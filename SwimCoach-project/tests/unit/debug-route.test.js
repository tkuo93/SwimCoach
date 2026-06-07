/**
 * Unit tests for src/routes/api/debug.js
 *
 * Tests the debug endpoints: GET /api/debug/profiles, GET /api/debug/prompts
 * Mocks SwimmerProfile to avoid database dependency.
 */

// ─── Mock SwimmerProfile ──────────────────────────────────────────────

const mockFind = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../src/models/SwimmerProfile', () => {
  const mockModel = jest.fn();
  mockModel.find = mockFind;
  mockModel.findById = mockFindById;
  return mockModel;
});

// Import route handlers after mock is set up
const router = require('../../src/routes/api/debug');
const SwimmerProfile = require('../../src/models/SwimmerProfile');

// ─── Helpers ─────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return { query: {}, params: {}, ...overrides };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function findHandler(method, pathPattern) {
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.methods[method.toLowerCase()] &&
      l.route.path === pathPattern,
  );
  if (!layer) throw new Error(`No ${method} ${pathPattern} route found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeFakeId() {
  return '507f1f77bcf86cd7994390' + Math.random().toString(16).slice(2, 5);
}

function makeProfile(overrides = {}) {
  const id = makeFakeId();
  return {
    _id: id,
    firstName: 'Test',
    lastName: 'Swimmer',
    email: `test-${id}@example.com`,
    dateOfBirth: new Date('1990-01-01'),
    gender: 'male',
    goals: {
      primaryEvents: [{ stroke: 'freestyle', distance: 100 }],
      outcomes: [],
      trainingFocus: ['endurance'],
    },
    trainingSchedule: {
      weeklyPoolSessions: 3,
      weeklyGymSessions: 2,
      sessionDuration: 60,
    },
    equipment: {
      poolLength: { value: 25, unit: 'meters' },
      poolEquipment: {},
      gymEquipment: {},
    },
    bestTimes: [],
    experienceLevel: 'intermediate',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('GET /api/debug/profiles', () => {
  const handler = findHandler('get', '/profiles');

  test('returns success with profiles array', async () => {
    mockFind.mockReturnValue({
      sort: jest.fn().mockResolvedValue([makeProfile(), makeProfile()]),
    });

    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const body = res.json.mock.calls[0][0];
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  test('returns empty array when no profiles', async () => {
    mockFind.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });
});

describe('GET /api/debug/prompts', () => {
  const handler = findHandler('get', '/prompts');

  test('returns 400 if swimmerId is missing', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test('returns 404 if profile not found', async () => {
    mockFindById.mockResolvedValue(null);

    const req = mockReq({ query: { swimmerId: makeFakeId() } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns prompts with valid swimmerId', async () => {
    const profile = makeProfile();
    mockFindById.mockResolvedValue(profile);

    const req = mockReq({
      query: {
        swimmerId: profile._id,
        workoutType: 'endurance',
        duration: '60',
      },
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const body = res.json.mock.calls[0][0];
    expect(body.data.insightsPrompt).toBeDefined();
    expect(body.data.generationPrompt).toBeDefined();
    expect(body.data.insightsPrompt).toContain('endurance');
    expect(body.data.generationPrompt).toContain('freestyle');
    expect(body.data.profile.name).toBe('Test Swimmer');
  });

  test('includes llmModel in response when provided', async () => {
    const profile = makeProfile();
    mockFindById.mockResolvedValue(profile);

    const req = mockReq({
      query: {
        swimmerId: profile._id,
        workoutType: 'speed',
        duration: '45',
        llmModel: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
      },
    });
    const res = mockRes();

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.modelUsed).toContain('nemotron');
  });

  test('uses default values for optional params', async () => {
    const profile = makeProfile();
    mockFindById.mockResolvedValue(profile);

    const req = mockReq({
      query: { swimmerId: profile._id },
    });
    const res = mockRes();

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.insightsPrompt).toContain('endurance'); // default workoutType
    expect(body.data.generationPrompt).toContain('60'); // default duration
  });
});
