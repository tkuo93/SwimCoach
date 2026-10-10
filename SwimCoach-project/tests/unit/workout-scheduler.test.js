/**
 * Unit tests for src/services/workout-scheduler.js
 *
 * Tests the date-checking logic, caching guard, and integration with
 * the program generator. Mocks the DB models and program-generator.
 */

// ─── Mock dependencies ─────────────────────────────────────────────────

const mockCountDocuments = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../src/models/Workout', () => {
  const Workout = jest.fn();
  Workout.countDocuments = mockCountDocuments;
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
  isDayBeforeNewWeek,
  getWeekRange,
  getISOWeekKey,
  checkAndGenerateUpcomingWeek,
  clearCache,
  lastCheckCache,
} = require('../../src/services/workout-scheduler');

// ─── Tests ──────────────────────────────────────────────────────────────

describe('isDayBeforeNewWeek', () => {
  test('returns true on Sunday', () => {
    const sunday = new Date(2025, 0, 5, 14, 30, 0);
    expect(isDayBeforeNewWeek(sunday)).toBe(true);
  });

  test('returns false on Monday', () => {
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    expect(isDayBeforeNewWeek(monday)).toBe(false);
  });

  test('returns false on Saturday', () => {
    const saturday = new Date(2025, 0, 4, 9, 0, 0);
    expect(isDayBeforeNewWeek(saturday)).toBe(false);
  });
});

describe('getWeekRange', () => {
  test('on Sunday, returns the upcoming (next) week range', () => {
    // Sunday Jan 5, 2025
    const refDate = new Date(2025, 0, 5, 14, 0, 0);
    const { start, end } = getWeekRange(refDate);

    // Next Monday is Jan 6
    expect(start.getDay()).toBe(1); // Monday
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-06');
    // Next Sunday is Jan 12
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-12');
  });

  test('on Wednesday, returns the current week range', () => {
    // Wednesday Jan 8, 2025 — current week started Monday Jan 6
    const refDate = new Date(2025, 0, 8, 10, 0, 0);
    const { start, end } = getWeekRange(refDate);

    // This week's Monday is Jan 6
    expect(start.getDay()).toBe(1);
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-06');
    // This week's Sunday is Jan 12
    expect(end.getDay()).toBe(0);
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-12');
  });

  test('on Monday, returns the current week (starting today)', () => {
    // Monday Jan 6, 2025
    const refDate = new Date(2025, 0, 6, 9, 0, 0);
    const { start, end } = getWeekRange(refDate);

    expect(start.getDay()).toBe(1);
    expect(start.toLocaleDateString('en-CA')).toBe('2025-01-06');
    expect(end.toLocaleDateString('en-CA')).toBe('2025-01-12');
  });

  test('start is at midnight, end is at end of Sunday', () => {
    const { start, end } = getWeekRange(new Date(2025, 0, 5, 23, 59, 59));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
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

  test('on Sunday with no workouts, generates with weekStartOffset=1', async () => {
    // Sunday Jan 5, 2025
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    const profile = { _id: 'swimmer123', goals: { trainingFocus: ['endurance'] }, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
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

    // Should use weekStartOffset=1 on Sunday (next week)
    expect(mockGenerate).toHaveBeenCalledWith(profile, {
      programPeriod: 'weekly',
      weekStartOffset: 1,
    });
  });

  test('on Monday with no workouts, generates with weekStartOffset=0', async () => {
    // Monday Jan 6, 2025
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    const profile = { _id: 'swimmer123', goals: { trainingFocus: ['endurance'] }, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockGenerate.mockResolvedValue({
      programId: 'prog_test456',
      programPeriod: 'weekly',
      totalSessions: 5,
      generatedCount: 5,
      workouts: [],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', monday);
    expect(result.generated).toBe(true);

    // Should use weekStartOffset=0 on Monday (current week)
    expect(mockGenerate).toHaveBeenCalledWith(profile, {
      programPeriod: 'weekly',
      weekStartOffset: 0,
    });
  });

  test('on Tuesday with no workouts, generates with weekStartOffset=0', async () => {
    // Tuesday Jan 7, 2025
    const tuesday = new Date(2025, 0, 7, 9, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(0);
    mockGenerate.mockResolvedValue({
      programId: 'prog_tue',
      programPeriod: 'weekly',
      totalSessions: 3,
      generatedCount: 3,
      workouts: [],
    });

    const result = await checkAndGenerateUpcomingWeek('swimmer123', tuesday);
    expect(result.generated).toBe(true);
    expect(mockGenerate).toHaveBeenCalledWith(profile, {
      programPeriod: 'weekly',
      weekStartOffset: 0,
    });
  });

  test('skips if already checked this week (ISO week guard)', async () => {
    // Monday Jan 6, 2025 (ISO week 2)
    const monday = new Date(2025, 0, 6, 9, 0, 0);
    mockFindById.mockResolvedValue(null);

    // First call — proceeds (but profile not found)
    const first = await checkAndGenerateUpcomingWeek('swimmer123', monday);
    expect(first.skipped).toBe(true);
    expect(first.reason).toBe('Profile not found');

    // Second call same ISO week (Tuesday Jan 7) — should be skipped by guard
    const tuesday = new Date(2025, 0, 7, 9, 0, 0);
    const second = await checkAndGenerateUpcomingWeek('swimmer123', tuesday);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('Already checked this week');
  });

  test('skips when workouts already exist for the week', async () => {
    const sunday = new Date(2025, 0, 5, 14, 0, 0);
    const profile = { _id: 'swimmer123', goals: {}, trainingSchedule: {} };
    mockFindById.mockResolvedValue(profile);
    mockCountDocuments.mockResolvedValue(3);

    const result = await checkAndGenerateUpcomingWeek('swimmer123', sunday);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Workouts already exist');
    expect(result.existingCount).toBe(3);
    expect(mockGenerate).not.toHaveBeenCalled();
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

  test('same swimmer on different weeks both trigger (not guarded)', async () => {
    const sunday1 = new Date(2025, 0, 5, 14, 0, 0); // Jan 5, 2025 — Week 1
    const sunday2 = new Date(2025, 0, 12, 14, 0, 0); // Jan 12, 2025 — Week 2
    mockFindById.mockResolvedValue(null);

    const r1 = await checkAndGenerateUpcomingWeek('swimmer123', sunday1);
    const r2 = await checkAndGenerateUpcomingWeek('swimmer123', sunday2);

    // Both should proceed past the guard (different ISO weeks)
    expect(r1.skipped).toBe(true);
    expect(r2.skipped).toBe(true);
    expect(mockFindById).toHaveBeenCalledTimes(2);
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
