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
const CoachingMemory = require('../models/CoachingMemory');
const { getCSS, formatSecondsToSendOff, formatSecondsToTime } = require('../utils/interval-calculator');
const { callByRoute } = require('./model-router');
const { sanitizeModel } = require('../config/model-routes');

const OPEN_NOTEBOOK_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';
const OPEN_NOTEBOOK_MODEL = process.env.OPEN_NOTEBOOK_MODEL || '';

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
  const events = resolvePrimaryEvents(profile, customization);
  const distance = events.length > 0 ? events.map(e => `${e.distance}m ${e.stroke}`).join(', ') : 'general';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLen = resolvePoolLength(customization, profile);
  const poolUnit = isPoolYards(customization, profile) ? 'yd' : 'm';
  const { poolEquipment, gymEquipment } = resolveEquipment(customization, profile);
  const poolGear = Object.entries(poolEquipment).filter(([, v]) => v).map(([k]) => k).sort().join(',');
  const gymGear = Object.entries(gymEquipment).filter(([, v]) => v).map(([k]) => k).sort().join(',');
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
    // May arrive as a number from the frontend; coerce to a unit string
    if (typeof cl === 'number') {
      return customization.poolLengthUnit === 'yards' ? `${cl}yd` : `${cl}m`;
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
    // numeric poolLength with no recognizable unit — fall through to profile/unit hint
  }
  if (customization.poolLengthUnit === 'yards') return true;
  if (customization.poolLengthUnit === 'meters') return false;
  const pl = profile.equipment?.poolLength;
  if (pl) {
    if (typeof pl === 'object') return pl.unit === 'yards';
    if (typeof pl === 'string') return /yd|yards|scy/i.test(pl);
  }
  return false;
}

/**
 * Known pool equipment values — used to split a flat equipment array into pool vs gym.
 */
const POOL_EQUIPMENT_VALUES = new Set(['fins', 'paddles', 'pullBuoy', 'snorkel', 'parachute', 'resistanceBands']);

/**
 * Split customization.availableEquipment into pool and gym equipment objects,
 * falling back to profile equipment when customization is not provided.
 */
function resolveEquipment(customization, profile) {
  const avail = customization.availableEquipment;
  if (avail && Array.isArray(avail) && avail.length > 0) {
    const poolEquip = {};
    const gymEquip = {};
    // Start with all profile equipment set to false, then enable only what's in the form
    const profilePool = profile.equipment?.poolEquipment || {};
    const profileGym = profile.equipment?.gymEquipment || {};
    // Initialize all known keys to false
    for (const key of Object.keys(profilePool)) poolEquip[key] = false;
    for (const key of Object.keys(profileGym)) gymEquip[key] = false;
    // Enable only what the user checked
    for (const item of avail) {
      if (POOL_EQUIPMENT_VALUES.has(item)) {
        poolEquip[item] = true;
      } else {
        gymEquip[item] = true;
      }
    }
    return { poolEquipment: poolEquip, gymEquipment: gymEquip };
  }
  return {
    poolEquipment: profile.equipment?.poolEquipment || {},
    gymEquipment: profile.equipment?.gymEquipment || {},
  };
}

/**
 * Resolve the primary events for workout focus.
 * Returns an array of all events the swimmer trains for.
 * If customization.stroke is set, returns a single synthetic event (stroke override).
 */
function resolvePrimaryEvents(profile, customization) {
  if (customization.stroke && customization.stroke !== 'any') {
    // Use the user's stroke preference — create a synthetic event
    // Use the distance from the profile's primary event if available, otherwise default to 100
    const profileEvent = profile.goals?.primaryEvents?.[0];
    const distance = profileEvent?.distance || 100;
    return [{ stroke: customization.stroke, distance }];
  }
  return profile.goals?.primaryEvents || [];
}

