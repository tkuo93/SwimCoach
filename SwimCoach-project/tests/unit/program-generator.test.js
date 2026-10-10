/**
 * Unit tests for src/services/program-generator.js
 *
 * Tests the pure helper functions: seededShuffle, nextDateForDay,
 * buildPredictedSessionSummary, hasWorkoutContent, checkTaper,
 * and buildSessionSummary.
 */

const {
  seededShuffle,
  nextDateForDay,
  buildPredictedSessionSummary,
  hasWorkoutContent,
  checkTaper,
  buildSessionSummary,
} = require('../../src/services/program-generator');

// ─── seededShuffle ─────────────────────────────────────────────────────

describe('seededShuffle', () => {
  test('produces deterministic output for same seed', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const seed = 'prog_123';
    const result1 = seededShuffle(arr, seed);
    const result2 = seededShuffle(arr, seed);
    expect(result1).toEqual(result2);
  });

  test('produces different output for different seeds', () => {
    const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const result1 = seededShuffle(arr, 'seed1');
    const result2 = seededShuffle(arr, 'seed2');
    // Extremely unlikely to be equal for different seeds with 8 elements
    expect(result1).not.toEqual(result2);
  });

  test('does not mutate the original array', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const original = [...arr];
    seededShuffle(arr, 'test');
    expect(arr).toEqual(original);
  });

  test('returns an array with the same elements', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const result = seededShuffle(arr, 'test');
    expect(result.sort()).toEqual([...arr].sort());
  });

  test('handles empty array', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
  });

  test('handles single element', () => {
    expect(seededShuffle(['x'], 'seed')).toEqual(['x']);
  });
});

// ─── nextDateForDay ─────────────────────────────────────────────────────

