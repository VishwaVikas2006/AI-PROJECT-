import { system } from './_common.js';

export function buildExplainPrompt({ question, userAnswer, correctAnswer, options }) {
  return [
    {
      role: 'system',
      content: system('Explain concisely why the correct answer is right. Return {"explanation":"..."}.'),
    },
    {
      role: 'user',
      content: `Question: ${question}
Options: ${options?.join(', ') || 'N/A'}
User chose: ${userAnswer}
Correct: ${correctAnswer}

Explain in 3-4 sentences (under ~350 tokens). Return JSON: {"explanation":"..."}`,
    },
  ];
}

export function buildFlashcardsPrompt({ topics = [], content, count = 10 }) {
  const cap = Math.min(10, count);
  return [
    {
      role: 'system',
      content: system('Create concise flashcards for memory retention.'),
    },
    {
      role: 'user',
      content: `Create ${cap} flashcards for: ${topics.join(', ')}.
Each: {"question":"short question","answer":"1-2 sentence answer","topic":"..."}
No one-word answers. Return JSON: {"flashcards":[...]}. Keep under ~600 tokens.

Content:
${content?.slice(0, 1500) || 'General knowledge'}`,
    },
  ];
}

export function buildSummaryPrompt({ content, title }) {
  return [
    {
      role: 'system',
      content: system('Create a concise exam revision sheet.'),
    },
    {
      role: 'user',
      content: `Revision sheet for "${title}". Return JSON:
{
  "quickSummary": "3-4 sentences",
  "keyConcepts": ["..."],
  "importantDefinitions": ["..."],
  "commonMistakes": ["..."],
  "memoryTricks": ["..."]
}
Use bullet points, not paragraphs. Keep the whole response under ~300 tokens.

Content:
${content?.slice(0, 2000) || ''}`,
    },
  ];
}
