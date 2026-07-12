// Google Gemini wrapper. Replaces the old OpenRouter client.
//
// The public surface (callOpenRouter / callOpenRouterFast) is kept intentionally
// identical to the previous wrapper so every caller (agents, controllers, the
// jsonParser helper) continues to work without changes. Internally this talks to
// the official Google Gemini REST API.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 30000;
// One retry for transient failures only (see isTransient).
const DEFAULT_RETRIES = 1;

function getModel(options) {
  return options.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

function getFastModel(options) {
  return options.model || process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

// Per-feature output token budgets (Free Tier tuning).
// These are hard caps. Prompts ask for even tighter targets so real usage
// stays well under the cap.
const TOKEN_BUDGETS = {
  Analyzer: 600, // target ~500 tokens
  QuizGenerator: 700, // exactly 5 questions
  Planner: 350,
  StudyPlanner: 600, // 5-day plan
  Evaluator: 900, // per-question feedback
  Summary: 360, // target ~300 tokens
  Flashcards: 700, // <=10 cards
  Explain: 420, // target ~350 tokens
  Diagnose: 800,
};

function isDebug() {
  return process.env.GEMINI_DEBUG === 'true';
}

function log(message, meta = {}) {
  if (!isDebug()) return;
  console.log('[Gemini]', message, JSON.stringify(meta));
}

// Convert OpenAI-style messages into Gemini's request shape:
//   - 'system' role -> top-level systemInstruction
//   - 'assistant' role -> 'model'
//   - 'user' role -> 'user'
// Gemini requires contents to alternate roles, so consecutive same-role
// messages are merged.
function convertMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Gemini messages must be a non-empty array');
  }

  const systemParts = [];
  const contents = [];

  for (const m of messages) {
    if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw new Error('Each Gemini message must have a string role and content');
    }

    if (m.role === 'system') {
      if (m.content.trim()) systemParts.push(m.content.trim());
    } else if (m.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: m.content }] });
    } else {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    }
  }

  const merged = [];
  for (const c of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === c.role) {
      last.parts.push(...c.parts);
    } else {
      merged.push({ role: c.role, parts: [...c.parts] });
    }
  }

  if (merged.length === 0) {
    throw new Error('Gemini request must include at least one user message');
  }

  const systemInstruction = systemParts.length
    ? { parts: [{ text: systemParts.join('\n\n') }] }
    : undefined;

  return { contents: merged, systemInstruction };
}

function buildBody(messages, options) {
  const { contents, systemInstruction } = convertMessages(messages);
  const maxTokens =
    Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0
      ? Number(options.maxTokens)
      : TOKEN_BUDGETS[options.agentName] || 1024;

  const generationConfig = {
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: maxTokens,
  };
  if (options.json) {
    generationConfig.responseMimeType = 'application/json';
  }

  const body = { contents, generationConfig };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  return body;
}

function createTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

function parseRetryAfter(response) {
  const raw = response.headers?.get?.('retry-after');
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds)) return seconds;
  // Could be an HTTP-date; parse best-effort but we don't know "now" here.
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(1, Math.round((date - Date.now()) / 1000));
  return undefined;
}

function classifyError(status, parsedDetail) {
  if (status === 400) return `Gemini bad request (400): ${parsedDetail}`;
  if (status === 401 || status === 403) {
    return `Gemini authentication failed (${status}): check GEMINI_API_KEY. ${parsedDetail}`;
  }
  if (status === 429) return `Gemini quota exceeded or rate limited (429): ${parsedDetail}`;
  return `Gemini API error: ${status} - ${parsedDetail}`;
}

async function parseGeminiResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 300)}`);
  }

  if (data.error) {
    const detail = `${data.error.code || ''} ${data.error.message || ''}`.trim();
    throw new Error(`Gemini API error: ${detail}`);
  }

  const candidate = data.candidates?.[0];
  const content = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

  if (!content) {
    const finishReason = candidate?.finishReason;
    if (finishReason === 'SAFETY') {
      throw new Error('Gemini blocked the response due to safety filters.');
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was truncated (max output tokens reached).');
    }
    throw new Error(`Gemini returned no content. Raw response: ${text.slice(0, 300)}`);
  }

  if (isDebug()) {
    console.log('\n========== RAW MODEL CONTENT ==========');
    console.log(content);
    console.log('=======================================\n');
  }

  return content;
}

async function sendGeminiRequest(messages, options) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = options.fast ? getFastModel(options) : getModel(options);
  const body = buildBody(messages, options);
  const url = `${GEMINI_URL}/${model}:generateContent?key=${apiKey}`;

  const { controller, timer } = createTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  log('Request', {
    model,
    messages: messages.length,
    maxTokens: body.generationConfig.maxOutputTokens,
    json: Boolean(options.json),
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        detail = `${parsed.error?.code || response.status} ${parsed.error?.message || ''}`.trim();
      } catch {
        // keep raw text
      }

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response);
        const err = new Error(
          retryAfter
            ? `Gemini free-tier rate limit reached. Please wait ${retryAfter} seconds and try again.`
            : 'Gemini free-tier rate limit reached. Please wait about a minute and try again.',
        );
        err.isRateLimit = true;
        err.retryAfter = retryAfter;
        err.status = 429;
        throw err;
      }

      throw new Error(classifyError(response.status, detail));
    }

    return parseGeminiResponse(response);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Gemini request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Retry ONCE for transient failures (5xx / network / timeout).
// Rate limits (429) are NOT retried — see isRateLimit and the 429 branch above.
function isTransient(err) {
  if (!err || typeof err.message !== 'string') return false;
  return (
    /\b(500|502|503|504)\b/.test(err.message) ||
    /timed out/i.test(err.message) ||
    /network/i.test(err.message) ||
    /fetch failed/i.test(err.message)
  );
}

export function isRateLimit(err) {
  return Boolean(err?.isRateLimit) || /\b429\b/.test(err?.message || '');
}

async function callWithRetry(messages, options) {
  const attempts = (options.retries ?? DEFAULT_RETRIES) + 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await sendGeminiRequest(messages, options);
    } catch (err) {
      lastError = err;
      log('Attempt error', { attempt, error: err.message });
      if (!isTransient(err)) throw err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
  }
  throw lastError;
}

// Exported names are intentionally kept identical to the previous OpenRouter
// wrapper so no caller needs to change.
export async function callOpenRouter(messages, options = {}) {
  return callWithRetry(messages, options);
}

export async function callOpenRouterFast(messages, options = {}) {
  return callWithRetry(messages, { ...options, fast: true });
}
