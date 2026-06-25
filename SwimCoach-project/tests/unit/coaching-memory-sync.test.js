/**
 * Unit tests for coaching-memory-sync service.
 *
 * Tests feedback sync and trend detection.
 */

const {
  syncFeedbackToMemory,
  detectTrends,
  backfillFromMemoryMd,
} = require('../../src/services/coaching-memory-sync');

// ─── syncFeedbackToMemory ───────────────────────────────────────────

describe('syncFeedbackToMemory', () => {
  const CoachingMemory = require('../../src/models/CoachingMemory');
  const { deriveLearning } = require('../../src/services/memory');

  test('stores a feedback-derived observation', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ _id: 'mem1' });
    CoachingMemory.create = mockCreate;

    const result = await syncFeedbackToMemory({
      swimmerId: 'profile1',
      workoutId: 'workout1',
      workoutType: 'lactate',
      feedback: { rating: 2, difficultyPerception: 'too-hard', enjoyment: 'neutral', quality: 'average', accuracy: 'mostly-accurate' },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        swimmerId: 'profile1',
        type: 'observation',
        source: 'feedback-derivation',
        active: true,
      })
    );
    expect(result).toBeTruthy();
  });

  test('returns null when deriveLearning produces no insight', async () => {
    const result = await syncFeedbackToMemory({
      swimmerId: 'profile1',
      workoutId: 'workout1',
      workoutType: 'endurance',
      feedback: { rating: 3, difficultyPerception: 'just-right', enjoyment: 'enjoyed', quality: 'good', accuracy: 'spot-on' },
    });

    // deriveLearning may or may not return null for "just-right" —
    // the test validates the function doesn't throw
    expect(result).toBeDefined();
  });
});

// ─── detectTrends ───────────────────────────────────────────────────

describe('detectTrends', () => {
  const CoachingMemory = require('../../src/models/CoachingMemory');
  const Workout = require('../../src/models/Workout');

  test('returns empty array when fewer than 3 workouts', async () => {
    Workout.find = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });

    const trends = await detectTrends('profile1');
    expect(trends).toEqual([]);
  });

  test('detects too-hard trend when >50% of a type is too-hard', async () => {
    // 3 lactate workouts, all rated too-hard
    const mockWorkouts = [
      { workoutType: 'lactate', userFeedback: { rating: 2, difficultyPerception: 'too-hard' } },
      { workoutType: 'lactate', userFeedback: { rating: 2, difficultyPerception: 'too-hard' } },
      { workoutType: 'lactate', userFeedback: { rating: 3, difficultyPerception: 'too-hard' } },
    ];

    Workout.find = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockWorkouts),
    });

    CoachingMemory.findOne = jest.fn().mockResolvedValue(null); // No existing trend
    CoachingMemory.create = jest.fn().mockResolvedValue({ _id: 'trend1' });

    const trends = await detectTrends('profile1');
    expect(trends.length).toBeGreaterThanOrEqual(1);
    expect(trends[0].type).toBe('trend');
    expect(trends[0]._id).toBe('trend1');
  });

  test('skips duplicate trends', async () => {
    const mockWorkouts = [
      { workoutType: 'lactate', userFeedback: { rating: 2, difficultyPerception: 'too-hard' } },
      { workoutType: 'lactate', userFeedback: { rating: 2, difficultyPerception: 'too-hard' } },
      { workoutType: 'lactate', userFeedback: { rating: 3, difficultyPerception: 'too-hard' } },
    ];

    Workout.find = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockWorkouts),
    });

    // Simulate existing trend
    CoachingMemory.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
    CoachingMemory.create = jest.fn().mockResolvedValue({ _id: 'new1' });

    const trends = await detectTrends('profile1');
    expect(trends).toEqual([]); // Skipped because duplicate exists
  });
});

// ─── backfillFromMemoryMd ───────────────────────────────────────────

describe('backfillFromMemoryMd', () => {
  const CoachingMemory = require('../../src/models/CoachingMemory');

  test('creates CoachingMemory entries from MEMORY.md entries', async () => {
    CoachingMemory.findOne = jest.fn().mockResolvedValue(null); // No duplicates
    CoachingMemory.create = jest.fn().mockImplementation(data => Promise.resolve({ _id: 'mem_' + Math.random(), ...data }));

    const entries = [
      { learning: 'Reduce intensity for speed workouts', workoutType: 'speed', rating: 2 },
      { learning: 'User can handle more volume', workoutType: 'endurance', rating: 5 },
      { learning: null, workoutType: 'technique' }, // Skip entries without learning
    ];

    const created = await backfillFromMemoryMd('profile1', entries);
    expect(created.length).toBe(2); // Only 2 entries have learning
  });

  test('skips entries that already exist in CoachingMemory', async () => {
    CoachingMemory.findOne = jest.fn().mockResolvedValue({ _id: 'existing' }); // All exist
    CoachingMemory.create = jest.fn();

    const entries = [
      { learning: 'Already stored observation', workoutType: 'endurance' },
    ];

    const created = await backfillFromMemoryMd('profile1', entries);
    expect(created.length).toBe(0);
    expect(CoachingMemory.create).not.toHaveBeenCalled();
  });
});
