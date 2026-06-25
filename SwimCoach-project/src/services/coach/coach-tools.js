/**
 * Coach Tool Definitions and Implementations
 *
 * Defines tools in OpenAI function-calling format for the agentic coach.
 * Each tool has a `definition` (JSON schema sent to the LLM) and an
 * `execute` function that runs when the LLM calls it.
 */

const Workout = require('../../models/Workout');
const CoachingMemory = require('../../models/CoachingMemory');
const { query: queryKnowledgeBase } = require('../open-notebook');
const { regenerateWorkout } = require('../workout-generator');

// ─── General Tools (available in both modes) ────────────────────────

const queryKnowledgeBaseTool = {
  definition: {
    type: 'function',
    function: {
      name: 'queryKnowledgeBase',
      description: 'Search the swimming training knowledge base for scientific principles, training methods, or exercise research. Use this when the athlete asks about training science or you need evidence to support a recommendation.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The specific question to search the knowledge base for',
          },
        },
        required: ['question'],
      },
    },
  },
  async execute({ question }, _context) {
    try {
      const result = await queryKnowledgeBase(question);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      return `Knowledge base query failed: ${err.message}`;
    }
  },
};

const getSwimmerHistoryTool = {
  definition: {
    type: 'function',
    function: {
      name: 'getSwimmerHistory',
      description: 'Get the athlete\'s recent workout history, including feedback they gave. Use this to understand what they\'ve been doing, how sessions went, and spot patterns.',
      parameters: {
        type: 'object',
        properties: {
          workoutType: {
            type: 'string',
            description: 'Filter by workout type (lactate, speed, endurance, technique, resistance-power, mobility, recovery)',
          },
          limit: {
            type: 'number',
            description: 'Number of recent workouts to return (default 10, max 30)',
          },
        },
      },
    },
  },
  async execute({ workoutType, limit = 10 }, { profile }) {
    const capped = Math.min(limit, 30);
    const filter = { swimmerId: profile._id };
    if (workoutType) filter.workoutType = workoutType;

    const workouts = await Workout.find(filter)
      .sort({ date: -1 })
      .limit(capped)
      .select('workoutName workoutType date duration intensity userFeedback poolWorkout.totalDistance gymWorkout.mainSet');

    return workouts.map(w => {
      const parts = [
        `${w.workoutName} (${w.workoutType}, ${w.duration}min, ${w.intensity})`,
        `  Date: ${w.date.toISOString().split('T')[0]}`,
      ];
      if (w.poolWorkout?.totalDistance) {
        parts.push(`  Pool: ${w.poolWorkout.totalDistance}m`);
      }
      if (w.gymWorkout?.mainSet?.length) {
        parts.push(`  Gym: ${w.gymWorkout.mainSet.length} exercises`);
      }
      if (w.userFeedback?.rating) {
        parts.push(`  Rating: ${w.userFeedback.rating}/5, Difficulty: ${w.userFeedback.difficultyPerception || 'N/A'}`);
      }
      return parts.join('\n');
    }).join('\n\n') || 'No workout history found.';
  },
};

const getProgressSummaryTool = {
  definition: {
    type: 'function',
    function: {
      name: 'getProgressSummary',
      description: 'Analyze the athlete\'s training trends — average ratings by workout type, volume patterns, difficulty distribution, and completion rates. Use this to assess whether training is working and spot imbalances.',
      parameters: {
        type: 'object',
        properties: {
          weeks: {
            type: 'number',
            description: 'Look back this many weeks (default 8)',
          },
        },
      },
    },
  },
  async execute({ weeks = 8 }, { profile }) {
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const workouts = await Workout.find({
      swimmerId: profile._id,
      date: { $gte: since },
    }).select('workoutType duration intensity userFeedback poolWorkout.totalDistance');

    if (workouts.length === 0) {
      return `No workouts in the last ${weeks} weeks.`;
    }

    // Aggregate by type
    const byType = {};
    for (const w of workouts) {
      const t = w.workoutType;
      if (!byType[t]) byType[t] = { count: 0, totalDuration: 0, ratings: [], difficulties: [] };
      byType[t].count++;
      byType[t].totalDuration += w.duration;
      if (w.userFeedback?.rating) byType[t].ratings.push(w.userFeedback.rating);
      if (w.userFeedback?.difficultyPerception) byType[t].difficulties.push(w.userFeedback.difficultyPerception);
    }

    const lines = [`Training summary (last ${weeks} weeks, ${workouts.length} sessions):`];
    for (const [type, data] of Object.entries(byType)) {
      const avgRating = data.ratings.length ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : 'N/A';
      const commonDifficulty = data.difficulties.length ? mode(data.difficulties) : 'N/A';
      lines.push(`  ${type}: ${data.count} sessions, ${data.totalDuration}min total, avg rating ${avgRating}/5, difficulty: ${commonDifficulty}`);
    }

    // Overall stats
    const allRatings = workouts.filter(w => w.userFeedback?.rating).map(w => w.userFeedback.rating);
    if (allRatings.length) {
      const avg = (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1);
      lines.push(`  Overall avg rating: ${avg}/5`);
    }

    return lines.join('\n');
  },
};

