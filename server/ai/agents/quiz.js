import { callAndParse } from '../utils/jsonParser.js';
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

// Fisher-Yates shuffle. Returns a NEW array; never mutates the input.
function shuffle(array) {
  const arr = [...(array || [])];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Randomize option order per question while keeping the correct answer valid.
// correctAnswer is the option TEXT, so it stays correct as long as it remains
// present in the shuffled options array — no positional index bookkeeping
// needed, which is why the frontend (text-based matching) keeps working.
function shuffleQuestionOptions(question) {
  const options = shuffle(question.options);
  let correctAnswer = question.correctAnswer;
  if (!options.includes(correctAnswer)) {
    const match = options.find(
      (o) => String(o).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase(),
    );
    correctAnswer = match !== undefined ? match : options[0];
  }
  return { ...question, options, correctAnswer };
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

// Retries are handled centrally in gemini.js (one transient retry + one polite
// 429 backoff). We call exactly once here; on failure the outer try/catch below
// returns a deterministic fallback so a transient AI error never crashes the
// quiz flow or multiplies Gemini calls.
export async function runQuizGeneratorAgent({ topics, difficulty, questionCount, content, subject }) {
  // Free Tier optimization: always generate exactly 5 questions.
  const requestedCount = 5;
  const defaultDifficulty = ALLOWED_DIFFICULTIES.includes(normalizeString(difficulty).toLowerCase())
    ? normalizeString(difficulty).toLowerCase()
    : 'medium';

  try {
    const messages = buildQuizPrompt({ topics, difficulty: defaultDifficulty, questionCount: requestedCount, content, subject });
    const result = await callAndParse(messages, { agentName: 'QuizGenerator' });

    // Gemini may return either a bare array of questions or an object that
    // wraps them under a "questions" key. Accept both shapes so a valid
    // response is never mistaken for a failure (which would trigger the
    // degenerate fallback with identical options on every question).
    const rawQuestions = Array.isArray(result) ? result : result?.questions;
    if (!Array.isArray(rawQuestions)) {
      throw new Error('Quiz generator returned invalid question set');
    }

    const questions = rawQuestions.map((q, index) =>
      shuffleQuestionOptions(validateQuestionPayload(q, index, defaultDifficulty)),
    );

    const title = !Array.isArray(result) ? normalizeString(result.title) : '';
    return {
      title: title || `${subject} Quiz`,
      questions,
    };
  } catch (err) {
    console.error('Quiz generator fallback due to AI error:', err.message);
    const fallbackTopics = Array.isArray(topics) && topics.length > 0 ? topics : [subject || 'General'];
    const baseOptions = ['Definition', 'Example', 'Application', 'Summary'];
    const fallbackQuestions = Array.from({ length: requestedCount }, (_, index) => {
      const topic = fallbackTopics[index % fallbackTopics.length];
      const topicName = typeof topic === 'string' ? topic : topic.name || 'General';
      // Randomize the fallback too, so it never produces a fixed answer pattern.
      const options = shuffle(baseOptions);
      const correctAnswer = options[Math.floor(Math.random() * options.length)];
      return {
        type: 'mcq',
        topic: topicName,
        question: `What is a core concept related to ${topicName}?`,
        options,
        correctAnswer,
        explanation: `A core concept about ${topicName}.`,
        difficulty: defaultDifficulty,
      };
    });

    return {
      title: `${subject} Quiz`,
      questions: fallbackQuestions,
    };
  }
}
