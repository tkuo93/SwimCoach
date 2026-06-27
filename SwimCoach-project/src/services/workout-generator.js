const Workout = require('../models/Workout');
const { generateWorkout: generateWorkoutAI, resolvePoolLength, isPoolYards, resolveEquipment, resolvePrimaryEvents } = require('./workout-ai');

/**
 * Generates a personalized workout for a swimmer.
 *
 * Uses a two-step approach:
 * 1. Query Open Notebook for relevant training insights from the knowledge base
 * 2. Send those insights + swimmer profile to OpenRouter LLM for structured workout generation
 *
 * @param {Object} profile        - SwimmerProfile Mongoose document
 * @param {Object} customization  - Optional workout overrides
 * @returns {Promise<Object>}     - Saved Workout document
 */
async function generateWorkout(profile, customization = {}) {
  // Step 1+2: Get insights from knowledge base, then generate structured workout via OpenRouter
  const aiWorkout = await generateWorkoutAI(profile, customization);

  const workoutType = customization.workoutType || (Array.isArray(profile.goals?.trainingFocus) ? profile.goals.trainingFocus[0] : profile.goals?.trainingFocus) || 'endurance';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const sessionType = customization.sessionType || 'both';

  const includePool = sessionType === 'both' || sessionType === 'pool';
  const includeGym = sessionType === 'both' || sessionType === 'gym';

  // Available weights for clamping prescribed weights to what the user actually owns
  const availableWeights = (customization.weightInventory || profile.equipment?.weightInventory || []).map(w => ({
    weight: w.weight,
    unit: w.unit || 'lbs',
    type: w.type,
  }));

  const mappedWorkoutType = mapWorkoutType(workoutType);

  const workout = new Workout({
    swimmerId: profile._id,
    workoutName: generateWorkoutName(mappedWorkoutType, sessionType, aiWorkout, profile, customization.date),
    workoutType: mappedWorkoutType,
    date: customization.date || new Date(),
    duration,
    intensity: deriveIntensity(customization.intensity, workoutType),
    poolWorkout: includePool ? {
      poolUnit: isPoolYards(customization, profile) ? 'yards' : 'meters',
      warmUp: {
        description: aiWorkout.warmUp?.description || '',
        distance: aiWorkout.warmUp?.distance || 0,
        duration: aiWorkout.warmUp?.duration || Math.round(duration * 0.15),
      },
      mainSet: (aiWorkout.mainSet || []).map(s => ({
        distance: s.distancePerRep || s.distance || 0,
        repetitions: s.reps || s.repetitions || 1,
        stroke: s.stroke || 'freestyle',
        interval: s.restInterval || s.interval || '',
        focus: s.focus || '',
        description: s.notes || s.description || '',
        equipment: s.equipment || {},
      })),
      coolDown: {
        description: aiWorkout.coolDown?.description || '',
        distance: aiWorkout.coolDown?.distance || 0,
        duration: aiWorkout.coolDown?.duration || Math.round(duration * 0.1),
      },
      totalDistance: aiWorkout.totalDistance || calculateTotalDistance(aiWorkout),
      trainingNotes: aiWorkout.poolWorkout?.trainingNotes || [],
    } : { warmUp: { duration: 0 }, mainSet: [], coolDown: { duration: 0 }, totalDistance: 0, trainingNotes: [] },
    gymWorkout: includeGym && aiWorkout.gymWorkout ? (() => {
      const rawExercises = (aiWorkout.gymWorkout.exercises || []).map(ex => ({
        exercise: ex.exercise || '',
        sets: ex.sets || 3,
        repetitions: ex.reps || 10,
        weight: (() => {
          if (!ex.weight) return 0;
          if (typeof ex.weight === 'number') return ex.weight;
          const match = String(ex.weight).match(/^(\d+(?:\.\d+)?)/);
          return match ? parseFloat(match[1]) : 0;
        })(),
        weightUnit: (() => {
          if (!ex.weight || typeof ex.weight === 'number') return null;
          const str = String(ex.weight);
          if (/kg/i.test(str)) return 'kg';
          if (/lbs?/i.test(str) || /#/.test(str)) return 'lbs';
          return null;
        })(),
        restTime: ex.restSeconds || 60,
        equipment: ex.equipment || 'bodyweight',
        muscleGroup: normalizeMuscleGroup(ex.muscleGroup),
        focus: ex.focus || 'strength',
        description: ex.notes || '',
      }));
      // Filter out exercises requiring equipment the user doesn't have
      // Use customization equipment override if provided, otherwise profile defaults
      const { gymEquipment: resolvedGymEquip } = resolveEquipment(customization, profile);
      const availableGymGear = Object.entries(resolvedGymEquip).filter(([, v]) => v).map(([k]) => k);
      const filteredExercises = filterGymExercises(rawExercises, availableGymGear);
      if (rawExercises.length !== filteredExercises.length) {
        console.log(`Filtered gym exercises: ${rawExercises.length} -> ${filteredExercises.length} (removed exercises requiring unavailable equipment)`);
      }
      // Clamp prescribed weights to what the user actually owns
      const clampedExercises = clampWeightsToInventory(filteredExercises, availableWeights);
      return {
        warmUp: {
          description: aiWorkout.gymWorkout.warmUp?.description || '',
          duration: aiWorkout.gymWorkout.warmUp?.duration || 5,
        },
        mainSet: clampedExercises,
        coolDown: {
          description: aiWorkout.gymWorkout.coolDown?.description || '',
          duration: aiWorkout.gymWorkout.coolDown?.duration || 5,
        },
        trainingNotes: aiWorkout.gymWorkout?.trainingNotes || [],
      };
    })() : { warmUp: { duration: 0 }, mainSet: [], coolDown: { duration: 0 }, trainingNotes: [] },
    trainingNotes: aiWorkout.trainingNotes || [],
    userFeedback: {},
    generationInfo: {
      generatedBy: customization.workoutType ? 'user-customized' : 'system',
      generationParameters: {
        equipmentUsed: {
          poolLength: resolvePoolLength(customization, profile),
          ...resolveEquipment(customization, profile),
        },
        workoutPreferences: mappedWorkoutType,
        durationPreference: duration,
        intensityPreference: customization.intensity || null,
        strokePreference: customization.stroke || null,
        weightInventory: customization.weightInventory || profile.equipment?.weightInventory || [],
      },
    },
  });

  // Post-process: validate and correct pool distances if AI used wrong unit
  if (includePool && isPoolYards(customization, profile)) {
    validateYardsDistances(workout);
  }

  return workout.save();
}

/**
 * Validate that pool distances are appropriate for a yards pool.
 * If the AI generated meter-based distances (50, 100, 200, 400, 800, 1500),
 * convert them to the closest standard yards distance (50, 100, 200, 400, 500, 1650).
 */
function validateYardsDistances(workout) {
  // Standard meter distances that indicate the AI defaulted to meters
  const meterDistances = new Set([50, 100, 200, 400, 800, 1500]);
  // Map meter -> closest standard yards distance
  const meterToYards = { 50: 50, 100: 100, 200: 200, 400: 400, 800: 500, 1500: 1650 };

  const pool = workout.poolWorkout;
  if (!pool) return;

  const checkSet = (set) => {
    const dist = set.distance;
    if (dist && meterDistances.has(dist) && meterToYards[dist]) {
      const corrected = meterToYards[dist];
      console.log(`Pool unit correction: ${dist}m → ${corrected}yd`);
      set.distance = corrected;
      if (set.description) {
        set.description = set.description.replace(new RegExp(`${dist}m`, 'g'), `${corrected}yd`);
      }
    }
  };

  if (pool.warmUp) checkSet(pool.warmUp);
  if (pool.coolDown) checkSet(pool.coolDown);
  if (pool.mainSet) pool.mainSet.forEach(checkSet);

  // Recalculate total distance
  if (pool.mainSet) {
    pool.totalDistance = pool.mainSet.reduce((sum, s) => sum + (s.distance * s.repetitions), 0)
      + (pool.warmUp?.distance || 0)
      + (pool.coolDown?.distance || 0);
  }
}

/**
 * Regenerates a workout — deletes the old one and creates a fresh one.
 */
async function regenerateWorkout(workoutId, profile, customization = {}) {
  const oldWorkout = await Workout.findById(workoutId);
  await Workout.findByIdAndDelete(workoutId);
  // Preserve the original sessionType so we don't generate pool+gym if the
  // original was pool-only (or gym-only). Only use 'both' as a fallback.
  const sessionType = customization.sessionType
    || (oldWorkout?.generationInfo?.generationParameters?.sessionType)
    || 'both';
  return generateWorkout(profile, { ...customization, sessionType });
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Known equipment requirements for common gym exercises.
 * Maps exercise name keywords -> required equipment.
 */
const EXERCISE_EQUIPMENT_MAP = [
  { keywords: ['pull-up', 'pullup', 'chin-up', 'chinup'], equipment: 'pullUpBar' },
  { keywords: ['box jump', 'box step', 'plyo box'], equipment: 'plyometricBox' },
  { keywords: ['medicine ball', 'med ball', 'slam ball'], equipment: 'medicineBall' },
  { keywords: ['band', 'resistance band'], equipment: 'bands' },
  { keywords: ['slider', 'ab wheel'], equipment: 'sliders' },
  { keywords: ['lat pulldown', 'cable', 'leg press', 'machine', 'seated row'], equipment: 'resistanceMachine' },
  { keywords: ['barbell', 'squat', 'deadlift', 'bench press', 'overhead press', 'hip thrust', 'barbell row', 'barbell curl'], equipment: 'barbell' },
  { keywords: ['dumbbell', 'db ', 'bicep curl', 'tricep extension', 'shoulder press', 'lunge', 'row', 'chest fly', 'lateral raise', 'dumbbell press'], equipment: 'dumbbell' },
  { keywords: ['kettlebell', 'kb ', 'kettlebell swing', 'kettlebell clean', 'turkish get-up', 'get up'], equipment: 'kettlebell' },
];

/**
 * Filter gym exercises to only include those matching available equipment.
 * Exercises that require equipment the user doesn't have are removed.
 */
function filterGymExercises(exercises, availableGymGear) {
  if (!exercises || !exercises.length) return [];
  const availableSet = new Set(availableGymGear);
  // Always allow bodyweight exercises
  availableSet.add('bodyweight');

  return exercises.filter(ex => {
    const name = (ex.exercise || '').toLowerCase();
    const notes = (ex.notes || '').toLowerCase();
    const combined = `${name} ${notes}`;

    for (const mapping of EXERCISE_EQUIPMENT_MAP) {
      for (const keyword of mapping.keywords) {
        if (combined.includes(keyword)) {
          // This exercise requires specific equipment — check if available
          return availableSet.has(mapping.equipment);
        }
      }
    }
    // No specific equipment required — allow it
    return true;
  });
}

/**
 * Clamp exercise weights to the user's available inventory.
 * When the weight changes, reps and sets are adjusted to match:
 *   - Heavy (≥70% of prescribed): keep original reps/sets
 *   - Moderate (40-70% of prescribed): increase reps by ~50%
 *   - Light (<40% of prescribed): increase reps by ~100% and add a set
 * If no matching weight exists for the unit, remove the weight (bodyweight fallback).
 */
function clampWeightsToInventory(exercises, availableWeights) {
  if (!exercises || !exercises.length) return [];
  if (!availableWeights || !availableWeights.length) {
    // No weights available — strip all weights, keep exercises as bodyweight
    return exercises.map(ex => ({ ...ex, weight: 0, weightUnit: null }));
  }

  // Group available weights by unit for quick lookup
  const weightsByUnit = {};
  for (const w of availableWeights) {
    const unit = w.unit || 'lbs';
    if (!weightsByUnit[unit]) weightsByUnit[unit] = [];
    weightsByUnit[unit].push(w.weight);
  }
  // Sort each unit group ascending for binary-ish lookup
  for (const unit of Object.keys(weightsByUnit)) {
    weightsByUnit[unit].sort((a, b) => a - b);
  }

  return exercises.map(ex => {
    if (!ex.weight || ex.weight === 0) return ex;

    const unit = ex.weightUnit || 'lbs';
    const prescribed = ex.weight;
    const available = weightsByUnit[unit];

    if (!available || available.length === 0) {
      // No weights in this unit — strip weight, make it bodyweight
      return { ...ex, weight: 0, weightUnit: null, description: `${ex.description} (no ${unit} weights available — bodyweight)` };
    }

    // Find the closest available weight that doesn't exceed the prescribed amount
    let closest = available[0];
    for (const w of available) {
      if (w <= prescribed) closest = w;
      else break;
    }

    if (closest === prescribed) return ex;

    // Adjust reps and sets based on how the weight changed
    const ratio = closest / prescribed;
    let adjustedReps = ex.repetitions;
    let adjustedSets = ex.sets;
    let note = '';

    if (ratio < 0.4) {
      // Much lighter — increase reps significantly and add a set
      adjustedReps = Math.round(ex.repetitions * 2);
      adjustedSets = Math.min(ex.sets + 1, 5);
      note = ` (adjusted from ${prescribed}${unit} — light weight, higher reps)`;
    } else if (ratio < 0.7) {
      // Moderately lighter — increase reps
      adjustedReps = Math.round(ex.repetitions * 1.5);
      note = ` (adjusted from ${prescribed}${unit} — moderate weight)`;
    } else {
      // Close to prescribed — small adjustment, keep reps
      note = ` (adjusted from ${prescribed}${unit})`;
    }

    console.log(`Weight clamped: ${ex.exercise} ${prescribed}${unit} → ${closest}${unit} (${ex.reps}×${ex.sets} → ${adjustedReps}×${adjustedSets})`);
    return {
      ...ex,
      weight: closest,
      repetitions: adjustedReps,
      sets: adjustedSets,
      description: `${ex.description}${note}`,
    };
  });
}

function generateWorkoutName(mappedType, sessionType, aiWorkout, profile, date) {
  const dateStr = (date ? new Date(date) : new Date()).toLocaleDateString();
  const type = mapWorkoutTypeLabel(mappedType);

  // Derive the primary stroke from the actual generated workout content
  const mainStrokes = [];
  if (aiWorkout.mainSet && aiWorkout.mainSet.length > 0) {
    // Get unique strokes from main set, preserving order
    const seen = new Set();
    for (const set of aiWorkout.mainSet) {
      const stroke = set.stroke || 'freestyle';
      if (!seen.has(stroke)) {
        seen.add(stroke);
        mainStrokes.push(stroke);
      }
    }
  }
  // Fallback to profile event strokes if AI didn't generate content
  if (mainStrokes.length === 0) {
    const profileEvents = resolvePrimaryEvents(profile, {});
    if (profileEvents.length > 0) mainStrokes.push(profileEvents[0].stroke);
  }
  const strokeStr = mainStrokes.length > 0 ? ` ${mainStrokes.join('/')}` : '';

  // Session type label
  const typeLabel = sessionType === 'pool' ? `${type} (pool)` : sessionType === 'gym' ? `${type} (gym)` : type;

  return `${typeLabel}${strokeStr} — ${dateStr}`;
}

/**
 * Map workout type enum value to a human-readable label.
 */
function mapWorkoutTypeLabel(type) {
  const labels = {
    lactate: 'Lactate',
    'resistance-power': 'Power',
    speed: 'Speed',
    technique: 'Technique',
    endurance: 'Endurance',
    mobility: 'Mobility',
    recovery: 'Recovery',
  };
  return labels[type] || type || 'Mixed';
}

function mapWorkoutType(type) {
  const mapping = {
    lactate: 'lactate',
    'resistance-power': 'resistance-power',
    power: 'resistance-power',
    resistance: 'resistance-power',
    speed: 'speed',
    technique: 'technique',
    endurance: 'endurance',
    mobility: 'mobility',
    recovery: 'recovery',
  };
  return mapping[type] || 'endurance';
}

function deriveIntensity(explicitIntensity, workoutType) {
  if (explicitIntensity) return explicitIntensity;
  const mapping = {
    lactate: 'high',
    'resistance-power': 'high',
    speed: 'maximal',
    technique: 'moderate',
    endurance: 'moderate',
    mobility: 'low',
    recovery: 'low',
  };
  return mapping[workoutType] || 'moderate';
}

/**
 * Normalize a muscleGroup string from the AI to a valid enum value.
 * Handles descriptive values like "quadriceps, glutes, core" → "full-body"
 * or "infraspinatus, teres minor (rotator cuff)" → "rotator-cuff".
 */
const MUSCLE_GROUP_ALIASES = {
  // Direct matches (lowercased)
  'arms': 'arms', 'upper arms': 'arms', 'biceps': 'biceps', 'triceps': 'triceps',
  'forearms': 'forearms',
  'legs': 'legs', 'lower body': 'legs', 'quadriceps': 'quadriceps', 'quads': 'quadriceps',
  'hamstrings': 'hamstrings', 'glutes': 'glutes', 'calves': 'calves',
  'hip flexors': 'hip-flexors', 'hip-flexors': 'hip-flexors',
  'adductors': 'adductors', 'abductors': 'abductors',
  'core': 'core', 'abs': 'core', 'abdominals': 'core',
  'obliques': 'obliques', 'transverse abdominis': 'core', 'rectus abdominis': 'core',
  'chest': 'chest', 'pectorals': 'chest', 'pecs': 'chest',
  'back': 'back', 'lats': 'back', 'latissimus': 'back', 'rhomboids': 'back',
  'trapezius': 'back', 'traps': 'back',
  'shoulders': 'shoulders', 'deltoids': 'shoulders', 'delts': 'shoulders',
  'rotator cuff': 'rotator-cuff', 'rotator-cuff': 'rotator-cuff',
  'infraspinatus': 'rotator-cuff', 'teres minor': 'rotator-cuff',
  'lower back': 'lower-back', 'lower-back': 'lower-back', 'erectors': 'lower-back',
  'full body': 'full-body', 'full-body': 'full-body', 'total body': 'full-body',
};

const VALID_MUSCLE_GROUPS = new Set([
  'arms', 'legs', 'core', 'full-body',
  'chest', 'back', 'shoulders',
  'biceps', 'triceps', 'forearms',
  'quadriceps', 'hamstrings', 'glutes', 'calves',
  'hip-flexors', 'adductors', 'abductors',
  'rotator-cuff', 'lower-back', 'obliques',
]);

function normalizeMuscleGroup(raw) {
  if (!raw || typeof raw !== 'string') return 'full-body';

  const lower = raw.toLowerCase().trim();

  // Already valid
  if (VALID_MUSCLE_GROUPS.has(lower)) return lower;

  // Check aliases
  if (MUSCLE_GROUP_ALIASES[lower]) return MUSCLE_GROUP_ALIASES[lower];

  // Comma-separated or parenthetical descriptions — pick the first recognized muscle
  const tokens = lower.split(/[,;()]+/).map(t => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (VALID_MUSCLE_GROUPS.has(token)) return token;
    if (MUSCLE_GROUP_ALIASES[token]) return MUSCLE_GROUP_ALIASES[token];
  }

  // Multi-muscle exercises → full-body
  return 'full-body';
}

function calculateTotalDistance(parsed) {
  if (!parsed.mainSet) return 0;
  return parsed.mainSet.reduce(
    (sum, s) => sum + (s.distancePerRep || s.distance || 0) * (s.reps || s.repetitions || 1),
    0,
  ) + (parsed.warmUp?.distance || 0) + (parsed.coolDown?.distance || 0);
}

module.exports = {
  generateWorkout,
  regenerateWorkout,
};
