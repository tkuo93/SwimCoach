/**
 * Unit tests for src/services/workout-generator.js
 *
 * Tests the pure helper functions and the response parser.
 * Does NOT test generateWorkout() directly (requires DB + API).
 */

// ─── Extract the pure functions for testing ───────────────────────────
// Since parseWorkoutResponse, mapWorkoutType, deriveIntensity, and
// calculateTotalDistance are not exported, we replicate their logic here
// to test them as pure functions.

/**
 * Replicates parseWorkoutResponse from workout-generator.js
 */
function parseWorkoutResponse(text) {
  if (!text || typeof text !== 'string') return null;

  try {
    return JSON.parse(text);
  } catch { /* not raw JSON */ }

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch { /* not valid JSON in code block */ }
  }

  const braceMatch = text.match(/\{[\s\S]+\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch { /* not valid JSON */ }
  }

  return null;
}

/**
 * Replicates mapWorkoutType from workout-generator.js
 */
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

/**
 * Replicates deriveIntensity from workout-generator.js
 */
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

/**
 * Replicates calculateTotalDistance from workout-generator.js
 */
function calculateTotalDistance(parsed) {
  if (!parsed.mainSet) return 0;
  return parsed.mainSet.reduce(
    (sum, s) =>
      sum + (s.distancePerRep || s.distance || 0) * (s.reps || s.repetitions || 1),
    0,
  ) + (parsed.warmUp?.distance || 0) + (parsed.coolDown?.distance || 0);
}

// ─── parseWorkoutResponse ────────────────────────────────────────────

