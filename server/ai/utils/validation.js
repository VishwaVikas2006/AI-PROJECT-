export function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEnum(value, allowed, fallback) {
  const normalized = trimString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function normalizeDifficulty(value) {
  const normalized = trimString(value).toLowerCase();
  if (['beginner', 'easy'].includes(normalized)) return 'Beginner';
  if (['intermediate', 'medium'].includes(normalized)) return 'Intermediate';
  if (['advanced', 'hard'].includes(normalized)) return 'Advanced';
  return 'Intermediate';
}

export function normalizePriority(value) {
  const normalized = trimString(value).toLowerCase();
  if (['high', 'medium', 'low'].includes(normalized)) return normalized;
  if (/^h/.test(normalized)) return 'high';
  if (/^m/.test(normalized)) return 'medium';
  if (/^l/.test(normalized)) return 'low';
  return 'medium';
}

export function normalizeString(value, fallback = '') {
  const trimmed = trimString(value);
  return trimmed || fallback;
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimString(item))
    .filter((item) => item.length > 0);
}

export function normalizeTopicObjects(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((topic) => topic && typeof topic === 'object')
    .map((topic) => ({
      name: normalizeString(topic.name || topic.title || topic.topic || topic.type, 'Unknown Topic'),
      description: normalizeString(topic.description || topic.summary || topic.details || '', ''),
    }))
    .filter((topic) => topic.name && topic.description);
}

export function isValidJsonResponse(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
