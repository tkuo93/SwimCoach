const express = require('express');
const router = express.Router();
const Workout = require('../../models/Workout');
const SwimmerProfile = require('../../models/SwimmerProfile');
const { generateWorkout, regenerateWorkout } = require('../../services/workout-generator');
const { syncFeedbackToMemory, detectTrends } = require('../../services/coaching-memory-sync');
const { chat: coachChat } = require('../../services/coach/coach-agent');
const { generateWeeklyProgram } = require('../../services/program-generator');
const { checkAndGenerateUpcomingWeek } = require('../../services/workout-scheduler');
const { track } = require('../../services/posthog');

/**
 * Verify the requesting user owns the workout.
 * Returns sanitized workout if OK, or null if not (response already sent).
 */
async function verifyWorkoutOwnership(req, res) {
  let workout;
  try {
    workout = await Workout.findById(req.params.id);
  } catch (castErr) {
    const { ObjectId } = require('mongoose').Types;
    workout = await Workout.collection.findOne({ _id: new ObjectId(req.params.id) });
  }
  if (!workout) {
    res.status(404).json({ success: false, error: 'Workout not found' });
    return null;
  }
  const targetSwimmer = typeof workout.swimmerId === 'object' ? workout.swimmerId?._id : workout.swimmerId;
  if (!req.user || targetSwimmer.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: 'Forbidden — you do not own this resource.' });
    return null;
  }
  return sanitizeWorkout(workout);
}

