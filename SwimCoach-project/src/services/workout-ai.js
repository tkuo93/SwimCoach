/**
 * Workout AI Service
 *
 * Generates structured workouts by:
 * 1. Querying Open Notebook for relevant training insights from the knowledge base
 * 2. Reading past feedback from MEMORY.md
 * 3. Sending insights + feedback + swimmer profile to OpenRouter's LLM for workout generation
 */

const axios = require('axios');
const { getFeedbackSummary } = require('./memory');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPEN_NOTEBOOK_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';
const OPEN_NOTEBOOK_MODEL = process.env.OPEN_NOTEBOOK_MODEL || '';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/owl-alpha';

// ─── RAG Cache ──────────────────────────────────────────────────────
const ragCache = new Map();
const RAG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RAG_CACHE_MAX = 200;

function cacheGet(key) {
  const entry = ragCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > RAG_CACHE_TTL_MS) {
    ragCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (ragCache.size >= RAG_CACHE_MAX) {
    const oldestKey = ragCache.keys().next().value;
    ragCache.delete(oldestKey);
  }
  ragCache.set(key, { value, ts: Date.now() });
}

function hashInsightsPrompt(profile, customization) {
  const type = resolveTrainingFocus(profile, customization);
  const event = profile.goals?.primaryEvents?.[0];
  const distance = event ? `${event.distance}m${event.stroke}` : 'general';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLen = resolvePoolLength(customization, profile);
  const poolUnit = isPoolYards(customization, profile) ? 'yd' : 'm';
  const poolGear = Object.entries(profile.equipment?.poolEquipment || {}).filter(([, v]) => v).map(([k]) => k).sort().join(',');
  const gymGear = Object.entries(profile.equipment?.gymEquipment || {}).filter(([, v]) => v).map(([k]) => k).sort().join(',');
  return `${type}|${distance}|${duration}|${poolLen}|${poolUnit}|${poolGear}|${gymGear}`;
}

// ─── Step 1: Query Open Notebook for knowledge base insights ──────────

async function getTrainingInsights(profile, customization) {
  const prompt = buildInsightsPrompt(profile, customization);

  // Try the full RAG query first (sources + notes combined)
  try {
    const { query } = require('./open-notebook');
    const answer = await query(prompt);
    if (answer && answer !== 'No answer generated') return answer;
  } catch {
    // Fall through to simpler endpoint
  }

  // Fallback: direct REST call (non-streaming)
  const modelId = OPEN_NOTEBOOK_MODEL;
  const onClient = axios.create({
    baseURL: OPEN_NOTEBOOK_URL,
    timeout: 60_000,
  });

  try {
    const res = await onClient.post('/api/search/ask/simple', {
      question: prompt,
      strategy_model: modelId,
      answer_model: modelId,
      final_answer_model: modelId,
    });
    return res.data?.answer || '';
  } catch {
    return '';
  }
}

/**
 * Fetch notes from a specific Open Notebook notebook.
 * Open Notebook exposes notes via GET /api/notebooks/{id}/notes.
 * If no notebookId is configured, this returns empty string.
 */
async function getNotebookNotes(notebookId, topic) {
  if (!notebookId) return '';

  const onClient = axios.create({
    baseURL: OPEN_NOTEBOOK_URL,
    timeout: 30_000,
  });

  try {
    // Try to get notes from a specific notebook
    const res = await onClient.get(`/api/notebooks/${notebookId}/notes`, {
      params: topic ? { topic } : {},
    });
    const notes = res.data?.notes || res.data;
    if (Array.isArray(notes)) {
      return notes.map(n => n.content || n.text || n).join('\n\n');
    }
    if (typeof notes === 'string') return notes;
    return '';
  } catch {
    return '';
  }
}

/**
 * Fetch notes from Open Notebook's general notes endpoint.
 * This accesses notes that Open Notebook has generated from ingested sources.
 */
async function getAllNotebookNotes(topic) {
  const onClient = axios.create({
    baseURL: OPEN_NOTEBOOK_URL,
    timeout: 30_000,
  });

  try {
    // Try the general notes endpoint
    const res = await onClient.get('/api/notes', {
      params: topic ? { topic, limit: 5 } : { limit: 5 },
    });
    const notes = res.data?.notes || res.data;
    if (Array.isArray(notes)) {
      return notes.map(n => n.content || n.text || n).join('\n\n');
    }
    if (typeof notes === 'string') return notes;
    return '';
  } catch {
    return '';
  }
}

// Valid training focus values matching SwimmerProfile schema enum
const VALID_TRAINING_FOCUSES = new Set(['sprint', 'distance', 'technique', 'endurance', 'speed', 'maintenance', 'lactate', 'resistance-power', 'mobility', 'recovery']);

