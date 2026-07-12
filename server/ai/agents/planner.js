import { callAndParse } from '../utils/jsonParser.js';
import { buildPlannerPrompt } from '../prompts/planner.js';

export async function runPlannerAgent({ subject, topics, userProgress, questionCount }) {
  try {
    const messages = buildPlannerPrompt({ subject, topics, userProgress, questionCount });
    const plan = await callAndParse(messages, { agentName: 'Planner' });

    return {
      difficulty: plan.difficulty || 'medium',
      questionCount: plan.questionCount || questionCount || 10,
      topics: plan.topics || topics.map((t) => (typeof t === 'string' ? t : t.name)),
      reasoning: plan.reasoning || 'Default learning plan generated.',
    };
  } catch (err) {
    console.error('Planner fallback due to AI error:', err.message);
    const fallbackTopics = Array.isArray(topics) && topics.length > 0 ? topics : [subject || 'General'];
    return {
      difficulty: 'medium',
      questionCount: questionCount || 10,
      topics: fallbackTopics.map((t) => (typeof t === 'string' ? t : t.name)),
      reasoning: 'Unable to generate a plan from AI. Using a default topic-based quiz plan.',
    };
  }
}
