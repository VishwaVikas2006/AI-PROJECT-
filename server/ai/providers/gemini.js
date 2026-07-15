// providers/gemini.js
//
// Provider adapter for Google Gemini.
//
// This is a thin wrapper around the existing, battle-tested implementation in
// ../utils/gemini.js. We delegate to callWithRetry (not sendGeminiRequest directly)
// so the full Gemini retry logic is preserved:
//   - Truncation: budget doubling up to MAX_OUTPUT_CAP
//   - Rate-limit: single polite backoff before one retry
//
// The existing callOpenRouter / callOpenRouterFast / isRateLimit exports in
// utils/gemini.js continue to work unchanged.

// callWithRetry is not exported from utils/gemini.js — we re-use sendGeminiRequest
// and let the manager's own retry.js handle the outer loop. The Gemini-specific
// truncation and rate-limit logic inside callWithRetry is preserved by importing
// the full internal retry path via a dedicated named export added below.
//
// Strategy: export `callGeminiWithRetry` from utils/gemini.js and use it here.
// See utils/gemini.js for the implementation.
import { callGeminiWithRetry } from '../utils/gemini.js';

export const name = 'gemini';

/**
 * Check whether this provider can be used (API key present).
 * @returns {boolean}
 */
export function isAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Generate text using the Gemini API (with full internal retry logic).
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options  - same options shape used throughout the app
 * @returns {Promise<string>}
 */
export async function generateText(messages, options = {}) {
  return callGeminiWithRetry(messages, options);
}
