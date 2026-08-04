const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile');
const Workout = require('../../models/Workout');
const Conversation = require('../../models/Conversation');
const { chat: coachChat } = require('../../services/coach/coach-agent');
const { regenerateWorkout } = require('../../services/workout-generator');
const { track } = require('../../services/posthog');

// POST /api/coach/chat
// Body: { messages: Array<{role, text}>, message: string, llmModel?, conversationId?, workoutId? }
router.post('/chat', async (req, res) => {
  try {
    const { message, messages = [], llmModel, conversationId, workoutId } = req.body;

    // Debug logging (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Coach chat request:', { hasConversationId: !!conversationId, messageLength: message?.length });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const profile = await SwimmerProfile.findById(req.user._id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    // Optional: load workout if workoutId provided
    let workout = null;
    let mode = 'general';
    if (workoutId) {
      workout = await Workout.findById(workoutId);
      if (workout && workout.swimmerId.toString() === req.user._id.toString()) {
        mode = 'workout';
      } else {
        workout = null; // invalid workoutId — fall back to general
      }
    }

    const result = await coachChat({
      profile,
      workout,
      messages,
      userMessage: message,
      mode,
      modelOverride: llmModel,
    });

    // Track coach interaction
    const userId = req.user._id.toString();
    const sessionId = req.sessionID || req.headers['x-session-id'];
    track('coach_message_sent', {
      message_type: workout ? 'workout_context' : 'general',
      conversation_length: messages.length + 1,
      has_proposals: result.actions.some(a => a.proposal),
      proposal_count: result.actions.filter(a => a.proposal).length,
      workout_id: workoutId || null,
      llm_model: llmModel || 'default',
    }, userId, sessionId);

    // Store any proposal actions in Conversation DB for later confirmation
    const proposals = result.actions.filter(a => a.proposal);
    let finalConversationId = null;

    // If conversationId provided, try to find and append to existing conversation
    if (conversationId) {
      let conversation = await Conversation.findById(conversationId);
      if (conversation && conversation.swimmerId.toString() === req.user._id.toString()) {
        // Conversation found and owned by user
        if (process.env.NODE_ENV !== 'production') console.log('Found existing conversation');
      } else if (conversation) {
        // Conversation exists but belongs to different user
        if (process.env.NODE_ENV !== 'production') console.log('Conversation belongs to different user');
        return res.status(403).json({ success: false, error: 'Access denied to this conversation' });
      } else {
        // Conversation not found - create a new one (frontend should have created it, but handle gracefully)
        if (process.env.NODE_ENV !== 'production') console.log('Conversation not found, creating new');
        conversation = new Conversation({
          swimmerId: req.user._id,
          title: 'New conversation',
          messages: [],
          contextWorkoutId: workoutId || null,
        });
      }

      conversation.messages.push(
        { role: 'user', text: message },
        { role: 'coach', text: result.reply }
      );
      // Add proposals if any
      if (proposals.length > 0) {
        conversation.proposals = [...(conversation.proposals || []), ...proposals];
        // Set expiry for proposals (10 min from now) ONLY for conversations that have no prior messages
        // (i.e., proposals-only conversations created by backend). Frontend-created conversations
        // persist indefinitely and are deleted explicitly when proposals are confirmed/dismissed.
        const hasUserMessages = conversation.messages.some(m => m.role === 'user');
        if (!hasUserMessages || conversation.messages.length <= 2) { // Only the two we just added
          conversation.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        }
        // Update contextWorkoutId if provided and not already set
        if (workoutId && !conversation.contextWorkoutId) {
          conversation.contextWorkoutId = workoutId;
        }
      } else {
        // No proposals - clear any existing expiresAt (e.g., from previous proposal interactions)
        conversation.expiresAt = undefined;
      }
      // Always save the conversation to persist messages
      if (process.env.NODE_ENV !== 'production') console.log('Saving conversation, messages:', conversation.messages.length);
      await conversation.save();
      if (process.env.NODE_ENV !== 'production') console.log('Conversation saved successfully');
      finalConversationId = conversation._id.toString();
    }

    // If no conversationId provided, create a new conversation
    // This handles cases where the frontend doesn't send conversationId
    if (!finalConversationId && !conversationId) {
      const conversation = await Conversation.create({
        swimmerId: req.user._id,
        title: proposals.length > 0 ? 'Coach Proposals' : 'New conversation',
        messages: [
          { role: 'user', text: message },
          { role: 'coach', text: result.reply }
        ],
        contextWorkoutId: workoutId || null,
        ...(proposals.length > 0 ? { proposals, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } : {}),
      });
      if (process.env.NODE_ENV !== 'production') console.log('Created new conversation (no conversationId provided)');
      finalConversationId = conversation._id.toString();
    }

    res.json({
      success: true,
      data: {
        reply: result.reply,
        actions: result.actions,
        conversationId: finalConversationId,
      },
    });
  } catch (err) {
    // Extract OpenRouter error details for logging
    const openRouterError = err.response?.data?.error;
    const errorDetail = typeof openRouterError === 'object' && openRouterError !== null
      ? (openRouterError.message || openRouterError.code || JSON.stringify(openRouterError))
      : (openRouterError || err.message);

    console.error('Coach chat error:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      error: errorDetail,
      userId: err.response?.data?.user_id,
      message: err.message
    });
    res.status(err.response?.status || 500).json({
      success: false,
      error: errorDetail || err.message
    });
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

      // Track workout modification
      track('workout_modified', {
        workout_id: proposal.workoutId,
        field_modified: field,
        action_type: 'modify',
        via_coach: true,
      }, req.user._id.toString(), req.sessionID);

      // Remove confirmed proposal
      entry.proposals.splice(actionIndex, 1);
      if (entry.proposals.length === 0) {
        // If no more proposals, check if conversation has real messages (not just the ones from proposals)
        const hasUserMessages = entry.messages.some(m => m.role === 'user');
        if (hasUserMessages) {
          // Keep conversation but clear expiresAt
          entry.expiresAt = undefined;
          await entry.save();
        } else {
          // Proposals-only conversation - delete it
          await Conversation.findByIdAndDelete(conversationId);
        }
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

      // Track workout regeneration
      track('workout_regenerated', {
        original_workout_id: proposal.workoutId,
        new_workout_id: newWorkout._id.toString(),
        action_type: 'regenerate',
        via_coach: true,
      }, req.user._id.toString(), req.sessionID);

      // Remove confirmed proposal
      entry.proposals.splice(actionIndex, 1);
      if (entry.proposals.length === 0) {
        // If no more proposals, check if conversation has real messages (not just the ones from proposals)
        const hasUserMessages = entry.messages.some(m => m.role === 'user');
        if (hasUserMessages) {
          // Keep conversation but clear expiresAt
          entry.expiresAt = undefined;
          await entry.save();
        } else {
          // Proposals-only conversation - delete it
          await Conversation.findByIdAndDelete(conversationId);
        }
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
    // If no more proposals, check if conversation has real messages (not just the ones from proposals)
    const hasUserMessages = entry.messages.some(m => m.role === 'user');
    if (hasUserMessages) {
      // Keep conversation but clear expiresAt
      entry.expiresAt = undefined;
      await entry.save();
    } else {
      // Proposals-only conversation - delete it
      await Conversation.findByIdAndDelete(conversationId);
    }
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