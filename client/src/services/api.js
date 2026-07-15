const rawApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const API_BASE = rawApiUrl ? `${rawApiUrl}/api` : '/api';

// Retry ONLY transient connection failures (server restarting / not yet
// listening) and ONLY for idempotent GET requests. A brief backend restart
// (e.g. dev server reload) must not permanently fail a session load. Write
// requests (POST) are never retried to avoid duplicate submissions.
function isTransientNetworkError(err) {
  return /ECONNRESET|ECONNREFUSED|Failed to fetch|NetworkError/i.test(err?.message || '');
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const method = (options.method || 'GET').toUpperCase();
  const canRetry = method === 'GET';
  const MAX_RETRIES = canRetry ? 3 : 0;

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: options.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.message
          ? data.message
          : res.status === 401
            ? 'Your session expired. Please log in again.'
            : `Request failed (${res.status})`;
        const err = new Error(detail);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      lastError = err;
      // Cancellations must never be retried or reported as failures.
      if (err?.name === 'AbortError' || err?.isCanceled) break;
      if (!canRetry || !isTransientNetworkError(err) || attempt === MAX_RETRIES) {
        if (res === undefined) {
          throw new Error('Cannot reach the server. Make sure the backend is running (npm run dev:server).');
        }
        throw err;
      }
      // Server is likely mid-restart; wait and retry.
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export const api = {
  auth: {
    signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request('/auth/me'),
  },
  learning: {
    upload: (formData) => request('/learning/upload', { method: 'POST', body: formData }),
    paste: (body) => request('/learning/paste', { method: 'POST', body: JSON.stringify(body) }),
    topic: (body) => request('/learning/topic', { method: 'POST', body: JSON.stringify(body) }),
    youtube: (body) => request('/learning/youtube', { method: 'POST', body: JSON.stringify(body) }),
    sessions: () => request('/learning/sessions'),
    session: (id, signal) => request(`/learning/session/${id}`, { signal }),
    reanalyze: (id) => request(`/learning/session/${id}/analyze`, { method: 'POST' }),
  },
  quiz: {
    generate: (body, signal) => request('/quiz/generate', { method: 'POST', body: JSON.stringify(body), signal }),
    get: (id, signal) => request(`/quiz/quiz/${id}`, { signal }),
    submit: (body, signal) => request('/quiz/submit', { method: 'POST', body: JSON.stringify(body), signal }),
    history: () => request('/quiz/history'),
    attempt: (id) => request(`/quiz/attempt/${id}`),
  },
  ai: {
    explain: (body, signal) => request('/ai/explain', { method: 'POST', body: JSON.stringify(body), signal }),
    studyPlan: (body, signal) => request('/ai/study-plan', { method: 'POST', body: JSON.stringify(body), signal }),
    summary: (body, signal) => request('/ai/summary', { method: 'POST', body: JSON.stringify(body), signal }),
    flashcards: (body, signal) => request('/ai/flashcards', { method: 'POST', body: JSON.stringify(body), signal }),
    studyPlans: () => request('/ai/study-plans'),
  },
  dashboard: {
    progress: () => request('/dashboard/progress'),
    analytics: () => request('/dashboard/analytics'),
    weakTopics: () => request('/dashboard/weak-topics'),
  },
};