function resolveTrainingFocus(profile, customization) {
  if (customization.workoutType) return customization.workoutType;
  const tf = profile.goals?.trainingFocus;
  if (Array.isArray(tf) && tf.length > 0) {
    // Return first valid focus value
    const valid = tf.find(t => VALID_TRAINING_FOCUSES.has(t));
    return valid || tf[0] || 'endurance';
  }
  if (typeof tf === 'string' && VALID_TRAINING_FOCUSES.has(tf)) return tf;
  return 'endurance';
}

/**
 * Normalize poolLength to a display string like "25m" or "50yd".
 * Handles both the new { value, unit } object and old string formats.
 */
function resolvePoolLength(customization, profile) {
  // Customization override takes priority
  if (customization.poolLength) {
    const cl = customization.poolLength;
    if (typeof cl === 'object' && cl.value) {
      return `${cl.value}${cl.unit === 'yards' ? 'yd' : 'm'}`;
    }
    return cl; // already a string
  }
  // Profile default
  const pl = profile.equipment?.poolLength;
  if (pl) {
    if (typeof pl === 'object' && pl.value) {
      return `${pl.value}${pl.unit === 'yards' ? 'yd' : 'm'}`;
    }
    if (typeof pl === 'string') return pl;
  }
  return '25m';
}

/**
 * Get the pool unit string for prompt display (e.g. "25 meters", "50 yards").
 */
function resolvePoolLengthDisplay(customization, profile) {
  const str = resolvePoolLength(customization, profile);
  const match = str.match(/^(\d+)(m|yd|meters|yards)?$/i);
  if (match) {
    const unit = match[2];
    const unitLabel = unit && unit.startsWith('y') ? 'yards' : 'meters';
    return `${match[1]} ${unitLabel}`;
  }
  return str;
}

/**
 * Check whether the pool is in yards (for unit-aware workout generation).
 */
function isPoolYards(customization, profile) {
  if (customization.poolLength) {
    const cl = customization.poolLength;
    if (typeof cl === 'object') return cl.unit === 'yards';
    if (typeof cl === 'string') return /yd|yards|scy/i.test(cl);
  }
  const pl = profile.equipment?.poolLength;
  if (pl) {
    if (typeof pl === 'object') return pl.unit === 'yards';
    if (typeof pl === 'string') return /yd|yards|scy/i.test(pl);
  }
  return false;
}