const getCoachingMemoryTool = {
  definition: {
    type: 'function',
    function: {
      name: 'getCoachingMemory',
      description: 'Retrieve your accumulated observations and insights about this athlete — things you\'ve noticed from their feedback, conversations, or training patterns. Use this before making recommendations so you avoid repeating advice or missing known preferences.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter by category (intensity, volume, recovery, technique, stroke-preference, equipment, scheduling, general)',
          },
        },
      },
    },
  },
  async execute({ category }, { profile }) {
    const filter = { swimmerId: profile._id, active: true };
    if (category) filter.category = category;

    const memories = await CoachingMemory.find(filter)
      .sort({ confidence: -1, createdAt: -1 })
      .limit(20)
      .select('type category content source confidence createdAt');

    if (memories.length === 0) {
      return 'No coaching observations yet.';
    }

    return memories.map(m =>
      `[${m.type}/${m.category}] (${m.source}, confidence: ${m.confidence}) ${m.content}`
    ).join('\n');
  },
};

const addCoachingObservationTool = {
  definition: {
    type: 'function',
    function: {
      name: 'addCoachingObservation',
      description: 'Store a new observation or insight about the athlete. Use this when you notice something from their feedback, conversation, or training patterns that should inform future coaching. Examples: "prefers shorter warm-ups", "recovers slowly after lactate sessions", "shoulder discomfort on overhead press".',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['observation', 'preference', 'trend', 'injury', 'goal-update', 'insight'],
            description: 'What kind of observation this is',
          },
          category: {
            type: 'string',
            enum: ['intensity', 'volume', 'recovery', 'technique', 'stroke-preference', 'equipment', 'scheduling', 'general'],
            description: 'Which aspect of training this relates to',
          },
          content: {
            type: 'string',
            description: 'The observation in plain language',
          },
          confidence: {
            type: 'number',
            description: 'How confident you are (0-1). Use 0.9+ for direct user statements, 0.5-0.7 for inferences from patterns.',
          },
        },
        required: ['type', 'category', 'content'],
      },
    },
  },
  async execute({ type, category, content, confidence = 0.6 }, { profile, workout }) {
    const memory = await CoachingMemory.create({
      swimmerId: profile._id,
      type,
      category,
      content,
      source: 'coach-analysis',
      confidence,
      relevantWorkoutIds: workout ? [workout._id] : [],
      active: true,
    });
    return `Stored observation: "${content}" (${type}/${category}, confidence: ${confidence})`;
  },
};

// ─── Workout-Scoped Tools ───────────────────────────────────────────

