const API_BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Network-level failure (backend down / proxy can't reach :5000) throws here
  // before `res` exists — surface a clear message instead of a generic one.
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      'Cannot reach the server. Make sure the backend is running (npm run dev:server).'
    );
  }

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
    session: (id) => request(`/learning/session/${id}`),
    reanalyze: (id) => request(`/learning/session/${id}/analyze`, { method: 'POST' }),
  },
  quiz: {
    generate: (body) => request('/quiz/generate', { method: 'POST', body: JSON.stringify(body) }),
    get: (id) => request(`/quiz/quiz/${id}`),
    submit: (body) => request('/quiz/submit', { method: 'POST', body: JSON.stringify(body) }),
    history: () => request('/quiz/history'),
    attempt: (id) => request(`/quiz/attempt/${id}`),
  },
  ai: {
    explain: (body) => request('/ai/explain', { method: 'POST', body: JSON.stringify(body) }),
    studyPlan: (body) => request('/ai/study-plan', { method: 'POST', body: JSON.stringify(body) }),
    summary: (body) => request('/ai/summary', { method: 'POST', body: JSON.stringify(body) }),
    flashcards: (body) => request('/ai/flashcards', { method: 'POST', body: JSON.stringify(body) }),
    studyPlans: () => request('/ai/study-plans'),
  },
  dashboard: {
    progress: () => request('/dashboard/progress'),
    analytics: () => request('/dashboard/analytics'),
    weakTopics: () => request('/dashboard/weak-topics'),
  },
};
