const express = require('express');
const router = express.Router();
const KnowledgeSource = require('../../models/KnowledgeSource');
const { query } = require('../../services/open-notebook');// GET /api/knowledge/sources
router.get('/sources', async (req, res) => {
  try {
    const { category, sourceType, audience, limit = 50 } = req.query;
    const filter = {};
    if (category) filter.swimmingCategories = category;
    if (sourceType) filter.sourceType = sourceType;
    if (audience) filter.targetAudience = audience;

    const sources = await KnowledgeSource.find(filter)
      .sort({ relevanceScore: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, count: sources.length, data: sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/knowledge/query
// Body: { question }
router.post('/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'question is required' });
    }

    const answer = await query(question);
    res.json({ success: true, data: { question, answer } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/knowledge/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await KnowledgeSource.distinct('swimmingCategories');
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