function buildInsightsPrompt(profile, customization) {
  const type = resolveTrainingFocus(profile, customization);
  const events = resolvePrimaryEvents(profile, customization);
  const distance = events.length > 0
    ? events.map(e => `${e.distance}m ${e.stroke}`).join(', ')
    : 'general swimming';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLen = resolvePoolLengthDisplay(customization, profile);
  const poolUnit = isPoolYards(customization, profile) ? 'yards' : 'meters';

  // Build equipment context — use customization override if provided
  const { poolEquipment, gymEquipment } = resolveEquipment(customization, profile);
  const poolGear = Object.entries(poolEquipment).filter(([, v]) => v).map(([k]) => k);
  const gymGear = Object.entries(gymEquipment).filter(([, v]) => v).map(([k]) => k);
  const equipmentParts = [];
  if (poolGear.length) equipmentParts.push(`Pool equipment: ${poolGear.join(', ')}`);
  if (gymGear.length) equipmentParts.push(`Gym equipment: ${gymGear.join(', ')}`);
  if (equipmentParts.length === 0) equipmentParts.push('No special equipment available');
  const equipmentStr = equipmentParts.join('; ');

  let prompt = `Find scientific training principles and methodologies for:\n- ${type} training for ${distance}\n- ${duration} minute session\n- ${profile.experienceLevel || 'intermediate'} level swimmer\n- ${poolLen} pool (${poolUnit})\n- ${equipmentStr}\n\nReturn relevant training principles, set structures, interval recommendations, and any scientific findings from the knowledge base. Include source citations.`;

  // If taper mode, add a competition-prep query to pull notebook taper insights
  if (customization.taper && events.length > 0) {
    const taperEvent = events[0];
    prompt += `\n\nAlso find competition taper/peaking principles for ${taperEvent.distance}m ${taperEvent.stroke}: volume reduction, intensity maintenance, race-pace work, and rest protocols during the final 14 days before competition.`;
  }

  return prompt;
}

// ─── Step 2: Generate structured workout via OpenRouter ───────────────

async function generateWorkout(profile, customization, opts = {}) {
  // Resolve training focus once for reuse
  const type = resolveTrainingFocus(profile, customization);

  // The program route can pre-fetch these once and pass them in so sessions
  // 2-5 don't each re-query the knowledge base and coaching memory.
  const { programContext } = opts;

  let notebookNotes;
  let insights = '';
  if (programContext?.notebookNotes !== undefined) {
    notebookNotes = programContext.notebookNotes;
  } else {
    const notesTopic = `${type} training for swimmers`;
    notebookNotes = await getAllNotebookNotes(notesTopic);
    if (!notebookNotes) {
      const cacheKey = hashInsightsPrompt(profile, customization);
      insights = cacheGet(cacheKey);
      if (insights === null) {
        insights = await getTrainingInsights(profile, customization);
        cacheSet(cacheKey, insights);
      }
    }
  }

  const feedbackSummary = programContext?.feedbackSummary !== undefined
    ? programContext.feedbackSummary
    : getFeedbackSummary(10);

  const coachingObservations = programContext?.coachingObservations !== undefined
    ? programContext.coachingObservations
    : await getCoachingObservations(profile._id);

  // Determine model — use route-based model selection
  // Allow override via customization (for debug mode) but sanitize first
  const model = sanitizeModel(customization.llmModel);

  const sessionType = customization.sessionType || 'both';
  const includePool = sessionType === 'both' || sessionType === 'pool';
  const includeGym = sessionType === 'both' || sessionType === 'gym';

  const systemPrompt = buildSystemPrompt(includePool, includeGym);

  // Build the prompt context — include taper insights if in taper mode
  const promptCustomization = { ...customization };
  if (customization.taper && insights) {
    promptCustomization.taperInsights = insights;
  }

  const userPrompt = buildWorkoutPrompt(profile, promptCustomization, insights, feedbackSummary, coachingObservations, notebookNotes);

  const systemMessage = { role: 'system', content: systemPrompt };
  const userMessage = { role: 'user', content: userPrompt };

  // Use model router for workout generation
  const routeKey = customization.llmModel ? 'fallback:code' : 'workout:generate';
  let result = await callByRoute(routeKey, [systemMessage, userMessage], {
    maxTokens: 12288,
    timeout: 120000
  });
  if (!result.content) throw new Error('No response from OpenRouter');

  let parsed = parseWorkoutJSON(result.content);

  // If the JSON didn't parse, the LLM likely truncated mid-output. Retry once
  // with a higher token limit and the heavy context (insights/notes) stripped
  // so it has room to finish the workout.
  if (!parsed && result.finishReason === 'length') {
    console.warn('Workout JSON truncated (finish_reason=length) — retrying with 16384 tokens, context stripped');
    const leanPrompt = buildWorkoutPrompt(profile, promptCustomization, '', '', '', '');
    result = await callByRoute(routeKey, [systemMessage, { role: 'user', content: leanPrompt }], {
      maxTokens: 16384,
      timeout: 120000
    });
    if (result.content) parsed = parseWorkoutJSON(result.content);
  }

  // Last-ditch: try to repair a truncated JSON by closing open brackets.
  if (!parsed) {
    const repaired = repairTruncatedJSON(result.content);
    if (repaired) return repaired;
  }

  if (!parsed) {
    console.error('JSON parse error. Raw content:', result.content.substring(0, 500));
    throw new Error('Failed to parse workout JSON');
  }
  return parsed;
}

