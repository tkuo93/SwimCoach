/**
 * Workout Duration Calculator
 *
 * Calculates estimated workout duration from generated workout structure
 * and validates against target duration.
 */

// Standard time estimates for workout components (in minutes)
const COMPONENT_TIMES = {
  // Pool components
  pool: {
    warmUp: {
      // Base time + distance-based time (2 min per 100yd/m at easy pace)
      baseMinutes: 5,
      per100Distance: 2,
    },
    mainSet: {
      // Time per repetition includes swim + rest
      // Calculated from interval sendOff times
    },
    coolDown: {
      baseMinutes: 3,
      per100Distance: 2.5,
    },
  },
  // Gym components
  gym: {
    warmUp: {
      baseMinutes: 5,
    },
    exercise: {
      // Per set: work time + rest time + transition
      // Work: ~30-45s per set depending on reps
      // Rest: specified restSeconds
      // Transition: ~15-30s between exercises
      basePerSet: 0.75, // 45 seconds
      transitionPerExercise: 0.5, // 30 seconds
    },
    coolDown: {
      baseMinutes: 5,
    },
  },
};

/**
 * Parse send-off interval string to seconds
 * Handles formats: "2:00", "1:30", "90s", "1:30.5"
 */
function parseIntervalToSeconds(intervalStr) {
  if (!intervalStr) return 0;

  const str = String(intervalStr).trim();

  // Handle "90s" format
  if (str.endsWith('s') && !str.includes(':')) {
    const secs = parseFloat(str.slice(0, -1));
    return isNaN(secs) ? 0 : secs;
  }

  // Handle "M:SS" or "M:SS.hh" format
  const match = str.match(/^(?:(\d+):)?(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;

  const minutes = parseInt(match[1] || 0, 10);
  const seconds = parseInt(match[2], 10);
  const hundredths = match[3] ? parseInt(match[3].padEnd(2, '0').slice(0, 2), 10) : 0;

  return minutes * 60 + seconds + hundredths / 100;
}

/**
 * Calculate estimated pool workout duration in minutes
 */
function calculatePoolDuration(poolWorkout) {
  if (!poolWorkout) return 0;

  let totalMinutes = 0;

  // Warm-up
  if (poolWorkout.warmUp) {
    const distance = poolWorkout.warmUp.distance || 0;
    const explicitDuration = poolWorkout.warmUp.duration;

    if (explicitDuration && explicitDuration > 0) {
      totalMinutes += explicitDuration;
    } else {
      // Estimate: base + distance-based
      totalMinutes += COMPONENT_TIMES.pool.warmUp.baseMinutes;
      totalMinutes += (distance / 100) * COMPONENT_TIMES.pool.warmUp.per100Distance;
    }
  }

  // Main set - calculate from intervals
  if (poolWorkout.mainSet && poolWorkout.mainSet.length > 0) {
    for (const set of poolWorkout.mainSet) {
      const reps = set.repetitions || set.reps || 1;
      const intervalStr = set.interval || (set.intervalDetail?.sendOff);
      const intervalSeconds = parseIntervalToSeconds(intervalStr);

      if (intervalSeconds > 0) {
        // Total time for this set = reps * send-off interval
        totalMinutes += (reps * intervalSeconds) / 60;
      } else {
        // Fallback estimation: 2 min per 100 distance per rep
        const distance = set.distancePerRep || set.distance || 100;
        totalMinutes += reps * (distance / 100) * 2;
      }
    }
  }

  // Cool-down
  if (poolWorkout.coolDown) {
    const distance = poolWorkout.coolDown.distance || 0;
    const explicitDuration = poolWorkout.coolDown.duration;

    if (explicitDuration && explicitDuration > 0) {
      totalMinutes += explicitDuration;
    } else {
      totalMinutes += COMPONENT_TIMES.pool.coolDown.baseMinutes;
      totalMinutes += (distance / 100) * COMPONENT_TIMES.pool.coolDown.per100Distance;
    }
  }

  return Math.round(totalMinutes * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate estimated gym workout duration in minutes
 */
function calculateGymDuration(gymWorkout) {
  if (!gymWorkout) return 0;

  let totalMinutes = 0;

  // Warm-up
  if (gymWorkout.warmUp) {
    const explicitDuration = gymWorkout.warmUp.duration;
    totalMinutes += (explicitDuration && explicitDuration > 0) ? explicitDuration : COMPONENT_TIMES.gym.warmUp.baseMinutes;
  }

  // Main exercises
  if (gymWorkout.mainSet && gymWorkout.mainSet.length > 0) {
    for (const exercise of gymWorkout.mainSet) {
      const sets = exercise.sets || 3;
      const reps = exercise.repetitions || exercise.reps || 10;
      const restSeconds = exercise.restTime || 60;

      // Time per set = work time + rest time
      // Work time estimate: ~3-5 seconds per rep
      const workTimePerSet = reps * 4; // seconds
      const restTimePerSet = restSeconds;
      const setTime = workTimePerSet + restTimePerSet;

      totalMinutes += (sets * setTime) / 60;

      // Transition time between exercises (not after last)
      totalMinutes += COMPONENT_TIMES.gym.exercise.transitionPerExercise;
    }

    // Remove last transition time
    if (gymWorkout.mainSet.length > 0) {
      totalMinutes -= COMPONENT_TIMES.gym.exercise.transitionPerExercise;
    }
  }

  // Cool-down
  if (gymWorkout.coolDown) {
    const explicitDuration = gymWorkout.coolDown.duration;
    totalMinutes += (explicitDuration && explicitDuration > 0) ? explicitDuration : COMPONENT_TIMES.gym.coolDown.baseMinutes;
  }

  return Math.round(totalMinutes * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate total estimated workout duration
 * @param {Object} workout - The workout object (from workout-generator or Workout model)
 * @returns {Object} { poolMinutes, gymMinutes, totalMinutes, targetMinutes, withinTarget, percentOfTarget }
 */
function calculateWorkoutDuration(workout) {
  const poolMinutes = calculatePoolDuration(workout.poolWorkout);
  const gymMinutes = calculateGymDuration(workout.gymWorkout);
  const totalMinutes = poolMinutes + gymMinutes;

  // Target duration from workout metadata
  const targetMinutes = workout.duration || 60;

  const percentOfTarget = targetMinutes > 0 ? Math.round((totalMinutes / targetMinutes) * 100) : 0;
  const withinTarget = totalMinutes <= targetMinutes * 1.1; // Allow 10% overage

  return {
    poolMinutes,
    gymMinutes,
    totalMinutes,
    targetMinutes,
    withinTarget,
    percentOfTarget,
    overBy: totalMinutes > targetMinutes ? Math.round((totalMinutes - targetMinutes) * 10) / 10 : 0,
  };
}

/**
 * Adjust workout to fit within target duration
 * Reduces volume proportionally if workout exceeds target
 * @param {Object} workout - The workout object to adjust
 * @param {number} targetMinutes - Target duration in minutes
 * @returns {Object} Adjusted workout
 */
function adjustWorkoutToDuration(workout, targetMinutes) {
  const durationInfo = calculateWorkoutDuration({ ...workout, duration: targetMinutes });

  if (durationInfo.withinTarget) {
    return { ...workout, _durationAdjusted: false };
  }

  // Calculate reduction factor (with small buffer)
  const reductionFactor = (targetMinutes * 0.95) / durationInfo.totalMinutes;

  const adjustedWorkout = { ...workout };

  // Adjust pool workout
  if (adjustedWorkout.poolWorkout && durationInfo.poolMinutes > 0) {
    const poolReduction = Math.min(reductionFactor, 1);

    adjustedWorkout.poolWorkout = {
      ...adjustedWorkout.poolWorkout,
      warmUp: adjustPoolComponent(adjustedWorkout.poolWorkout.warmUp, poolReduction),
      mainSet: adjustMainSet(adjustedWorkout.poolWorkout.mainSet, poolReduction),
      coolDown: adjustPoolComponent(adjustedWorkout.poolWorkout.coolDown, poolReduction),
    };
  }

  // Adjust gym workout
  if (adjustedWorkout.gymWorkout && durationInfo.gymMinutes > 0) {
    const gymReduction = Math.min(reductionFactor, 1);

    adjustedWorkout.gymWorkout = {
      ...adjustedWorkout.gymWorkout,
      warmUp: adjustGymComponent(adjustedWorkout.gymWorkout.warmUp, gymReduction),
      mainSet: adjustGymMainSet(adjustedWorkout.gymWorkout.mainSet, gymReduction),
      coolDown: adjustGymComponent(adjustedWorkout.gymWorkout.coolDown, gymReduction),
    };
  }

  adjustedWorkout._durationAdjusted = true;
  adjustedWorkout._originalDuration = durationInfo.totalMinutes;
  adjustedWorkout._targetDuration = targetMinutes;

  return adjustedWorkout;
}

function adjustPoolComponent(component, factor) {
  if (!component) return component;

  return {
    ...component,
    distance: component.distance ? Math.max(50, Math.round(component.distance * factor / 50) * 50) : 0,
    duration: component.duration ? Math.max(1, Math.round(component.duration * factor * 10) / 10) : 0,
  };
}

function adjustMainSet(mainSet, factor) {
  if (!mainSet || !Array.isArray(mainSet)) return mainSet;

  return mainSet.map(set => {
    const newReps = Math.max(1, Math.round((set.repetitions || set.reps || 1) * factor));
    const newDistance = set.distancePerRep || set.distance;

    return {
      ...set,
      repetitions: newReps,
      reps: newReps,
      distancePerRep: newDistance,
      distance: newDistance,
    };
  });
}

function adjustGymComponent(component, factor) {
  if (!component) return component;

  return {
    ...component,
    duration: component.duration ? Math.max(1, Math.round(component.duration * factor * 10) / 10) : 0,
  };
}

function adjustGymMainSet(mainSet, factor) {
  if (!mainSet || !Array.isArray(mainSet)) return mainSet;

  return mainSet.map(exercise => {
    const newSets = Math.max(1, Math.round((exercise.sets || 3) * factor));
    const newReps = Math.max(1, Math.round((exercise.repetitions || exercise.reps || 10) * factor));

    return {
      ...exercise,
      sets: newSets,
      repetitions: newReps,
      reps: newReps,
    };
  });
}

/**
 * Validate workout duration and return warnings if over target
 * @param {Object} workout - The workout to validate
 * @returns {Object} { valid: boolean, warnings: string[], durationInfo: Object }
 */
function validateWorkoutDuration(workout) {
  const durationInfo = calculateWorkoutDuration(workout);
  const warnings = [];

  if (durationInfo.percentOfTarget > 110) {
    warnings.push(`Workout estimated at ${durationInfo.totalMinutes} min (${durationInfo.percentOfTarget}% of ${durationInfo.targetMinutes} min target) - significantly over duration`);
  } else if (durationInfo.percentOfTarget > 100) {
    warnings.push(`Workout estimated at ${durationInfo.totalMinutes} min (${durationInfo.percentOfTarget}% of ${durationInfo.targetMinutes} min target) - slightly over duration`);
  } else if (durationInfo.percentOfTarget < 50) {
    warnings.push(`Workout estimated at ${durationInfo.totalMinutes} min (${durationInfo.percentOfTarget}% of ${durationInfo.targetMinutes} min target) - significantly under duration`);
  }

  // Valid means within acceptable range (not significantly over or under)
  // Allow 50% to 110% as acceptable
  const valid = durationInfo.percentOfTarget >= 50 && durationInfo.percentOfTarget <= 110;

  return {
    valid,
    warnings,
    durationInfo,
  };
}

module.exports = {
  calculateWorkoutDuration,
  calculatePoolDuration,
  calculateGymDuration,
  adjustWorkoutToDuration,
  validateWorkoutDuration,
  parseIntervalToSeconds,
  COMPONENT_TIMES,
};