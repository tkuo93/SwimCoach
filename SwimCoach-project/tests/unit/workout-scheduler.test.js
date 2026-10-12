/**
 * Unit tests for src/services/workout-scheduler.js
 *
 * Tests the date-checking logic, caching guard, and integration with
 * the program generator. Mocks the DB models and program-generator.
 */

// ─── Mock dependencies ─────────────────────────────────────────────────
const mockCountDocuments = jest.fn();
const mockFindById = jest.fn();
const mockFind = jest.fn();

jest.mock('../../src/models/Workout', () => {
  const Workout = jest.fn();
  Workout.countDocuments = mockCountDocuments;
  Workout.find = mockFind;
  return Workout;
});

jest.mock('../../src/models/SwimmerProfile', () => {
  const SwimmerProfile = jest.fn();
  SwimmerProfile.findById = mockFindById;
  return SwimmerProfile;
});

// Mock program-generator so we don't actually call the LLM
const mockGenerate = jest.fn();
jest.mock('../../src/services/program-generator', () => ({
  generateWeeklyProgram: (...args) => mockGenerate(...args),
}));

// Import after mocks are set up
const {
  getUpcomingWeekRange,
  getISOWeekKey,
  checkAndGenerateUpcomingWeek,
  clearCache,
  lastCheckCache,
  getExistingWorkoutDates,
  countWorkoutsInWeek,
} = require('../../src/services/workout-scheduler');

// ─── Tests ──────────────────────────────────────────────────────────────

