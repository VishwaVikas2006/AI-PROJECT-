import { system } from './_common.js';

export function buildQuizPrompt({ topics, difficulty, questionCount, content, subject }) {
  const topicList = topics.map((t) => (typeof t === 'string' ? t : t.name)).join(', ');

  return [
    {
      role: 'system',
      content: system(
        'Write accurate quiz questions from the material. Avoid trivial/duplicate questions and "All of the above".',
      ),
    },
    {
      role: 'user',
      content: `Create a quiz for "${subject}" from these topics: ${topicList}.

Generate exactly ${questionCount} questions (~40% easy, 40% medium, 20% hard).
Each question JSON: {"type":"mcq|true_false|coding|short_answer","topic":"...","question":"...","options":["..."],"correctAnswer":"...","explanation":"1 sentence why","difficulty":"easy|medium|hard"}
- mcq: >=3 options. true_false: options ["True","False"].
- Explanations: 1 short sentence.
- Keep total response under ~700 tokens.

Reference content:
${content?.slice(0, 2000) || 'Use general knowledge for these topics.'}`,
    },
  ];
}