// POST /api/workouts — Direct create (for PoC, bypasses NotebookLM bridge)
router.post('/', async (req, res) => {
  try {
    const workout = new Workout(req.body);
    await workout.save();
    res.status(201).json({ success: true, data: workout });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors: messages });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/generate
// Body: { sessionType?, workoutType?, duration?, poolLength?, availableEquipment?, intensity?, programPeriod?, mode?, useHighVolumeRoute? }
router.post('/generate', async (req, res) => {
  try {
    const { mode = 'direct', useHighVolumeRoute = false, ...customization } = req.body;

    const profile = await SwimmerProfile.findById(req.user._id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const workout = await generateWorkout(profile, { ...customization, useHighVolumeRoute }, { mode });

    // Track workout generation
    track('workout_generated', {
      workout_id: workout._id.toString(),
      workout_type: workout.workoutType || 'mixed',
      session_type: customization.sessionType,
      duration: customization.duration,
      pool_length: customization.poolLength,
      intensity: customization.intensity,
      mode,
      is_ai_generated: true,
    }, req.user._id.toString(), req.sessionID);

    res.status(201).json({ success: true, data: workout });
  } catch (err) {
    console.error('Workout generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/workouts
router.get('/', async (req, res) => {
  try {
    // Scope to authenticated user
    const workouts = await Workout.find({ swimmerId: req.user._id })
      .populate('swimmerId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();
    const sanitized = workouts.map(w => sanitizeWorkout(w));
    res.json({ success: true, count: sanitized.length, data: sanitized });

    // Trigger weekly auto-generation check (runs at most once per user per ISO week).
    // Fire-and-forget: don't delay the response.
    setImmediate(async () => {
      try {
        await checkAndGenerateUpcomingWeek(req.user._id.toString());
      } catch (err) {
        console.error('[Scheduler] Auto-generation check failed:', err.message);
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Ensure poolWorkout and gymWorkout are plain objects, not strings or missing.
 * Older saves occasionally stored these as raw strings when AI returned malformed data.
 */
function sanitizeWorkout(w) {
  if (typeof w.poolWorkout === 'string' || w.poolWorkout == null) {
    w.poolWorkout = { warmUp: { duration: 0 }, mainSet: [], coolDown: { duration: 0 }, totalDistance: 0, trainingNotes: [] };
  }
  if (typeof w.gymWorkout === 'string' || w.gymWorkout == null) {
    w.gymWorkout = { warmUp: { duration: 0 }, mainSet: [], coolDown: { duration: 0 }, trainingNotes: [] };
  }
  return w;
}

// GET /api/workouts/program/:programId — MUST come before /:id to avoid being shadowed
router.get('/program/:programId', async (req, res) => {
  try {
    const query = { programId: req.params.programId, swimmerId: req.user._id };

    let workouts;
    try {
      workouts = await Workout.find(query)
        .populate('swimmerId', 'firstName lastName')
        .sort({ 'generationInfo.generationParameters.programIndex': 1 });
    } catch (castErr) {
      console.warn('Program query casting failed, using raw:', castErr.message);
      const { ObjectId } = require('mongoose').Types;
      const raw = await Workout.collection.find(query)
        .sort({ 'generationInfo.generationParameters.programIndex': 1 })
        .toArray();
      const swimmerIds = [...new Set(raw.map(w => w.swimmerId?.toString()).filter(Boolean))];
      const swimmers = swimmerIds.length
        ? await SwimmerProfile.find({ _id: { $in: swimmerIds.map(id => new ObjectId(id)) } }).select('firstName lastName').lean()
        : [];
      const swimmerMap = Object.fromEntries(swimmers.map(s => [s._id.toString(), s]));
      workouts = raw.map(w => ({ ...w, swimmerId: swimmerMap[w.swimmerId?.toString()] || null }));
    }
    if (!workouts.length) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }
    res.json({
      success: true,
      data: {
        programId: req.params.programId,
        programPeriod: workouts[0].generationInfo?.generationParameters?.programPeriod || 'unknown',
        totalSessions: workouts.length,
        swimmerName: workouts[0].swimmerId
          ? `${workouts[0].swimmerId.firstName} ${workouts[0].swimmerId.lastName}`
          : 'Unknown',
        workouts: workouts.map(w => sanitizeWorkout(w)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/workouts/:id
router.get('/:id', async (req, res) => {
  try {
    let workout;
    try {
      workout = await Workout.findById(req.params.id).populate('swimmerId');
    } catch (castErr) {
      // Legacy data: poolWorkout/gymWorkout may be stored as strings — fetch raw
      console.warn('Workout.findById casting failed, using raw doc:', castErr.message);
      const { ObjectId } = require('mongoose').Types;
      workout = await Workout.collection.findOne({ _id: new ObjectId(req.params.id) });
      if (!workout) {
        return res.status(404).json({ success: false, error: 'Workout not found' });
      }
      const swimmer = await SwimmerProfile.findById(workout.swimmerId).select('firstName lastName').lean();
      workout.swimmerId = swimmer || null;
    }
    // Verify ownership
    const targetSwimmer = typeof workout.swimmerId === 'object' ? workout.swimmerId?._id : workout.swimmerId;
    if (!req.user || targetSwimmer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden — you do not own this resource.' });
    }
    res.json({ success: true, data: sanitizeWorkout(workout) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/:id/feedback
router.post('/:id/feedback', async (req, res) => {
  try {
    const { rating, difficultyPerception, enjoyment, quality, accuracy, comments } = req.body;

    // Verify ownership
    const existing = await verifyWorkoutOwnership(req, res);
    if (!existing) return;

    const workout = await Workout.findByIdAndUpdate(
      req.params.id,
      {
        userFeedback: {
          rating,
          difficultyPerception,
          enjoyment,
          quality,
          accuracy,
          comments,
          completedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );
    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

    // Track workout completion/feedback
    track('workout_completed', {
      workout_id: workout._id.toString(),
      workout_type: workout.workoutType,
      rating,
      difficulty_perception: difficultyPerception,
      enjoyment,
      quality,
      accuracy,
      has_comments: !!comments,
    }, req.user._id.toString(), req.sessionID);

    // Sync feedback to CoachingMemory for the agentic coach
    try {
      await syncFeedbackToMemory({
        swimmerId: workout.swimmerId,
        workoutId: workout._id,
        workoutType: workout.workoutType,
        feedback: { rating, difficultyPerception, enjoyment, quality, accuracy },
      });

      // Run trend detection every 5th feedback for this swimmer
      const feedbackCount = await Workout.countDocuments({
        swimmerId: workout.swimmerId,
        'userFeedback.rating': { $exists: true },
      });
      if (feedbackCount % 5 === 0) {
        detectTrends(workout.swimmerId).catch(err =>
          console.error('Trend detection error:', err.message)
        );
      }
    } catch (memErr) {
      console.error('Failed to sync to CoachingMemory:', memErr.message);
    }

    res.json({ success: true, data: workout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/:id/chat
// Body: { message: string, messages: Array<{role: 'user'|'coach', text: string}> }
// Returns: { reply: string, actions: Array, workout?: Workout, conversationId?: string }
router.post('/:id/chat', async (req, res) => {
  try {
    const { message, messages = [], llmModel } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const workout = await verifyWorkoutOwnership(req, res);
    if (!workout) return;

    const profile = await SwimmerProfile.findById(workout.swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    // Use agentic coach in workout mode
    const result = await coachChat({
      profile,
      workout,
      messages,
      userMessage: message,
      mode: 'workout',
      modelOverride: llmModel,
    });

    // Process actions from the agent
    const processedActions = [];
    let regeneratedWorkout = null;

    for (const action of result.actions) {
      if (action.action === 'regenerateWorkout') {
        const customization = {
          ...(workout.generationInfo?.generationParameters?.toObject?.() || {}),
          ...action.overrides,
        };
        if (llmModel) customization.llmModel = llmModel;
        regeneratedWorkout = await regenerateWorkout(req.params.id, profile, customization, { mode: 'direct' });

        // Update workout notes to reflect the swap/regeneration reason
        if (action.reason && regeneratedWorkout) {
          const swapNote = `Coach swapped this workout: ${action.reason}`;
          const existingNotes = regeneratedWorkout.trainingNotes || [];
          if (!existingNotes.includes(swapNote)) {
            existingNotes.push(swapNote);
            regeneratedWorkout.trainingNotes = existingNotes;
            regeneratedWorkout.generationInfo.generatedBy = 'user-customized';
            await regeneratedWorkout.save();
          }
        }

        processedActions.push({ ...action, applied: true });
      } else {
        // modifyWorkout proposals are returned to frontend for confirmation
        processedActions.push(action);
      }
    }

    // Find or create conversation for this workout and save messages
    const Conversation = require('../../models/Conversation');
    let conversation = await Conversation.findOne({
      swimmerId: req.user._id,
      contextWorkoutId: req.params.id,
    });

    if (!conversation) {
      conversation = new Conversation({
        swimmerId: req.user._id,
        title: 'Workout chat',
        messages: [],
        contextWorkoutId: req.params.id,
      });
    }

    conversation.messages.push(
      { role: 'user', text: message },
      { role: 'coach', text: result.reply }
    );
    await conversation.save();

    res.json({
      success: true,
      data: {
        reply: result.reply,
        actions: processedActions,
        conversationId: conversation._id,
        ...(regeneratedWorkout && { workout: regeneratedWorkout }),
      },
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/:id/regenerate
router.post('/:id/regenerate', async (req, res) => {
  try {
    const existing = await verifyWorkoutOwnership(req, res);
    if (!existing) return;

    const profile = await SwimmerProfile.findById(existing.swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const customization = {
      ...(existing.generationParameters?.toObject?.() || {}),
      ...req.body,
    };

    const workout = await regenerateWorkout(req.params.id, profile, customization, {
      mode: req.body.mode || 'direct',
    });
    res.status(201).json({ success: true, data: workout });
  } catch (err) {
    console.error('Regeneration error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/workouts/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await verifyWorkoutOwnership(req, res);
    if (!existing) return;

    const deleted = await Workout.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }
    res.json({ success: true, message: 'Workout deleted' });
  } catch (err) {
    console.error(`Delete workout error (id: ${req.params.id}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/workouts/:id — Direct edit (supports partial updates)
router.put('/:id', async (req, res) => {
  try {
    const existing = await verifyWorkoutOwnership(req, res);
    if (!existing) return;

    // Build update object — only allow editable fields
    const editableFields = {};
    const allowedTopLevel = [
      'workoutName', 'workoutType', 'date', 'duration', 'intensity',
      'poolWorkout', 'gymWorkout', 'trainingNotes', 'progression', 'generationInfo',
    ];

    // Top-level keys (full object replacement)
    for (const key of allowedTopLevel) {
      if (req.body[key] !== undefined) {
        editableFields[key] = req.body[key];
      }
    }

    // Dot-notation field paths for partial nested updates (e.g. gymWorkout.mainSet.0.exercise)
    for (const key of Object.keys(req.body)) {
      if (key.includes('.')) {
        const root = key.split('.')[0];
        if (allowedTopLevel.includes(root)) {
          // Sanitize exercise name fields: strip sets/reps/weight suffixes
          if (key.endsWith('.exercise')) {
            editableFields[key] = sanitizeExerciseName(req.body[key]);
          } else {
            editableFields[key] = req.body[key];
          }
        }
      }
    }

    // Sanitize exercise names in gymWorkout.mainSet: strip sets/reps/weight
    // suffixes the LLM may have included (e.g. "Lat Pulldown 3x10 @ 75lbs" → "Lat Pulldown")
    if (editableFields.gymWorkout?.mainSet) {
      editableFields.gymWorkout.mainSet.forEach(ex => {
        if (ex.exercise) {
          ex.exercise = sanitizeExerciseName(ex.exercise);
        }
      });
    }

    // Always update the updatedAt timestamp
    editableFields.updatedAt = new Date();

    const workout = await Workout.findByIdAndUpdate(
      req.params.id,
      { $set: editableFields },
      { new: true, runValidators: true },
    );
    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }
    res.json({ success: true, data: workout });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors: messages });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/generate/program
// Body: { programPeriod, workoutType?, duration?, poolLength?, availableEquipment?, intensity?, sessionsPerWeek? }
router.post('/generate/program', async (req, res) => {
  try {
    const { programPeriod, sessionsPerWeek, weekStartOffset = 0, ...customization } = req.body;

    if (!programPeriod || programPeriod === 'single') {
      return res.status(400).json({ success: false, error: 'programPeriod must be weekly or monthly' });
    }

    const profile = await SwimmerProfile.findById(req.user._id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const result = await generateWeeklyProgram(profile, {
      ...customization,
      programPeriod,
      sessionsPerWeek,
      weekStartOffset,
    });

    if (result.workouts.length === 0) {
      return res.status(500).json({ success: false, error: 'All workout generations failed. Please try again shortly.', errors: result.errors });
    }

    res.status(201).json({
      success: true,
      partial: result.errors?.length > 0,
      data: {
        programId: result.programId,
        programPeriod: result.programPeriod,
        totalSessions: result.totalSessions,
        generatedCount: result.generatedCount,
        workouts: result.workouts,
        ...(result.errors?.length > 0 && { errors: result.errors }),
      },
    });
  } catch (err) {
    console.error('Program generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Strip sets/reps/weight suffixes from an exercise name string.
 * Prevents the LLM from including context info in the exercise name field.
 * e.g. "Lat Pulldown 3x10 @ 75lbs" → "Lat Pulldown"
 */
function sanitizeExerciseName(name) {
  if (typeof name !== 'string') return name;
  return name
    .replace(/\s*\d+\s*[x×]\s*\d+(?:\s*@\s*[\d.]+\s*(?:lbs|kg|kgs)?)?$/, '')
    .replace(/\s*\(\s*\d+\s*(?:sets|reps)\s*x\s*\d+\s*(?:reps|sets)?\s*\)$/i, '')
    .replace(/\s*@\s*[\d.]+\s*(?:lbs|kg|kgs)?$/, '')
    .trim();
}

module.exports = router;
