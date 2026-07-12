import { callAndParse } from '../utils/jsonParser.js';
import { buildEvaluatorPrompt } from '../prompts/evaluator.js';

export async function runEvaluatorAgent(questions, answers) {
  try {
    const messages = buildEvaluatorPrompt(questions, answers);
    const result = await callAndParse(messages, { agentName: 'Evaluator' });

    if (!result || !Array.isArray(result.evaluations)) {
      throw new Error('Evaluator returned invalid evaluations');
    }

    const evaluations = result.evaluations.map((ev, i) => ({
      questionId: questions[i]?._id,
      topic: questions[i]?.topic || null,
      userAnswer: answers[i]?.userAnswer || '',
      isCorrect: Boolean(ev.isCorrect),
      confidence: typeof ev.confidence === 'number' ? ev.confidence : 0,
      reason: typeof ev.reason === 'string' ? ev.reason.trim() : '',
      weakTopic: ev.weakTopic || null,
    }));

    const weakTopics = Array.isArray(result.weakTopics)
      ? result.weakTopics.filter(Boolean)
      : evaluations.filter((e) => !e.isCorrect && e.weakTopic).map((e) => e.weakTopic);
    const strongTopics = Array.isArray(result.strongTopics)
      ? result.strongTopics.filter(Boolean)
      : evaluations.filter((e) => e.isCorrect && e.topic).map((e) => e.topic);

    return {
      evaluations,
      weakTopics: [...new Set(weakTopics)],
      strongTopics: [...new Set(strongTopics)],
      overallFeedback: typeof result.overallFeedback === 'string' ? result.overallFeedback.trim() : '',
      recommendations: typeof result.recommendations === 'string' ? result.recommendations.trim() : '',
    };
  } catch (err) {
    console.error('Evaluator AI failure: runEvaluatorAgent');
    console.error('Raw error:', err.message);

    const evaluations = questions.map((q, i) => {
      const userAnswer = answers[i]?.userAnswer || '';
      const isCorrect = userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      return {
        questionId: q._id,
        topic: q.topic || 'General',
        userAnswer,
        isCorrect,
        confidence: isCorrect ? 90 : 40,
        reason: isCorrect
          ? 'Your answer matches the expected correct answer.'
          : `Your answer is incorrect because it does not match the expected response. The correct answer is ${q.correctAnswer}.`,
        weakTopic: isCorrect ? null : q.topic || 'General',
      };
    });

    const weakTopics = evaluations.filter((e) => !e.isCorrect && e.weakTopic).map((e) => e.weakTopic);
    const strongTopics = evaluations.filter((e) => e.isCorrect && e.topic).map((e) => e.topic);

    return {
      evaluations,
      weakTopics: [...new Set(weakTopics.filter(Boolean))],
      strongTopics: [...new Set(strongTopics.filter(Boolean))],
      overallFeedback: 'Evaluation completed using a fallback heuristic because the AI service was unavailable.',
      recommendations: 'Review incorrect topics and retry when the AI service is available.',
    };
  }
}