/**
 * Sleep utility for retry delays
 */
/**
 * Extract JSON from an LLM response. Returns the parsed object, or null.
 */
function parseWorkoutJSON(content) {
  if (!content) return null;
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
  } catch {
    return null;
  }
}

/**
 * Best-effort repair of a truncated JSON object/array string by closing
 * open braces, brackets, and quotes. Returns a parsed object or null.
 */
function repairTruncatedJSON(content) {
  if (!content) return null;
  let s = content.trim();
  const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeBlockMatch) s = codeBlockMatch[1].trim();
  if (!s.startsWith('{')) {
    const braceMatch = s.match(/\{[\s\S]+\}/);
    if (braceMatch) s = braceMatch[0];
    else s = '{' + s;
  }

  let repaired = s;

  // First pass: find the last complete key-value pair at depth 1 (top-level properties)
  // or complete array elements (depth 2 for arrays inside objects)
  let depth = 0;
  let inStr = false;
  let escaped = false;
  let lastCompletePos = -1;
  let lastCompleteDepth = 0;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (ch === '"' && !escaped) inStr = !inStr;
    if (inStr) {
      escaped = (ch === '\\' && !escaped);
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      // Mark complete positions at depth 0 (root), 1 (top-level props), or 2 (array elements)
      if ((depth === 0 || depth === 1 || depth === 2) && i > 0) {
        lastCompletePos = i;
        lastCompleteDepth = depth;
      }
    }
  }

  // If we have a complete position and the string ends incomplete, truncate to the last complete element
  if (lastCompletePos > 0 && lastCompletePos < repaired.length - 1) {
    const remainder = repaired.substring(lastCompletePos + 1);
    let remQuotes = 0;
    let remEscaped = false;
    let remDepth = 0;
    let remInStr = false;
    for (const ch of remainder) {
      if (ch === '"' && !remEscaped) remInStr = !remInStr;
      if (remInStr) {
        remEscaped = (ch === '\\' && !remEscaped);
        continue;
      }
      if (ch === '{' || ch === '[') remDepth++;
      if (ch === '}' || ch === ']') remDepth = Math.max(0, remDepth - 1);
      if (ch === '"' && !remEscaped) remQuotes++;
      remEscaped = (ch === '\\' && !remEscaped);
    }
    // If remainder has unclosed quotes or unclosed braces/brackets, truncate
    if (remQuotes % 2 !== 0 || remDepth > 0 || remInStr) {
      // Include trailing comma if present (common after array elements)
      let truncatePos = lastCompletePos + 1;
      if (truncatePos < repaired.length && repaired[truncatePos] === ',') {
        truncatePos++;
      }
      repaired = repaired.substring(0, truncatePos);
    }
  }

  // Remove trailing commas before closing braces/brackets (must be after truncation)
  // Matches comma followed by whitespace and either closing bracket/brace or end of string
  repaired = repaired.replace(/,\s*([}\]])?\s*$/g, '$1');

  // Close open string literals
  let quotes = 0;
  escaped = false;
  for (const ch of repaired) {
    if (ch === '"' && !escaped) quotes++;
    escaped = (ch === '\\' && !escaped);
  }
  if (quotes % 2 !== 0) repaired += '"';

  // Close open arrays and objects (track separately)
  depth = 0; inStr = false; escaped = false;
  let openArrays = 0;
  let openObjects = 0;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (ch === '"' && !escaped) inStr = !inStr;
    if (inStr) {
      escaped = (ch === '\\' && !escaped);
      continue;
    }
    if (ch === '{') { depth++; openObjects++; }
    if (ch === '[') { depth++; openArrays++; }
    if (ch === '}') { depth = Math.max(0, depth - 1); openObjects = Math.max(0, openObjects - 1); }
    if (ch === ']') { depth = Math.max(0, depth - 1); openArrays = Math.max(0, openArrays - 1); }
  }
  for (let i = 0; i < openArrays; i++) repaired += ']';
  for (let i = 0; i < openObjects; i++) repaired += '}';

  try { return JSON.parse(repaired); } catch { return null; }
}

