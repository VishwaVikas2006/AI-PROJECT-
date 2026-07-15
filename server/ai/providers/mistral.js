// providers/mistral.js
//
// Provider adapter for Mistral AI (https://mistral.ai).
// Uses Mistral's OpenAI-compatible /v1/chat/completions endpoint.
//
// Requires: MISTRAL_API_KEY environment variable.

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MODEL = 'mistral-small-latest';

export const name = 'mistral';

export function isAvailable() {
  return Boolean(process.env.MISTRAL_API_KEY);
}

function buildPayload(messages, options) {
  const agentTokenBudgets = {
    Analyzer: 900,
    QuizGenerator: 1600,
    Planner: 500,
    StudyPlanner: 1200,
    Evaluator: 1500,
    Summary: 1200,
    Flashcards: 1500,
    Explain: 900,
    Diagnose: 1200,
  };

  const maxTokens =
    Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0
      ? Number(options.maxTokens)
      : agentTokenBudgets[options.agentName] || 1024;

  const payload = {
    model: options.model || process.env.MISTRAL_MODEL || DEFAULT_MODEL,
    messages, // Mistral accepts OpenAI-style messages natively
    temperature: options.temperature ?? 0.3,
    max_tokens: maxTokens,
  };

  if (options.json) {
    payload.response_format = { type: 'json_object' };
  }

  return payload;
}

function createTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

/**
 * Generate text using Mistral AI.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function generateText(messages, options = {}) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured');

  const payload = buildPayload(messages, options);
  const { controller, timer } = createTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const t0 = Date.now();
    const response = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - t0;

    if (!response.ok) {
      const errText = await response.text();
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        detail = parsed.message || parsed.error?.message || errText;
      } catch { /* keep raw */ }

      const err = new Error(`Mistral error ${response.status}: ${detail}`);
      err.status = response.status;
      if (response.status === 429) err.isRateLimit = true;
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('Mistral returned empty content');
    }

    return Object.assign(content, {
      _providerMeta: { latencyMs, model: payload.model, tokens: data.usage },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Mistral request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