function buildInsightsPrompt(profile, customization) {
  const type = resolveTrainingFocus(profile, customization);
  const event = profile.goals?.primaryEvents?.[0];
  const distance = event ? `${event.distance}m ${event.stroke}` : 'general swimming';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLen = resolvePoolLengthDisplay(customization, profile);
  const poolUnit = isPoolYards(customization, profile) ? 'yards' : 'meters';

  // Build equipment context
  const poolGear = Object.entries(profile.equipment?.poolEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const gymGear = Object.entries(profile.equipment?.gymEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const equipmentParts = [];
  if (poolGear.length) equipmentParts.push(`Pool equipment: ${poolGear.join(', ')}`);
  if (gymGear.length) equipmentParts.push(`Gym equipment: ${gymGear.join(', ')}`);
  if (equipmentParts.length === 0) equipmentParts.push('No special equipment available');
  const equipmentStr = equipmentParts.join('; ');

  return `Find scientific training principles and methodologies for:\n- ${type} training for ${distance}\n- ${duration} minute session\n- ${profile.experienceLevel || 'intermediate'} level swimmer\n- ${poolLen} pool (${poolUnit})\n- ${equipmentStr}\n\nReturn relevant training principles, set structures, interval recommendations, and any scientific findings from the knowledge base. Include source citations.`;
}

// ─── Step 2: Generate structured workout via OpenRouter ───────────────

async function generateWorkout(profile, customization) {
  // Resolve training focus once for reuse
  const type = resolveTrainingFocus(profile, customization);

  // Check RAG cache first
  const cacheKey = hashInsightsPrompt(profile, customization);
  let insights = cacheGet(cacheKey);

  // Fire independent calls in parallel: RAG query (if not cached) + notebook notes
  const notesTopic = `${type} training for swimmers`;
  const tasks = [];

  if (insights === null) {
    tasks.push(
      getTrainingInsights(profile, customization).then(result => {
        cacheSet(cacheKey, result);
        insights = result;
      })
    );
  } else {
    tasks.push(Promise.resolve()); // no-op, already cached
  }

  let notebookNotes = '';
  tasks.push(
    getAllNotebookNotes(notesTopic).then(result => { notebookNotes = result; })
  );

  await Promise.all(tasks);

  // Get past feedback summary from MEMORY.md
  const feedbackSummary = getFeedbackSummary(10);

  // Determine model — allow override via customization (for debug mode)
  const model = customization.llmModel || DEFAULT_MODEL;

  const sessionType = customization.sessionType || 'both';
  const includePool = sessionType === 'both' || sessionType === 'pool';
  const includeGym = sessionType === 'both' || sessionType === 'gym';

  const systemPrompt = buildSystemPrompt(includePool, includeGym);

  const userPrompt = buildWorkoutPrompt(profile, customization, insights, feedbackSummary, notebookNotes);

  const response = await axios.post(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      provider: { order: ['openai'], sort: 'throughput' },
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://swimcoach.app',
        'X-Title': 'SwimCoach',
      },
      timeout: 120_000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from OpenRouter');

  let jsonStr = content.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  if (!jsonStr.startsWith('{')) {
    const braceMatch = jsonStr.match(/\{[\s\S]+\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('JSON parse error. Raw content:', content.substring(0, 500));
    throw new Error(`Failed to parse workout JSON: ${parseErr.message}`);
  }
}

function buildWorkoutPrompt(profile, customization, insights, feedbackSummary, notebookNotes) {
  const type = resolveTrainingFocus(profile, customization);
  const events = profile.goals?.primaryEvents || [];
  const primaryEvent = events[0];
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLength = resolvePoolLength(customization, profile);
  const poolLengthDisplay = resolvePoolLengthDisplay(customization, profile);
  const poolIsYards = isPoolYards(customization, profile);
  const poolUnit = poolIsYards ? 'yards' : 'meters';
  const poolUnitAbbr = poolIsYards ? 'yd' : 'm';

  // Distance unit label for display in best times, events, etc.
  const distUnit = poolIsYards ? 'yd' : 'm';

  // Build equipment lists
  const poolEquip = profile.equipment?.poolEquipment || {};
  const gymEquip = profile.equipment?.gymEquipment || {};
  const availablePoolGear = Object.entries(poolEquip).filter(([, v]) => v).map(([k]) => k);
  const availableGymGear = Object.entries(gymEquip).filter(([, v]) => v).map(([k]) => k);

  // Standard distances appropriate for this pool unit
  // Yards pools (SCY): 50, 100, 200, 400, 500, 1000, 1650 yd
  // Meters pools (SCM/LCM): 50, 100, 200, 400, 800, 1500 m
  const standardDistances = poolIsYards
    ? [50, 100, 200, 400, 500, 1000, 1650]
    : [50, 100, 200, 400, 800, 1500];

  const parts = [
    `Generate a ${type} workout for the following swimmer:`,
    '',
    '## Swimmer Profile',
    `- Name: ${profile.firstName} ${profile.lastName}`,
    `- Level: ${profile.experienceLevel || 'intermediate'}`,
    `- Session duration: ${duration} minutes`,
    `- Pool length: ${poolLengthDisplay} (${poolUnit})`,
    `- Pool sessions/week: ${profile.trainingSchedule?.weeklyPoolSessions || 3}`,
    `- Gym sessions/week: ${profile.trainingSchedule?.weeklyGymSessions || 2}`,
  ];

  if (events.length > 0) {
    parts.push(`- Events: ${events.map(e => `${e.distance}${distUnit} ${e.stroke}`).join(', ')}`);
  } else {
    parts.push(`- Primary event: ${primaryEvent ? `${primaryEvent.distance}${distUnit} ${primaryEvent.stroke}` : 'general'}`);
  }

  if (profile.goals?.outcomes?.length) {
    parts.push(`- Desired outcomes: ${profile.goals.outcomes.join(', ')}`);
  }

  if (profile.bestTimes?.length) {
    parts.push(`- Best times: ${profile.bestTimes.map(t => `${t.distance}${distUnit} ${t.stroke} (${t.poolLength}): ${t.time}`).join(', ')}`);
  }

  if (profile.goals?.targetImprovement) {
    parts.push(`- Goal: ${profile.goals.targetImprovement}`);
  }

  if (customization.intensity) parts.push(`- Intensity: ${customization.intensity}`);

  parts.push('');

  // ── Pool constraints (CRITICAL — AI must follow these) ──
  parts.push('## Pool Workout Constraints — STRICT');
  parts.push(`THIS IS A ${poolUnit.toUpperCase()} POOL. ALL swim distances MUST be in ${poolUnit} (e.g. ${standardDistances.slice(0, 4).join(', ')} ${poolUnit}). NEVER use meter-based distances like 100m, 200m, 400m in a yards pool.`);
  if (availablePoolGear.length > 0) {
    parts.push(`- Pool equipment available: ${availablePoolGear.join(', ')}`);
  } else {
    parts.push('- No pool equipment available — do NOT use fins, paddles, pull buoy, snorkel, parachute, or bands');
  }

  parts.push('');

  // ── Gym constraints (CRITICAL — AI must follow these) ──
  parts.push('## Gym Workout Constraints — STRICT');
  if (availableGymGear.length > 0) {
    parts.push(`- Gym equipment available: ${availableGymGear.join(', ')}`);
  } else {
    parts.push('- NO gym equipment — bodyweight exercises ONLY');
  }

  parts.push('');

  // Knowledge base insights
  if (insights && insights !== 'No answer generated') {
    parts.push('## Knowledge Base Insights');
    parts.push(insights);
    parts.push('');
  }

  if (notebookNotes) {
    parts.push('## Notebook Notes');
    parts.push('The following notes have been generated by Open Notebook from ingested swimming research sources. Use these insights to inform the workout design:');
    parts.push('');
    parts.push(notebookNotes);
    parts.push('');
  }

  if (feedbackSummary) {
    parts.push('## Past Workout Feedback');
    parts.push('The following feedback has been collected from this swimmer\'s previous workouts. Use this to adjust intensity, difficulty, and exercise selection:');
    parts.push('');
    parts.push(feedbackSummary);
    parts.push('');
  }

  const sessionType = customization.sessionType || 'both';
  const includePool = sessionType === 'both' || sessionType === 'pool';
  const includeGym = sessionType === 'both' || sessionType === 'gym';

  parts.push('## Output Requirements');
  parts.push(`- Total workout time: ${duration} minutes (including warm-up and cool-down)`);
  if (includePool) {
    parts.push(`- Pool workout for a ${poolLengthDisplay} ${poolUnit} pool`);
    parts.push(`- ALL distances MUST be standard ${poolUnit} distances: ${standardDistances.join(', ')} ${poolUnitAbbr}`);
    parts.push(`- DO NOT use distances like ${poolIsYards ? '100m, 200m, 400m' : '100yd, 200yd, 400yd'} — wrong unit`);
    parts.push('- Include specific distances, reps, rest intervals, and target paces');
  }
  if (includeGym) {
    parts.push('- Include a gym session with exercises, sets, reps, and rest periods');
    parts.push('- Every gym exercise MUST only use the available equipment listed above');
  }
  parts.push('- Provide 3-5 training notes with scientific rationale');
  parts.push('- Return ONLY valid JSON, no other text');

  return parts.join('\n');
}

function buildSystemPrompt(includePool, includeGym) {
  const poolJson = includePool ? `
  "warmUp": {
    "description": "Detailed warm-up instructions",
    "distance": number (pool lengths — use the unit specified in constraints),
    "duration": number (minutes)
  },
  "mainSet": [
    {
      "distancePerRep": number (per repetition — appropriate for the pool length and unit specified),
      "reps": number,
      "stroke": "freestyle|backstroke|breaststroke|butterfly|im|kick|drill",
      "restInterval": "e.g., 1:30, 2:00, 15s",
      "focus": "e.g., technique, speed, endurance, power",
      "notes": "Additional instructions"
    }
  ],
  "coolDown": {
    "description": "Detailed cool-down instructions",
    "distance": number,
    "duration": number (minutes)
  },
  "totalDistance": number,` : '';

  const gymJson = includeGym ? `
  "gymWorkout": {
    "warmUp": { "description": "Gym warm-up", "duration": number },
    "exercises": [
      { "exercise": "name (bodyweight or using ONLY available equipment)", "sets": number, "reps": number, "restSeconds": number, "muscleGroup": "one of: arms, legs, core, chest, back, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, glutes, calves, hip-flexors, adductors, abductors, rotator-cuff, lower-back, obliques, full-body", "notes": "form cues — do not reference equipment not listed as available" }
    ],
    "coolDown": { "description": "Stretching", "duration": number }
  },` : '';

  return `You are an expert swim coach and exercise scientist. Your task is to generate a structured workout plan as a JSON object.

CRITICAL RULES:
- Only suggest exercises using equipment the swimmer actually has available
- Only suggest swim distances appropriate for the swimmer's pool length and unit (yards vs meters)
- If no gym equipment is available, use only bodyweight exercises
- If no pool equipment is available, do not include equipment-dependent swim sets

CRITICAL: Respond with ONLY a valid JSON object. No markdown code blocks, no explanatory text before or after the JSON. Just the raw JSON object starting with { and ending with }. Generate structured, personalized workouts based on the provided knowledge base insights and swimmer profile.

Always respond with valid JSON in this exact structure:
{${poolJson}${gymJson}
  "trainingNotes": [
    "Scientific principle or rationale 1",
    "Training tip 2",
    "Safety consideration 3"
  ]
}`;
}

module.exports = {
  generateWorkout,
  getTrainingInsights,
  getNotebookNotes,
  getAllNotebookNotes,
  buildInsightsPrompt,
  buildWorkoutPrompt,
  buildSystemPrompt,
  resolveTrainingFocus,
  resolvePoolLength,
  isPoolYards,
};