function buildWorkoutPrompt(profile, customization, insights, feedbackSummary, coachingObservations, notebookNotes) {
  const type = resolveTrainingFocus(profile, customization);
  const trainingFoci = profile.goals?.trainingFocus || [];
  const { poolEquipment, gymEquipment } = resolveEquipment(customization, profile);
  const weightInventory = customization.weightInventory || profile.equipment?.weightInventory || [];
  const oneRepMaxes = customization.oneRepMaxes || profile.oneRepMaxes || [];
  const events = resolvePrimaryEvents(profile, customization);
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLength = resolvePoolLength(customization, profile);
  const poolLengthDisplay = resolvePoolLengthDisplay(customization, profile);
  const poolIsYards = isPoolYards(customization, profile);
  const poolUnit = poolIsYards ? 'yards' : 'meters';
  const poolUnitAbbr = poolIsYards ? 'yd' : 'm';

  // Distance unit label for display in best times, events, etc.
  const distUnit = poolIsYards ? 'yd' : 'm';

  // Build equipment lists — use customization override if provided
  const availablePoolGear = Object.entries(poolEquipment).filter(([, v]) => v).map(([k]) => k);
  const availableGymGear = Object.entries(gymEquipment).filter(([, v]) => v).map(([k]) => k);

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
    parts.push('- Events: general');
  }

  if (trainingFoci.length > 0) {
    parts.push(`- Training focus: ${trainingFoci.join(', ')}`);
  }

  if (profile.goals?.outcomes?.length) {
    parts.push(`- Desired outcomes: ${profile.goals.outcomes.join(', ')}`);
  }

  if (profile.bestTimes?.length) {
    parts.push(`- Best times: ${profile.bestTimes.map(t => `${t.distance}${distUnit} ${t.stroke} (${t.poolLength}): ${t.time}`).join(', ')}`);
  }

  // 1-Rep Maxes for percentage-based strength programming
  if (oneRepMaxes && oneRepMaxes.length > 0) {
    const oneRMDesc = oneRepMaxes.map(orm => {
      const exerciseLabel = orm.exercise.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const est = orm.estimated ? ' (est.)' : '';
      return `${exerciseLabel}: ${orm.weight}${orm.unit}${est}`;
    }).join(', ');
    parts.push(`- 1-Rep Maxes: ${oneRMDesc}`);
    parts.push('- PRESCRIBE WEIGHTS USING 1RM PERCENTAGES: For main lifts (squat, clean, press variations, deadlift), specify both absolute weight AND percent1RM field (e.g., weight: 180, weightUnit: "lbs", percent1RM: 80, oneRepMaxRef: "squat").');
    parts.push('- Choose appropriate %1RM based on training focus: strength/power (80-90%), hypertrophy (65-80%), endurance (50-65%).');
    parts.push('- If available weights don\'t match exact %1RM, round to nearest available weight and note the actual %1RM in notes.');
  }

  if (profile.goals?.targetImprovement) {
    parts.push(`- Goal: ${profile.goals.targetImprovement}`);
  }

  if (customization.intensity) parts.push(`- Intensity: ${customization.intensity}`);

  // ── Stroke Distribution Guidelines ──
  if (events.length > 1) {
    parts.push('');
    parts.push('## Stroke Distribution Guidelines');
    parts.push(`This swimmer trains for multiple events: ${events.map(e => `${e.distance}${distUnit} ${e.stroke}`).join(', ')}.`);
    parts.push('You MAY combine multiple events in a single workout when the training concept aligns (e.g., butterfly sprint + freestyle sprint in the same session).');
    parts.push('You MAY dedicate a session to a single event when appropriate (e.g., a technique-focused session).');
    parts.push('Use the training focus to guide decisions: speed/sprint workouts pair well across strokes; distance/endurance workouts should match the target event.');
    parts.push('Aim to cover all events across the program — do not neglect any one event.');
  }

  // ── Program context — tell the AI where this session sits in the overall program ──
  if (customization.programId && customization.totalSessions > 1) {
    parts.push('');
    parts.push('## Program Context');
    parts.push(`This is session ${customization.programIndex + 1} of ${customization.totalSessions} in a ${customization.programPeriod} program.`);
    parts.push('The other sessions in this program cover different training foci.');
    parts.push('Design this workout to complement the others — avoid repeating the same sets or exercises from other sessions.');
    if (customization.programIndex === 0) {
      parts.push('This is the first session — start at moderate intensity to build a base.');
    } else if (customization.programIndex === customization.totalSessions - 1) {
      parts.push('This is the final session — close out the program with a strong finish.');
    }
  }

  // ── Previous Sessions in this program — avoid repetition ──
  if (customization.previousSessionSummaries && customization.previousSessionSummaries.length > 0) {
    parts.push('');
    parts.push('## Previous Sessions in This Program');
    parts.push('The following sessions have already been generated for this program:');
    parts.push('');
    for (const summary of customization.previousSessionSummaries) {
      parts.push(`- ${summary}`);
    }
    parts.push('');
    parts.push('Design this workout to complement the previous sessions. Avoid repeating the same sets, strokes, or exercises. If a previous session focused on one event or training focus, prioritize different ones here.');
  }

  parts.push('');

  // ── Pool constraints (CRITICAL — AI must follow these) ──
  parts.push('## Pool Workout Constraints — STRICT');
  parts.push(`THIS IS A ${poolUnit.toUpperCase()} POOL. ALL swim distances MUST be in ${poolUnit} (e.g. ${standardDistances.slice(0, 4).join(', ')} ${poolUnit}). NEVER use meter-based distances like 100m, 200m, 400m in a yards pool.`);

  // Stroke preference override — if user selected a specific stroke, enforce it
  if (customization.stroke && customization.stroke !== 'any') {
    const strokeDisplay = customization.stroke === 'individual-medley' ? 'Individual Medley (IM)' : customization.stroke.charAt(0).toUpperCase() + customization.stroke.slice(1);
    parts.push(`- STROKE: ${strokeDisplay} — ALL main set swims MUST use this stroke. Do NOT use other strokes in the main set.`);
  }

  if (availablePoolGear.length > 0) {
    parts.push(`- Pool equipment available: ${availablePoolGear.join(', ')}`);
  } else {
    parts.push('- No pool equipment available — do NOT use fins, paddles, pull buoy, snorkel, parachute, or bands');
  }

  parts.push('');

