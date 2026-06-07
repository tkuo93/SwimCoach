const express = require('express');
const router = express.Router();
const { readMemory, getFeedbackSummary, appendFeedback } = require('../../services/memory');

// GET /api/memory — Read full MEMORY.md
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

// POST /api/memory — Append a manual entry
router.post('/', (req, res) => {
  try {
    const { profileName, workoutType, rating, difficultyPerception, enjoyment, comments, learning } = req.body;
    appendFeedback({ profileName, workoutType, rating, difficultyPerception, enjoyment, comments, learning });
    res.json({ success: true, data: { message: 'Entry appended to MEMORY.md' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
