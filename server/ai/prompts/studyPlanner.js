import { system } from './_common.js';

export function buildStudyPlannerPrompt({ weakTopics, subject, sessionSummary }) {
  return [
    {
      role: 'system',
      content: system('Create a concise 5-day study plan ordered from fundamentals to advanced.'),
    },
    {
      role: 'user',
      content: `Subject: "${subject}". Weak topics: ${JSON.stringify(weakTopics)}.
Summary: ${(sessionSummary || '').slice(0, 600)}

Build a 5-day plan. For each topic: name, priority (low|medium|high), duration, and 2-3 short activities.
Return JSON:
{"dailyPlan":"1-2 sentences","estimatedDuration":"...","topics":[{"name":"...","priority":"low|medium|high","duration":"...","activities":["..."]}]}
Keep under ~600 tokens.`,
    },
  ];
}