describe('getUpcomingWeekRange', () => {
  test('on Sunday, returns the upcoming (next) week range', () => {
    // Sunday Jan 5, 2025
    const refDate = new Date(2025, 0, 5, 14, 0, 0);
    const { start, end } = getUpcomingWeekRange(refDate);

    // Next Monday is Jan 6
    expect(start.getDay()).toBe(1); // Monday
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-06');
    // Next Sunday is Jan 12
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-12');
  });

  test('on Wednesday, returns the upcoming (next) week, NOT the current week', () => {
    // Wednesday Jan 8, 2025 — current week started Jan 6, next week starts Jan 13
    const refDate = new Date(2025, 0, 8, 10, 0, 0);
    const { start, end } = getUpcomingWeekRange(refDate);

    // Next Monday is Jan 13 (not Jan 6!)
    expect(start.getDay()).toBe(1); // Monday
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-13');
    // Next Sunday is Jan 19
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-19');
  });

  test('on Monday, returns the upcoming (next) week, not current', () => {
    // Monday Jan 6, 2025 — current week starts Jan 6, next week starts Jan 13
    const refDate = new Date(2025, 0, 6, 9, 0, 0);
    const { start, end } = getUpcomingWeekRange(refDate);

    expect(start.getDay()).toBe(1);
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-13'); // NOT Jan 6
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-19');
  });

  test('on Saturday, returns the upcoming (next) week', () => {
    // Saturday Jan 11, 2025 — next week starts Jan 13
    const refDate = new Date(2025, 0, 11, 15, 0, 0);
    const { start, end } = getUpcomingWeekRange(refDate);

    expect(start.getDay()).toBe(1); // Monday
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-13');
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-19');
  });

  test('start is at midnight, end is at end of Sunday', () => {
    const { start, end } = getUpcomingWeekRange(new Date(2025, 0, 5, 23, 59, 59));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  test('defaults to now when no refDate is passed', () => {
    const { start, end } = getUpcomingWeekRange();
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
  });
});

describe('getISOWeekKey', () => {
  test('returns consistent key for same week', () => {
    const key1 = getISOWeekKey(new Date(2025, 0, 6)); // Monday
    const key2 = getISOWeekKey(new Date(2025, 0, 8)); // Wednesday (same week)
    expect(key1).toBe(key2);
  });

  test('returns different key for different weeks', () => {
    const key1 = getISOWeekKey(new Date(2025, 0, 6)); // Week 2
    const key2 = getISOWeekKey(new Date(2025, 0, 13)); // Week 3
    expect(key1).not.toBe(key2);
  });

  test('format is YYYY-Www', () => {
    const key = getISOWeekKey(new Date(2025, 0, 6));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('checkAndGenerateUpcomingWeek', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
  });

  test('on Sunday with no workouts, generates full week with weekStartOffset=1 and refDate', async () => {
    // Sunday Jan 5, 2025
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    const profile = { _id: 'swimmer123', goals: { trainingFocus: ['endurance'] }, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockGenerate.mockResolvedValue({
      programId: 'prog_test123',
      programPeriod: 'weekly',
      totalSessions: 5,
      generatedCount: 5,
      workouts: [{ _id: 'w1' }, { _id: 'w2' }, { _id: 'w3' }, { _id: 'w4' }, { _id: 'w5' }],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', sunday);
    expect(result.generated).toBe(true);
    expect(result.programId).toBe('prog_test123');

    // Should always use weekStartOffset=1 (next week) and pass refDate
    expect(mockGenerate).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        programPeriod: 'weekly',
        weekStartOffset: 1,
        existingDates: [],
      }),
      { refDate: sunday }
    );
  });

  test('on Monday with no workouts, generates for NEXT week (not current)', async () => {
    // Monday Jan 6, 2025
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    const profile = { _id: 'swimmer123', goals: { trainingFocus: ['endurance'] }, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockGenerate.mockResolvedValue({
      programId: 'prog_test456',
      programPeriod: 'weekly',
      totalSessions: 5,
      generatedCount: 5,
      workouts: [],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', monday);
    expect(result.generated).toBe(true);

    // Should use weekStartOffset=1 on Monday too (always next week)
    expect(mockGenerate).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        programPeriod: 'weekly',
        weekStartOffset: 1,
        existingDates: [],
      }),
      { refDate: monday }
    );
  });

  test('on Wednesday with no workouts, generates for NEXT week', async () => {
    // Wednesday Jan 8, 2025
    const wednesday = new Date(2025, 0, 8, 9, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockGenerate.mockResolvedValue({
      programId: 'prog_wed',
      programPeriod: 'weekly',
      totalSessions: 3,
      generatedCount: 3,
      workouts: [],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', wednesday);
    expect(result.generated).toBe(true);
    expect(mockGenerate).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        programPeriod: 'weekly',
        weekStartOffset: 1,
      }),
      { refDate: wednesday }
    );
  });

  test('when partial workouts exist in upcoming week, fills in missing days', async () => {
    // Monday Jan 6, 2025 — check upcoming week (Jan 13–19)
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(2); // 2 workouts already exist in upcoming week
    // Mock existing workout dates: Jan 13 (Monday) and Jan 17 (Friday)
    const existingDates = [new Date(2025, 0, 13), new Date(2025, 0, 17)];
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { date: existingDates[0] }, { date: existingDates[1] },
    ]) }) });
    mockGenerate.mockResolvedValue({
      programId: 'prog_fill',
      programPeriod: 'weekly',
      totalSessions: 3,
      generatedCount: 3,
      workouts: [{ _id: 'w1' }, { _id: 'w2' }, { _id: 'w3' }],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', monday);
    expect(result.generated).toBe(true);

    // Should pass the existing dates so the generator skips those slots
    expect(mockGenerate).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        existingDates: expect.arrayContaining([
          existingDates[0].toISOString(),
          existingDates[1].toISOString(),
        ]),
      }),
      { refDate: monday }
    );
  });

  test('skips if already checked for this target week (ISO week guard)', async () => {
    // Monday Jan 6, 2025 — target week is Jan 13–19 (ISO week 3)
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    mockFindById.mockResolvedValue(null);

    // First call — proceeds (but profile not found)
    const first = await checkAndGenerateUpcomingWeek('swimmer123', monday);
    expect(first.skipped).toBe(true);
    expect(first.reason).toBe('Profile not found');

    // Second call same target week (Tuesday Jan 7 — still targets Jan 13–19)
    const tuesday = new Date(2025, 0, 7, 9, 0, 0);
    const second = await checkAndGenerateUpcomingWeek('swimmer123', tuesday);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('Already checked this week');
  });

  test('same swimmer across different target weeks both trigger', async () => {
    // Monday Jan 6 → targets week of Jan 13
    // Monday Jan 13 → targets week of Jan 20
    const monday1 = new Date(2025, 0, 6, 9, 0, 0);
    const monday2 = new Date(2025, 0, 13, 9, 0, 0);
    mockFindById.mockResolvedValue(null);

    const r1 = await checkAndGenerateUpcomingWeek('swimmer123', monday1);
    const r2 = await checkAndGenerateUpcomingWeek('swimmer123', monday2);

    // Both should proceed past the guard (different target ISO weeks)
    expect(r1.skipped).toBe(true);
    expect(r2.skipped).toBe(true);
    expect(mockFindById).toHaveBeenCalledTimes(2);
  });

  test('handles profile not found gracefully', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    mockFindById.mockResolvedValue(null);

    const result = await checkAndGenerateUpcomingWeek('nonexistent', sunday);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Profile not found');
  });

  test('handles DB query error gracefully', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockRejectedValue(new Error('Mongo connection lost'));

    const result = await checkAndGenerateUpcomingWeek('swimmer123', sunday);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('DB query failed');
  });

  test('handles generation error gracefully', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockGenerate.mockRejectedValue(new Error('OpenRouter rate limited'));

    const result = await checkAndGenerateUpcomingWeek('swimmer123', sunday);
    expect(result.error).toBe('OpenRouter rate limited');
  });

  test('different swimmers are independently guarded', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    mockFindById.mockResolvedValue(null);

    const r1 = await checkAndGenerateUpcomingWeek('swimmerA', sunday);
    const r2 = await checkAndGenerateUpcomingWeek('swimmerB', sunday);

    // Both should proceed past the guard (different swimmer IDs)
    expect(r1.skipped).toBe(true);
    expect(r1.reason).toBe('Profile not found');
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('Profile not found');
    expect(mockFindById).toHaveBeenCalledTimes(2);
  });

  test('checks the upcoming week, not the current week (count query targets next week)', async () => {
    // Wednesday Jan 8, 2025 — current week is Jan 6-12, target is Jan 13-19
    const wednesday = new Date(2025, 0, 8, 10, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    mockGenerate.mockResolvedValue({
      programId: 'prog_next',
      programPeriod: 'weekly',
      totalSessions: 3,
      generatedCount: 3,
      workouts: [],
    });

    await checkAndGenerateUpcomingWeek('swimmer123', wednesday);

    // countWorkoutsInWeek should have been called with the TARGET week's date range
    // (Jan 13-19), not the current week (Jan 6-12)
    // The mock (Workout.countDocuments) receives the query filter — check the $gte date
    const callArgs = mockCountDocuments.mock.calls[0];
    const filter = callArgs[0];
    expect(filter.date.$gte.toLocaleDateString('en-CA')).toBe('2025-01-13'); // Next Monday, not Jan 6
  });
});

