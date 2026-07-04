const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const Workout = require('../../models/Workout');
const Conversation = require('../../models/Conversation');
const { chat: coachChat } = require('../../services/coach/coach-agent');
const { regenerateWorkout } = require('../../services/workout-generator');

// POST /api/coach/chat
// Body: { messages: Array<{role, text}>, message: string, llmModel? }
router.post('/chat', async (req, res) => {
  try {
    const { message, messages = [], llmModel } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const profile = await SwimmerProfile.findById(req.user._id);
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

    // Store any proposal actions in Conversation DB for later confirmation
    const proposals = result.actions.filter(a => a.proposal);
    let conversationId = null;
    if (proposals.length > 0) {
      conversationId = crypto.randomUUID();
      await Conversation.create({
        _id: conversationId,
        swimmerId: req.user._id,
        title: 'Coach Proposals',
        messages: [],
        contextWorkoutId: null,
        proposals: proposals,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min TTL
      });
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

    const entry = await Conversation.findById(conversationId);
    if (!entry || !entry.proposals?.[actionIndex]) {
      return res.status(404).json({ success: false, error: 'Proposal not found or expired. Ask the coach again.' });
    }

    // Verify the requesting user owns this proposal
    if (entry.swimmerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    // Check TTL
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      await Conversation.findByIdAndDelete(conversationId);
      return res.status(404).json({ success: false, error: 'Proposal expired.' });
    }

    const proposal = entry.proposals[actionIndex];

    if (proposal.action === 'modifyWorkout') {
      const workout = await Workout.findById(proposal.workoutId);
      if (!workout) {
        return res.status(404).json({ success: false, error: 'Workout not found.' });
      }

      if (workout.swimmerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
      }

      const { field, newValue } = proposal;
      if (!isAllowedField(field)) {
        return res.status(400).json({ success: false, error: `Field "${field}" is not modifiable.` });
      }
      const update = {};
      update[field] = parseValue(newValue, field);
      update.updatedAt = new Date();

      const updated = await Workout.findByIdAndUpdate(
        proposal.workoutId,
        { $set: update },
        { new: true, runValidators: true },
      );

      // Remove confirmed proposal
      entry.proposals.splice(actionIndex, 1);
      if (entry.proposals.length === 0) {
        await Conversation.findByIdAndDelete(conversationId);
      } else {
        await entry.save();
      }

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

      if (workout.swimmerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Forbidden.' });
      }

      const profile = await SwimmerProfile.findById(req.user._id);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Swimmer profile not found.' });
      }

      const customization = {
        ...(workout.generationInfo?.generationParameters?.toObject?.() || {}),
        ...proposal.overrides,
      };

      const newWorkout = await regenerateWorkout(proposal.workoutId, profile, customization, { mode: 'direct' });

      // Remove confirmed proposal
      entry.proposals.splice(actionIndex, 1);
      if (entry.proposals.length === 0) {
        await Conversation.findByIdAndDelete(conversationId);
      } else {
        await entry.save();
      }

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
router.post('/chat/:conversationId/dismiss', async (req, res) => {
  const { conversationId } = req.params;
  const { actionIndex = 0 } = req.body;

  const entry = await Conversation.findById(conversationId);
  if (!entry || !entry.proposals?.[actionIndex]) {
    return res.status(404).json({ success: false, error: 'Proposal not found.' });
  }

  // Verify ownership
  if (entry.swimmerId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  entry.proposals.splice(actionIndex, 1);
  if (entry.proposals.length === 0) {
    await Conversation.findByIdAndDelete(conversationId);
  } else {
    await entry.save();
  }

  res.json({ success: true, dismissed: true });
});

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Allowlist of field paths the coach can modify via modifyWorkout.
 * Prevents mass assignment — the LLM can't set _id, swimmerId, or inject
 * MongoDB operators like $gt.
 */
const ALLOWED_FIELD_PREFIXES = [
  'poolWorkout.mainSet.',
  'poolWorkout.warmUp.',
  'poolWorkout.coolDown.',
  'poolWorkout.totalDistance',
  'poolWorkout.poolUnit',
  'gymWorkout.mainSet.',
  'gymWorkout.warmUp.',
  'gymWorkout.coolDown.',
  'workoutName',
  'workoutType',
  'duration',
  'intensity',
];

const ALLOWED_MAINSET_POOL_FIELDS = new Set(['distance', 'repetitions', 'stroke', 'interval', 'focus', 'description']);
const ALLOWED_MAINSET_GYM_FIELDS = new Set(['exercise', 'sets', 'repetitions', 'weight', 'weightUnit', 'restTime', 'muscleGroup', 'focus', 'description']);
const ALLOWED_WARMUP_COOLDOWN_POOL_FIELDS = new Set(['distance', 'duration', 'description']);
const ALLOWED_WARMUP_COOLDOWN_GYM_FIELDS = new Set(['duration', 'description']);

function isAllowedField(field) {
  // Reject fields containing MongoDB operators or path traversal
  if (field.includes('$') || field.includes('..')) return false;

  // Top-level allowed fields
  if (['workoutName', 'workoutType', 'duration', 'intensity'].includes(field)) return true;

  // poolWorkout.totalDistance, poolWorkout.poolUnit
  if (field === 'poolWorkout.totalDistance' || field === 'poolWorkout.poolUnit') return true;

  // poolWorkout.mainSet.N.fieldName
  const poolMainSetMatch = field.match(/^poolWorkout\.mainSet\.(\d+)\.(\w+)$/);
  if (poolMainSetMatch) return ALLOWED_MAINSET_POOL_FIELDS.has(poolMainSetMatch[2]);

  // gymWorkout.mainSet.N.fieldName
  const gymMainSetMatch = field.match(/^gymWorkout\.mainSet\.(\d+)\.(\w+)$/);
  if (gymMainSetMatch) return ALLOWED_MAINSET_GYM_FIELDS.has(gymMainSetMatch[2]);

  // poolWorkout.(warmUp|coolDown).fieldName
  const poolWUCDMatch = field.match(/^poolWorkout\.(warmUp|coolDown)\.(\w+)$/);
  if (poolWUCDMatch) return ALLOWED_WARMUP_COOLDOWN_POOL_FIELDS.has(poolWUCDMatch[2]);

  // gymWorkout.(warmUp|coolDown).fieldName
  const gymWUCDMatch = field.match(/^gymWorkout\.(warmUp|coolDown)\.(\w+)$/);
  if (gymWUCDMatch) return ALLOWED_WARMUP_COOLDOWN_GYM_FIELDS.has(gymWUCDMatch[2]);

  return false;
}

/**
 * Parse a string value into the appropriate JS type for MongoDB updates.
 * Validates that numeric fields get numeric values.
 */
function parseValue(val, field) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;

  // Numeric fields must parse as numbers
  const numericFields = /(\.distance|\.repetitions|\.duration|\.sets|\.weight|\.restTime|totalDistance|^duration$)/;
  if (numericFields.test(field)) {
    const num = Number(val);
    if (isNaN(num)) throw new Error(`Invalid numeric value for ${field}: ${val}`);
    return num;
  }

  if (!isNaN(val) && val !== '') return Number(val);
  return val;
}

module.exports = router;