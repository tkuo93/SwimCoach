/**
 * SwimCoach API Client
 * Thin fetch wrapper around the Express REST API.
 * Uses cookie-based authentication (credentials: 'include').
 *
 * AUTH MODEL: Backend extracts user identity from session/JWT (req.user._id).
 * Client does NOT pass user/swimmer/profile IDs - backend trusts only authenticated session.
 * This prevents IDOR: users can only access their own resources.
 */

const BASE = '/api';

async function request(path, { method = 'GET', body, headers: extraHeaders } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    credentials: 'include', // Include cookies for session auth
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // Server returned non-JSON (e.g. HTML error page, empty body)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    throw new Error(`Unexpected response from server: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = json.errors ? json.errors.join(', ') : (json.error || `HTTP ${res.status}`);
    throw new Error(msg);
  }

  return json;
}

const api = {
  // ─── Profiles ───
  profiles: {
    list: () => request('/profiles'),
    get: (id) => request(`/profiles/${id}`),
    create: (data) => request('/profiles', { method: 'POST', body: data }),
    update: (id, data) => request(`/profiles/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/profiles/${id}`, { method: 'DELETE' }),
    migrate: (profileId) => request('/profiles/migrate', { method: 'POST', body: { profileId } }),
  },

  // ─── Workouts ───
  workouts: {
    list: () => request('/workouts'),
    get: (id) => request(`/workouts/${id}`),
    generate: (data) => request('/workouts/generate', { method: 'POST', body: data }),
    feedback: (id, data) => request(`/workouts/${id}/feedback`, { method: 'POST', body: data }),
    chat: (id, data) => request(`/workouts/${id}/chat`, { method: 'POST', body: data }),
    regenerate: (id, data) => request(`/workouts/${id}/regenerate`, { method: 'POST', body: data }),
    generateProgram: (data) => request('/workouts/generate/program', { method: 'POST', body: data }),
    getProgram: (programId) => request(`/workouts/program/${programId}`),
    delete: (id) => request(`/workouts/${id}`, { method: 'DELETE' }),
    update: (id, data) => request(`/workouts/${id}`, { method: 'PUT', body: data }),
  },

  // ─── Customization Options ───
  customization: {
    options: () => request('/workouts/customize/options'),
  },

  // ─── Knowledge ───
  knowledge: {
    sources: () => request('/knowledge/sources'),
    query: (q) => request('/knowledge/query', { method: 'POST', body: { query: q } }),
    categories: () => request('/knowledge/categories'),
  },

  // ─── Coaching Memory ───
  memory: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/memory${qs ? `?${qs}` : ''}`);
    },
    create: (data) => request('/memory', { method: 'POST', body: data }),
    update: (id, data) => request(`/memory/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/memory/${id}`, { method: 'DELETE' }),
  },

  // ─── Debug ───
  debug: {
    profiles: () => request('/debug/profiles'),
    prompts: (workoutType, duration, llmModel) => {
      const params = new URLSearchParams({ workoutType, duration });
      if (llmModel) params.set('llmModel', llmModel);
      return request(`/debug/prompts?${params}`);
    },
  },

  // ─── Coach (general chat, no workout context) ───
  coach: {
    chat: (data) => request('/coach/chat', {
      method: 'POST',
      body: data,
    }),
    confirm: (conversationId, actionIndex) => request(`/coach/chat/${conversationId}/confirm`, {
      method: 'POST',
      body: { actionIndex },
    }),
    dismiss: (conversationId, actionIndex) => request(`/coach/chat/${conversationId}/dismiss`, {
      method: 'POST',
      body: { actionIndex },
    }),
  },

  // ─── Conversations (persistent chat history) ───
  conversations: {
    list: (includeMessages = false) =>
      request(`/conversations${includeMessages ? '?includeMessages=true' : ''}`),
    get: (id) => request(`/conversations/${id}`),
    findForWorkout: (workoutId) =>
      request(`/conversations/workout/${workoutId}`),
    create: (data) => request('/conversations', {
      method: 'POST',
      body: data,
    }),
    addMessages: (id, messages) => request(`/conversations/${id}/messages`, {
      method: 'PUT',
      body: { messages },
    }),
    setTitle: (id, title) => request(`/conversations/${id}/title`, {
      method: 'PUT',
      body: { title },
    }),
    delete: (id) => request(`/conversations/${id}`, {
      method: 'DELETE',
    }),
  },

  // ─── Auth ───
  auth: {
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'GET' }),
  },
};

// ES module export
export { api };
// Also expose globally for backward compatibility
window.api = api;