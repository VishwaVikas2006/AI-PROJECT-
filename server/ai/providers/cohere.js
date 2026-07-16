// providers/cohere.js
//
// Provider adapter for Cohere (https://cohere.com).
// Uses Cohere's /v2/chat REST endpoint — no SDK needed.
//
// Requires: COHERE_API_KEY environment variable.

const COHERE_URL = 'https://api.cohere.com/v2/chat';
const DEFAULT_TIMEOUT_MS = 30000;
// NOTE: 'command-r-plus' was removed by Cohere on 2025-09-15 and now
// returns 404. Use a current model id instead.
const DEFAULT_MODEL = 'command-a-03-2025';

export const name = 'cohere';

export function isAvailable() {
  return Boolean(process.env.COHERE_API_KEY);
}

/**
 * Convert internal OpenAI-style messages to Cohere's chat format.
 * Cohere v2 /chat accepts messages with roles: system, user, assistant.
 */
function convertMessages(messages) {
  const chatMessages = [];
  for (const m of messages) {
    if (m.role === 'system') {
      chatMessages.push({ role: 'system', content: m.content });
    } else if (m.role === 'model' || m.role === 'assistant') {
      chatMessages.push({ role: 'assistant', content: m.content });
    } else {
      chatMessages.push({ role: 'user', content: m.content });
    }
  }
  return chatMessages;
}

function buildPayload(messages, options) {
const agentTokenBudgets = {
  Analyzer: 500,
  QuizGenerator: 800,
  Planner: 400,
  StudyPlanner: 700,
  Evaluator: 700,
  Summary: 700,
  Flashcards: 700,
  Explain: 500,
  Diagnose: 700,
};

  const maxTokens =
    Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0
      ? Number(options.maxTokens)
      : agentTokenBudgets[options.agentName] || 1024;

  const chatMessages = convertMessages(messages);

  const payload = {
    model: options.model || process.env.COHERE_MODEL || DEFAULT_MODEL,
    messages: chatMessages,
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.3,
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
 * Generate text using Cohere.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function generateText(messages, options = {}) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY is not configured');

  const payload = buildPayload(messages, options);
  const { controller, timer } = createTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const t0 = Date.now();
    const response = await fetch(COHERE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Client-Name': 'ai-learning-coach',
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
        detail = parsed.message || errText;
      } catch { /* keep raw */ }

      const err = new Error(`Cohere error ${response.status}: ${detail}`);
      err.status = response.status;
      if (response.status === 429) err.isRateLimit = true;
      throw err;
    }

    const data = await response.json();
    console.log(
      '[COHERE RESPONSE]',
      JSON.stringify(data, null, 2)
    );
    // Cohere v2: message.content is an array of content blocks.
    // Find the FIRST block whose type is "text" — a "thinking" block
    // must NOT be returned. Future responses may contain multiple blocks.
    const contentBlocks = Array.isArray(data.message?.content)
      ? data.message.content
      : [];
    const textBlock = contentBlocks.find(
      (b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()
    );
    const content =
      (textBlock?.text) ||
      data.text || // v1 fallback
      '';

    if (!content) {
      throw new Error('Cohere returned empty content');
    }

    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Cohere request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
