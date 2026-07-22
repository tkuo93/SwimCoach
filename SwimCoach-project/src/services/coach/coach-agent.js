/**
 * Coach Agent Service
 *
 * Agentic coach with tool-calling capabilities. Replaces the
 * structured-text chat-with-coach.js with an iterative agent loop
 * that can call tools (query knowledge base, fetch history, propose
 * modifications, store observations) to deliver richer coaching.
 *
 * Two modes:
 *   - 'general'  — personal coach, no workout context
 *   - 'workout'  — workout-scoped, includes current workout + extra tools
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const CoachingMemory = require('../../models/CoachingMemory');
const { getToolDefinitions, executeTool } = require('./coach-tools');
const { sanitizeModel } = require('../workout-ai');
const { sanitizeUserMessage, sanitizeConversationHistory, buildSafeSystemPrompt } = require('../prompt-sanitizer');
const { rateLimitedAxiosCall } = require('../openrouter-rate-limiter');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
const MAX_AGENT_ITERATIONS = 5;
const MAX_HISTORY_TOKENS = 1500;

// Load soul.md once at startup
const SOUL_PATH = path.join(__dirname, 'soul.md');
let soulContent = '';
try {
  soulContent = fs.readFileSync(SOUL_PATH, 'utf8');
} catch {
  console.warn('soul.md not found — coach will run without personality context');
}

/**
 * Main entry point for the agentic coach.
 *
 * @param {Object} profile       - SwimmerProfile document
 * @param {Object} [workout]     - Current Workout document (workout mode only)
 * @param {Array}  messages      - Conversation history [{role, text}]
 * @param {string} userMessage   - The latest user message
 * @param {string} mode          - 'general' or 'workout'
 * @param {string} [modelOverride] - LLM model override
 * @returns {Promise<{reply: string, actions: Array}>}
 */
async function chat({ profile, workout, messages, userMessage, mode = 'general', modelOverride }) {
  // 1. Sanitize user input
  let safeUserMessage;
  try {
    safeUserMessage = sanitizeUserMessage(userMessage, { context: mode });
  } catch (err) {
    return {
      reply: "I can't process that message — it appears to contain content that could be a prompt injection attempt. Please rephrase your question about swimming, training, or your workout.",
      actions: []
    };
  }

  // 2. Assemble context
  const coachingMemoryContext = await assembleCoachingMemory(profile);
  const baseSystemPrompt = buildSystemPrompt(profile, workout, coachingMemoryContext, mode);
  const systemPrompt = buildSafeSystemPrompt(baseSystemPrompt, mode);
  const conversationHistory = buildConversationHistory(messages, safeUserMessage);
  // Sanitize conversation history (user messages only)
  const safeConversationHistory = sanitizeConversationHistory(conversationHistory, { context: mode });
  const tools = getToolDefinitions(mode);
  const model = sanitizeModel(modelOverride);

  // 2. Agent loop
  const agentMessages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];

  let reply = '';
  const actions = [];

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await callLLM(model, agentMessages, tools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error('No response from LLM');

    const message = choice.message;

    // Append the assistant message (including any tool calls) to history
    agentMessages.push(message);

    // If the LLM made tool calls, execute them and continue
    if (message.tool_calls?.length > 0) {
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        const result = await executeTool(toolName, toolArgs, { profile, workout });

        // Check if the tool returned a proposal action
        let parsedResult;
        try {
          parsedResult = JSON.parse(result);
        } catch {
          parsedResult = null;
        }

        if (parsedResult?.proposal) {
          actions.push(parsedResult);
        }

        // Append tool result to conversation
        agentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      // Continue loop — LLM will see tool results and respond
    } else {
      // Final response — no more tool calls
      reply = message.content || '';
      break;
    }
  }

  // If we ran out of iterations without a final response, take the last content
  if (!reply) {
    const lastAssistant = [...agentMessages].reverse().find(m => m.role === 'assistant' && m.content);
    reply = lastAssistant?.content || 'I need more time to think about that. Could you ask again?';
  }

  // 4. Post-loop: extract learnings from the conversation and store in CoachingMemory
  // Only extract when the coach made substantive statements (not just greetings or simple answers)
  await extractConversationLearnings(profile, userMessage, reply, workout);

  return { reply, actions };
}

