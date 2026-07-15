// providers/openrouter.js
//
// Provider adapter for OpenRouter (https://openrouter.ai).
// OpenRouter exposes an OpenAI-compatible REST API so we use a simple fetch
// call — no extra SDK needed.
//
// Requires: OPENROUTER_API_KEY environment variable.
//
// Model waterfall (tried in order within this provider on the manager's request):
//   deepseek/deepseek-chat-v3-0324
//   qwen/qwen-2.5-72b-instruct
//   meta-llama/llama-3.3-70b-instruct
//   mistralai/mistral-7b-instruct

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;

export const name = 'openrouter';

// Models tried in order. The manager calls generateText once per entry.
export const models = [
  'deepseek/deepseek-chat-v3-0324',
  'qwen/qwen-2.5-72b-instruct',
  'meta-llama/llama-3.3-70b-instruct',
  'mistralai/mistral-7b-instruct',
];

export function isAvailable() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Convert internal message array to OpenAI-compatible chat format.
 * OpenRouter accepts the same message structure as OpenAI — no conversion needed
 * for role names (system / user / assistant are all valid).
 */
function buildPayload(messages, options, model) {
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
    model,
    messages,
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
 * Generate text using OpenRouter.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function generateText(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const model = options.model || models[0];
  const payload = buildPayload(messages, options, model);
  const { controller, timer } = createTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const t0 = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ai-learning-coach',
        'X-Title': 'AI Learning Coach',
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
        detail = parsed.error?.message || errText;
      } catch { /* keep raw */ }

      const err = new Error(`OpenRouter error ${response.status}: ${detail}`);
      err.status = response.status;
      if (response.status === 429) {
        err.isRateLimit = true;
      }
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('OpenRouter returned empty content');
    }

    // Attach metadata for manager logging
    const meta = { latencyMs, model, tokens: data.usage };
    return Object.assign(content, { _providerMeta: meta });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('OpenRouter request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
