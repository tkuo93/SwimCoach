/**
 * Unit tests for workout-duration utility
 */

const {
  calculateWorkoutDuration,
  calculatePoolDuration,
  calculateGymDuration,
  adjustWorkoutToDuration,
  validateWorkoutDuration,
  parseIntervalToSeconds,
} = require('../../src/utils/workout-duration');

describe('parseIntervalToSeconds', () => {
  test('parses MM:SS format', () => {
    expect(parseIntervalToSeconds('2:00')).toBe(120);
    expect(parseIntervalToSeconds('1:30')).toBe(90);
    expect(parseIntervalToSeconds('0:45')).toBe(45);
  });

  test('parses seconds with s suffix', () => {
    expect(parseIntervalToSeconds('90s')).toBe(90);
    expect(parseIntervalToSeconds('120s')).toBe(120);
  });

  test('parses MM:SS.hh format', () => {
    expect(parseIntervalToSeconds('1:30.5')).toBe(90.5);
    expect(parseIntervalToSeconds('2:00.50')).toBe(120.5);
  });

  test('returns 0 for invalid input', () => {
    expect(parseIntervalToSeconds('invalid')).toBe(0);
    expect(parseIntervalToSeconds('')).toBe(0);
    expect(parseIntervalToSeconds(null)).toBe(0);
  });
});

describe('calculatePoolDuration', () => {
  test('calculates duration from explicit warmUp/coolDown durations', () => {
    const poolWorkout = {
      warmUp: { distance: 400, duration: 10 },
      mainSet: [
        { distancePerRep: 100, repetitions: 10, interval: '1:45' },
      ],
      coolDown: { distance: 200, duration: 5 },
    };
    // 10 + (10 * 1:45 * 10) + 5 = 10 + 17.5 + 5 = 32.5
    expect(calculatePoolDuration(poolWorkout)).toBe(32.5);
  });

  test('estimates warmUp/coolDown duration from distance when explicit not provided', () => {
    const poolWorkout = {
      warmUp: { distance: 400 }, // 5 base + 400/100 * 2 = 13 min
      mainSet: [
        { distancePerRep: 100, repetitions: 5, interval: '2:00' }, // 5 * 2 = 10 min
      ],
      coolDown: { distance: 200 }, // 3 base + 200/100 * 2.5 = 8 min
    };
    // 13 + 10 + 8 = 31 min
    expect(calculatePoolDuration(poolWorkout)).toBe(31);
  });

  test('uses intervalDetail.sendOff when interval not present', () => {
    const poolWorkout = {
      warmUp: { duration: 5 },
      mainSet: [
        { distancePerRep: 50, repetitions: 8, intervalDetail: { sendOff: '1:00' } },
      ],
      coolDown: { duration: 3 },
    };
    // 5 + (8 * 1) + 3 = 16 min
    expect(calculatePoolDuration(poolWorkout)).toBe(16);
  });

  test('returns 0 for empty workout', () => {
    expect(calculatePoolDuration({})).toBe(0);
    expect(calculatePoolDuration({ mainSet: [] })).toBe(0);
    expect(calculatePoolDuration(null)).toBe(0);
  });
});

describe('calculateGymDuration', () => {
  test('calculates duration from explicit warmUp/coolDown durations', () => {
    const gymWorkout = {
      warmUp: { duration: 5 },
      mainSet: [
        { exercise: 'Squats', sets: 3, repetitions: 8, restTime: 90 },
      ],
      coolDown: { duration: 5 },
    };
    // 5 + (3 * (32 + 90) / 60) + 5 = 5 + 6.1 + 5 = 16.1 min
    // Work time per set = 8 * 4 = 32 seconds
    // Rest time = 90 seconds
    // Total per set = 122 seconds = 2.033 min
    // 3 sets = 6.1 min + 0.5 transition = 6.6 min
    const result = calculateGymDuration(gymWorkout);
    expect(result).toBeCloseTo(16.1, 1);
  });

  test('estimates warmUp/coolDown duration when explicit not provided', () => {
    const gymWorkout = {
      warmUp: {},
      mainSet: [
        { exercise: 'Push-ups', sets: 2, repetitions: 15, restTime: 60 },
      ],
      coolDown: {},
    };
    // 5 + (2 * (60 + 60) / 60) + 5 = 5 + 4 + 5 = 14 min
    const result = calculateGymDuration(gymWorkout);
    expect(result).toBeCloseTo(14, 1);
  });

  test('returns 0 for empty workout', () => {
    expect(calculateGymDuration({})).toBe(0);
    expect(calculateGymDuration({ mainSet: [] })).toBe(0);
    expect(calculateGymDuration(null)).toBe(0);
  });
});

describe('calculateWorkoutDuration', () => {
  test('calculates total duration for pool + gym workout', () => {
    const workout = {
      duration: 60,
      poolWorkout: {
        warmUp: { duration: 10 },
        mainSet: [{ distancePerRep: 100, repetitions: 10, interval: '1:45' }],
        coolDown: { duration: 5 },
      },
      gymWorkout: {
        warmUp: { duration: 5 },
        mainSet: [
          { exercise: 'Squats', sets: 3, repetitions: 8, restTime: 90 },
        ],
        coolDown: { duration: 5 },
      },
    };
    const result = calculateWorkoutDuration(workout);
    expect(result.poolMinutes).toBeCloseTo(32.5, 1);
    expect(result.gymMinutes).toBeCloseTo(16.1, 1);
    expect(result.totalMinutes).toBeCloseTo(48.6, 1);
    expect(result.targetMinutes).toBe(60);
    expect(result.withinTarget).toBe(true);
    expect(result.percentOfTarget).toBeLessThan(100);
  });

  test('detects over-duration workout', () => {
    const workout = {
      duration: 40,
      poolWorkout: {
        warmUp: { duration: 10 },
        mainSet: [{ distancePerRep: 100, repetitions: 10, interval: '1:45' }],
        coolDown: { duration: 5 },
      },
      gymWorkout: {
        warmUp: { duration: 5 },
        mainSet: [
          { exercise: 'Squats', sets: 3, repetitions: 8, restTime: 90 },
        ],
        coolDown: { duration: 5 },
      },
    };
    const result = calculateWorkoutDuration(workout);
    expect(result.withinTarget).toBe(false);
    expect(result.percentOfTarget).toBeGreaterThan(100);
    expect(result.overBy).toBeGreaterThan(0);
  });
});

