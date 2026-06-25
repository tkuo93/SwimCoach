/**
 * SwimCoach API Client
 * Thin fetch wrapper around the Express REST API.
 */

const BASE = '/api';

async function request(path, { method = 'GET', body, headers: extraHeaders } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
  },

  // ─── Workouts ─ pass swimmerId for ownership verification ───
  _workoutHeaders(swimmerId) {
    return swimmerId ? { 'X-Swimmer-Id': swimmerId } : {};
  },
  workouts: {
    list: (swimmerId) => request(`/workouts${swimmerId ? `?swimmerId=${swimmerId}` : ''}`),
    get: (id, swimmerId) => request(`/workouts/${id}`, { headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    generate: (data, swimmerId) => request('/workouts/generate', { method: 'POST', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    feedback: (id, data, swimmerId) => request(`/workouts/${id}/feedback`, { method: 'POST', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    chat: (id, data, swimmerId) => request(`/workouts/${id}/chat`, { method: 'POST', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    regenerate: (id, data, swimmerId) => request(`/workouts/${id}/regenerate`, { method: 'POST', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    generateProgram: (data, swimmerId) => request('/workouts/generate/program', { method: 'POST', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    getProgram: (programId, swimmerId) => request(`/workouts/program/${programId}`, { headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    delete: (id, swimmerId) => request(`/workouts/${id}`, { method: 'DELETE', headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
    update: (id, data, swimmerId) => request(`/workouts/${id}`, { method: 'PUT', body: data, headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {} }),
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

  // ─── Memory ───
  memory: {
    get: () => request('/memory'),
    summary: (max) => request(`/memory/summary${max ? `?max=${max}` : ''}`),
    append: (data) => request('/memory', { method: 'POST', body: data }),
  },

  // ─── Debug ───
  debug: {
    profiles: () => request('/debug/profiles'),
    prompts: (swimmerId, workoutType, duration, llmModel) => {
      const params = new URLSearchParams({ swimmerId, workoutType, duration });
      if (llmModel) params.set('llmModel', llmModel);
      return request(`/debug/prompts?${params}`);
    },
  },

  // ─── Coach ───
  coach: {
    chat: (data, swimmerId) => request('/coach/chat', {
      method: 'POST',
      body: data,
      headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {},
    }),
    confirm: (conversationId, actionIndex, swimmerId) => request(`/coach/chat/${conversationId}/confirm`, {
      method: 'POST',
      body: { actionIndex },
      headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {},
    }),
    dismiss: (conversationId, actionIndex, swimmerId) => request(`/coach/chat/${conversationId}/dismiss`, {
      method: 'POST',
      body: { actionIndex },
      headers: swimmerId ? { 'X-Swimmer-Id': swimmerId } : {},
    }),
  },
};

// ES module export
export { api };
// Also expose globally for backward compatibility
window.api = api;