// ─── Context Assembly ───────────────────────────────────────────────

/**
 * Fetch active coaching memories for the swimmer.
 */
async function assembleCoachingMemory(profile) {
  try {
    const memories = await CoachingMemory.find({
      swimmerId: profile._id,
      active: true,
    })
      .sort({ confidence: -1, createdAt: -1 })
      .limit(15)
      .select('type category content source confidence');

    if (memories.length === 0) return '';
    return '## What You Know About This Swimmer\n' +
      memories.map(m => `- [${m.type}/${m.category}] (${m.source}, confidence: ${m.confidence}) ${m.content}`).join('\n');
  } catch {
    return '';
  }
}

/**
 * Build the system prompt from soul.md + mode-specific context.
 */
function buildSystemPrompt(profile, workout, coachingMemoryContext, mode) {
  const parts = [];

  // Soul — personality, philosophy, decision principles
  if (soulContent) {
    parts.push(soulContent);
  }

  parts.push('\n---\n');

  // Swimmer profile summary
  parts.push(buildProfileSummary(profile));

  // Coaching memory
  if (coachingMemoryContext) {
    parts.push('\n' + coachingMemoryContext);
  }

  // Mode-specific context
  if (mode === 'workout' && workout) {
    parts.push('\n' + buildWorkoutContext(workout, profile));
  }

  if (mode === 'general') {
    parts.push('\n## Current Mode');
    parts.push('You are in general coaching mode. The athlete is chatting with you outside of any specific workout. They may ask about training, recovery, their progress, or just check in. Use your tools to look up information before making recommendations.');
  } else {
    parts.push('\n## Current Mode');
    parts.push('You are discussing a specific workout with the athlete. Use explainWorkout to understand the design, modifyWorkout for small changes, or regenerateWorkout for bigger restructuring. The athlete can also ask general training questions.');
  }

  return parts.join('\n');
}

/**
 * Build a compact swimmer profile summary for the prompt.
 */
