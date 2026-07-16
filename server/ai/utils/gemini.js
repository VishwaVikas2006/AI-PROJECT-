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

// Per-feature output token budgets.
// These are the STARTING caps. gemini-2.0-flash supports up to 8192 output
// tokens, so we size each budget to comfortably fit the JSON each agent emits.
// The previous budgets (Summary 360, QuizGenerator 700, ...) were far too small
// and caused Gemini to hit maxOutputTokens mid-JSON — truncating the response
// and producing the "Unterminated string in JSON" parse errors. If a response
// is still truncated, callWithRetry escalates the budget (see MAX_OUTPUT_CAP).
const TOKEN_BUDGETS = {
  Analyzer: 500,
  QuizGenerator: 800,      // 5 questions
  Planner: 400,
  StudyPlanner: 700,
  Evaluator: 700,
  Summary: 700,
  Flashcards: 700,         // 8–10 cards
  Explain: 500,
  Diagnose: 700,
};

// Hard ceiling for output tokens (gemini-2.0-flash maximum). Truncation retries
// double the budget until they reach this cap.
const MAX_OUTPUT_CAP = 8192;

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
    // gemini-3.x-flash are thinking models: thinking tokens count against
    // maxOutputTokens and starve the actual JSON output (finishReason MAX_TOKENS,
    // truncated response). Disable thinking so the whole budget goes to the answer.
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
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

// A response cut off by the output-token limit. We tag it with isTruncation so
// callWithRetry can transparently retry with a larger budget instead of letting
// the half-written JSON bubble up as an opaque parse error.
function makeTruncationError() {
  const err = new Error('Gemini stopped early because the output token limit was reached.');
  err.isTruncation = true;
  return err;
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
  const finishReason = candidate?.finishReason;

  // CRITICAL: detect truncation regardless of whether `content` is empty.
  // When maxOutputTokens is hit mid-JSON, Gemini still returns partial content,
  // so the old check (only when !content) let truncated payloads slip through
  // to JSON.parse and surface as "Unterminated string in JSON".
  if (finishReason === 'MAX_TOKENS') {
    throw makeTruncationError();
  }

  const content = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

  if (!content) {
    if (finishReason === 'SAFETY') {
      throw new Error('Gemini blocked the response due to safety filters.');
    }
    throw new Error(`Gemini returned no content. Raw response: ${text.slice(0, 300)}`);
  }

  if (isDebug()) {
    console.log('\n========== RAW MODEL CONTENT ==========');
    console.log(content);
    console.log('========== METADATA ==========');
    console.log('finishReason:', finishReason);
    console.log('usageMetadata:', JSON.stringify(data.usageMetadata || {}));
    console.log('content length:', content.length);
    console.log('=======================================\n');
  }

  return content;
}

// Exported so providers/gemini.js can use this as its generateText implementation.
// All internal retry logic (callWithRetry) remains active — the provider adapter
// calls sendGeminiRequest directly, which is wrapped by callWithRetry below.
export async function sendGeminiRequest(messages, options) {
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
    const t0 = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (isDebug()) log('Gemini request duration', { durationMs: Date.now() - t0, status: response.status });

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
// Rate limits (429) are retried at most once with a polite, capped backoff —
// see MAX_RATELIMIT_RETRIES below. We never hammer the Free Tier.
function isTransient(err) {
  if (!err || typeof err.message !== 'string') return false;
  return (
    /\b(500|502|503|504)\b/.test(err.message) ||
    /timed out/i.test(err.message) ||
    /network/i.test(err.message) ||
    /ECONNRESET/i.test(err.message) ||
    /fetch failed/i.test(err.message)
  );
}

export function isRateLimit(err) {
  return Boolean(err?.isRateLimit) || /\b429\b/.test(err?.message || '');
}

// Resolve the starting output-token budget for a request.
function resolveMaxTokens(options) {
  return Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0
    ? Number(options.maxTokens)
    : TOKEN_BUDGETS[options.agentName] || 1024;
}

async function callWithRetry(messages, options) {
  let maxTokens = resolveMaxTokens(options);
  const attempts = (options.retries ?? DEFAULT_RETRIES) + 1;
  let lastError;
  // Truncation retries escalate the budget and are allowed in addition to the
  // normal transient retries, so a genuinely large response still completes.
  let truncationTries = 0;
  const MAX_TRUNCATION_TRIES = 3;

  // Rate-limit handling: back off ONCE with a short, capped delay and retry a
  // single time. This exists mainly for the Gemini-only (no fallback) case,
  // where a brief backoff can ride out a transient 429. When fallback providers
  // are configured, the manager's retry.js throws the 429 immediately so it can
  // fail over to the next provider instead of waiting — so this inner backoff
  // only runs once before the manager hands off. We keep it short (≤10s) so
  // quota-exceeded requests fail over fast. The process never crashes on a 429.
  let rateLimitTries = 0;
  const MAX_RATELIMIT_RETRIES = 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await sendGeminiRequest(messages, { ...options, maxTokens });
    } catch (err) {
      lastError = err;
      log('Attempt error', { attempt, error: err.message });

      // Truncation: give the model more room and retry without counting it
      // against the transient retry budget.
      if (err.isTruncation && maxTokens < MAX_OUTPUT_CAP && truncationTries < MAX_TRUNCATION_TRIES) {
        maxTokens = Math.min(MAX_OUTPUT_CAP, Math.ceil(maxTokens * 2));
        truncationTries += 1;
        log('Output truncated — retrying with larger token budget', { truncationTries, maxTokens });
        attempt -= 1; // do not consume a transient attempt
        continue;
      }

      // Rate limit: back off once (capped at 10s) and retry exactly once.
      // A second consecutive 429 is thrown so the client can surface Retry.
      if (isRateLimit(err) && rateLimitTries < MAX_RATELIMIT_RETRIES) {
        rateLimitTries += 1;
        const base = Math.min(err.retryAfter || 3, 10);
        const waitMs = base * 1000 * rateLimitTries;
        log('Rate limited — single short backoff before one retry', { rateLimitTries, waitMs });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!isTransient(err)) throw err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
  }
  throw lastError;
}

// Exported so providers/gemini.js can invoke the full Gemini retry path
// (truncation budget escalation + rate-limit backoff) without duplicating logic.
// This is the internal callWithRetry function made available under a stable name.
export async function callGeminiWithRetry(messages, options = {}) {
  return callWithRetry(messages, options);
}

// ── Provider abstraction ─────────────────────────────────────────────────────
// callOpenRouter / callOpenRouterFast are now routed through aiManager, which
// tries Gemini first (via providers/gemini.js → callGeminiWithRetry → callWithRetry
// → sendGeminiRequest) and falls back to OpenRouter / Cohere / Mistral if Gemini
// is exhausted.
//
// All existing callers (jsonParser.js, agents, controllers) continue to import
// from this file — the interface is 100% backward-compatible.
//
// We use a lazy dynamic import to avoid a circular reference at module load time
// (gemini.js ← providers/gemini.js ← providerRegistry ← aiManager → gemini.js).
export async function callOpenRouter(messages, options = {}) {
  const { callOpenRouter: managerCall } = await import('../manager/aiManager.js');
  return managerCall(messages, options);
}

export async function callOpenRouterFast(messages, options = {}) {
  const { callOpenRouterFast: managerCall } = await import('../manager/aiManager.js');
  return managerCall(messages, { ...options, fast: true });
}

