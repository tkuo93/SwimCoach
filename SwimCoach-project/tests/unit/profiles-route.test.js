/**
 * Unit tests for src/routes/api/profiles.js
 *
 * Mocks the SwimmerProfile mongoose model to test route handlers in isolation.
 * No database required.
 */

// ─── Mock SwimmerProfile ──────────────────────────────────────────────

const mockSave = jest.fn();
const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFindByIdAndDelete = jest.fn();

jest.mock('../../src/models/SwimmerProfile', () => {
  const mockModel = jest.fn().mockImplementation((data) => ({
    ...data,
    save: mockSave,
  }));
  mockModel.find = mockFind;
  mockModel.findById = mockFindById;
  mockModel.findByIdAndUpdate = mockFindByIdAndUpdate;
  mockModel.findByIdAndDelete = mockFindByIdAndDelete;
  return mockModel;
});

// Import route handlers after mock is set up
const router = require('../../src/routes/api/profiles');

// ─── Helpers ─────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Find the handler for a given method + path pattern
function findHandler(method, pathPattern) {
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.methods[method.toLowerCase()] &&
      l.route.path === pathPattern,
  );
  if (!layer) throw new Error(`No ${method} ${pathPattern} route found`);
  // The last handler in the stack is the actual route handler
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// ─── Test data ───────────────────────────────────────────────────────

const validProfile = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  dateOfBirth: '1990-05-15',
  gender: 'female',
  experienceLevel: 'intermediate',
  goals: {
    primaryEvents: [{ stroke: 'freestyle', distance: 100 }],
    trainingFocus: ['sprint'],
  },
  trainingSchedule: {
    weeklyPoolSessions: 3,
    weeklyGymSessions: 2,
    sessionDuration: 60,
  },
  equipment: {
    poolLength: { value: 25, unit: 'meters' },
    poolEquipment: { fins: true, paddles: false },
    gymEquipment: { weights: true, yogaMat: true },
  },
};

const mockProfileDoc = {
  _id: '507f1f77bcf86cd799439011',
  ...validProfile,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/profiles', () => {
  const handler = findHandler('post', '/');

  test('creates a profile with valid data and returns 201', async () => {
    mockSave.mockResolvedValueOnce(undefined);

    const req = mockReq({ body: validProfile });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    // The handler sends the profile instance (new SwimmerProfile(req.body)),
    // not the resolved value of save(). So we expect the body data + save method.
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.firstName).toBe('Jane');
    expect(jsonArg.data.lastName).toBe('Smith');
    expect(jsonArg.data.email).toBe('jane@example.com');
    expect(jsonArg.data).toHaveProperty('save');
  });

  test('returns 400 on validation error', async () => {
    const validationError = {
      name: 'ValidationError',
      errors: {
        email: { message: 'Please provide a valid email address' },
        firstName: { message: 'Path `firstName` is required' },
      },
    };
    mockSave.mockRejectedValueOnce(validationError);

    const req = mockReq({ body: { email: 'bad' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errors: expect.arrayContaining([
          'Please provide a valid email address',
          'Path `firstName` is required',
        ]),
      }),
    );
  });

  test('returns 409 on duplicate email', async () => {
    const dupError = { code: 11000, message: 'duplicate key' };
    mockSave.mockRejectedValueOnce(dupError);

    const req = mockReq({ body: validProfile });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'A profile with this email already exists',
    });
  });

  test('returns 500 on unexpected error', async () => {
    mockSave.mockRejectedValueOnce(new Error('Something broke'));

    const req = mockReq({ body: validProfile });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Something broke',
    });
  });
});

describe('GET /api/profiles', () => {
  const handler = findHandler('get', '/');

  test('returns list of profiles', async () => {
    const profiles = [mockProfileDoc, { ...mockProfileDoc, _id: 'abc123' }];
    mockFind.mockReturnValueOnce({
      sort: jest.fn().mockResolvedValueOnce(profiles),
    });

    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      count: 2,
      data: profiles,
    });
  });

  test('returns 500 on error', async () => {
    mockFind.mockReturnValueOnce({
      sort: jest.fn().mockRejectedValueOnce(new Error('DB error')),
    });

    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('GET /api/profiles/:id', () => {
  const handler = findHandler('get', '/:id');

  test('returns a single profile', async () => {
    mockFindById.mockResolvedValueOnce(mockProfileDoc);

    const req = mockReq({ params: { id: '507f1f77bcf86cd799439011' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProfileDoc,
    });
  });

  test('returns 404 when profile not found', async () => {
    mockFindById.mockResolvedValueOnce(null);

    const req = mockReq({ params: { id: '507f1f77bcf86cd799439011' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Profile not found',
    });
  });

  test('returns 500 on error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('DB error'));

    const req = mockReq({ params: { id: 'bad-id' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('PUT /api/profiles/:id', () => {
  const handler = findHandler('put', '/:id');

  test('updates and returns profile', async () => {
    const updated = { ...mockProfileDoc, firstName: 'Janet' };
    mockFindByIdAndUpdate.mockResolvedValueOnce(updated);

    const req = mockReq({
      params: { id: '507f1f77bcf86cd799439011' },
      body: { firstName: 'Janet' },
    });
    const res = mockRes();

    await handler(req, res);

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { firstName: 'Janet' },
      { new: true, runValidators: true },
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: updated,
    });
  });

  test('returns 404 when profile not found', async () => {
    mockFindByIdAndUpdate.mockResolvedValueOnce(null);

    const req = mockReq({
      params: { id: '507f1f77bcf86cd799439011' },
      body: { firstName: 'Janet' },
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 on validation error', async () => {
    const validationError = {
      name: 'ValidationError',
      errors: { email: { message: 'Invalid email' } },
    };
    mockFindByIdAndUpdate.mockRejectedValueOnce(validationError);

    const req = mockReq({
      params: { id: '507f1f77bcf86cd799439011' },
      body: { email: 'bad' },
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /api/profiles/:id', () => {
  const handler = findHandler('delete', '/:id');

  test('deletes and returns profile', async () => {
    mockFindByIdAndDelete.mockResolvedValueOnce(mockProfileDoc);

    const req = mockReq({ params: { id: '507f1f77bcf86cd799439011' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProfileDoc,
    });
  });

  test('returns 404 when profile not found', async () => {
    mockFindByIdAndDelete.mockResolvedValueOnce(null);

    const req = mockReq({ params: { id: '507f1f77bcf86cd799439011' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 500 on error', async () => {
    mockFindByIdAndDelete.mockRejectedValueOnce(new Error('DB error'));

    const req = mockReq({ params: { id: 'bad-id' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
