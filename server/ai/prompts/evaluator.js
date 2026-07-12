import { system } from './_common.js';

export function buildEvaluatorPrompt(questions, answers) {
  const pairs = questions.map((q, i) => ({
    index: i + 1,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    userAnswer: answers[i]?.userAnswer || '',
  }));

  return [
    {
      role: 'system',
      content: system('Evaluate each answer; give a 1-sentence reason and the weak topic.'),
    },
    {
      role: 'user',
      content: `Evaluate answers. For each, set isCorrect, confidence 0-100, a 1-sentence reason, and weakTopic (or null).
Add overallFeedback (1-2 sentences) and recommendations (1 sentence).
Return JSON:
{
  "evaluations":[{"questionIndex":1,"isCorrect":true,"confidence":0,"reason":"...","weakTopic":"..."}],
  "weakTopics":["..."],
  "strongTopics":["..."],
  "overallFeedback":"...",
  "recommendations":"..."
}

Answers:
${JSON.stringify(pairs)}`,
    },
  ];
}
