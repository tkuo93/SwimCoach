/**
 * Unit tests for updated SwimmerProfile model validation.
 * Tests new fields: outcomes, poolDays, gymDays, bestTimes.poolLength,
 * updated distance enum, poolLength string enum.
 *
 * Uses mongoose schema validation directly — no database required.
 */

const mongoose = require('mongoose');
const SwimmerProfile = require('../../src/models/SwimmerProfile');

describe('SwimmerProfile schema — new fields validation', () => {
  let counter = 0;

  function makeEmail() {
    counter++;
    return `test-${counter}-${Date.now()}@example.com`;
  }

  const baseProfile = {
    firstName: 'Jane',
    lastName: 'Smith',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'female',
  };

  test('accepts valid outcomes array', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [{ stroke: 'freestyle', distance: 100 }],
        outcomes: ['drop-time', 'build-muscle', 'technique'],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('rejects invalid outcome value', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [{ stroke: 'freestyle', distance: 100 }],
        outcomes: ['invalid-value'],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['goals.outcomes.0']).toBeDefined();
  });

  test('accepts poolDays and gymDays arrays', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      trainingSchedule: {
        weeklyPoolSessions: 3,
        poolDays: ['monday', 'wednesday', 'friday'],
        gymDays: ['tuesday', 'thursday'],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('rejects invalid day value in poolDays', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      trainingSchedule: {
        poolDays: ['notaday'],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('accepts new distance values 500 and 1650', () => {
    const doc500 = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [{ stroke: 'freestyle', distance: 500 }],
      },
    });
    expect(doc500.validateSync()).toBeUndefined();

    const doc1650 = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [{ stroke: 'freestyle', distance: 1650 }],
      },
    });
    expect(doc1650.validateSync()).toBeUndefined();
  });

  test('rejects old distance values not in enum', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [{ stroke: 'freestyle', distance: 300 }],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('accepts poolLength object with value and unit', () => {
    const validPoolLengths = [
      { value: 25, unit: 'meters' },
      { value: 50, unit: 'meters' },
      { value: 25, unit: 'yards' },
    ];

    for (const pl of validPoolLengths) {
      const doc = new SwimmerProfile({
        ...baseProfile,
        email: makeEmail(),
        equipment: { poolLength: pl },
      });
      const err = doc.validateSync();
      expect(err).toBeUndefined();
    }
  });

  test('rejects invalid poolLength unit', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      equipment: { poolLength: { value: 25, unit: 'feet' } },
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('accepts bestTimes with poolLength field', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      bestTimes: [{
        stroke: 'freestyle',
        distance: 100,
        poolLength: 'scm',
        time: '01:30.25',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('rejects bestTimes without poolLength', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      bestTimes: [{
        stroke: 'freestyle',
        distance: 100,
        time: '01:30.25',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('accepts multiple primary events', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      goals: {
        primaryEvents: [
          { stroke: 'freestyle', distance: 100 },
          { stroke: 'butterfly', distance: 50 },
          { stroke: 'backstroke', distance: 200 },
        ],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('accepts bands and sliders in gymEquipment', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      equipment: {
        gymEquipment: {
          bands: true,
          sliders: true,
          barbell: true,
        },
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('default poolLength is { value: 25, unit: meters }', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
    });
    expect(doc.equipment.poolLength.value).toBe(25);
    expect(doc.equipment.poolLength.unit).toBe('meters');
  });

  test('default outcomes is empty array', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
    });
    expect(doc.goals.outcomes).toEqual([]);
  });

  test('accepts competitionDates array with multiple ranges', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      trainingSchedule: {
        competitionDates: [
          { start: new Date('2026-07-15'), end: new Date('2026-07-17'), label: 'Summer Invitational' },
          { start: new Date('2026-09-20'), end: new Date('2026-09-22'), label: 'Fall Championships' },
        ],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  test('competitionDates requires start and end', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      trainingSchedule: {
        competitionDates: [
          { start: new Date('2026-07-15'), label: 'Missing end date' },
        ],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test('competitionDates label is optional', () => {
    const doc = new SwimmerProfile({
      ...baseProfile,
      email: makeEmail(),
      trainingSchedule: {
        competitionDates: [
          { start: new Date('2026-07-15'), end: new Date('2026-07-17') },
        ],
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
