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

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        const parseError = new Error(`Failed to parse AI JSON response: ${innerErr.message}`);
        parseError.rawText = cleaned;
        throw parseError;
      }
    }
    const parseError = new Error(`Failed to parse AI JSON response: ${err.message}`);
    parseError.rawText = cleaned;
    throw parseError;
  }
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
