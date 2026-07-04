const express = require('express');
const router = express.Router();
const Workout = require('../../models/Workout');
const SwimmerProfile = require('../../models/SwimmerProfile');
const { generateWorkout, regenerateWorkout } = require('../../services/workout-generator');
const { syncFeedbackToMemory, detectTrends } = require('../../services/coaching-memory-sync');
const { deriveLearning } = require('../../services/memory');
const { getCoachingObservations, getAllNotebookNotes } = require('../../services/workout-ai');
const { chat: legacyChat } = require('../../services/chat-with-coach');
const { chat: coachChat } = require('../../services/coach/coach-agent');

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
// Body: { sessionType?, workoutType?, duration?, poolLength?, availableEquipment?, intensity?, programPeriod?, mode? }
router.post('/generate', async (req, res) => {
  try {
    const { mode = 'direct', ...customization } = req.body;

    const profile = await SwimmerProfile.findById(req.user._id);
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
// Returns: { reply: string, actions: Array, workout?: Workout }
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
        processedActions.push({ ...action, applied: true });
      } else {
        // modifyWorkout proposals are returned to frontend for confirmation
        processedActions.push(action);
      }
    }

    res.json({
      success: true,
      data: {
        reply: result.reply,
        actions: processedActions,
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
      'poolWorkout', 'gymWorkout', 'trainingNotes', 'progression',
    ];

    for (const key of allowedTopLevel) {
      if (req.body[key] !== undefined) {
        editableFields[key] = req.body[key];
      }
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

// Delay between LLM calls to avoid OpenRouter rate limits (free tier: 20 req/min)
const GENERATION_DELAY_MS = 3500;
const TAPER_WINDOW_DAYS = 14;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a compact summary of a generated workout for context in subsequent sessions.
 * Format: "Session N: [type], [strokes], [distance]m, gym: [muscle groups]"
 */
function buildSessionSummary(workout, sessionIndex) {
  const parts = [`Session ${sessionIndex + 1}: ${workout.workoutType || 'mixed'}`];

  // Pool strokes
  const strokes = [];
  if (workout.poolWorkout?.mainSet) {
    const seen = new Set();
    for (const set of workout.poolWorkout.mainSet) {
      if (set.stroke && !seen.has(set.stroke)) {
        seen.add(set.stroke);
        strokes.push(set.stroke);
      }
    }
  }
  if (strokes.length > 0) parts.push(strokes.join('+'));

  // Total distance
  if (workout.poolWorkout?.totalDistance) {
    parts.push(`${workout.poolWorkout.totalDistance}m`);
  }

  // Gym muscle groups
  if (workout.gymWorkout?.mainSet?.length > 0) {
    const muscleGroups = [];
    const seenMuscles = new Set();
    for (const ex of workout.gymWorkout.mainSet) {
      if (ex.muscleGroup && !seenMuscles.has(ex.muscleGroup)) {
        seenMuscles.add(ex.muscleGroup);
        muscleGroups.push(ex.muscleGroup);
      }
    }
    if (muscleGroups.length > 0) parts.push(`gym: ${muscleGroups.join('+')}`);
  }

  return parts.join(', ');
}

/**
 * Check if a session date falls within the taper window of any competition.
 * Returns { taper: true, competitionLabel, competitionDate } or { taper: false }.
 */
function checkTaper(sessionDate, competitionDates) {
  if (!competitionDates || competitionDates.length === 0) return { taper: false };

  const s = new Date(sessionDate);
  s.setHours(0, 0, 0, 0);

  for (const comp of competitionDates) {
    const compStart = new Date(comp.start);
    compStart.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((compStart - s) / (1000 * 60 * 60 * 24));

    if (daysUntil >= 0 && daysUntil <= TAPER_WINDOW_DAYS) {
      return {
        taper: true,
        competitionLabel: comp.label || 'Competition',
        competitionDate: comp.start,
        daysUntil,
      };
    }
  }
  return { taper: false };
}

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

    // ── Determine workout type per session from profile's training foci ──
    // If the user explicitly chose a workout type, use it for all sessions.
    // Otherwise shuffle foci within each week for variety across programs.
    const VALID_FOCUSES = new Set(['sprint', 'distance', 'technique', 'endurance', 'speed', 'maintenance', 'lactate', 'resistance-power', 'mobility', 'recovery']);
    const baseFoci = (() => {
      if (customization.workoutType) return [];
      const tf = profile.goals?.trainingFocus;
      const foci = Array.isArray(tf) ? tf : (tf ? [tf] : []);
      const filtered = foci.filter(f => VALID_FOCUSES.has(f));
      return filtered.length > 0 ? filtered : ['endurance'];
    })();

    /**
     * Shuffle an array deterministically based on a seed string.
     * Gives us different orderings per program run while remaining testable.
     */
    function seededShuffle(arr, seed) {
      const a = [...arr];
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
      }
      for (let i = a.length - 1; i > 0; i--) {
        h = ((h << 5) - h) | 0;
        const j = Math.abs(h) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ── Build weekly schedule from profile's pool/gym days ──
    const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    // Allow per-generation overrides of pool/gym days (e.g. custom week flow).
    // An empty array is treated as "no override" so the profile default is used.
    const customPoolDays = Array.isArray(customization.poolDays) && customization.poolDays.length > 0 ? customization.poolDays : null;
    const customGymDays  = Array.isArray(customization.gymDays)  && customization.gymDays.length  > 0 ? customization.gymDays  : null;
    const poolDays = (customPoolDays || profile.trainingSchedule?.poolDays || []).map(d => d.toLowerCase());
    const gymDays  = (customGymDays  || profile.trainingSchedule?.gymDays  || []).map(d => d.toLowerCase());

    // If no days are configured, fall back to generating all sessions as "both" (legacy behavior)
    const hasSchedule = poolDays.length > 0 || gymDays.length > 0;

    // Build a sorted weekly pattern: [{ dayOfWeek: 'monday', sessionType: 'pool' }, ...]
    let weeklyPattern = [];
    if (hasSchedule) {
      for (const day of DAY_ORDER) {
        if (poolDays.includes(day)) weeklyPattern.push({ dayOfWeek: day, sessionType: 'pool' });
        if (gymDays.includes(day))  weeklyPattern.push({ dayOfWeek: day, sessionType: 'gym' });
      }
    }

    // Honor a sessionType override ("pool" or "gym") by filtering the pattern.
    // "both" (or empty) keeps the full profile schedule.
    if (customization.sessionType === 'pool' || customization.sessionType === 'gym') {
      weeklyPattern = weeklyPattern.filter(s => s.sessionType === customization.sessionType);
    }

    // Determine number of sessions per week
    const perWeek = sessionsPerWeek
      || (hasSchedule ? weeklyPattern.length : (profile.trainingSchedule?.weeklyPoolSessions || 3));
    const totalWeeks = programPeriod === 'monthly' ? 4 : 1;
    const totalSessions = perWeek * totalWeeks;

    // ── Compute the calendar date for each session ──
    // dayOfWeek (lowercase) -> JS Date.getDay() (0=Sun, 1=Mon, ...)
    const DAY_TO_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

    /**
     * Given a target day-of-week and a starting date, return the next date
     * on or after `startDate` that falls on that day-of-week.
     */
    function nextDateForDay(dayOfWeek, startDate) {
      const target = DAY_TO_NUM[dayOfWeek];
      const d = new Date(startDate);
      const current = d.getDay();
      const offset = (target - current + 7) % 7;
      d.setDate(d.getDate() + offset);
      // Midnight in the user's local timezone. The frontend reads dates in
      // local time too, so the stored date string always matches the day
      // the user sees — no UTC shift.
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // Build the full session plan: [{ date, sessionType }, ...]
    const sessionPlan = [];
    if (hasSchedule && weeklyPattern.length > 0) {
      // Start from the Monday of the target week (current week + offset)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const targetMonday = new Date(today);
      targetMonday.setDate(targetMonday.getDate() + mondayOffset + weekStartOffset);

      for (let week = 0; week < totalWeeks; week++) {
        for (const slot of weeklyPattern) {
          // Find the date for this day-of-week in this week
          const weekStart = new Date(targetMonday);
          weekStart.setDate(weekStart.getDate() + week * 7);
          const date = nextDateForDay(slot.dayOfWeek, weekStart);
          sessionPlan.push({ date, sessionType: slot.sessionType });
        }
      }
    }
    // If no schedule configured, sessionPlan stays empty — we'll use defaults below

    // Generate sequential workouts with shared programId
    const programId = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    /**
     * Build the full session type plan for the entire program.
     * Each week gets a shuffled ordering of the foci, then cycles if sessions > foci.
     */
    const sessionTypes = (() => {
      if (customization.workoutType) return Array(totalSessions).fill(customization.workoutType);
      const types = [];
      for (let week = 0; week < totalWeeks; week++) {
        const shuffled = seededShuffle(baseFoci, `${programId}-week-${week}`);
        for (let s = 0; s < perWeek; s++) {
          types.push(shuffled[s % shuffled.length]);
        }
      }
      return types;
    })();

    const workouts = [];
    const errors = [];
    const previousSessionSummaries = [];

    // Competition dates for taper detection
    const competitionDates = profile.trainingSchedule?.competitionDates || [];

    // ── Hoist expensive, session-independent lookups out of the per-session loop ──
    // Notebook notes, feedback summary, and coaching observations are the same for
    // every session in a program. Fetching them once (instead of 5×) is the main
    // reason sessions 4-5 felt slow — each was re-querying the knowledge base.
    const startTime = Date.now();
    const feedbackSummary = await getFeedbackSummary(10, req.user._id);
    const coachingObservations = await getCoachingObservations(profile._id);
    // Determine training focus once so the notes lookup runs a single time.
    const baseWorkoutType = customization.workoutType
      || (Array.isArray(profile.goals?.trainingFocus) ? profile.goals.trainingFocus[0] : profile.goals?.trainingFocus)
      || 'endurance';
    const notebookNotes = await getAllNotebookNotes(`${baseWorkoutType} training for swimmers`);
    console.log(`Program context loaded in ${Date.now() - startTime}ms (notes: ${notebookNotes ? 'hit' : 'miss'})`);

    for (let i = 0; i < totalSessions; i++) {
      const plan = sessionPlan[i];
      const sessionDate = plan ? plan.date : new Date();

      // Check if this session falls within a competition taper window
      const taperInfo = checkTaper(sessionDate, competitionDates);

      const sessionCustomization = {
        ...customization,
        workoutType: sessionTypes[i],
        programIndex: i,
        totalSessions,
        programPeriod,
        programId,
        ...(plan ? { date: plan.date } : {}),
        // sessionType: plan-level pool/gym unless the user overrode it for the whole program
        ...(plan
          ? { sessionType: customization.sessionType === 'pool' || customization.sessionType === 'gym'
              ? customization.sessionType
              : plan.sessionType }
          : { sessionType: customization.sessionType || 'both' }),
        // Pass previous session summaries for variety
        ...(previousSessionSummaries.length > 0
          ? { previousSessionSummaries: [...previousSessionSummaries] }
          : {}),
        // Pass taper context if approaching competition
        ...(taperInfo.taper
          ? {
              taper: true,
              competitionLabel: taperInfo.competitionLabel,
              competitionDate: taperInfo.competitionDate,
            }
          : {}),
      };

      // Retry each workout generation with exponential backoff
      let workout = null;
      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          workout = await generateWorkout(profile, sessionCustomization, { mode: 'direct', programContext: { feedbackSummary, coachingObservations, notebookNotes } });
          break;
        } catch (genErr) {
          const isRateLimited = genErr.message?.includes('429') || genErr.status === 429 || genErr.statusCode === 429;
          const isRetryable = isRateLimited || genErr.message?.includes('truncated') || genErr.message?.includes('JSON parse') || genErr.message?.includes('No response from OpenRouter');
          if (isRetryable && attempt < maxRetries) {
            const backoffMs = GENERATION_DELAY_MS * Math.pow(2, attempt);
            const reason = isRateLimited ? 'rate limited' : 'transient error';
            console.log(`${reason} on session ${i + 1}/${totalSessions}, attempt ${attempt + 1}/${maxRetries + 1} — retrying in ${backoffMs / 1000}s`);
            await sleep(backoffMs);
          } else {
            const sessionLabel = plan ? `${plan.dayOfWeek} ${plan.sessionType}` : `session ${i + 1}`;
            const errMsg = genErr.message || 'Unknown error';
            console.error(`Failed to generate ${sessionLabel} (${i + 1}/${totalSessions}):`, errMsg);
            errors.push({ session: i + 1, sessionType: plan?.sessionType || 'unknown', dayOfWeek: plan?.dayOfWeek || 'unknown', error: errMsg });
            break;
          }
        }
      }

      if (workout) {
        workouts.push(workout);
        // Build summary for subsequent sessions
        previousSessionSummaries.push(buildSessionSummary(workout, i));
      }

      // Sleep between generations to stay within OpenRouter rate limits
      if (i < totalSessions - 1) {
        await sleep(GENERATION_DELAY_MS);
      }
    }

    if (workouts.length === 0) {
      return res.status(500).json({ success: false, error: 'All workout generations failed. Please try again shortly.', errors });
    }

    res.status(201).json({
      success: true,
      partial: errors.length > 0,
      data: {
        programId,
        programPeriod,
        totalSessions,
        generatedCount: workouts.length,
        workouts,
        ...(errors.length > 0 && { errors }),
      },
    });
  } catch (err) {
    console.error('Program generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
