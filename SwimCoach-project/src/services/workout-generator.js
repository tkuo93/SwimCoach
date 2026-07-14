const Workout = require('../models/Workout');
const { generateWorkout: generateWorkoutAI, resolvePoolLength, isPoolYards, resolveEquipment, resolvePrimaryEvents } = require('./workout-ai');

/**
 * Calculate working weight from 1RM percentage
 * @param {number} oneRM - The 1-rep max weight
 * @param {number} percent - Percentage (e.g., 80 for 80%)
 * @returns {number} - Calculated working weight
 */
function calculateWeightFrom1RM(oneRM, percent) {
  if (!oneRM || !percent) return 0;
  return Math.round(oneRM * (percent / 100) * 2) / 2; // Round to nearest 0.5
}

/**
 * Find 1RM for a given exercise reference
 * @param {Array} oneRepMaxes - Array of 1RM objects from profile
 * @param {string} ref - The oneRepMaxRef (e.g., 'squat', 'clean')
 * @returns {Object|null} - The matching 1RM object or null
 */
function findOneRepMax(oneRepMaxes, ref) {
  if (!oneRepMaxes || !oneRepMaxes.length || !ref) return null;
  return oneRepMaxes.find(orm => orm.exercise === ref) || null;
}

/**
 * Generates a personalized workout for a swimmer.
 *
 * Uses a two-step approach:
 * 1. Query Open Notebook for relevant training insights from the knowledge base
 * 2. Send those insights + swimmer profile to OpenRouter LLM for structured workout generation
 *
 * @param {Object} profile        - SwimmerProfile Mongoose document
 * @param {Object} customization  - Optional workout overrides
 * @param {Object} opts           - Optional context (programContext, mode, etc.)
 * @returns {Promise<Object>}     - Saved Workout document
 */
