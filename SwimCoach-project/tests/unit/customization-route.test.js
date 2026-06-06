/**
 * Unit tests for src/routes/api/customization.js
 *
 * Tests the GET /api/workouts/options endpoint that returns static
 * customization configuration. No database required.
 */

const router = require('../../src/routes/api/customization');

// ─── Helpers ─────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return { query: {}, ...overrides };
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('GET /api/workouts/customize/options', () => {
  const handler = findHandler('get', '/options');

  test('returns 200 with success flag', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  test('returns workoutTypes array with correct structure', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.workoutTypes).toBeDefined();
    expect(Array.isArray(body.data.workoutTypes)).toBe(true);
    expect(body.data.workoutTypes).toHaveLength(6);

    body.data.workoutTypes.forEach((t) => {
      expect(t).toHaveProperty('value');
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('description');
    });
  });

  test('includes all expected workout types', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const types = res.json.mock.calls[0][0].data.workoutTypes.map(
      (t) => t.value,
    );
    expect(types).toEqual([
      'lactate',
      'resistance-power',
      'speed',
      'technique',
      'endurance',
      'recovery',
    ]);
  });

  test('returns poolLengths with 2 options', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.poolLengths).toHaveLength(2);
    expect(data.poolLengths.map((p) => p.value)).toEqual([25, 50]);
  });

  test('returns poolEquipment with 6 options', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.poolEquipment).toHaveLength(6);
    const values = data.poolEquipment.map((e) => e.value);
    expect(values).toContain('fins');
    expect(values).toContain('paddles');
    expect(values).toContain('pullBuoy');
    expect(values).toContain('snorkel');
    expect(values).toContain('parachute');
    expect(values).toContain('resistanceBands');
  });

  test('returns gymEquipment with 6 options', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.gymEquipment).toHaveLength(6);
    const values = data.gymEquipment.map((e) => e.value);
    expect(values).toContain('weights');
    expect(values).toContain('resistanceMachine');
    expect(values).toContain('pullUpBar');
    expect(values).toContain('plyometricBox');
    expect(values).toContain('medicineBall');
    expect(values).toContain('yogaMat');
  });

  test('returns intensities with 4 levels', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.intensities).toHaveLength(4);
    const values = data.intensities.map((i) => i.value);
    expect(values).toEqual(['low', 'moderate', 'high', 'maximal']);
  });

  test('returns programPeriods with 3 options', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.programPeriods).toHaveLength(3);
    const values = data.programPeriods.map((p) => p.value);
    expect(values).toEqual(['single', 'weekly', 'monthly']);
  });

  test('each intensity has a descriptive label', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const intensities = res.json.mock.calls[0][0].data.intensities;
    intensities.forEach((i) => {
      expect(i.label.length).toBeGreaterThan(3);
      expect(i.label).toContain('—'); // Has description separator
    });
  });

  test('workout type labels are human-readable', async () => {
    const req = mockReq();
    const res = mockRes();

    await handler(req, res);

    const types = res.json.mock.calls[0][0].data.workoutTypes;
    const labels = types.map((t) => t.label);
    expect(labels).toContain('Lactate Threshold');
    expect(labels).toContain('Resistance / Power');
    expect(labels).toContain('Speed');
    expect(labels).toContain('Technique');
    expect(labels).toContain('Endurance');
    expect(labels).toContain('Recovery');
  });
});