function buildProfileSummary(profile) {
  const events = (profile.goals?.primaryEvents || []).map(e => `${e.distance} ${e.stroke}`).join(', ');
  const focus = Array.isArray(profile.goals?.trainingFocus) ? profile.goals.trainingFocus.join(', ') : (profile.goals?.trainingFocus || 'general');
  const poolLen = profile.equipment?.poolLength;
  const poolUnit = typeof poolLen === 'object' ? `${poolLen.value} ${poolLen.unit}` : (poolLen || '25m');
  const poolGear = Object.entries(profile.equipment?.poolEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const gymGear = Object.entries(profile.equipment?.gymEquipment || {}).filter(([, v]) => v).map(([k]) => k);

  const lines = [
    '## Swimmer Profile',
    `- Name: ${profile.firstName} ${profile.lastName}`,
    `- Level: ${profile.experienceLevel || 'intermediate'}`,
    `- Events: ${events || 'Not specified'}`,
    `- Training focus: ${focus}`,
    `- Pool: ${poolUnit}`,
    `- Pool equipment: ${poolGear.length ? poolGear.join(', ') : 'None'}`,
    `- Gym equipment: ${gymGear.length ? gymGear.join(', ') : 'None'}`,
    `- Schedule: ${profile.trainingSchedule?.weeklyPoolSessions || 3} pool + ${profile.trainingSchedule?.weeklyGymSessions || 2} gym sessions/week`,
    `- Session duration: ${profile.trainingSchedule?.sessionDuration || 60} minutes`,
  ];

  if (profile.healthConsiderations?.injuries?.length) {
    lines.push(`- Injuries/limitations: ${profile.healthConsiderations.injuries.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Build workout context for workout mode.
 */
function buildWorkoutContext(workout, profile) {
  const isYards = profile.equipment?.poolLength?.unit === 'yards';
  const distUnit = isYards ? 'yd' : 'm';

  const lines = [
    '## Current Workout',
    `- Name: ${workout.workoutName}`,
    `- Type: ${workout.workoutType}`,
    `- Duration: ${workout.duration} minutes`,
    `- Intensity: ${workout.intensity}`,
  ];

  const pool = workout.poolWorkout;
  if (pool?.mainSet?.length > 0) {
    lines.push(`- Pool: ${pool.totalDistance || 0}${distUnit} total`);
    pool.mainSet.forEach((set, i) => {
      lines.push(`  Set ${i + 1}: ${set.repetitions}x${set.distance}${distUnit} ${set.stroke || 'freestyle'}, rest ${set.interval || 'N/A'}, focus: ${set.focus || 'N/A'}`);
    });
  }

  const gym = workout.gymWorkout;
  if (gym?.mainSet?.length > 0) {
    lines.push(`- Gym: ${gym.mainSet.length} exercises`);
    gym.mainSet.forEach((ex, i) => {
      lines.push(`  Exercise ${i + 1}: ${ex.exercise} ${ex.sets}x${ex.repetitions}${ex.weight ? ` @ ${ex.weight}${ex.weightUnit || 'lbs'}` : ''}, muscle: ${ex.muscleGroup || 'N/A'}`);
    });
  }

  return lines.join('\n');
}

// ─── Conversation History ───────────────────────────────────────────

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function buildConversationHistory(messages, userMessage) {
  const history = [];
  let tokenBudget = MAX_HISTORY_TOKENS - estimateTokens(userMessage);

  // Walk backwards, adding messages while we have budget
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.text);
    if (tokens > tokenBudget) break;
    history.unshift({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text,
    });
    tokenBudget -= tokens;
  }

  // Always include the current user message
  history.push({ role: 'user', content: userMessage });
  return history;
}

// ─── Observation Extraction ─────────────────────────────────────────

/**
 * After a conversation, check if the coach's reply contains learnings
 * worth persisting to CoachingMemory. Uses pattern matching rather than
 * a separate LLM call to keep it fast and free.
 *
 * We store observations when:
 * - The user states a preference or limitation (detected from user message)
 * - The coach explicitly recommends a change to training approach
 * - The user mentions an injury or physical issue
 */
async function extractConversationLearnings(profile, userMessage, coachReply, workout) {
  const observations = [];
  const lowerUser = (userMessage || '').toLowerCase();
  const lowerCoach = (coachReply || '').toLowerCase();

  // User-stated injuries or physical issues
  const injuryKeywords = /\b(hurt|hurts|pain|painful|sore|injury|injured|can't|cannot|avoid|bother|bothering|tweak|twinge|strain)\b/;
  const bodyParts = /\b(shoulder|knee|back|elbow|wrist|hip|ankle|neck|rotator|calf|hamstring|quad|groin)\b/;
  if (injuryKeywords.test(lowerUser) && bodyParts.test(lowerUser)) {
    const bodyMatch = lowerUser.match(bodyParts);
    const body = bodyMatch ? bodyMatch[0] : 'unspecified';
    observations.push({
      type: 'injury',
      category: 'general',
      content: `User mentioned ${body} issue: "${userMessage.slice(0, 100)}"`,
      source: 'user-stated',
      confidence: 0.9,
    });
  }

  // User-stated preferences
  const preferencePatterns = [
    { regex: /\b(i prefer|i like|i'd rather|i want more|i want less|i hate|i don't like|i love|i enjoy)\b/, category: 'general' },
    { regex: /\b(shorter warm.?up|longer warm.?up|no warm.?up)\b/, category: 'volume' },
    { regex: /\b(more rest|less rest|more recovery|less recovery)\b/, category: 'recovery' },
    { regex: /\b(more (?:pool|swim)|less (?:pool|swim)|more gym|less gym)\b/, category: 'scheduling' },
    { regex: /\b(more (?:intensity|volume|endurance|speed)|harder|easier|lighter|heavier)\b/, category: 'intensity' },
  ];
  for (const { regex, category } of preferencePatterns) {
    if (regex.test(lowerUser)) {
      observations.push({
        type: 'preference',
        category,
        content: `User stated: "${userMessage.slice(0, 120)}"`,
        source: 'user-stated',
        confidence: 0.85,
      });
      break; // Only one preference observation per message
    }
  }

  // Coach recommendations that imply a training insight
  const coachRecPatterns = [
    { regex: /\b(you should|we should|let's (?:reduce|increase|try|add|skip|avoid|switch|focus))\b/, category: 'general' },
    { regex: /\b(reduce (?:intensity|volume)|dial (?:it |back)|pull back|scale back)\b/, category: 'intensity' },
    { regex: /\b(increase (?:intensity|volume)|push harder|build up|more (?:volume|intensity))\b/, category: 'intensity' },
    { regex: /\b(avoid (?:overhead|internal rotation|heavy)|work around)\b/, category: 'technique' },
  ];
  for (const { regex, category } of coachRecPatterns) {
    if (regex.test(lowerCoach)) {
      observations.push({
        type: 'insight',
        category,
        content: `Coach recommendation: "${coachReply.slice(0, 150)}"`,
        source: 'coach-analysis',
        confidence: 0.5, // Lower confidence — coach is advising, not yet confirmed
      });
      break;
    }
  }

  // Store all extracted observations (non-blocking)
  if (observations.length > 0) {
    try {
      await CoachingMemory.insertMany(observations.map(o => ({
        swimmerId: profile._id,
        ...o,
        relevantWorkoutIds: workout ? [workout._id] : [],
        active: true,
      })));
    } catch (err) {
      console.warn('Failed to store conversation learnings:', err.message);
    }
  }
}

// ─── LLM Call ───────────────────────────────────────────────────────

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call LLM with exponential backoff retry for 429 rate limit errors
 * @param {string} model - Model to use
 * @param {Array} messages - Conversation messages
 * @param {Array} tools - Tool definitions
 * @param {number} attempt - Current attempt number (for recursion)
 * @returns {Promise<Object>} API response data
 */
async function callLLM(model, messages, tools, attempt = 1) {
  const body = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  // Only include tools if we have them (avoids API errors on models without tool support)
  if (tools?.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay

  try {
    // Use rate limiter to prevent hitting free tier limits
    const response = await rateLimitedAxiosCall(() => axios.post(
      `${OPENROUTER_BASE}/chat/completions`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://swimcoach.app',
          'X-Title': 'SwimCoach',
        },
        timeout: 60_000,
      },
    ));

    return response.data;
  } catch (error) {
    // Check if it's a 429 rate limit error
    const isRateLimited = error.response?.status === 429;
    const isRetryableError = isRateLimited || (error.response?.status >= 500 && error.response?.status < 600);

    // Extract the actual OpenRouter error message (nested in error.response.data.error)
    const openRouterError = error.response?.data?.error;
    const errorMessage = typeof openRouterError === 'object' && openRouterError !== null
      ? (openRouterError.message || openRouterError.code || JSON.stringify(openRouterError))
      : (openRouterError || error.message);

    if (isRetryableError && attempt < maxRetries) {
      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`[RETRY ${attempt}/${maxRetries}] OpenRouter ${error.response?.status}: ${errorMessage}. Waiting ${Math.round(delay)}ms...`);
      await sleep(delay);
      return callLLM(model, messages, tools, attempt + 1);
    }

    console.error(`[FAILED] OpenRouter call failed after ${attempt} attempts: ${errorMessage}`);
    throw error;
  }
}

// Helper to safely stringify error response data
function errorJSON(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

module.exports = {
  chat,
};
