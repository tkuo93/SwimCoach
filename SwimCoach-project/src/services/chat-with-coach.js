/**
 * Chat with Coach Service
 *
 * Handles conversational chat between the swimmer and the AI coach.
 * The coach can answer questions, provide explanations, and — when the
 * swimmer explicitly asks for changes — trigger workout regeneration.
 *
 * Returns a text response and optionally a flag indicating the workout
 * should be regenerated with updated preferences.
 */

const axios = require('axios');
const { resolveTrainingFocus, resolvePoolLength, isPoolYards, sanitizeModel } = require('./workout-ai');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

/**
 * Send a conversational chat message to the coach.
 *
 * @param {Object} profile       - SwimmerProfile document
 * @param {Object} workout       - Current Workout document
 * @param {Array}  messages      - Conversation history [{role: 'user'|'coach', text: string}]
 * @param {string} userMessage   - The latest user message
 * @returns {Promise<{reply: string, regenerate: boolean, customizationOverrides: Object}>}
 */
async function chat(profile, workout, messages, userMessage, modelOverride) {
  const systemPrompt = buildChatSystemPrompt(profile, workout);
  const conversationHistory = buildConversationHistory(messages, userMessage, workout);

  // Sanitize user-supplied model to prevent injection into outbound API calls
  const model = sanitizeModel(modelOverride);

  const response = await axios.post(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
      ],
      temperature: 0.7,
      max_tokens: 2048,
      provider: { order: ['openai'], sort: 'throughput' },
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://swimcoach.app',
        'X-Title': 'SwimCoach',
      },
      timeout: 60_000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from coach');

  return parseCoachResponse(content);
}

/**
 * Build the system prompt for the chat context.
 */
