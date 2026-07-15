// manager/aiManager.js
//
// Public facade for the AI provider layer.
//
// This is the ONLY file the rest of the system needs to import. It exposes
// the same interface as the old gemini.js so every caller is backward-compatible.
//
// Exported names intentionally match gemini.js exports that callers depend on:
//   - callOpenRouter(messages, options)
//   - callOpenRouterFast(messages, options)
//   - isRateLimit(err)
//
// Fallback flow:
//   1. Try Gemini (using the existing sendGeminiRequest + callWithRetry logic)
//   2. On exhaustion → try OpenRouter (if key present)
//   3. On exhaustion → try Cohere (if key present)
//   4. On exhaustion → try Mistral (if key present)
//   5. All exhausted → throw the last error
//
// The frontend never knows a fallback occurred.

import { getProviders } from './providerRegistry.js';
import { getModel } from './modelSelector.js';
import { tryProvider, isRetriable, isRateLimitError } from './retry.js';

// ── Logging ──────────────────────────────────────────────────────────────────

function isDebug() {
  return process.env.GEMINI_DEBUG === 'true' || process.env.AI_DEBUG === 'true';
}

function logEvent(status, providerName, model, latencyMs, retries, err) {
  const base = `[AIManager] provider=${providerName} model=${model || 'default'} latency=${latencyMs}ms retries=${retries}`;
  if (status === 'success') {
    if (isDebug()) console.log(`${base} status=OK`);
  } else {
    // Truncate error message — never log full stack or API key fragments
    const errMsg = (err?.message || String(err)).slice(0, 120);
    console.log(`${base} status=ERROR error="${errMsg}"`);
  }
}

// ── Core generateText ─────────────────────────────────────────────────────────

/**
 * Generate text using the first available provider that succeeds.
 * Tries providers in registry order, moving to the next on retriable failures.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @param {string}  [options.agentName]   - for model routing + logging
 * @param {boolean} [options.json]        - request JSON output
 * @param {boolean} [options.fast]        - prefer lighter/faster model
 * @param {number}  [options.maxTokens]   - output token budget
 * @param {number}  [options.temperature]
 * @param {number}  [options.timeoutMs]
 * @returns {Promise<string>}
 */
export async function generateText(messages, options = {}) {
  const providers = getProviders();

  if (providers.length === 0) {
    throw new Error('No AI providers are configured. Set at least GEMINI_API_KEY.');
  }

  let lastError;

  for (let i = 0; i < providers.length; i++) {
    const entry = providers[i];
    const model = getModel(entry.name, options.agentName, Boolean(options.fast));

    try {
      const result = await tryProvider(entry, messages, options, model, logEvent);
      return result;
    } catch (err) {
      lastError = err;

      const isLast = i === providers.length - 1;

      if (isLast) {
        // No more providers — re-throw preserving the error shape so callers
        // (especially isRateLimit checks in jsonParser.js) still work.
        break;
      }

      if (!isRetriable(err)) {
        // Fatal error (400, 401, 403, safety) — don't try next provider.
        // The request itself is bad; switching providers won't help.
        throw err;
      }

      // Log the handoff (no API keys in messages)
      const nextProvider = providers[i + 1];
      console.log(
        `[AIManager] ${entry.name} exhausted (${(err.message || '').slice(0, 80)}) — trying next provider: ${nextProvider.name}`,
      );
    }
  }

  throw lastError;
}

// ── Backward-compatible exports ───────────────────────────────────────────────
// These match the function names that gemini.js currently exports, so
// any code that imports from gemini.js (via the updated re-exports there)
// continues to work without any changes.

/**
 * Generate text (standard quality). Mirrors callOpenRouter signature.
 * @param {Array} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function callOpenRouter(messages, options = {}) {
  return generateText(messages, options);
}

/**
 * Generate text (fast / lighter model preference). Mirrors callOpenRouterFast.
 * @param {Array} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function callOpenRouterFast(messages, options = {}) {
  return generateText(messages, { ...options, fast: true });
}

/**
 * Check if an error is a rate-limit error. Mirrors isRateLimit from gemini.js.
 * Preserved so jsonParser.js continues to work without modification.
 * @param {Error} err
 * @returns {boolean}
 */
export function isRateLimit(err) {
  return isRateLimitError(err);
}
