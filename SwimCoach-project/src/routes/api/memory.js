const express = require('express');
const router = express.Router();
const CoachingMemory = require('../../models/CoachingMemory');
const { requireAuth } = require('../../middleware/auth');

// All memory endpoints require authentication (already applied in index.js)
// Admin-only endpoints can still check for a specific user or role

// GET /api/memory — Get user's coaching memories
router.get('/', async (req, res) => {
  try {
    const { type, category, active = 'true', limit = 50 } = req.query;
    const filter = { swimmerId: req.user._id };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (active !== 'all') filter.active = active === 'true';

    const memories = await CoachingMemory.find(filter)
      .sort({ confidence: -1, updatedAt: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, count: memories.length, data: memories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/memory — Add a coaching observation (user-initiated)
router.post('/', async (req, res) => {
  try {
    const { type, category, content, source = 'user', confidence = 0.8 } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const memory = new CoachingMemory({
      swimmerId: req.user._id,
      type,
      category,
      content,
      source,
      confidence,
      active: true,
    });
    await memory.save();
    res.status(201).json({ success: true, data: memory });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/memory/:id — Update a memory (e.g., mark inactive, update confidence)
router.put('/:id', async (req, res) => {
  try {
    const memory = await CoachingMemory.findOne({
      _id: req.params.id,
      swimmerId: req.user._id
    });
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    const { type, category, content, confidence, active, supersededBy } = req.body;
    if (type) memory.type = type;
    if (category) memory.category = category;
    if (content) memory.content = content;
    if (confidence !== undefined) memory.confidence = confidence;
    if (active !== undefined) memory.active = active;
    if (supersededBy) memory.supersededBy = supersededBy;

    await memory.save();
    res.json({ success: true, data: memory });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/memory/:id — Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    const memory = await CoachingMemory.findOneAndDelete({
      _id: req.params.id,
      swimmerId: req.user._id
    });
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }
    res.json({ success: true, message: 'Memory deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;