function buildChatSystemPrompt(profile, workout) {
  const poolLen = resolvePoolLength({}, profile);
  const isYards = isPoolYards({}, profile);
  const unit = isYards ? 'yards' : 'meters';
  const distUnit = isYards ? 'yd' : 'm';
  const tf = profile.goals?.trainingFocus;
  const focusList = Array.isArray(tf) ? tf.join(', ') : (tf || 'general');
  const events = (profile.goals?.primaryEvents || []).map(e => `${e.distance}${distUnit} ${e.stroke}`).join(', ');
  const equip = profile.equipment || {};
  const poolGear = Object.entries(equip.poolEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const gymGear = Object.entries(equip.gymEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const gymGearNote = gymGear.length === 0 ? '  ⚠️ No gym equipment — only bodyweight exercises!' : '';
  const weightInv = (profile.equipment?.weightInventory || []).map(w => `${w.weight}${w.unit} ${w.type}`).join(', ');
  const poolUnitNote = `  ⚠️ This is a ${unit} pool — all distances must be in ${unit}, NOT ${isYards ? 'meters' : 'yards'}!`;

  const workoutSummary = buildWorkoutSummary(workout, isYards);

  return `You are SwimCoach, an expert swim coach and exercise scientist having a conversation with a swimmer about their workout.

## Swimmer Profile
- Name: ${profile.firstName} ${profile.lastName}
- Level: ${profile.experienceLevel || 'intermediate'}
- Events: ${events || 'Not specified'}
- Training focus: ${focusList}
- Pool: ${poolLen} (${unit})${poolUnitNote}
- Pool equipment: ${poolGear.length ? poolGear.join(', ') : 'None'}
- Gym equipment: ${gymGear.length ? gymGear.join(', ') : 'None'}${gymGearNote}
- Available weights: ${weightInv || 'None specified'}

## Current Workout
${workoutSummary}

## Your Role
- Have a natural, helpful conversation with the swimmer about their workout
- Answer questions about exercises, training principles, or the workout design
- Explain your reasoning for exercise selections and set structures
- If the swimmer asks for a clear change (e.g., "make it harder", "swap freestyle for backstroke", "add more rest", "remove pull buoy exercises", "I don't have dumbbells"), acknowledge the request and agree to update the workout
- Only commit to updating the workout when the swimmer explicitly asks for a change or modification
- If the swimmer is just asking questions or making conversation, respond naturally without mentioning workout updates
- CRITICAL: If you regenerate, ALL swim distances MUST be in ${unit} (the swimmer's pool unit). Never mix in ${isYards ? 'meter' : 'yard'} distances.

## Response Format
reply: Your conversational response to the swimmer (1-3 sentences, friendly and helpful)
regenerate: true or false — set to true ONLY if the swimmer explicitly asked for a workout change
overrides: If regenerate is true, include any workout preference changes as JSON key-value pairs (e.g. workoutType, duration, intensity, sessionType). If regenerate is false, return an empty object.

Respond in this exact format:
reply: <your response>
regenerate: <true|false>
overrides: <JSON object, or {} if no regeneration>`;
}

/**
 * Build a text summary of the current workout for the coach context.
 */
function buildWorkoutSummary(workout, isYards = false) {
  if (!workout) return 'No workout loaded.';
  const parts = [];
  const distUnit = isYards ? 'yd' : 'm';
  parts.push(`- Type: ${workout.workoutType || 'N/A'}`);
  parts.push(`- Duration: ${workout.duration || 0} minutes`);
  parts.push(`- Intensity: ${workout.intensity || 'moderate'}`);

  const pool = workout.poolWorkout;
  if (pool && pool.mainSet && pool.mainSet.length > 0) {
    parts.push(`- Pool: ${pool.totalDistance || 0}${distUnit} total`);
    pool.mainSet.forEach((set, i) => {
      parts.push(`  Set ${i + 1}: ${set.repetitions}x${set.distance}${distUnit} ${set.stroke || 'freestyle'}, rest ${set.interval || 'N/A'}, focus: ${set.focus || 'N/A'}`);
    });
  }

  const gym = workout.gymWorkout;
  if (gym && gym.mainSet && gym.mainSet.length > 0) {
    parts.push(`- Gym: ${gym.mainSet.length} exercises`);
    gym.mainSet.forEach((ex, i) => {
      parts.push(`  Exercise ${i + 1}: ${ex.exercise} ${ex.sets}x${ex.repetitions}${ex.weight ? ` @ ${ex.weight}kg` : ''}, muscle: ${ex.muscleGroup || 'N/A'}`);
    });
  }

  return parts.join('\n');
}

/**
 * Build the conversation history for the LLM.
 */
// Rough token estimate: ~4 chars per token for English text
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function buildConversationHistory(messages, userMessage, workout) {
  const history = [];
  const MAX_HISTORY_TOKENS = 1500;

  // Always include the current user message
  const currentMsg = { role: 'user', content: userMessage };
  let tokenBudget = MAX_HISTORY_TOKENS - estimateTokens(userMessage);

  // Walk backwards through messages, adding them while we have budget
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

  history.push(currentMsg);
  return history;
}

/**
 * Parse the coach's structured response.
 */
function parseCoachResponse(content) {
  let reply = '';
  let regenerate = false;
  let overrides = {};

  // Try to parse structured format
  const replyMatch = content.match(/reply:\s*([\s\S]*?)(?=regenerate:|$)/i);
  const regenMatch = content.match(/regenerate:\s*(true|false)/i);
  const overrideMatch = content.match(/overrides:\s*([\s\S]*)/i);

  if (replyMatch) {
    reply = replyMatch[1].trim();
  } else {
    // Fallback: treat the whole content as the reply
    reply = content.trim();
  }

  if (regenMatch) {
    regenerate = regenMatch[1].toLowerCase() === 'true';
  }

  if (overrideMatch && regenerate) {
    try {
      overrides = JSON.parse(overrideMatch[1].trim());
    } catch {
      // If overrides can't be parsed, try to extract key-value pairs
      const pairs = overrideMatch[1].trim();
      const kvMatch = pairs.match(/(\w+):\s*["']?([^"'\n,}]+)["']?/g);
      if (kvMatch) {
        kvMatch.forEach(pair => {
          const [k, v] = pair.split(/:\s*/);
          if (k && v) overrides[k.trim()] = v.trim().replace(/^["']|["']$/g, '');
        });
      }
    }
  }

  return { reply, regenerate, overrides };
}

module.exports = {
  chat,
};
