const express = require('express');
const router = express.Router();
const path = require('path');
const { readMemory, getFeedbackSummary, appendFeedback } = require('../../services/memory');
const { requireApiKey, resolveSwimmerId, requireOwnership } = require('../../middleware/auth');

// All memory endpoints require API key auth
router.use(requireApiKey);

// Resolve MEMORY_PATH safely — hardcoded, not overridable via env
const MEMORY_PATH = path.join(__dirname, '..', '..', '..', 'MEMORY.md');

// GET /api/memory — Read full MEMORY.md (admin only)
router.get('/', (req, res) => {
  try {
    const content = readMemory();
    res.json({ success: true, data: { content } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/memory/summary — Get condensed feedback summary for prompts
router.get('/summary', (req, res) => {
  try {
    const maxEntries = parseInt(req.query.max, 10) || 10;
    const summary = getFeedbackSummary(maxEntries);
    res.json({ success: true, data: { summary, entryCount: maxEntries } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/memory — Append a feedback entry
// Restricted: only server-side feedback writes should use this.
// User-provided input is sanitized to prevent injection.
router.post('/', (req, res) => {
  try {
    const { profileName, workoutType, rating, difficultyPerception, enjoyment, comments, learning, swimmerId } = req.body;

    // If swimmerId is provided, verify ownership
    const requestingSwimmerId = resolveSwimmerId(req);
    if (swimmerId && requestingSwimmerId) {
      const err = requireOwnership(req, res, requestingSwimmerId, swimmerId);
      if (err) return err;
    }

    // Sanitize string inputs to prevent injection
    const sanitize = (s) => typeof s === 'string' ? s.replace(/[<>{}]/g, '').slice(0, 500) : '';

    appendFeedback({
      profileName: sanitize(profileName) || 'Unknown',
      workoutType: sanitize(workoutType),
      rating: rating ? parseInt(rating, 10) : null,
      difficultyPerception: sanitize(difficultyPerception),
      enjoyment: sanitize(enjoyment),
      comments: sanitize(comments),
      learning: sanitize(learning),
    });
    res.json({ success: true, data: { message: 'Entry appended to MEMORY.md' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
