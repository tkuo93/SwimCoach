const axios = require('axios');

/**
 * Open Notebook REST API client.
 *
 * Provides two capabilities:
 *   1. query(question) — RAG query against uploaded swim training documents
 *   2. submitRequest / pollForResponse — async queue for workout generation
 *      (kept for backwards compatibility with the existing workout-generator.js)
 *
 * Required Open Notebook API fields (strategy_model, answer_model, final_answer_model)
 * are auto-resolved from /api/models at startup, or overridden via OPEN_NOTEBOOK_MODEL env var.
 */

const BASE_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';
const TIMEOUT_MS = 120_000;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Resolve the model ID to use for all three Open Notebook API fields.
 *
 * Priority:
 *   1. OPEN_NOTEBOOK_MODEL env var (explicit override)
 *   2. Default chat model from /api/models/defaults (configured in Open Notebook UI)
 *   3. First available "language" model from /api/models (fallback)
 *   4. null (will cause a clear error message)
 */
async function resolveModelId() {
  // Explicit override takes priority
  if (process.env.OPEN_NOTEBOOK_MODEL) {
    return process.env.OPEN_NOTEBOOK_MODEL;
  }

  try {
    // Use the default model configured in Open Notebook Settings
    const defaults = await client.get('/api/models/defaults');
    if (defaults.data?.default_chat_model) {
      return defaults.data.default_chat_model;
    }
  } catch {
    // Endpoint unavailable — fall through to auto-detect
  }

  try {
    const res = await client.get('/api/models');
    const languageModels = res.data.filter(m => m.type === 'language');
    if (languageModels.length > 0) {
      return languageModels[0].id;
    }
  } catch {
    // Open Notebook unreachable — fall through to null
  }

  return null;
}

/** Cached model ID (resolved once at startup, lazily) */
let _cachedModelId = undefined;

/**
 * Get the cached model ID, resolving it on first call.
 */
async function getModelId() {
  if (_cachedModelId === undefined) {
    _cachedModelId = await resolveModelId();
  }
  return _cachedModelId;
}

/**
 * Query the knowledge base via Open Notebook's streaming RAG endpoint.
 *
 * Uses POST /api/search/ask (SSE streaming) because the Next.js proxy on 8502
 * times out on the non-streaming /ask/simple endpoint for complex queries.
 *
 * The SSE stream sends: strategy → answer(s) → final_answer → complete.
 * Some models don't reach final_answer, so we also accept the last answer event.
 *
 * Open Notebook API routes:
 *   POST /api/search/ask         — streaming RAG query (SSE) — what we use
 *   POST /api/search/ask/simple  — non-streaming (avoided: proxy timeout)
 *   POST /api/chat/execute       — session-based chat
 */
async function query(question, opts = {}) {
  const modelId = await getModelId();

  if (!modelId) {
    throw new Error(
      'No Open Notebook model available. ' +
      'Set OPEN_NOTEBOOK_MODEL env var or ensure Open Notebook has language models configured.'
    );
  }

  // Retry up to N times on transient Open Notebook errors (strategy parse failures, etc.)
  const maxRetries = opts.retries ?? 3;
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const answer = await _streamQuery(question, modelId);
      if (answer && answer !== 'No answer generated') return answer;
      lastErr = new Error('No answer generated');
    } catch (err) {
      lastErr = err;
      // Only retry on transient Open Notebook errors, not on timeout or connection errors
      if (err.message?.includes('timed out') || err.message?.includes('ECONNREFUSED')) break;
    }
  }

  throw lastErr;
}

async function _streamQuery(question, modelId) {
  // Use axios for streaming because the Node.js http module has issues with
  // SSE data events when called from within an Express server process.
  const axios = require('axios');
  const { URL } = require('url');

  const proxyUrl = new URL(BASE_URL);
  const pythonBaseUrl = `${proxyUrl.protocol}//${proxyUrl.hostname}:5055`;

  const res = await axios({
    method: 'post',
    url: `${pythonBaseUrl}/api/search/ask`,
    data: { question, strategy_model: modelId, answer_model: modelId, final_answer_model: modelId },
    responseType: 'stream',
    timeout: TIMEOUT_MS,
  });

  let lastAnswer = '';
  let buffer = '';

  return new Promise((resolve, reject) => {
    res.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(line.slice(6));
          if ((json.type === 'answer' || json.type === 'final_answer') && json.content) {
            lastAnswer = json.content;
          }
          if (json.type === 'complete') {
            resolve(lastAnswer || json.final_answer || 'No answer generated');
            return;
          }
          if (json.type === 'error') {
            reject(new Error(`Open Notebook RAG error: ${json.message || 'unknown error'}`));
            return;
          }
        } catch {
          // malformed JSON in SSE — skip
        }
      }
    });

    res.data.on('end', () => resolve(lastAnswer || 'No answer generated'));
    res.data.on('error', reject);
  });
}

/**
 * Submit a generation request (queue-based, for backwards compat).
 * With Open Notebook, this is now a thin wrapper around query().
 */