parts.push('## Gym Workout Constraints — STRICT');
  if (availableGymGear.length > 0) {
    parts.push(`- Gym equipment available: ${availableGymGear.join(', ')}`);
  } else {
    parts.push('- NO gym equipment — bodyweight exercises ONLY');
  }

  // Weight inventory — tell the AI exactly what weights are available
  if (weightInventory && weightInventory.length > 0) {
    const weightDesc = weightInventory.map(w => `${w.weight}${w.unit} ${w.type}`).join(', ');
    parts.push(`- Available weights: ${weightDesc}`);
    parts.push('- When prescribing weighted exercises, ONLY use the exact weights listed above. Do not invent weights.');
    parts.push('- MATCH REPS TO WEIGHT: heavy weights → low reps (4-8), moderate weights → medium reps (8-12), light weights → high reps (12-20).');
    parts.push('- For strength/power workouts (speed, resistance-power): use the HEAVIEST available weights with low reps (4-6), 3-5 sets, long rest (90-120s).');
    parts.push('- For endurance/mobility workouts: use LIGHTER weights with higher reps (12-20), 2-3 sets, short rest (30-60s).');
    parts.push('- If only one weight is available, adjust reps and sets to match the training focus — do not always prescribe the same 3x10 for everything.');
  }

  // 1RM percentage guidance
  if (oneRepMaxes && oneRepMaxes.length > 0) {
    parts.push('- USE 1RM PERCENTAGES: For exercises matching a known 1RM (squat, clean, press variations, deadlift), include percent1RM and oneRepMaxRef fields.');
    parts.push('- Strength/power focus: 80-90% 1RM, 3-5 sets x 3-6 reps, 90-120s rest');
    parts.push('- Hypertrophy focus: 65-80% 1RM, 3-4 sets x 8-12 reps, 60-90s rest');
    parts.push('- Endurance/mobility focus: 50-65% 1RM, 2-3 sets x 12-20 reps, 30-60s rest');
  }

  parts.push('');

  // Notebook notes (pre-generated insights — primary knowledge source)
  if (notebookNotes) {
    parts.push('## Training Insights');
    parts.push('The following scientific training insights have been curated from swimming research sources. Use these to inform the workout design:');
    parts.push('');
    parts.push(notebookNotes);
    parts.push('');
  }

  // Knowledge base insights (fallback — raw RAG on sources when notes are insufficient)
  if (insights && insights !== 'No answer generated') {
    parts.push('## Knowledge Base Deep Dive');
    parts.push('Additional context from the knowledge base for this specific workout:');
    parts.push('');
    parts.push(insights);
    parts.push('');
  }

  // ── Competition Taper: use notebook insights, not hardcoded rules ──
  if (customization.taper) {
    parts.push('## Competition Taper Context');
    if (customization.taperInsights) {
      parts.push('The following competition taper insights were retrieved from the knowledge base:');
      parts.push('');
      parts.push(customization.taperInsights);
      parts.push('');
    }
    if (customization.competitionLabel) {
      parts.push(`Competition: ${customization.competitionLabel} on ${customization.competitionDate}.`);
    } else {
      parts.push('A competition is approaching within 14 days.');
    }
    parts.push('Design this session following the taper principles above — do NOT apply a generic rule. The knowledge base insights should guide volume, intensity, and race-pace work.');
    parts.push('');
  }

  if (feedbackSummary) {
    parts.push('## Past Workout Feedback');
    parts.push('The following feedback has been collected from this swimmer\'s previous workouts. Use this to adjust intensity, difficulty, and exercise selection:');
    parts.push('');
    parts.push(feedbackSummary);
    parts.push('');
  }

  if (coachingObservations) {
    parts.push('## Coach Observations');
    parts.push('Your coaching system has derived the following insights about this swimmer over time. These are more reliable than individual feedback entries — they represent accumulated patterns and preferences:');
    parts.push('');
    parts.push(coachingObservations);
    parts.push('');
  }

  // Inject active injury/recovery notes as explicit constraints
  const activePhysicalNotes = extractActivePhysicalNotes(coachingObservations);
  if (activePhysicalNotes.length > 0) {
    parts.push('## ⚠️ Active Physical Notes — Adjust Workout Accordingly');
    parts.push('The following recent observations may affect this workout. Modify exercises, strokes, volume, or intensity to accommodate:');
    parts.push('');
    activePhysicalNotes.forEach(note => parts.push(`- ${note}`));
    parts.push('');
  }

  const sessionType = customization.sessionType || 'both';
  const includePool = sessionType === 'both' || sessionType === 'pool';
  const includeGym = sessionType === 'both' || sessionType === 'gym';

  parts.push('## Output Requirements');
  // ── CSS Calibration — Swimmer's calibrated paces for realistic intervals ──
  const cssPace = getCSS(profile);
  if (cssPace && includePool) {
    const cssDisplay = formatSecondsToTime(cssPace);
    parts.push('## Swimmer\'s Calibrated Paces (Critical Swim Speed)');
    parts.push(`CSS = ${cssDisplay}/100${poolUnitAbbr} (derived from best times)`);
    parts.push('Use these as reference for target paces — adjust by training focus:');
    parts.push('- Speed / Power: CSS × 0.90–0.95');
    parts.push('- Lactate Threshold: CSS × 0.95–1.02');
    parts.push('- Endurance / Aerobic: CSS × 1.05–1.15');
    parts.push('- Technique / Drill: CSS × 1.05–1.12');
    parts.push('- Recovery / Mobility: CSS × 1.10–1.20');
    parts.push('');
    parts.push('MANDATORY INTERVAL FORMAT — Every main set MUST include:');
    parts.push('  "interval": {');
    parts.push('    "sendOff": "2:00",        // send-off interval (when to leave wall)');
    parts.push('    "targetPace": "1:35",   // target swim time per rep');
    parts.push('    "rest": "25s",          // calculated rest (sendOff - targetPace)');
    parts.push('    "type": "fixed|descending|building",');
    parts.push('    "progression": "-2s/round or build to fast"');
    parts.push('  }');
    parts.push('');
    parts.push('MINIMUM REST REQUIREMENTS by focus:');
    parts.push('- Speed/Power: ≥30s rest per rep');
    parts.push('- Lactate Threshold: ≥20s rest per rep');
    parts.push('- Endurance/Aerobic: ≥12s rest per rep');
    parts.push('- Technique/Drill: ≥15s rest per rep');
    parts.push('- Recovery/Mobility: ≥20s rest per rep');
    parts.push('');
    parts.push('If your calculated sendOff provides less than minimum rest, INCREASE the sendOff — do NOT make targetPace faster.');
    parts.push('');
  }


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
    if (weightInventory && weightInventory.length > 0) {
      parts.push('- EVERY exercise using weights MUST include the exact weight from the available weights list. Do NOT leave weight as 0 or omit the field. Choose the appropriate weight based on the exercise and training focus.');
      parts.push('- Rep ranges must match the weight: heavy (4-6 reps), moderate (8-12 reps), light (12-20 reps). Adjust sets and rest accordingly.');
    }
    if (oneRepMaxes && oneRepMaxes.length > 0) {
      parts.push('- For exercises matching a known 1RM, include: weight (absolute), weightUnit, percent1RM (number), oneRepMaxRef (which 1RM exercise this references).');
      parts.push('- Example: "exercise": "Back Squat", "weight": 180, "weightUnit": "lbs", "percent1RM": 80, "oneRepMaxRef": "squat"');
    }
  }
  if (includePool) {
    parts.push('- Include 2-3 pool-specific training notes (swim technique, energy systems, pacing, recovery between sets)');
  }
  if (includeGym) {
    parts.push('- Include 2-3 gym-specific training notes (exercise form, muscle activation, load management, strength/hypertrophy rationale)');
  }
  const contentParts = [];
  if (includePool) contentParts.push('the swim sets (distances, strokes, rest intervals, and progression)');
  if (includeGym) contentParts.push('the gym exercises (movements, loads, rep ranges, and rest periods)');
  parts.push(`- Include 3-5 overall training notes that explain the scientific rationale for ${contentParts.join(' and ')} in this specific workout. Each note must reference something concrete from the workout you generated (e.g., why this rep range, why this rest interval, why this stroke focus, why this loading scheme). Do NOT include generic notes that could apply to any workout, and do NOT include notes about workout sections that are not part of this session (e.g., no swim notes in a gym-only workout).`);
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
      "interval": {
        "sendOff": "2:00",          // send-off interval (when to leave wall)
        "targetPace": "1:35",       // target swim time per rep
        "rest": "25s",              // rest per rep (sendOff - targetPace)
        "type": "fixed|descending|building",
        "progression": "-2s/round or build to fast"
      },
      "focus": "e.g., technique, speed, endurance, power",
      "notes": "Additional instructions"
    }
  ],
  "coolDown": {
    "description": "Detailed cool-down instructions",
    "distance": number,
    "duration": number (minutes)
  },
  "totalDistance": number,
  "trainingNotes": [
    "Swim-specific training principle or rationale 1",
    "Pool training tip 2"
  ],` : '';

  const gymJson = includeGym ? `
  "gymWorkout": {
    "warmUp": { "description": "Gym warm-up", "duration": number },
    "exercises": [
      { "exercise": "name", "sets": number, "reps": number, "weight": number, "weightUnit": "lbs|kg", "percent1RM": number (percentage of 1RM, e.g., 80), "oneRepMaxRef": "string (which 1RM this references: squat, clean, strict-overhead-press, bench-press, deadlift, front-squat, push-press, pull-up)", "restSeconds": number, "muscleGroup": "one of: arms, legs, core, chest, back, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, glutes, calves, hip-flexors, adductors, abductors, rotator-cuff, lower-back, obliques, full-body", "notes": "form cues and weight selection rationale — do not reference equipment not listed as available" }
    ],
    "coolDown": { "description": "Stretching", "duration": number },
    "trainingNotes": [
      "Gym-specific training principle or rationale 1",
      "Strength/power training tip 2"
    ]
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
    "Scientific training principle or rationale 1",
    "Periodization / programming logic 2",
    "Safety or recovery consideration 3"
  ]
}`;
}

/**
 * Fetch accumulated coaching observations for a swimmer from CoachingMemory.
 * Returns a formatted string for injection into the workout generation prompt.
 * Returns empty string if no observations or on error (non-blocking).
 */
async function getCoachingObservations(swimmerId) {
  try {
    const memories = await CoachingMemory.find({
      swimmerId,
      active: true,
    })
      .sort({ confidence: -1, createdAt: -1 })
      .limit(10)
      .select('type category content source confidence');

    if (memories.length === 0) return '';

    return memories.map(m =>
      `- [${m.type}/${m.category}] (${m.source}, confidence: ${m.confidence}) ${m.content}`
    ).join('\n');
  } catch (err) {
    // Non-blocking — don't fail workout generation if CoachingMemory is unavailable
    console.warn('Failed to fetch coaching observations:', err.message);
    return '';
  }
}

function extractActivePhysicalNotes(coachingObservations) {
  if (!coachingObservations) return [];

  const notes = [];
  const lines = coachingObservations.split('\n');

  for (const line of lines) {
    // Match injury or recovery-related observations
    if (line.includes('[injury/') || line.includes('[observation/recovery/')) {
      // Extract the content after the metadata prefix
      // Format: "- [type/category] (source, confidence: X) content"
      const contentMatch = line.match(/\]\s*\([^)]+\)\s*(.+)/);
      if (contentMatch) {
        notes.push(contentMatch[1].trim());
      } else {
        // Fallback: just take everything after the first "]"
        const afterBracket = line.split(']')[1];
        if (afterBracket) notes.push(afterBracket.trim());
      }
    }
  }

  return notes;
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
  resolveEquipment,
  resolvePrimaryEvents,
  sanitizeModel,
  getCoachingObservations,
  extractActivePhysicalNotes,
};