const explainWorkoutTool = {
  definition: {
    type: 'function',
    function: {
      name: 'explainWorkout',
      description: 'Get the reasoning behind the current workout\'s design — training notes, generation parameters, and what principles shaped it. Use this when the athlete asks "why this workout?" or "why these sets?"',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  async execute(_args, { workout }) {
    if (!workout) return 'No workout loaded.';

    const parts = [];
    parts.push(`Workout: ${workout.workoutName}`);
    parts.push(`Type: ${workout.workoutType}, Duration: ${workout.duration}min, Intensity: ${workout.intensity}`);

    if (workout.trainingNotes?.length) {
      parts.push('\nTraining notes:');
      workout.trainingNotes.forEach(n => parts.push(`  - ${n}`));
    }

    if (workout.poolWorkout?.trainingNotes?.length) {
      parts.push('\nPool notes:');
      workout.poolWorkout.trainingNotes.forEach(n => parts.push(`  - ${n}`));
    }

    if (workout.gymWorkout?.trainingNotes?.length) {
      parts.push('\nGym notes:');
      workout.gymWorkout.trainingNotes.forEach(n => parts.push(`  - ${n}`));
    }

    if (workout.generationInfo?.generationParameters) {
      const gp = workout.generationInfo.generationParameters;
      parts.push(`\nGenerated by: ${workout.generationInfo.generatedBy || 'system'}`);
      if (gp.workoutPreferences) parts.push(`Workout focus: ${gp.workoutPreferences}`);
      if (gp.intensityPreference) parts.push(`Intensity preference: ${gp.intensityPreference}`);
    }

    return parts.join('\n') || 'No design rationale available for this workout.';
  },
};

const modifyWorkoutTool = {
  definition: {
    type: 'function',
    function: {
      name: 'modifyWorkout',
      description: 'Propose an incremental edit to the current workout. Returns a proposal for the athlete to confirm — does NOT auto-apply. Use for targeted changes like adjusting one set, swapping an exercise, or changing rest intervals. For bigger changes, use regenerateWorkout instead.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Human-readable description of the proposed change',
          },
          field: {
            type: 'string',
            description: 'Dot-path to the field to change (e.g. "poolWorkout.mainSet.0.repetitions", "gymWorkout.mainSet.1.weight")',
          },
          currentValue: {
            type: 'string',
            description: 'Current value of the field (for verification)',
          },
          newValue: {
            type: 'string',
            description: 'Proposed new value for the field',
          },
        },
        required: ['description', 'field', 'currentValue', 'newValue'],
      },
    },
  },
  async execute({ description, field, currentValue, newValue }, { workout }) {
    if (!workout) return 'No workout loaded to modify.';

    // Validate field path — reject dangerous paths
    if (field.includes('$') || field.includes('..') || field.startsWith('_')) {
      return `Invalid field path: "${field}". Only workout data fields can be modified.`;
    }

    // Return a proposal — the frontend will confirm before applying
    return JSON.stringify({
      proposal: true,
      action: 'modifyWorkout',
      description,
      field,
      currentValue,
      newValue,
      workoutId: workout._id.toString(),
    });
  },
};

const regenerateWorkoutTool = {
  definition: {
    type: 'function',
    function: {
      name: 'regenerateWorkout',
      description: 'Regenerate the entire workout with new preferences. Use this for bigger changes that can\'t be expressed as a single field edit — e.g., changing the workout type, switching the training focus, or significantly restructuring the session. This triggers the full workout generation pipeline.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief reason for regeneration (shown to the athlete)',
          },
          overrides: {
            type: 'object',
            description: 'Workout preference overrides (workoutType, duration, intensity, sessionType, stroke, poolLength)',
            properties: {
              workoutType: { type: 'string' },
              duration: { type: 'number' },
              intensity: { type: 'string' },
              sessionType: { type: 'string' },
              stroke: { type: 'string' },
            },
          },
        },
        required: ['reason'],
      },
    },
  },
  async execute({ reason, overrides = {} }, { profile, workout }) {
    if (!workout) return 'No workout loaded to regenerate.';

    // Only allow known override keys — prevent injection of arbitrary fields
    const ALLOWED_OVERRIDES = new Set(['workoutType', 'duration', 'intensity', 'sessionType', 'stroke', 'poolLength']);
    const safeOverrides = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (ALLOWED_OVERRIDES.has(key)) {
        safeOverrides[key] = value;
      }
    }

    // Return a proposal — the route handler will execute regeneration after confirming
    return JSON.stringify({
      proposal: true,
      action: 'regenerateWorkout',
      reason,
      overrides: safeOverrides,
      workoutId: workout._id.toString(),
    });
  },
};

// ─── Tool Registry ──────────────────────────────────────────────────

const generalTools = [
  queryKnowledgeBaseTool,
  getSwimmerHistoryTool,
  getProgressSummaryTool,
  getCoachingMemoryTool,
  addCoachingObservationTool,
];

const workoutTools = [
  explainWorkoutTool,
  modifyWorkoutTool,
  regenerateWorkoutTool,
];

/**
 * Get tool definitions for a given mode.
 * @param {'general'|'workout'} mode
 * @returns {Object[]} OpenAI function-calling tool definitions
 */
function getToolDefinitions(mode) {
  const definitions = generalTools.map(t => t.definition);
  if (mode === 'workout') {
    definitions.push(...workoutTools.map(t => t.definition));
  }
  return definitions;
}

/**
 * Execute a tool call by name.
 * @param {string} name - Tool function name
 * @param {Object} args - Arguments from the LLM
 * @param {Object} context - { profile, workout? }
 * @returns {Promise<string>} Tool result as a string
 */
async function executeTool(name, args, context) {
  const allTools = [...generalTools, ...workoutTools];
  const tool = allTools.find(t => t.definition.function.name === name);
  if (!tool) {
    return `Unknown tool: ${name}`;
  }
  try {
    return await tool.execute(args, context);
  } catch (err) {
    return `Tool execution failed (${name}): ${err.message}`;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function mode(arr) {
  const counts = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = {
  getToolDefinitions,
  executeTool,
  generalTools,
  workoutTools,
};
