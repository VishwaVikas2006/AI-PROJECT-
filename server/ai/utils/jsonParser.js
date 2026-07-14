// Best-effort repair of a JSON string that was cut off mid-write (e.g. a
// truncated model response). It is deliberately conservative: it only returns a
// value when the repaired text parses as VALID JSON. It never invents data — it
// merely closes the structures the model had already opened. Returns null if a
// safe repair cannot be produced. This is a safety net; the Gemini layer retries
// on truncation before this is ever reached.
function tryRepair(text) {
  const trimmed = text.trim();
  if (!/^[\[{]/.test(trimmed)) return null;

  // Strip a trailing comma that sits right before a closing bracket.
  let s = trimmed.replace(/,(\s*[}\]])/g, '$1');

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      if (stack.length === 0) return null;
      const open = stack.pop();
      if ((c === '}' && open !== '{') || (c === ']' && open !== '[')) return null;
    }
  }

  // Close any string the model was still writing, then close open structures
  // in the reverse order they were opened.
  let repaired = s;
  if (inString) repaired += '"';
  while (stack.length) {
    const open = stack.pop();
    repaired += open === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

export function parseJSON(text) {
  if (text == null) throw new Error('Empty AI response');

  if (typeof text !== 'string') {
    return text;
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Candidate substrings to try, in priority order: the whole thing, then the
  // outermost {…} and […] (models sometimes wrap prose around the JSON).
  const candidates = [cleaned];
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  const bracketMatch = cleaned.match(/\[[\s\S]*\]/);
  if (braceMatch) candidates.push(braceMatch[0]);
  if (bracketMatch) candidates.push(bracketMatch[0]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = tryRepair(candidate);
      if (repaired !== null) return repaired;
    }
  }

  // Never expose the raw parser detail (position/column) to the caller — the
  // controller wraps this and shows the message to the user. Raw text stays on
  // the error object for server-side logging only.
  const parseError = new Error('The AI returned a response we could not read. Please try again.');
  parseError.rawText = cleaned;
  throw parseError;
}

export async function callAndParse(messages, options = {}) {
  const { callOpenRouter, isRateLimit } = await import('./gemini.js');

  try {
    const content = await callOpenRouter(messages, { ...options, json: true });
    return parseJSON(content);
  } catch (err) {
    // Preserve rate-limit errors intact so controllers can return HTTP 429
    // with a friendly message and Retry-After, instead of blindly retrying.
    if (isRateLimit(err)) {
      err.status = 429;
      err.isRateLimit = true;
      throw err;
    }
    const agentName = options.agentName || 'AI Agent';
    console.error(`AI failure in ${agentName}`);
    if (err?.message) {
      console.error('Error message:', err.message);
    }
    if (err?.stack) {
      console.error('Stack trace:', err.stack);
    }
    if (err?.rawText) {
      console.error('Raw AI response:', err.rawText);
    }

    if (options.fallback) {
      console.error('Recovery action: returning fallback object.');
      return options.fallback;
    }

    if (typeof err === 'object' && err !== null && 'response' in err && typeof err.response === 'string') {
      console.error('Raw AI response:', err.response);
    }

    const errMsg = err?.message || String(err);
    throw new Error(`AI call failed: ${errMsg}`);
  }
}
