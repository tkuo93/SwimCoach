const Workout = require('../models/Workout');
const { generateWorkout: generateWorkoutAI } = require('./workout-ai');

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

  const workoutType = customization.workoutType || profile.goals?.trainingFocus || 'endurance';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;

  const workout = new Workout({
    swimmerId: profile._id,
    workoutName: generateWorkoutName(profile, customization),
    workoutType: mapWorkoutType(workoutType),
    duration,
    intensity: deriveIntensity(customization.intensity, workoutType),
    poolWorkout: {
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
    },
    gymWorkout: aiWorkout.gymWorkout ? {
      warmUp: {
        description: aiWorkout.gymWorkout.warmUp?.description || '',
        duration: aiWorkout.gymWorkout.warmUp?.duration || 5,
      },
      mainSet: (aiWorkout.gymWorkout.exercises || []).map(ex => ({
        exercise: ex.exercise || '',
        sets: ex.sets || 3,
        repetitions: ex.reps || 10,
        weight: ex.weight || 0,
        restTime: ex.restSeconds || 60,
        equipment: ex.equipment || 'bodyweight',
        muscleGroup: ex.muscleGroup || 'full-body',
        focus: ex.focus || 'strength',
        description: ex.notes || '',
      })),
      coolDown: {
        description: aiWorkout.gymWorkout.coolDown?.description || '',
        duration: aiWorkout.gymWorkout.coolDown?.duration || 5,
      },
    } : { warmUp: { duration: 0 }, mainSet: [], coolDown: { duration: 0 } },
    trainingNotes: aiWorkout.trainingNotes || [],
    userFeedback: {},
    generationInfo: {
      generatedBy: customization.workoutType ? 'user-customized' : 'system',
      generationParameters: {
        equipmentUsed: {
          poolLength: customization.poolLength || profile.equipment?.poolLength || 25,
          poolEquipment: profile.equipment?.poolEquipment || {},
          gymEquipment: profile.equipment?.gymEquipment || {},
        },
        workoutPreferences: workoutType,
        durationPreference: duration,
        intensityPreference: customization.intensity || null,
      },
    },
  });

  return workout.save();
}

/**
 * Regenerates a workout — deletes the old one and creates a fresh one.
 */
async function regenerateWorkout(workoutId, profile, customization = {}) {
  await Workout.findByIdAndDelete(workoutId);
  return generateWorkout(profile, customization);
}

// ─── Helpers ───────────────────────────────────────────────────────

function generateWorkoutName(profile, customization) {
  const date = new Date().toLocaleDateString();
  const type = customization.workoutType || profile.goals?.trainingFocus || 'mixed';
  const event = profile.goals?.primaryEvents?.[0];
  const eventStr = event ? ` ${event.distance}m ${event.stroke}` : '';
  return `${type}${eventStr} — ${date}`;
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
    recovery: 'low',
  };
  return mapping[workoutType] || 'moderate';
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
