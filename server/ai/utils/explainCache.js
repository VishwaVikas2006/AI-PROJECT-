// In-memory cache for "Explain Answer" results.
//
// The explanation for a given (question, correct answer, user's answer) never
// changes, so re-calling Gemini for it is pure quota waste — especially when a
// learner clicks Explain repeatedly or navigates back to a question. We cache
// by that key and dedupe concurrent identical requests through the caller's
// in-flight lock. Bounded to MAX_ENTRIES so it can't grow unbounded.
//
// This is process-local (resets on restart) which is fine: its only purpose is
// to stop duplicate Gemini calls, not to persist explanations.

const MAX_ENTRIES = 500;
const cache = new Map();

export function explainCacheKey({ question, correctAnswer, userAnswer }) {
  return `${question}::${correctAnswer}::${userAnswer}`;
}

export function getExplain(key) {
  return cache.has(key) ? cache.get(key) : undefined;
}

export function setExplain(key, value) {
  // Evict the oldest entry when full (insertion order == age in a Map).
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}
