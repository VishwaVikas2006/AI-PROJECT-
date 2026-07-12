import { callAndParse } from '../utils/jsonParser.js';
import { buildStudyPlannerPrompt } from '../prompts/studyPlanner.js';
import { normalizePriority, normalizeString, normalizeStringArray } from '../utils/validation.js';

export async function runStudyPlannerAgent({ weakTopics, subject, sessionSummary }) {
  try {
    const messages = buildStudyPlannerPrompt({ weakTopics, subject, sessionSummary });
    const plan = await callAndParse(messages, { agentName: 'StudyPlanner' });

    const topics = Array.isArray(plan.topics) ? plan.topics : [];
    const normalizedTopics = topics
      .filter((topic) => topic && typeof topic === 'object')
      .map((topic) => {
        const activityList = normalizeStringArray(topic.activities);
        const practiceList = normalizeStringArray(topic.practiceSuggestions);
        const objectiveList = normalizeStringArray(topic.objectives);
        const revisionStep = normalizeString(topic.revisionSuggestion, '');

        return {
          name: normalizeString(topic.name || topic.title || topic.topic || 'Unknown Topic'),
          priority: normalizePriority(topic.priority),
          duration: normalizeString(topic.duration, '10 mins'),
          activities: activityList.length
            ? activityList
            : [...objectiveList, ...practiceList, ...(revisionStep ? [revisionStep] : [])].filter(Boolean),
        };
      })
      .filter((topic) => topic.name && topic.priority && topic.activities.length > 0);

    return {
      dailyPlan: normalizeString(plan.dailyPlan, 'Review weak topics and practice.'),
      estimatedDuration: normalizeString(plan.estimatedDuration, '20 mins'),
      topics: normalizedTopics,
    };
  } catch (err) {
    console.error('Study planner AI failure: runStudyPlannerAgent');
    console.error('Error message:', err.message);
    console.error('Recovery action: fallback study plan generated.');
    return {
      dailyPlan: `Focus on ${weakTopics.join(', ') || subject} with short review sessions.`,
      estimatedDuration: '20 mins',
      topics: (weakTopics || []).map((topic) => ({
        name: normalizeString(topic, 'Unknown Topic'),
        priority: 'high',
        duration: '10 mins',
        activities: ['Review key concepts', 'Practice examples', 'Quiz yourself'],
        objectives: ['Review the main ideas'],
        practiceSuggestions: ['Recall definitions', 'Make example problems'],
        revisionSuggestion: 'Revisit the topic in the next study session',
        expectedOutcome: 'Better familiarity with the topic',
      })),
    };
  }
}
