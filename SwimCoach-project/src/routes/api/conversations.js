const express = require('express');
const router = express.Router();
const Conversation = require('../../models/Conversation');
const { resolveSwimmerId, requireOwnership } = require('../../middleware/auth');

// GET /api/conversations — List all conversations for the authenticated swimmer
// Query: ?includeMessages=true returns full message arrays (for sidebar, omit for lightweight)
router.get('/', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const projection = req.query.includeMessages
      ? 'title messages updatedAt contextWorkoutId'
      : 'title updatedAt contextWorkoutId';
    const conversations = await Conversation.find({ swimmerId })
      .sort({ updatedAt: -1 })
      .select(projection)
      .lean();
    res.json({ success: true, count: conversations.length, data: conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/conversations/workout/:workoutId — Find the conversation tied to a workout
// Used when opening a workout page to restore its chat history.
router.get('/workout/:workoutId', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const conversation = await Conversation.findOne({
      swimmerId,
      contextWorkoutId: req.params.workoutId,
    }).lean();
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'No conversation for this workout' });
    }
    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/conversations/:id — Get a single conversation with full messages
router.get('/:id', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== swimmerId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/conversations — Create a new conversation
router.post('/', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const { title, contextWorkoutId } = req.body;
    const conversation = new Conversation({
      swimmerId,
      title: title || 'New Conversation',
      messages: [],
      contextWorkoutId: contextWorkoutId || null,
    });
    await conversation.save();
    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/conversations/:id/messages — Append messages to a conversation (batch)
// Body: { messages: Array<{ role: 'user'|'coach', text: string }> }
// Used by both per-workout and global coach chat to persist conversation history.
router.put('/:id/messages', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== swimmerId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array required' });
    }
    for (const m of messages) {
      if (m.role && m.text) conversation.messages.push({ role: m.role, text: m.text });
    }
    await conversation.save();
    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/conversations/:id/title — Rename a conversation
// Body: { title: string }
router.put('/:id/title', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== swimmerId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    conversation.title = req.body.title || conversation.title;
    await conversation.save();
    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/conversations/:id — Delete a conversation
router.delete('/:id', async (req, res) => {
  try {
    const swimmerId = resolveSwimmerId(req);
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required' });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== swimmerId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await Conversation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
