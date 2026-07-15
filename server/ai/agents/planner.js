// The analyzer already produces topics + difficulty during session analysis,
// so a separate Gemini call here is redundant and wastes free-tier quota. The
// quiz plan is derived locally from the session's existing analysis (and any
// weak topics from progress) instead of spending another request.
export async function runPlannerAgent({ subject, topics, userProgress, questionCount }) {
  const topicNames = Array.isArray(topics) && topics.length > 0
    ? topics.map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean)
    : [subject || 'General'];

  // Focus the quiz on topics the learner is weak in, if we have progress data.
  const weakTopics = Array.isArray(userProgress)
    ? userProgress.filter((p) => p && typeof p.mastery === 'number' && p.mastery < 50).map((p) => p.topic)
    : [];
  const focusTopics = weakTopics.length > 0 ? weakTopics : topicNames;
  const difficulty = weakTopics.length > 0 ? 'hard' : 'medium';

  return {
    difficulty,
    questionCount: questionCount || 10,
    topics: focusTopics,
    reasoning: weakTopics.length > 0
      ? 'Focusing on topics the learner is currently weak in.'
      : 'Default quiz plan derived from analyzed session topics.',
  };
}
