const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const Workout = require('../../models/Workout');
const { chat: coachChat } = require('../../services/coach/coach-agent');
const { regenerateWorkout } = require('../../services/workout-generator');
const { resolveSwimmerId, requireOwnership } = require('../../middleware/auth');

// In-memory store for pending proposals (conversationId -> action[])
const pendingProposals = new Map();

// POST /api/coach/chat
// Body: { swimmerId, messages: Array<{role, text}>, message: string, llmModel? }
router.post('/chat', async (req, res) => {
  try {
    const { message, messages = [], llmModel } = req.body;
    const swimmerId = resolveSwimmerId(req);

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required. Provide X-Swimmer-Id header.' });
    }

    const profile = await SwimmerProfile.findById(swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const result = await coachChat({
      profile,
      workout: null,
      messages,
      userMessage: message,
      mode: 'general',
      modelOverride: llmModel,
    });

    // Generate a conversation ID for tracking proposals
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store any proposal actions for later confirmation
    const proposals = result.actions.filter(a => a.proposal);
    if (proposals.length > 0) {
      pendingProposals.set(conversationId, proposals);
      // Auto-clean up old proposals after 10 minutes
      setTimeout(() => pendingProposals.delete(conversationId), 10 * 60 * 1000);
    }

    res.json({
      success: true,
      data: {
        reply: result.reply,
        actions: result.actions,
        conversationId,
      },
    });
  } catch (err) {
    console.error('Coach chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/coach/chat/:conversationId/confirm
// Body: { actionIndex: number }
// Confirms and applies a proposed action from the agent
router.post('/chat/:conversationId/confirm', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { actionIndex = 0 } = req.body;
    const swimmerId = resolveSwimmerId(req);

    if (!swimmerId) {
      return res.status(401).json({ success: false, error: 'Swimmer ID required.' });
    }

    const proposals = pendingProposals.get(conversationId);
    if (!proposals || !proposals[actionIndex]) {
      return res.status(404).json({ success: false, error: 'Proposal not found or expired. Ask the coach again.' });
    }

    const proposal = proposals[actionIndex];

    if (proposal.action === 'modifyWorkout') {
      // Apply the field modification to the workout
      const workout = await Workout.findById(proposal.workoutId);
      if (!workout) {
        return res.status(404).json({ success: false, error: 'Workout not found.' });
      }

      const err = requireOwnership(req, res, swimmerId, workout.swimmerId);
      if (err) return err;

      // Parse the field path and set the new value
      const { field, newValue } = proposal;
      const update = {};
      update[field] = parseValue(newValue);
      update.updatedAt = new Date();

      const updated = await Workout.findByIdAndUpdate(
        proposal.workoutId,
        { $set: update },
        { new: true, runValidators: true },
      );

      // Remove confirmed proposal
      proposals.splice(actionIndex, 1);
      if (proposals.length === 0) pendingProposals.delete(conversationId);

      return res.json({
        success: true,
        data: {
          applied: true,
          action: 'modifyWorkout',
          workout: updated,
        },
      });
    }

    if (proposal.action === 'regenerateWorkout') {
      const workout = await Workout.findById(proposal.workoutId);
      if (!workout) {
        return res.status(404).json({ success: false, error: 'Workout not found.' });
      }

      const err = requireOwnership(req, res, swimmerId, workout.swimmerId);
      if (err) return err;

      const profile = await SwimmerProfile.findById(swimmerId);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Swimmer profile not found.' });
      }

      const customization = {
        ...(workout.generationInfo?.generationParameters?.toObject?.() || {}),
        ...proposal.overrides,
      };

      const newWorkout = await regenerateWorkout(proposal.workoutId, profile, customization, { mode: 'direct' });

      // Remove confirmed proposal
      proposals.splice(actionIndex, 1);
      if (proposals.length === 0) pendingProposals.delete(conversationId);

      return res.json({
        success: true,
        data: {
          applied: true,
          action: 'regenerateWorkout',
          workout: newWorkout,
        },
      });
    }

    res.status(400).json({ success: false, error: `Unknown action type: ${proposal.action}` });
  } catch (err) {
    console.error('Coach confirm error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/coach/chat/:conversationId/dismiss
// Body: { actionIndex: number }
router.post('/chat/:conversationId/dismiss', (req, res) => {
  const { conversationId } = req.params;
  const { actionIndex = 0 } = req.body;

  const proposals = pendingProposals.get(conversationId);
  if (!proposals || !proposals[actionIndex]) {
    return res.status(404).json({ success: false, error: 'Proposal not found.' });
  }

  proposals.splice(actionIndex, 1);
  if (proposals.length === 0) pendingProposals.delete(conversationId);

  res.json({ success: true, dismissed: true });
});

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Parse a string value into the appropriate JS type for MongoDB updates.
 */
function parseValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  if (!isNaN(val) && val !== '') return Number(val);
  return val;
}

module.exports = router;