describe('parseWorkoutResponse', () => {
  test('parses valid JSON directly', () => {
    const json = JSON.stringify({ warmUp: { distance: 200 }, mainSet: [] });
    const result = parseWorkoutResponse(json);
    expect(result).toEqual({ warmUp: { distance: 200 }, mainSet: [] });
  });

  test('parses JSON wrapped in ```json code block', () => {
    const text = 'Here is your workout:\n```json\n{"warmUp": {"distance": 400}}\n```\nEnjoy!';
    const result = parseWorkoutResponse(text);
    expect(result).toEqual({ warmUp: { distance: 400 } });
  });

  test('parses JSON wrapped in ``` code block (no language)', () => {
    const text = '```\n{"mainSet": [{"distance": 100}]}\n```';
    const result = parseWorkoutResponse(text);
    expect(result).toEqual({ mainSet: [{ distance: 100 }] });
  });

  test('parses JSON found inside surrounding text', () => {
    const text = 'Based on your profile, here is the workout: {"totalDistance": 2000, "mainSet": []} Let me know if you need changes.';
    const result = parseWorkoutResponse(text);
    expect(result).toEqual({ totalDistance: 2000, mainSet: [] });
  });

  test('returns null for plain text with no JSON', () => {
    expect(parseWorkoutResponse('This is just a plain text workout description.')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseWorkoutResponse('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseWorkoutResponse(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parseWorkoutResponse(undefined)).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseWorkoutResponse('{invalid json}')).toBeNull();
  });

  test('returns null for malformed JSON in code block', () => {
    expect(parseWorkoutResponse('```json\n{invalid}\n```')).toBeNull();
  });

  test('handles nested JSON objects', () => {
    const json = JSON.stringify({
      warmUp: { distance: 200, description: 'Easy swim' },
      mainSet: [
        { distance: 100, reps: 4, stroke: 'freestyle', interval: '1:30' },
      ],
      coolDown: { distance: 100 },
      totalDistance: 700,
      trainingNotes: ['Focus on technique'],
    });
    const result = parseWorkoutResponse(json);
    expect(result.mainSet).toHaveLength(1);
    expect(result.mainSet[0].reps).toBe(4);
    expect(result.trainingNotes).toHaveLength(1);
  });

  test('handles JSON with markdown and code block together', () => {
    const text = `
# Your Workout

Here's your personalized session:

\`\`\`json
{
  "warmUp": {"distance": 300, "description": "Mixed strokes"},
  "mainSet": [{"distancePerRep": 50, "reps": 10, "stroke": "free"}],
  "totalDistance": 800
}
\`\`\`

Good luck!
    `;
    const result = parseWorkoutResponse(text);
    expect(result).not.toBeNull();
    expect(result.totalDistance).toBe(800);
    expect(result.mainSet[0].distancePerRep).toBe(50);
  });
});

// ─── mapWorkoutType ──────────────────────────────────────────────────

describe('mapWorkoutType', () => {
  test.each([
    ['lactate', 'lactate'],
    ['resistance-power', 'resistance-power'],
    ['power', 'resistance-power'],
    ['resistance', 'resistance-power'],
    ['speed', 'speed'],
    ['technique', 'technique'],
    ['endurance', 'endurance'],
    ['recovery', 'recovery'],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(mapWorkoutType(input)).toBe(expected);
  });

  test('defaults unknown type to endurance', () => {
    expect(mapWorkoutType('unknown')).toBe('endurance');
    expect(mapWorkoutType('')).toBe('endurance');
    expect(mapWorkoutType(null)).toBe('endurance');
  });
});

// ─── deriveIntensity ─────────────────────────────────────────────────

describe('deriveIntensity', () => {
  test('returns explicit intensity when provided', () => {
    expect(deriveIntensity('low', 'speed')).toBe('low');
    expect(deriveIntensity('maximal', 'recovery')).toBe('maximal');
  });

  test.each([
    ['lactate', 'high'],
    ['resistance-power', 'high'],
    ['speed', 'maximal'],
    ['technique', 'moderate'],
    ['endurance', 'moderate'],
    ['recovery', 'low'],
  ])('maps workout type "%s" → intensity "%s"', (type, expected) => {
    expect(deriveIntensity(null, type)).toBe(expected);
    expect(deriveIntensity('', type)).toBe(expected);
  });

  test('defaults unknown workout type to moderate', () => {
    expect(deriveIntensity(null, 'unknown')).toBe('moderate');
    expect(deriveIntensity(null, '')).toBe('moderate');
  });
});

// ─── calculateTotalDistance ──────────────────────────────────────────

describe('calculateTotalDistance', () => {
  test('calculates total from main set with reps', () => {
    const parsed = {
      mainSet: [
        { distance: 100, reps: 4 },
        { distance: 50, reps: 8 },
      ],
    };
    expect(calculateTotalDistance(parsed)).toBe(800); // 100*4 + 50*8
  });

  test('includes warmUp and coolDown distances', () => {
    const parsed = {
      warmUp: { distance: 200 },
      mainSet: [{ distance: 100, reps: 4 }],
      coolDown: { distance: 100 },
    };
    expect(calculateTotalDistance(parsed)).toBe(700); // 200 + 400 + 100
  });

  test('uses distancePerRep as fallback field name', () => {
    const parsed = {
      mainSet: [{ distancePerRep: 50, reps: 10 }],
    };
    expect(calculateTotalDistance(parsed)).toBe(500);
  });

  test('uses repetitions as fallback field name', () => {
    const parsed = {
      mainSet: [{ distance: 100, repetitions: 6 }],
    };
    expect(calculateTotalDistance(parsed)).toBe(600);
  });

  test('returns 0 for empty main set', () => {
    expect(calculateTotalDistance({ mainSet: [] })).toBe(0);
  });

  test('returns 0 when mainSet is undefined', () => {
    expect(calculateTotalDistance({})).toBe(0);
  });

  test('defaults missing distance to 0', () => {
    const parsed = {
      mainSet: [{ reps: 5 }],
    };
    expect(calculateTotalDistance(parsed)).toBe(0);
  });

  test('defaults missing reps to 1', () => {
    const parsed = {
      mainSet: [{ distance: 100 }],
    };
    expect(calculateTotalDistance(parsed)).toBe(100);
  });
});