describe('validateWorkoutDuration', () => {
  test('returns valid=true for within-target workout', () => {
    const workout = {
      duration: 60,
      poolWorkout: {
        warmUp: { duration: 10 },
        mainSet: [{ distancePerRep: 100, repetitions: 8, interval: '2:00' }],
        coolDown: { duration: 5 },
      },
      gymWorkout: {
        warmUp: { duration: 5 },
        mainSet: [{ exercise: 'Push-ups', sets: 3, repetitions: 12, restTime: 60 }],
        coolDown: { duration: 5 },
      },
    };
    const result = validateWorkoutDuration(workout);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('returns warning for significantly over duration', () => {
    const workout = {
      duration: 40,
      poolWorkout: {
        warmUp: { duration: 15 },
        mainSet: [{ distancePerRep: 100, repetitions: 10, interval: '2:00' }],
        coolDown: { duration: 10 },
      },
      gymWorkout: {
        warmUp: { duration: 10 },
        mainSet: [{ exercise: 'Squats', sets: 5, repetitions: 10, restTime: 120 }],
        coolDown: { duration: 10 },
      },
    };
    const result = validateWorkoutDuration(workout);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('over duration');
  });

  test('returns warning for significantly under duration', () => {
    const workout = {
      duration: 90,
      poolWorkout: {
        warmUp: { duration: 5 },
        mainSet: [{ distancePerRep: 50, repetitions: 2, interval: '1:30' }],
        coolDown: { duration: 3 },
      },
      gymWorkout: null,
    };
    const result = validateWorkoutDuration(workout);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('under duration');
  });
});

describe('adjustWorkoutToDuration', () => {
  test('reduces pool main set repetitions proportionally', () => {
    const workout = {
      duration: 40,
      poolWorkout: {
        warmUp: { duration: 5 },
        mainSet: [
          { distancePerRep: 100, repetitions: 10, interval: '1:45' },
          { distancePerRep: 50, repetitions: 8, interval: '1:00' },
        ],
        coolDown: { duration: 5 },
      },
      gymWorkout: null,
    };
    // This workout is ~27 min pool, target 40 - should not need reduction
    // Let's make it over target
    const overWorkout = {
      ...workout,
      duration: 20,
      poolWorkout: {
        ...workout.poolWorkout,
        mainSet: [
          { distancePerRep: 100, repetitions: 20, interval: '1:45' },
          { distancePerRep: 50, repetitions: 16, interval: '1:00' },
        ],
      },
    };

    const adjusted = adjustWorkoutToDuration(overWorkout, 20);
    expect(adjusted._durationAdjusted).toBe(true);
    // Reps should be reduced
    expect(adjusted.poolWorkout.mainSet[0].repetitions).toBeLessThan(20);
    expect(adjusted.poolWorkout.mainSet[1].repetitions).toBeLessThan(16);
  });

  test('reduces gym sets and reps proportionally', () => {
    const workout = {
      duration: 30,
      poolWorkout: null,
      gymWorkout: {
        warmUp: { duration: 5 },
        mainSet: [
          { exercise: 'Squats', sets: 5, repetitions: 10, restTime: 90 },
          { exercise: 'Push-ups', sets: 4, repetitions: 15, restTime: 60 },
        ],
        coolDown: { duration: 5 },
      },
    };

    const adjusted = adjustWorkoutToDuration(workout, 20);
    expect(adjusted._durationAdjusted).toBe(true);
    expect(adjusted.gymWorkout.mainSet[0].sets).toBeLessThanOrEqual(5);
    expect(adjusted.gymWorkout.mainSet[0].repetitions).toBeLessThanOrEqual(10);
  });

  test('does not adjust if already within target', () => {
    const workout = {
      duration: 60,
      poolWorkout: {
        warmUp: { duration: 5 },
        mainSet: [{ distancePerRep: 100, repetitions: 4, interval: '2:00' }],
        coolDown: { duration: 3 },
      },
      gymWorkout: null,
    };

    const adjusted = adjustWorkoutToDuration(workout, 60);
    expect(adjusted._durationAdjusted).toBe(false);
  });

  test('preserves minimum values (1 rep, 1 set)', () => {
    const workout = {
      duration: 5,
      poolWorkout: {
        warmUp: { duration: 1 },
        mainSet: [
          { distancePerRep: 100, repetitions: 1, interval: '2:00' },
        ],
        coolDown: { duration: 1 },
      },
      gymWorkout: {
        warmUp: { duration: 1 },
        mainSet: [
          { exercise: 'Push-ups', sets: 1, repetitions: 1, restTime: 30 },
        ],
        coolDown: { duration: 1 },
      },
    };

    const adjusted = adjustWorkoutToDuration(workout, 5);
    // Should not go below 1
    expect(adjusted.poolWorkout.mainSet[0].repetitions).toBeGreaterThanOrEqual(1);
    expect(adjusted.gymWorkout.mainSet[0].sets).toBeGreaterThanOrEqual(1);
    expect(adjusted.gymWorkout.mainSet[0].repetitions).toBeGreaterThanOrEqual(1);
  });
});