async function submitRequest(profile, customization) {
  const prompt = buildPrompt(profile, customization);

  // Fire the query immediately; Open Notebook is synchronous over HTTP
  const answer = await query(prompt);
  console.log('submitRequest: answer length:', answer?.length || 0);

  return {
    requestId: `req_${Date.now()}`,
    answer,
  };
}

/**
 * Poll for response — with Open Notebook this is instant (HTTP request already completed).
 * Kept for API compatibility with workout-generator.js.
 */
async function pollForResponse(responseFileOrAnswer, maxWaitMs) {
  // If called with a string (direct answer), return immediately
  if (typeof responseFileOrAnswer === 'string') {
    return { answer: responseFileOrAnswer };
  }
  // If called with { answer } object from submitRequest
  if (responseFileOrAnswer?.answer) {
    return { answer: responseFileOrAnswer.answer };
  }
  return responseFileOrAnswer;
}

/**
 * Query direct (now just an alias for query).
 */
async function queryDirect(question) {
  return query(question);
}

// ─── Prompt builder (same logic as before, now accepts customization with question field) ──────────

function buildPrompt(profile, customization) {
  // If customization has a raw 'question' field, use it directly
  if (customization?.question) {
    return customization.question;
  }

  const parts = [
    'You are a swim coach with access to a scientific swimming training knowledge base.',
    '',
    '## Swimmer Profile',
    `- Name: ${profile.firstName} ${profile.lastName}`,
    `- Experience: ${profile.experienceLevel || 'intermediate'}`,
    `- Goals: ${formatGoals(profile.goals)}`,
    `- Training schedule: ${profile.trainingSchedule?.weeklyPoolSessions || 3} pool sessions, ${profile.trainingSchedule?.weeklyGymSessions || 2} gym sessions per week`,
    `- Session duration: ${profile.trainingSchedule?.sessionDuration || 60} minutes`,
    profile.bestTimes?.length ? `- Best times: ${formatBestTimes(profile.bestTimes)}` : '',
    `- Equipment: ${formatEquipment(profile.equipment)}`,
    '',
    '## Workout Request',
  ];

  if (customization.workoutType) parts.push(`- Type: ${customization.workoutType}`);
  if (customization.duration) parts.push(`- Duration: ${customization.duration} minutes`);
  if (customization.poolLength) parts.push(`- Pool length: ${customization.poolLength}m`);
  if (customization.availableEquipment?.length) parts.push(`- Available equipment: ${customization.availableEquipment.join(', ')}`);
  if (customization.intensity) parts.push(`- Intensity: ${customization.intensity}`);
  if (customization.programPeriod) parts.push(`- Program period: ${customization.programPeriod}`);

  parts.push(
    '',
    '## Instructions',
    'Using the SwimCoach knowledge base (research papers and curated training sources), generate a detailed workout.',
    'The workout should be grounded in scientific training principles from the knowledge base.',
    'Return a JSON object with this exact structure:',
    '{',
    '  "warmUp": { "description": "...", "distance": number, "duration": number },',
    '  "mainSet": [',
    '    { "distancePerRep": number, "reps": number, "stroke": "...", "restInterval": "...", "focus": "...", "notes": "..." }',
    '  ],',
    '  "coolDown": { "description": "...", "distance": number, "duration": number },',
    '  "totalDistance": number,',
    '  "trainingNotes": ["note 1", "note 2", "note 3"]',
    '}',
  );

  return parts.filter(Boolean).join('\n');
}

// ─── Format helpers ────────────────────────────────────────────────

function formatGoals(goals) {
  if (!goals) return 'General fitness';
  const events = goals.primaryEvents?.map(e => `${e.distance}m ${e.stroke}`).join(', ') || '';
  const focus = goals.trainingFocus ? `, focus: ${goals.trainingFocus}` : '';
  const target = goals.targetImprovement ? `, target: ${goals.targetImprovement}` : '';
  return `${events}${focus}${target}` || 'General fitness';
}

function formatBestTimes(times) {
  if (!times || !times.length) return 'Not specified';
  return times.map(t => `${t.distance}m ${t.stroke}: ${t.time}`).join('; ');
}

function formatEquipment(equipment) {
  if (!equipment) return 'Standard pool access';
  const pool = equipment.poolLength ? `${equipment.poolLength}m pool` : '';
  const poolGear = equipment.poolEquipment
    ? Object.entries(equipment.poolEquipment).filter(([, v]) => v).map(([k]) => k).join(', ')
    : '';
  const gymGear = equipment.gymEquipment
    ? Object.entries(equipment.gymEquipment).filter(([, v]) => v).map(([k]) => k).join(', ')
    : '';
  return [pool, poolGear, gymGear].filter(Boolean).join(' | ') || 'Standard pool access';
}

module.exports = {
  query,
  queryDirect,
  submitRequest,
  pollForResponse,
  client,
  getModelId,
  // Allow tests to reset the cached model ID
  set cachedModelId(val) { _cachedModelId = val; },
  get cachedModelId() { return _cachedModelId; },
};
