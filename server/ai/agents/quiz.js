import { callAndParse } from '../utils/jsonParser.js';
import { isRateLimit } from '../utils/gemini.js';
import { buildQuizPrompt } from '../prompts/quiz.js';
import { normalizeString } from '../utils/validation.js';

const ALLOWED_QUESTION_TYPES = ['mcq', 'true_false', 'coding', 'short_answer'];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];

function normalizeQuestionType(type) {
  const value = normalizeString(type).toLowerCase();
  if (!value) return 'mcq';
  if (value.includes('true')) return 'true_false';
  if (value.includes('false')) return 'true_false';
  if (value.includes('code')) return 'coding';
  if (value.includes('scenario')) return 'short_answer';
  if (value.includes('concept')) return 'short_answer';
  if (value.includes('short')) return 'short_answer';
  if (value.includes('mcq') || value.includes('multiple choice')) return 'mcq';
  return ALLOWED_QUESTION_TYPES.includes(value) ? value : 'mcq';
}

function normalizeQuestionDifficulty(value, defaultDifficulty) {
  const normalized = normalizeString(value).toLowerCase();
  if (ALLOWED_DIFFICULTIES.includes(normalized)) return normalized;
  if (normalized === 'beginner') return 'easy';
  if (normalized === 'intermediate') return 'medium';
  if (normalized === 'advanced') return 'hard';
  return ALLOWED_DIFFICULTIES.includes(defaultDifficulty) ? defaultDifficulty : 'medium';
}

function normalizeOptions(type, options) {
  const normalized = Array.isArray(options) ? options.map((opt) => normalizeString(opt)).filter(Boolean) : [];
  if (type === 'true_false') {
    if (normalized.length >= 2) {
      return normalized;
    }
    return ['True', 'False'];
  }
  return normalized;
}

function validateQuestionPayload(q, index, defaultDifficulty) {
  if (!q || typeof q !== 'object') {
    throw new Error(`Quiz generator returned invalid question at index ${index}`);
  }

  const type = normalizeQuestionType(q.type);
  const topic = normalizeString(q.topic) || 'General';
  const question = normalizeString(q.question);
  const correctAnswer = typeof q.correctAnswer === 'string'
    ? normalizeString(q.correctAnswer)
    : q.correctAnswer != null
      ? String(q.correctAnswer).trim()
      : '';
  const explanation = typeof q.explanation === 'string'
    ? normalizeString(q.explanation, '')
    : q.explanation != null
      ? String(q.explanation).trim()
      : '';
  const difficulty = normalizeQuestionDifficulty(q.difficulty, defaultDifficulty);
  const options = normalizeOptions(type, q.options);

  if (!question) {
    throw new Error(`Quiz generator returned missing question text at index ${index}`);
  }

  if (!correctAnswer) {
    throw new Error(`Quiz generator returned missing correctAnswer at index ${index}`);
  }

  if (type === 'mcq' && options.length < 2) {
    throw new Error(`MCQ question at index ${index} must include at least 2 options`);
  }

  if (type === 'true_false') {
    const normalizedAnswer = correctAnswer.toLowerCase();
    if (!['true', 'false'].includes(normalizedAnswer)) {
      throw new Error(`True/false question at index ${index} must use correctAnswer 'True' or 'False'`);
    }
  }

  return {
    type,
    topic,
    question,
    options,
    correctAnswer,
    explanation,
    difficulty,
  };
}

async function tryCall(messages, attempts = 2, delayMs = 500) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callAndParse(messages, { agentName: 'QuizGenerator' });
    } catch (err) {
      lastError = err;
      // Never retry a rate limit — stop immediately.
      if (isRateLimit(err) || attempt >= attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}

export async function runQuizGeneratorAgent({ topics, difficulty, questionCount, content, subject }) {
  // Free Tier optimization: always generate exactly 5 questions.
  const requestedCount = 5;
  const defaultDifficulty = ALLOWED_DIFFICULTIES.includes(normalizeString(difficulty).toLowerCase())
    ? normalizeString(difficulty).toLowerCase()
    : 'medium';

  try {
    const messages = buildQuizPrompt({ topics, difficulty: defaultDifficulty, questionCount: requestedCount, content, subject });
    const result = await tryCall(messages);

    if (!result || !Array.isArray(result.questions)) {
      throw new Error('Quiz generator returned invalid question set');
    }

    const questions = result.questions.map((q, index) => validateQuestionPayload(q, index, defaultDifficulty));

    return {
      title: normalizeString(result.title) || `${subject} Quiz`,
      questions,
    };
  } catch (err) {
    console.error('Quiz generator fallback due to AI error:', err.message);
    const fallbackTopics = Array.isArray(topics) && topics.length > 0 ? topics : [subject || 'General'];
    const fallbackQuestions = Array.from({ length: requestedCount }, (_, index) => {
      const topic = fallbackTopics[index % fallbackTopics.length];
      return {
        type: 'mcq',
        topic: typeof topic === 'string' ? topic : topic.name || 'General',
        question: `What is a core concept related to ${typeof topic === 'string' ? topic : topic.name || subject}?`,
        options: ['Definition', 'Example', 'Application', 'Summary'],
        correctAnswer: 'Definition',
        explanation: `A core concept about ${typeof topic === 'string' ? topic : topic.name || subject}.`,
        difficulty: defaultDifficulty,
      };
    });

    return {
      title: `${subject} Quiz`,
      questions: fallbackQuestions,
    };
  }
}