async function generateWorkout(profile, customization = {}, opts = {}) {
  // Step 1+2: Get insights from knowledge base, then generate structured workout via OpenRouter
  const aiWorkout = await generateWorkoutAI(profile, customization, opts);

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
      // Get 1RM data for percentage-based weight calculation
      const oneRepMaxes = customization.oneRepMaxes || profile.oneRepMaxes || [];

      const rawExercises = (aiWorkout.gymWorkout.exercises || []).map(ex => {
        // Handle weight: use explicit weight, or calculate from percent1RM + oneRepMaxRef
        let weight = 0;
        let weightUnit = null;
        let percent1RM = null;
        let oneRepMaxRef = null;

        if (ex.percent1RM && ex.oneRepMaxRef) {
          // Calculate weight from 1RM percentage
          const oneRM = findOneRepMax(oneRepMaxes, ex.oneRepMaxRef);
          if (oneRM) {
            weight = calculateWeightFrom1RM(oneRM.weight, ex.percent1RM);
            weightUnit = oneRM.unit;
            percent1RM = ex.percent1RM;
            oneRepMaxRef = ex.oneRepMaxRef;
          } else if (ex.weight) {
            // Fallback to explicit weight if 1RM not found
            weight = typeof ex.weight === 'number' ? ex.weight : parseFloat(String(ex.weight).match(/^(\d+(?:\.\d+)?)/)?.[1] || 0);
            weightUnit = ex.weightUnit || 'lbs';
          }
        } else if (ex.weight) {
          // Explicit weight provided
          weight = typeof ex.weight === 'number' ? ex.weight : parseFloat(String(ex.weight).match(/^(\d+(?:\.\d+)?)/)?.[1] || 0);
          weightUnit = ex.weightUnit || 'lbs';
        }

        return {
          exercise: ex.exercise || '',
          sets: ex.sets || 3,
          repetitions: ex.reps || 10,
          weight,
          weightUnit,
          percent1RM,
          oneRepMaxRef,
          restTime: ex.restSeconds || 60,
          equipment: ex.equipment || 'bodyweight',
          muscleGroup: normalizeMuscleGroup(ex.muscleGroup),
          focus: ex.focus || 'strength',
          description: ex.notes || '',
        };
      });
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
        oneRepMaxes: customization.oneRepMaxes || profile.oneRepMaxes || [],
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
async function regenerateWorkout(workoutId, profile, customization = {}, opts = {}) {
  const oldWorkout = await Workout.findById(workoutId);
  await Workout.findByIdAndDelete(workoutId);
  // Preserve the original sessionType so we don't generate pool+gym if the
  // original was pool-only (or gym-only). Only use 'both' as a fallback.
  const sessionType = customization.sessionType
    || (oldWorkout?.generationInfo?.generationParameters?.sessionType)
    || 'both';
  return generateWorkout(profile, { ...customization, sessionType }, opts);
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Known equipment requirements for common gym exercises.
 * Maps exercise name keywords -> required equipment.
 *
 * NOTE: keywords are matched most-specific-first (array order). Generic terms
 * like "row" or "lunge" that have bodyweight variants are intentionally
 * excluded — those exercises are allowed unless the description names a
 * specific implement (e.g. "dumbbell row", "barbell squat").
 */
const EXERCISE_EQUIPMENT_MAP = [
  { keywords: ['pull-up', 'pullup', 'chin-up', 'chinup'], equipment: 'pullUpBar' },
  { keywords: ['box jump', 'box step', 'plyo box'], equipment: 'plyometricBox' },
  { keywords: ['medicine ball', 'med ball', 'slam ball'], equipment: 'medicineBall' },
  { keywords: ['resistance band'], equipment: 'bands' },
  { keywords: ['ab wheel'], equipment: 'sliders' },
  { keywords: ['lat pulldown', 'cable', 'leg press', 'seated row'], equipment: 'resistanceMachine' },
  { keywords: ['barbell'], equipment: 'barbell' },
  { keywords: ['dumbbell', 'db '], equipment: 'dumbbell' },
  { keywords: ['kettlebell', 'kb '], equipment: 'kettlebell' },
];

/**
 * Substitution options when an exercise needs equipment the user doesn't have.
 * Each entry lists the equipment it can use (any one suffices) and a template.
 * Order matters: we prefer the user's available gear before falling back to
 * bodyweight, so a dumbbell user gets a dumbbell variant, not push-ups.
 */
const EXERCISE_SUBSTITUTIONS = {
  chest: [
    { equipment: ['barbell', 'dumbbell', 'kettlebell'], template: { exercise: 'Floor press', reps: 10, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band chest press', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Push-up variations', reps: 15, sets: 3 } },
  ],
  back: [
    { equipment: ['barbell', 'dumbbell', 'kettlebell'], template: { exercise: 'Bent-over row', reps: 10, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band rows', reps: 15, sets: 3 } },
    { equipment: ['pullUpBar'], template: { exercise: 'Pull-ups', reps: 8, sets: 3 } },
    { equipment: [], template: { exercise: 'Superman holds', reps: 12, sets: 3 } },
  ],
  shoulders: [
    { equipment: ['dumbbell', 'kettlebell', 'barbell'], template: { exercise: 'Overhead press', reps: 10, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band shoulder press', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Pike push-ups', reps: 12, sets: 3 } },
  ],
  legs: [
    { equipment: ['barbell', 'dumbbell', 'kettlebell'], template: { exercise: 'Goblet squats', reps: 12, sets: 3 } },
    { equipment: [], template: { exercise: 'Bodyweight squats', reps: 20, sets: 3 } },
  ],
  quads: [
    { equipment: ['barbell', 'dumbbell', 'kettlebell'], template: { exercise: 'Split squats', reps: 10, sets: 3 } },
    { equipment: [], template: { exercise: 'Walking lunges', reps: 16, sets: 3 } },
  ],
  hamstrings: [
    { equipment: ['dumbbell', 'kettlebell', 'barbell'], template: { exercise: 'Romanian deadlift', reps: 10, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band good-mornings', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Glute bridges', reps: 15, sets: 3 } },
  ],
  glutes: [
    { equipment: ['dumbbell', 'kettlebell', 'barbell'], template: { exercise: 'Hip thrust', reps: 12, sets: 3 } },
    { equipment: [], template: { exercise: 'Single-leg glute bridges', reps: 12, sets: 3 } },
  ],
  biceps: [
    { equipment: ['dumbbell', 'barbell', 'kettlebell'], template: { exercise: 'Curls', reps: 12, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band curls', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Isometric curl holds', reps: 10, sets: 3 } },
  ],
  triceps: [
    { equipment: ['dumbbell', 'barbell', 'kettlebell'], template: { exercise: 'Overhead tricep extension', reps: 12, sets: 3 } },
    { equipment: ['bands'], template: { exercise: 'Band tricep pushdowns', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Bench dips', reps: 15, sets: 3 } },
  ],
  core: [
    { equipment: ['medicineBall'], template: { exercise: 'Med ball slams', reps: 12, sets: 3 } },
    { equipment: ['kettlebell', 'dumbbell'], template: { exercise: 'Weighted crunches', reps: 15, sets: 3 } },
    { equipment: [], template: { exercise: 'Plank variations', reps: 8, sets: 3 } },
  ],
};

/** Pick the best substitution for a muscle group given available equipment. */
function pickSubstitution(muscleGroup, availableSet) {
  const mg = (muscleGroup || 'core').toLowerCase();
  const options = EXERCISE_SUBSTITUTIONS[mg] || EXERCISE_SUBSTITUTIONS['core'];
  for (const opt of options) {
    // An option with no equipment requirement is the bodyweight fallback — always matches.
    if (opt.equipment.length === 0) return opt.template;
    // Otherwise require at least one of its equipment to be available.
    if (opt.equipment.some(eq => availableSet.has(eq))) return opt.template;
  }
  // Should never reach here (last option is always bodyweight), but guard anyway.
  return options[options.length - 1].template;
}

/**
 * Filter gym exercises to only include those matching available equipment.
 * Exercises requiring unavailable equipment are substituted with a variant
 * that uses gear the user actually has (or bodyweight if nothing fits),
 * so the workout keeps its intended size instead of being silently stripped.
 */
function filterGymExercises(exercises, availableGymGear) {
  if (!exercises || !exercises.length) return [];
  const availableSet = new Set(availableGymGear);
  availableSet.add('bodyweight');

  const result = [];
  let substituted = 0;

  for (const ex of exercises) {
    const name = (ex.exercise || '').toLowerCase();
    const notes = (ex.notes || '').toLowerCase();
    const combined = `${name} ${notes}`;

    let required = null;
    for (const mapping of EXERCISE_EQUIPMENT_MAP) {
      for (const keyword of mapping.keywords) {
        if (combined.includes(keyword)) {
          required = mapping.equipment;
          break;
        }
      }
      if (required) break;
    }

    if (!required || availableSet.has(required)) {
      result.push(ex); // no gear needed, or gear available
    } else {
      const sub = pickSubstitution(ex.muscleGroup, availableSet);
      result.push({
        ...ex,
        exercise: `${sub.exercise} (subbed — no ${required})`,
        reps: sub.reps,
        sets: sub.sets,
        weight: 0,
        weightUnit: null,
        muscleGroup: ex.muscleGroup,
      });
      substituted++;
    }
  }

  if (substituted > 0) {
    console.log(`Substituted ${substituted} gym exercise(s) requiring unavailable equipment`);
  }
  return result;
}

/**
 * Clamp exercise weights to the user's available inventory.
 * When the weight changes, reps and sets are adjusted to match:
 *   - Heavy (≥70% of prescribed): keep original reps/sets
 *   - Moderate (40-70% of prescribed): increase reps by ~50%
 *   - Light (<40% of prescribed): increase reps by ~100% and add a set
 * If no matching weight exists for the unit, remove the weight (bodyweight fallback).
 * Preserves percent1RM and oneRepMaxRef fields for tracking.
 */
function clampWeightsToInventory(exercises, availableWeights) {
  if (!exercises || !exercises.length) return [];
  if (!availableWeights || !availableWeights.length) {
    // No weights available — strip all weights, keep exercises as bodyweight
    return exercises.map(ex => ({ ...ex, weight: 0, weightUnit: null, percent1RM: null, oneRepMaxRef: null }));
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
      return { ...ex, weight: 0, weightUnit: null, percent1RM: null, oneRepMaxRef: null, description: `${ex.description} (no ${unit} weights available — bodyweight)` };
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
      // Preserve percent1RM and oneRepMaxRef for tracking
      percent1RM: ex.percent1RM,
      oneRepMaxRef: ex.oneRepMaxRef,
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
