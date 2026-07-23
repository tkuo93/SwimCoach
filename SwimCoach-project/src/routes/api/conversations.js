const express = require('express');
const router = express.Router();
const Conversation = require('../../models/Conversation');

// GET /api/conversations — List all conversations for the authenticated swimmer
// Query: ?includeMessages=true returns full message arrays (for sidebar, omit for lightweight)
router.get('/', async (req, res) => {
  try {
    const projection = req.query.includeMessages
      ? 'title messages updatedAt contextWorkoutId'
      : 'title updatedAt contextWorkoutId';
    const conversations = await Conversation.find({ swimmerId: req.user._id })
      .sort({ updatedAt: -1 })
      .select(projection)
      .lean();

    // Filter out any conversations with invalid _id (e.g., UUID strings from old bug)
    // Valid ObjectId is 24 hex chars
    const validConversations = conversations.filter(c =>
      c._id && typeof c._id === 'object' && c._id.toString().match(/^[0-9a-fA-F]{24}$/)
    );

    res.json({ success: true, count: validConversations.length, data: validConversations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/conversations/workout/:workoutId — Find the conversation tied to a workout
router.get('/workout/:workoutId', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      swimmerId: req.user._id,
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
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== req.user._id.toString()) {
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
    const { title, contextWorkoutId } = req.body;
    const conversation = new Conversation({
      swimmerId: req.user._id,
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
router.put('/:id/messages', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== req.user._id.toString()) {
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
router.put('/:id/title', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== req.user._id.toString()) {
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
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (conversation.swimmerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await Conversation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;