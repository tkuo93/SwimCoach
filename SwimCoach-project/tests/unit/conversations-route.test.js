/**
 * Unit tests for src/routes/api/conversations.js
 *
 * Tests the conversation list endpoint, specifically the _id validation filter.
 */

const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockFindByIdAndDelete = jest.fn();

// Mock the Conversation model before requiring the router
jest.mock('../../src/models/Conversation', () => {
  const mockModel = jest.fn();
  mockModel.find = mockFind;
  mockModel.findById = mockFindById;
  mockModel.findOne = mockFindOne;
  mockModel.create = mockCreate;
  mockModel.findByIdAndDelete = mockFindByIdAndDelete;
  return mockModel;
});

// Import route handlers after mock is set up
const router = require('../../src/routes/api/conversations');
const Conversation = require('../../src/models/Conversation');

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
      l.route.path === pathPattern &&
      Object.keys(l.route.methods)[0] === method
  );
  if (!layer) throw new Error(`Handler not found: ${method} ${pathPattern}`);
  return layer.route.stack[0].handle;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('GET /api/conversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns conversations with string _id from .lean()', async () => {
    const stringIdDocs = [
      { _id: '6ac0416357e4eadca90c4b1c', title: 'Chat 1', messages: [], updatedAt: new Date() },
      { _id: '6ac0416357e4eadca90c4b1d', title: 'Chat 2', messages: [], updatedAt: new Date() },
    ];

    const queryChain = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(stringIdDocs),
    };
    mockFind.mockReturnValue(queryChain);

    const req = mockReq({ query: { includeMessages: 'true' }, user: { _id: 'user123' } });
    const res = mockRes();

    const handler = findHandler('get', '/');
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    expect(body.data.length).toBe(2);
    expect(body.data[0].title).toBe('Chat 1');
  });

  test('returns conversations with ObjectId _id from .lean()', async () => {
    const mongoose = require('mongoose');
    const objectIdDocs = [
      { _id: new mongoose.Types.ObjectId('6ac0416357e4eadca90c4b1c'), title: 'Chat 1', messages: [], updatedAt: new Date() },
    ];

    const queryChain = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(objectIdDocs),
    };
    mockFind.mockReturnValue(queryChain);

    const req = mockReq({ query: { includeMessages: 'true' }, user: { _id: 'user123' } });
    const res = mockRes();

    const handler = findHandler('get', '/');
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.data.length).toBe(1);
  });

  test('filters out conversations with invalid _id (UUID)', async () => {
    const mixedDocs = [
      { _id: '6ac0416357e4eadca90c4b1c', title: 'Valid', updatedAt: new Date() },
      { _id: '550e8400-e29b-41d4-a716-446655440000', title: 'Old UUID bug', updatedAt: new Date() },
    ];

    const queryChain = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mixedDocs),
    };
    mockFind.mockReturnValue(queryChain);

    const req = mockReq({ query: {}, user: { _id: 'user123' } });
    const res = mockRes();

    const handler = findHandler('get', '/');
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.count).toBe(1);
    expect(body.data[0].title).toBe('Valid');
  });

  test('returns empty list when no conversations exist', async () => {
    const queryChain = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(queryChain);

    const req = mockReq({ query: {}, user: { _id: 'user123' } });
    const res = mockRes();

    const handler = findHandler('get', '/');
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.count).toBe(0);
    expect(body.data).toEqual([]);
  });
});
