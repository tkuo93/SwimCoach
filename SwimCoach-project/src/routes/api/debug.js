const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const { buildInsightsPrompt, buildWorkoutPrompt } = require('../../services/workout-ai');
const { getFeedbackSummary } = require('../../services/memory');

// GET /api/debug/profiles — List all profiles (for debug selector)
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await SwimmerProfile.find().sort({ createdAt: -1 });
    res.json({ success: true, count: profiles.length, data: profiles });
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

    // Use the same prompt builders as the actual generation pipeline
    const insightsPrompt = buildInsightsPrompt(profile, customization);
    const feedbackSummary = getFeedbackSummary(10);
    const generationPrompt = buildWorkoutPrompt(profile, customization, '[Insights from OpenNotebook would appear here]', feedbackSummary);

    res.json({
      success: true,
      data: {
        insightsPrompt,
        generationPrompt,
        feedbackSummary: feedbackSummary || 'No past feedback',
        modelUsed: llmModel || process.env.OPENROUTER_MODEL || 'openrouter/owl-alpha (default)',
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
