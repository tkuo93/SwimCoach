const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const { buildInsightsPrompt, buildWorkoutPrompt } = require('../../services/workout-ai');
const { getFeedbackSummary } = require('../../services/memory');
const { requireApiKey } = require('../../middleware/auth');

// All debug endpoints require API key auth
router.use(requireApiKey);

// GET /api/debug/profiles — List all profiles (for debug selector)
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await SwimmerProfile.find().sort({ createdAt: -1 });
    // Strip PII — only return what the debug UI needs
    const safe = profiles.map(p => ({
      _id: p._id,
      name: `${p.firstName} ${p.lastName}`,
      experienceLevel: p.experienceLevel,
    }));
    res.json({ success: true, count: safe.length, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/debug/prompts — Preview prompts for a given profile + customization
router.get('/prompts', async (req, res) => {
  try {
    const { swimmerId, workoutType, duration, llmModel } = req.query;

    if (!swimmerId) {
      return res.status(400).json({ success: false, error: 'swimmerId is required' });
    }

    const profile = await SwimmerProfile.findById(swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const customization = {
      workoutType: workoutType || 'endurance',
      duration: parseInt(duration, 10) || 60,
    };

    const insightsPrompt = buildInsightsPrompt(profile, customization);
    const feedbackSummary = getFeedbackSummary(10);
    const generationPrompt = buildWorkoutPrompt(profile, customization, '[Insights from OpenNotebook would appear here]', feedbackSummary);

    res.json({
      success: true,
      data: {
        insightsPrompt,
        generationPrompt,
        feedbackSummary: feedbackSummary || 'No past feedback',
        modelUsed: llmModel || process.env.OPEN_ROUTER_MODEL || 'openrouter/owl-alpha (default)',
        // Minimal profile summary — no PII like email, DOB, etc.
        profile: {
          name: `${profile.firstName} ${profile.lastName}`,
          level: profile.experienceLevel,
          events: profile.goals?.primaryEvents,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