describe('nextDateForDay', () => {
  test('returns the same day if startDate is already on that day', () => {
    const monday = new Date(2025, 0, 6); // Jan 6, 2025 = Monday
    const result = nextDateForDay('monday', monday);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-06');
  });

  test('advances to next Monday from Sunday', () => {
    const sunday = new Date(2025, 0, 5); // Jan 5, 2025 = Sunday
    const result = nextDateForDay('monday', sunday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.toISOString().split('T')[0]).toBe('2025-01-06');
  });

  test('advances to next Monday from Wednesday', () => {
    const wednesday = new Date(2025, 0, 8); // Jan 8, 2025 = Wednesday
    const result = nextDateForDay('monday', wednesday);
    expect(result.getDay()).toBe(1);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-13');
  });

  test('wraps around within the week (Saturday -> Monday)', () => {
    const saturday = new Date(2025, 0, 11); // Jan 11, 2025 = Saturday
    const result = nextDateForDay('monday', saturday);
    expect(result.getDay()).toBe(1);
    expect(result.toISOString().split('T')[0]).toBe('2025-01-13');
  });

  test('sets to midnight', () => {
    const date = new Date(2025, 0, 6, 14, 30, 45);
    const result = nextDateForDay('monday', date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  test('handles all days of the week', () => {
    const weekStart = new Date(2025, 0, 5); // Sunday Jan 5
    const expected = {
      sunday: '2025-01-05',
      monday: '2025-01-06',
      tuesday: '2025-01-07',
      wednesday: '2025-01-08',
      thursday: '2025-01-09',
      friday: '2025-01-10',
      saturday: '2025-01-11',
    };
    for (const [day, dateStr] of Object.entries(expected)) {
      const result = nextDateForDay(day, weekStart);
      expect(result.toISOString().split('T')[0]).toBe(dateStr);
    }
  });
});

// ─── buildPredictedSessionSummary ──────────────────────────────────────

describe('buildPredictedSessionSummary', () => {
  const profile = {
    goals: {
      primaryEvents: [
        { stroke: 'freestyle', distance: 100 },
        { stroke: 'butterfly', distance: 100 },
      ],
    },
    trainingSchedule: { sessionDuration: 60 },
  };

  test('includes session index, type, and strokes', () => {
    const summary = buildPredictedSessionSummary('endurance', 0, 'pool', profile, {});
    expect(summary).toContain('Session 1');
    expect(summary).toContain('endurance');
    expect(summary).toContain('freestyle');
    expect(summary).toContain('butterfly');
  });

  test('includes estimated distance based on duration', () => {
    const summary = buildPredictedSessionSummary('endurance', 1, 'pool', profile, {});
    expect(summary).toContain('m');
    expect(summary).toMatch(/\d+m/);
  });

  test('includes gym muscle groups for "both" session type', () => {
    const summary = buildPredictedSessionSummary('resistance-power', 0, 'both', profile, {});
    expect(summary).toContain('gym:');
    expect(summary).toContain('legs+core');
  });

  test('includes gym muscle groups for "gym" session type', () => {
    const summary = buildPredictedSessionSummary('technique', 0, 'gym', profile, {});
    expect(summary).toContain('gym:');
    expect(summary).toContain('shoulders+core');
  });

  test('omits gym info for pool-only session type', () => {
    const summary = buildPredictedSessionSummary('endurance', 0, 'pool', profile, {});
    expect(summary).not.toContain('gym:');
  });

  test('uses customization stroke over event strokes', () => {
    const summary = buildPredictedSessionSummary('speed', 0, 'both', profile, { stroke: 'breaststroke' });
    expect(summary).toContain('breaststroke');
    expect(summary).not.toContain('butterfly');
  });

  test('handles empty events array', () => {
    const profileNoEvents = { goals: { primaryEvents: [] }, trainingSchedule: {} };
    const summary = buildPredictedSessionSummary('endurance', 0, 'both', profileNoEvents, {});
    expect(summary).toContain('Session 1');
    expect(summary).toContain('endurance');
    // Should still have distance and gym info
    expect(summary).toMatch(/\d+m/);
    expect(summary).toContain('gym:');
  });
});

// ─── hasWorkoutContent ──────────────────────────────────────────────────

describe('hasWorkoutContent', () => {
  test('returns true for workout with mainSet', () => {
    const workout = {
      poolWorkout: { mainSet: [{ distance: 100, repetitions: 4 }] },
      gymWorkout: {},
    };
    expect(hasWorkoutContent(workout)).toBe(true);
  });

  test('returns true for workout with warm-up description', () => {
    const workout = {
      poolWorkout: { warmUp: { description: 'Easy swim' } },
      gymWorkout: {},
    };
    expect(hasWorkoutContent(workout)).toBeTruthy();
  });

  test('returns true for workout with cool-down description', () => {
    const workout = {
      poolWorkout: {},
      gymWorkout: { coolDown: { description: 'Stretch' } },
    };
    expect(hasWorkoutContent(workout)).toBeTruthy();
  });

  test('returns true for gym workout with mainSet', () => {
    const workout = {
      poolWorkout: {},
      gymWorkout: { mainSet: [{ exercise: 'Squat' }] },
    };
    expect(hasWorkoutContent(workout)).toBe(true);
  });

  test('returns false for empty workout', () => {
    const workout = {
      poolWorkout: { mainSet: [], warmUp: {}, coolDown: {} },
      gymWorkout: { mainSet: [], warmUp: {}, coolDown: {} },
    };
    expect(hasWorkoutContent(workout)).toBeFalsy();
  });

  test('returns false for null pool/gym', () => {
    const workout = {};
    expect(hasWorkoutContent(workout)).toBeFalsy();
  });

  test('returns false for empty objects', () => {
    const workout = { poolWorkout: {}, gymWorkout: {} };
    expect(hasWorkoutContent(workout)).toBeFalsy();
  });
});

// ─── checkTaper ─────────────────────────────────────────────────────────

describe('checkTaper', () => {
  test('returns { taper: false } when no competition dates', () => {
    expect(checkTaper(new Date(), [])).toEqual({ taper: false });
    expect(checkTaper(new Date(), null)).toEqual({ taper: false });
    expect(checkTaper(new Date(), undefined)).toEqual({ taper: false });
  });

  test('returns { taper: false } when session is outside the taper window (far future)', () => {
    const sessionDate = new Date(2025, 5, 15); // Jun 15
    const competitionDates = [{
      start: new Date(2025, 11, 1), // Dec 1 — far away
      label: 'December Meet',
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.taper).toBe(false);
  });

  test('returns { taper: true } when session is within 14 days before competition', () => {
    const sessionDate = new Date(2025, 11, 15); // Dec 15
    const competitionDates = [{
      start: new Date(2025, 11, 20), // Dec 20 — 5 days after session
      label: 'December Meet',
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.taper).toBe(true);
    expect(result.competitionLabel).toBe('December Meet');
    expect(result.competitionDate).toEqual(new Date(2025, 11, 20));
    expect(result.daysUntil).toBe(5);
  });

  test('returns { taper: false } when session is after the competition', () => {
    const sessionDate = new Date(2025, 11, 25); // Dec 25 — after competition
    const competitionDates = [{
      start: new Date(2025, 11, 20), // Dec 20
      label: 'December Meet',
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.taper).toBe(false);
  });

  test('uses "Competition" as default label', () => {
    const sessionDate = new Date(2025, 11, 15);
    const competitionDates = [{
      start: new Date(2025, 11, 20),
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.competitionLabel).toBe('Competition');
  });

  test('returns { taper: false } at exactly 15 days before competition', () => {
    const sessionDate = new Date(2025, 11, 5); // Dec 5
    const competitionDates = [{
      start: new Date(2025, 11, 20), // Dec 20 — 15 days away
      label: 'December Meet',
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.taper).toBe(false);
  });

  test('tapers at exactly 0 days (same day as competition)', () => {
    const sessionDate = new Date(2025, 11, 20);
    const competitionDates = [{
      start: new Date(2025, 11, 20),
      label: 'December Meet',
    }];
    const result = checkTaper(sessionDate, competitionDates);
    expect(result.taper).toBe(true);
    expect(result.daysUntil).toBe(0);
  });
});

// ─── buildSessionSummary ────────────────────────────────────────────────

describe('buildSessionSummary', () => {
  test('includes session index and workout type', () => {
    const workout = { workoutType: 'endurance' };
    const summary = buildSessionSummary(workout, 2);
    expect(summary).toContain('Session 3');
    expect(summary).toContain('endurance');
  });

  test('includes pool strokes from mainSet', () => {
    const workout = {
      workoutType: 'technique',
      poolWorkout: {
        mainSet: [
          { stroke: 'freestyle' },
          { stroke: 'butterfly' },
          { stroke: 'freestyle' }, // duplicate should be deduplicated
        ],
        totalDistance: 2000,
      },
    };
    const summary = buildSessionSummary(workout, 0);
    expect(summary).toContain('freestyle+butterfly');
    expect(summary).toContain('2000m');
  });

  test('includes gym muscle groups', () => {
    const workout = {
      workoutType: 'resistance-power',
      gymWorkout: {
        mainSet: [
          { muscleGroup: 'quadriceps' },
          { muscleGroup: 'core' },
        ],
      },
    };
    const summary = buildSessionSummary(workout, 0);
    expect(summary).toContain('gym:');
    expect(summary).toContain('quadriceps');
    expect(summary).toContain('core');
  });

  test('handles workout with no pool or gym content', () => {
    const workout = { workoutType: 'recovery' };
    const summary = buildSessionSummary(workout, 0);
    expect(summary).toBe('Session 1: recovery');
  });

  test('defaults workoutType to "mixed"', () => {
    const workout = {};
    const summary = buildSessionSummary(workout, 0);
    expect(summary).toContain('mixed');
  });
});
