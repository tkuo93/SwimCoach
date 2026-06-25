const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const Workout = require('../../models/Workout');
const { chat: coachChat } = require('../../services/coach/coach-agent');
const { regenerateWorkout } = require('../../services/workout-generator');
const { resolveSwimmerId, requireOwnership } = require('../../middleware/auth');

// In-memory store for pending proposals (conversationId -> { swimmerId, actions[] })
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

    // Generate a cryptographically random conversation ID for tracking proposals
    const conversationId = crypto.randomUUID();

    // Store any proposal actions for later confirmation (keyed with swimmerId for ownership)
    const proposals = result.actions.filter(a => a.proposal);
    if (proposals.length > 0) {
      pendingProposals.set(conversationId, { swimmerId, actions: proposals });
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

    const entry = pendingProposals.get(conversationId);
    if (!entry || !entry.actions[actionIndex]) {
      return res.status(404).json({ success: false, error: 'Proposal not found or expired. Ask the coach again.' });
    }

    // Verify the requesting swimmer owns this proposal
    if (entry.swimmerId !== swimmerId) {
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    }

    const proposal = entry.actions[actionIndex];

    if (proposal.action === 'modifyWorkout') {
      // Apply the field modification to the workout
      const workout = await Workout.findById(proposal.workoutId);
      if (!workout) {
        return res.status(404).json({ success: false, error: 'Workout not found.' });
      }

      const err = requireOwnership(req, res, swimmerId, workout.swimmerId);
      if (err) return err;

      // Parse the field path — validate against allowlist to prevent mass assignment
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
      entry.actions.splice(actionIndex, 1);
      if (entry.actions.length === 0) pendingProposals.delete(conversationId);

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
      entry.actions.splice(actionIndex, 1);
      if (entry.actions.length === 0) pendingProposals.delete(conversationId);

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
  const swimmerId = resolveSwimmerId(req);

  const entry = pendingProposals.get(conversationId);
  if (!entry || !entry.actions[actionIndex]) {
    return res.status(404).json({ success: false, error: 'Proposal not found.' });
  }

  // Verify ownership
  if (entry.swimmerId !== swimmerId) {
    return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  entry.actions.splice(actionIndex, 1);
  if (entry.actions.length === 0) pendingProposals.delete(conversationId);

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
