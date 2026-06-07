const express = require('express');
const router = express.Router();
const Workout = require('../../models/Workout');
const SwimmerProfile = require('../../models/SwimmerProfile');
const { generateWorkout, regenerateWorkout } = require('../../services/workout-generator');
const { appendFeedback, deriveLearning } = require('../../services/memory');
const { chat } = require('../../services/chat-with-coach');

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
// Body: { swimmerId, sessionType?, workoutType?, duration?, poolLength?, availableEquipment?, intensity?, programPeriod?, mode? }
router.post('/generate', async (req, res) => {
  try {
    const { swimmerId, mode = 'direct', ...customization } = req.body;

    if (!swimmerId) {
      return res.status(400).json({ success: false, error: 'swimmerId is required' });
    }

    const profile = await SwimmerProfile.findById(swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const workout = await generateWorkout(profile, customization, { mode });
    res.status(201).json({ success: true, data: workout });
  } catch (err) {
    console.error('Workout generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/workouts?swimmerId=xxx
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.swimmerId) {
      filter.swimmerId = req.query.swimmerId;
    }
    const workouts = await Workout.find(filter)
      .populate('swimmerId', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: workouts.length, data: workouts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/workouts/:id
router.get('/:id', async (req, res) => {
  try {
    const workout = await Workout.findById(req.params.id).populate('swimmerId');
    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }
    res.json({ success: true, data: workout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/workouts/program/:programId
router.get('/program/:programId', async (req, res) => {
  try {
    const workouts = await Workout.find({ programId: req.params.programId })
      .populate('swimmerId', 'firstName lastName')
      .sort({ 'generationInfo.generationParameters.programIndex': 1 });
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
        workouts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/:id/feedback
router.post('/:id/feedback', async (req, res) => {
  try {
    const { rating, difficultyPerception, enjoyment, comments } = req.body;
    const workout = await Workout.findByIdAndUpdate(
      req.params.id,
      {
        userFeedback: {
          rating,
          difficultyPerception,
          enjoyment,
          comments,
          completedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );
    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

    // Write feedback to MEMORY.md for future generation context
    try {
      const profile = await SwimmerProfile.findById(workout.swimmerId);
      const profileName = profile
        ? `${profile.firstName} ${profile.lastName}`
        : 'Unknown';

      appendFeedback({
        profileName,
        workoutType: workout.workoutType,
        rating,
        difficultyPerception,
        enjoyment,
        comments,
        learning: deriveLearning({ rating, difficultyPerception, enjoyment, workoutType: workout.workoutType }),
      });
    } catch (memErr) {
      // Don't fail the request if MEMORY.md write fails
      console.error('Failed to write to MEMORY.md:', memErr.message);
    }

    res.json({ success: true, data: workout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/workouts/:id/chat
// Body: { message: string, messages: Array<{role: 'user'|'coach', text: string}> }
// Returns: { reply: string, regenerate: boolean, workout?: Workout }
router.post('/:id/chat', async (req, res) => {
  try {
    const { message, messages = [] } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const workout = await Workout.findById(req.params.id);
    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

    const profile = await SwimmerProfile.findById(workout.swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    const result = await chat(profile, workout, messages, message);

    // If the coach decided to regenerate, do it
    if (result.regenerate) {
      const customization = {
        ...(workout.generationParameters?.toObject?.() || {}),
        ...result.overrides,
      };
      const newWorkout = await regenerateWorkout(req.params.id, profile, customization, {
        mode: 'direct',
      });
      return res.json({
        success: true,
        data: {
          reply: result.reply,
          regenerate: true,
          workout: newWorkout,
        },
      });
    }

    res.json({
      success: true,
      data: {
        reply: result.reply,
        regenerate: false,
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
    const existing = await Workout.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

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

// PUT /api/workouts/:id — Direct edit
router.put('/:id', async (req, res) => {
  try {
    const workout = await Workout.findByIdAndUpdate(
      req.params.id,
      req.body,
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
// Body: { swimmerId, programPeriod, workoutType?, duration?, poolLength?, availableEquipment?, intensity?, sessionsPerWeek? }
router.post('/generate/program', async (req, res) => {
  try {
    const { swimmerId, programPeriod, sessionsPerWeek, ...customization } = req.body;

    if (!swimmerId) {
      return res.status(400).json({ success: false, error: 'swimmerId is required' });
    }
    if (!programPeriod || programPeriod === 'single') {
      return res.status(400).json({ success: false, error: 'programPeriod must be weekly or monthly' });
    }

    const profile = await SwimmerProfile.findById(swimmerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Swimmer profile not found' });
    }

    // Determine number of sessions
    const perWeek = sessionsPerWeek || profile.trainingSchedule?.weeklyPoolSessions || 3;
    const totalWeeks = programPeriod === 'monthly' ? 4 : 1;
    const totalSessions = perWeek * totalWeeks;

    // Generate sequential workouts with shared programId
    const programId = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const workouts = [];
    for (let i = 0; i < totalSessions; i++) {
      const sessionCustomization = {
        ...customization,
        programIndex: i,
        totalSessions,
        programPeriod,
        programId,
      };
      const workout = await generateWorkout(profile, sessionCustomization, { mode: 'direct' });
      workouts.push(workout);
    }

    res.status(201).json({
      success: true,
      data: {
        programId,
        programPeriod,
        totalSessions,
        workouts,
      },
    });
  } catch (err) {
    console.error('Program generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
