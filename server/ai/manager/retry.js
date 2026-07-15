// manager/retry.js
//
// Retry and fallback logic for the AI provider manager.
//
// Responsibilities:
//   - Determine whether an error is retriable or fatal.
//   - Retry the SAME provider on transient errors (up to MAX_SAME_PROVIDER_RETRIES).
//   - Move to the NEXT provider when the current one is exhausted.
//   - Never retry on: 400, 401, 403, safety blocks, prompt validation errors.
//   - Log provider, model, latency, retry count (never logs API keys).

const MAX_SAME_PROVIDER_RETRIES = 1; // One retry per provider before moving on
const RETRY_DELAY_BASE_MS = 800;

/**
 * Errors that should cause an immediate move to the next provider
 * (or a final throw if no providers remain).
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isRetriable(err) {
  if (!err || typeof err.message !== 'string') return false;
  const msg = err.message;

  // Never retry client errors
  if (/\b(400|401|403)\b/.test(msg)) return false;
  if (/bad request/i.test(msg)) return false;
  if (/authentication|unauthorized|forbidden/i.test(msg)) return false;
  if (/safety/i.test(msg)) return false;
  if (/blocked/i.test(msg) && /safety/i.test(msg)) return false;

  // Retriable conditions
  if (err.isRateLimit) return true;
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
  if (/timed out/i.test(msg)) return true;
  if (/network/i.test(msg)) return true;
  if (/ECONNRESET/i.test(msg)) return true;
  if (/fetch failed/i.test(msg)) return true;
  if (/unavailable/i.test(msg)) return true;

  return false;
}

/**
 * Errors that should stop the ENTIRE fallback chain immediately.
 * Only safety blocks are considered universally fatal across all providers.
 * All other errors (400, 401, 402, 403) are specific to the current provider
 * and should trigger a fallback to the next provider.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isFatalError(err) {
  if (!err || typeof err.message !== 'string') return false;
  const msg = err.message;
  return /safety/i.test(msg) || (/blocked/i.test(msg) && /safety/i.test(msg));
}

/**
 * Whether an error is a rate-limit specifically.
 * @param {Error} err
 * @returns {boolean}
 */
export function isRateLimitError(err) {
  return Boolean(err?.isRateLimit) || /\b429\b/.test(err?.message || '');
}

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt a single provider call with up to MAX_SAME_PROVIDER_RETRIES retries
 * on retriable errors.
 *
 * @param {object}   providerEntry  { name, provider }
 * @param {Array}    messages
 * @param {object}   options
 * @param {string}   model
 * @param {Function} log
 * @returns {Promise<string>}  throws if all retries on this provider fail
 */
export async function tryProvider(providerEntry, messages, options, model, log) {
  const { name: providerName, provider } = providerEntry;
  let lastError;

  for (let attempt = 1; attempt <= MAX_SAME_PROVIDER_RETRIES + 1; attempt++) {
    const t0 = Date.now();
    try {
      const result = await provider.generateText(messages, { ...options, model });
      const latencyMs = Date.now() - t0;
      log('success', providerName, model, latencyMs, attempt - 1, null);
      return result;
    } catch (err) {
      lastError = err;
      const latencyMs = Date.now() - t0;
      log('error', providerName, model, latencyMs, attempt - 1, err);

      if (!isRetriable(err)) {
        // Fatal — don't retry this provider, let caller decide whether to
        // try the next one based on whether it's a permanent failure.
        throw err;
      }

      // Rate-limited (429 / quota) on THIS provider: do NOT retry it. Its quota
      // won't free up within seconds, and each provider has its own quota, so
      // the right move is to fall through to the next provider immediately.
      // This prevents the nested backoff that previously made a quota-exceeded
      // request wait 20s+ on Gemini before any fallback was even attempted.
      if (isRateLimitError(err)) {
        throw err;
      }

      if (attempt > MAX_SAME_PROVIDER_RETRIES) break; // retries exhausted

      const delay = RETRY_DELAY_BASE_MS * attempt;

      console.log(
        `[AIManager] ${providerName} attempt ${attempt} failed (${err.message?.slice(0, 80)}). Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
