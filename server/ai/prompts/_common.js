// Shared, minimal system instruction used by every AI prompt.
// Replaces the long, repeated boilerplate ("You are a senior university
// professor with 20+ years... Never hallucinate...") that was duplicated in
// every prompt. This cuts input tokens on every single Gemini call.

export const JSON_SYSTEM =
  'You are a concise educational AI. Return ONLY valid JSON, no markdown, no extra text.';

// Build a system message: shared prefix + one short, feature-specific line.
export function system(specific) {
  return `${JSON_SYSTEM} ${specific}`;
}
