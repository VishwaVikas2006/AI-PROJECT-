import { system } from './_common.js';

export function buildPlannerPrompt({ subject, topics, userProgress, questionCount }) {
  const progressSummary = userProgress?.length
    ? userProgress.map((p) => `${p.topic}: ${p.mastery}%`).join(', ')
    : 'none';

  const topicNames = topics.map((t) => (typeof t === 'string' ? t : t.name)).join(', ');

  return [
    {
      role: 'system',
      content: system(
        'You plan quizzes only; you do not write questions. Pick difficulty by mastery: <40% easy, 40-70% medium, >70% hard; focus weak topics.',
      ),
    },
    {
      role: 'user',
      content: `Subject: ${subject}
Topics: ${topicNames}
Progress: ${progressSummary}
Requested questions: ${questionCount || 5}

Return JSON: {"difficulty":"easy|medium|hard","questionCount":number,"topics":["..."],"reasoning":"1 sentence"}`,
    },
  ];
}
