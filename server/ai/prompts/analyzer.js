import { system } from './_common.js';

export function buildAnalyzerPrompt(content, title, subject, mode = 'analyze') {
  const scope =
    mode === 'generate'
      ? 'Input is a TOPIC/TITLE, not full material. Generate accurate study material for it, then analyze that.'
      : 'Analyze ONLY the provided material. Do not invent topics, facts, or sections beyond it.';

  return [
    {
      role: 'system',
      content: system('Analyze learning material accurately. ' + scope),
    },
    {
      role: 'user',
      content: `Analyze "${title}" (subject "${subject}").

Return exactly this JSON:
{
  "title": "...",
  "subject": "...",
  "summary": "2-3 sentence plain-language summary",
  "difficulty": "Beginner" | "Intermediate" | "Advanced",
  "estimatedStudyTime": "...",
  "learningObjectives": ["verb-led objective", "..."],
  "topics": [{"name":"...","description":"1-2 sentences"}],
  "keywords": ["term", "..."]
}

4-8 topics, 1-2 sentence descriptions. Objectives start with verbs (Understand, Explain...). Keep under ~500 tokens.

Content:
${content}`,
    },
  ];
}
