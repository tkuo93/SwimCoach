const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const { buildInsightsPrompt, buildWorkoutPrompt } = require('../../services/workout-ai');
const { getFeedbackSummary } = require('../../services/memory');

// All debug endpoints require authentication (already applied in index.js)

// GET /api/debug/profiles — List current user's profiles
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await SwimmerProfile.find({ googleId: req.user.googleId }).sort({ createdAt: -1 });
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

// GET /api/debug/prompts — Preview prompts for current user + customization
router.get('/prompts', async (req, res) => {
  try {
    const { workoutType, duration, llmModel } = req.query;

    const profile = await SwimmerProfile.findById(req.user._id);
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