describe('countWorkoutsInWeek', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries Workout.countDocuments with correct date range', async () => {
    mockCountDocuments.mockResolvedValue(3);
    const weekStart = new Date(2025, 0, 13);
    const weekEnd = new Date(2025, 0, 19, 23, 59, 59, 999);

    const count = await countWorkoutsInWeek('swimmer123', weekStart, weekEnd);
    expect(count).toBe(3);
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        swimmerId: 'swimmer123',
        date: expect.any(Object),
      })
    );
  });

  test('returns -1 on DB error', async () => {
    mockCountDocuments.mockRejectedValue(new Error('DB error'));
    const count = await countWorkoutsInWeek('swimmer123', new Date(), new Date());
    expect(count).toBe(-1);
  });
});

describe('getExistingWorkoutDates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { date: new Date(2025, 0, 13) },
      { date: new Date(2025, 0, 15) },
    ]) }) });
  });

  test('returns dates of existing workouts in the week', async () => {
    const weekStart = new Date(2025, 0, 13);
    const weekEnd = new Date(2025, 0, 19, 23, 59, 59, 999);
    const dates = await getExistingWorkoutDates('swimmer123', weekStart, weekEnd);
    expect(dates).toHaveLength(2);
    expect(dates[0]).toBeInstanceOf(Date);
    expect(dates[1]).toBeInstanceOf(Date);
  });

  test('returns empty array on DB error', async () => {
    mockFind.mockReturnValue({ select: () => ({ lean: () => Promise.reject(new Error('DB error')) }) });
    const dates = await getExistingWorkoutDates('swimmer123', new Date(), new Date());
    expect(dates).toEqual([]);
  });
});

describe('clearCache', () => {
  test('clears the in-memory cache', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    mockFindById.mockResolvedValue(null);

    await checkAndGenerateUpcomingWeek('swimmerA', sunday);
    expect(lastCheckCache.size).toBeGreaterThan(0);

    clearCache();
    expect(lastCheckCache.size).toBe(0);
  });
});
