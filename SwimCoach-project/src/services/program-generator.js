/**
 * Program (multi-session) workout generation service.
 *
 * Extracted from routes/api/workouts.js to be callable both from the HTTP
 * route handler and the background weekly auto-generation scheduler.
 */

const { generateWorkout } = require('./workout-generator');
const { getFeedbackSummary } = require('./memory');
const { getCoachingObservations, getAllNotebookNotes } = require('./workout-ai');

const TAPER_WINDOW_DAYS = 14;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Constants ─────────────────────────────────────────────────────────

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_TO_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const VALID_FOCUSES = new Set(['sprint', 'distance', 'technique', 'endurance', 'speed', 'maintenance', 'lactate', 'resistance-power', 'mobility', 'recovery']);

// ─── Helpers ─────────────────────────────────────────────────────────────

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
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build a predicted session summary based on planned workout parameters.
 * This allows parallel generation while maintaining the "informed by previous sessions" feature.
 * The summary format: "Session N: [type], [strokes], [distance]m, gym: [muscle groups]"
 */
function buildPredictedSessionSummary(workoutType, sessionIndex, sessionType, profile, customization) {
  const parts = [`Session ${sessionIndex + 1}: ${workoutType}`];

  const events = profile.goals?.primaryEvents || [];
  if (events.length > 0) {
    if (customization.stroke && customization.stroke !== 'any') {
      parts.push(customization.stroke);
    } else {
      const strokes = events.map(e => e.stroke).filter((v, i, a) => a.indexOf(v) === i);
      parts.push(strokes.join('+'));
    }
  }

  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const baseDistance = workoutType === 'endurance' || workoutType === 'distance' ? 3500
    : workoutType === 'recovery' || workoutType === 'mobility' ? 2000
    : 2800;
  const estimatedDistance = Math.round(baseDistance * (duration / 60));
  parts.push(`${estimatedDistance}m`);

  if (sessionType === 'gym' || sessionType === 'both') {
    const focusToMuscles = {
      'resistance-power': 'legs+core',
      'speed': 'full-body',
      'endurance': 'core+legs',
      'technique': 'shoulders+core',
      'lactate': 'legs+full-body',
      'sprint': 'legs+core',
      'mobility': 'full-body',
      'recovery': 'core'
    };
    const muscles = focusToMuscles[workoutType] || 'full-body';
    parts.push(`gym: ${muscles}`);
  }

  return parts.join(', ');
}

/**
 * Check if a workout has meaningful structured content (not just an empty shell).
 * A workout with empty mainSet arrays and no descriptions is treated as a failure.
 */
function hasWorkoutContent(workout) {
  const pool = workout.poolWorkout || {};
  const gym = workout.gymWorkout || {};
  const hasPoolContent = pool.mainSet?.length > 0 || pool.warmUp?.description || pool.coolDown?.description;
  const hasGymContent = gym.mainSet?.length > 0 || gym.warmUp?.description || gym.coolDown?.description;
  return hasPoolContent || hasGymContent;
}

/**
 * Generate multiple workouts in parallel for a program.
 * All workouts share the same programContext (pre-fetched notes, feedback, observations).
 * Each workout gets its own workoutType and programIndex.
 * Previous session summaries are pre-computed from the plan to enable parallel generation.
 */
async function generateWorkoutsParallel(profile, sessionCustomizations, programContext, maxRetries = 2) {
  const STAGGER_DELAY_MS = 500;

  const promises = sessionCustomizations.map((customization, index) => {
    return (async () => {
      if (index > 0) {
        await sleep(index * STAGGER_DELAY_MS);
      }

      let workout = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          workout = await generateWorkout(profile, customization, { mode: 'direct', programContext });
          break;
        } catch (genErr) {
          const isRateLimited = genErr.message?.includes('429') || genErr.status === 429 || genErr.statusCode === 429;
          const isRetryable = isRateLimited || genErr.message?.includes('truncated') || genErr.message?.includes('JSON parse') || genErr.message?.includes('No response from OpenRouter');
          if (isRetryable && attempt < maxRetries) {
            const backoffMs = 500 * Math.pow(2, attempt);
            console.warn(`Retry ${attempt + 1}/${maxRetries} for workout ${index + 1} in ${backoffMs}ms: ${genErr.message}`);
            await sleep(backoffMs);
            continue;
          } else {
            throw genErr;
          }
        }
      }
      return workout;
    })();
  });

  const results = await Promise.allSettled(promises);

  const workouts = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value && hasWorkoutContent(result.value)) {
      workouts.push({ ...result.value, programIndex: index });
    } else {
      errors.push({
        session: index + 1,
        error: result.reason?.message || result.value ? 'Workout generated but has no structured content' : (result.reason?.message || 'Unknown error')
      });
    }
  });

  return { workouts, errors };
}

/**
 * Build a compact summary of a generated workout for context in subsequent sessions.
 * Format: "Session N: [type], [strokes], [distance]m, gym: [muscle groups]"
 */
function buildSessionSummary(workout, sessionIndex) {
  const parts = [`Session ${sessionIndex + 1}: ${workout.workoutType || 'mixed'}`];

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

  if (workout.poolWorkout?.totalDistance) {
    parts.push(`${workout.poolWorkout.totalDistance}m`);
  }

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

// ─── Core API ────────────────────────────────────────────────────────────

/**
 * Generate a weekly or monthly program of workouts.
 *
 * @param {Object} profile        - SwimmerProfile Mongoose document
 * @param {Object} customization  - Optional overrides (programPeriod, weekStartOffset, workoutType, etc.)
 * @param {Object} opts           - Optional context
 * @returns {Promise<Object>}     - { programId, programPeriod, totalSessions, generatedCount, workouts, errors }
 */
async function generateWeeklyProgram(profile, customization = {}, opts = {}) {
  const {
    programPeriod = 'weekly',
    sessionsPerWeek,
    weekStartOffset = 0,
    ...rest
  } = customization;

  if (!programPeriod || programPeriod === 'single') {
    throw new Error('programPeriod must be weekly or monthly');
  }

  // ── Determine workout type per session from profile's training foci ──
  const baseFoci = (() => {
    if (rest.workoutType) return [];
    const tf = profile.goals?.trainingFocus;
    const foci = Array.isArray(tf) ? tf : (tf ? [tf] : []);
    const filtered = foci.filter(f => VALID_FOCUSES.has(f));
    return filtered.length > 0 ? filtered : ['endurance'];
  })();

  // ── Build weekly schedule from profile's pool/gym days ──
  const customPoolDays = Array.isArray(rest.poolDays) && rest.poolDays.length > 0 ? rest.poolDays.map(d => d.toLowerCase()) : null;
  const customGymDays = Array.isArray(rest.gymDays) && rest.gymDays.length > 0 ? rest.gymDays.map(d => d.toLowerCase()) : null;
  const poolDays = (customPoolDays || profile.trainingSchedule?.poolDays || []).map(d => d.toLowerCase());
  const gymDays = (customGymDays || profile.trainingSchedule?.gymDays || []).map(d => d.toLowerCase());

  const hasSchedule = poolDays.length > 0 || gymDays.length > 0;

  let weeklyPattern = [];
  if (hasSchedule) {
    for (const day of DAY_ORDER) {
      if (poolDays.includes(day)) weeklyPattern.push({ dayOfWeek: day, sessionType: 'pool' });
      if (gymDays.includes(day)) weeklyPattern.push({ dayOfWeek: day, sessionType: 'gym' });
    }
  }

  if (rest.sessionType === 'pool' || rest.sessionType === 'gym') {
    weeklyPattern = weeklyPattern.filter(s => s.sessionType === rest.sessionType);
  }

  const perWeek = sessionsPerWeek
    || (hasSchedule ? weeklyPattern.length : (profile.trainingSchedule?.weeklyPoolSessions || 3));
  const totalWeeks = programPeriod === 'monthly' ? 4 : 1;
  const totalSessions = perWeek * totalWeeks;

  // ── Compute the calendar date for each session ──
  const sessionPlan = [];
  if (hasSchedule && weeklyPattern.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDayOfWeek = today.getDay();
    const mondayOffset = todayDayOfWeek === 0 ? -6 : 1 - todayDayOfWeek;
    const targetMonday = new Date(today);
    targetMonday.setDate(targetMonday.getDate() + mondayOffset + weekStartOffset);

    for (let week = 0; week < totalWeeks; week++) {
      for (const slot of weeklyPattern) {
        const weekStart = new Date(targetMonday);
        weekStart.setDate(weekStart.getDate() + week * 7);
        const date = nextDateForDay(slot.dayOfWeek, weekStart);
        sessionPlan.push({ date, sessionType: slot.sessionType });
      }
    }
  }

  const programId = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const sessionTypes = (() => {
    if (rest.workoutType) return Array(totalSessions).fill(rest.workoutType);
    const types = [];
    for (let week = 0; week < totalWeeks; week++) {
      const shuffled = seededShuffle(baseFoci, `${programId}-week-${week}`);
      for (let s = 0; s < perWeek; s++) {
        types.push(shuffled[s % shuffled.length]);
      }
    }
    return types;
  })();

  const competitionDates = profile.trainingSchedule?.competitionDates || [];

  // ── Hoist expensive, session-independent lookups ──
  const startTime = Date.now();
  const feedbackSummary = await getFeedbackSummary(10, profile._id);
  const coachingObservations = await getCoachingObservations(profile._id);
  const baseWorkoutType = rest.workoutType
    || (Array.isArray(profile.goals?.trainingFocus) ? profile.goals.trainingFocus[0] : profile.goals?.trainingFocus)
    || 'endurance';
  const notebookNotes = await getAllNotebookNotes(`${baseWorkoutType} training for swimmers`, rest);
  console.log(`Program context loaded in ${Date.now() - startTime}ms (notes: ${notebookNotes ? 'hit' : 'miss'})`);

  // ── Build all session customizations with PREDICTED previous summaries ──
  const sessionCustomizations = [];
  const predictedSummaries = [];
  for (let i = 0; i < totalSessions; i++) {
    const plan = sessionPlan[i];
    const sessionDate = plan ? plan.date : new Date();
    const taperInfo = checkTaper(sessionDate, competitionDates);

    const predictedSummary = buildPredictedSessionSummary(
      sessionTypes[i],
      i,
      plan ? plan.sessionType : (rest.sessionType || 'both'),
      profile,
      rest
    );
    predictedSummaries.push(predictedSummary);

    const sessionCustomization = {
      ...rest,
      workoutType: sessionTypes[i],
      programIndex: i,
      totalSessions,
      programPeriod,
      programId,
      useHighVolumeRoute: true,
      ...(plan ? { date: plan.date } : {}),
      sessionType: plan
        ? (rest.sessionType === 'pool' || rest.sessionType === 'gym'
            ? rest.sessionType
            : plan.sessionType)
        : (rest.sessionType || 'both'),
      ...(i > 0 ? { previousSessionSummaries: predictedSummaries.slice(0, i) } : {}),
      ...(taperInfo.taper
        ? {
            taper: true,
            competitionLabel: taperInfo.competitionLabel,
            competitionDate: taperInfo.competitionDate,
          }
        : {}),
    };
    sessionCustomizations.push(sessionCustomization);
  }

  // ── Generate all workouts IN PARALLEL ──
  const programContext = { feedbackSummary, coachingObservations, notebookNotes };
  const { workouts: generatedWorkouts, errors } = await generateWorkoutsParallel(
    profile,
    sessionCustomizations,
    programContext,
    2
  );

  generatedWorkouts.sort((a, b) => a.programIndex - b.programIndex);

  console.log(`Program generation complete: ${generatedWorkouts.length}/${totalSessions} workouts, errors: ${errors.length}`);

  return {
    programId,
    programPeriod,
    totalSessions,
    generatedCount: generatedWorkouts.length,
    workouts: generatedWorkouts,
    ...(errors.length > 0 && { errors }),
  };
}

module.exports = {
  generateWeeklyProgram,
  generateWorkoutsParallel,
  buildPredictedSessionSummary,
  hasWorkoutContent,
  checkTaper,
  buildSessionSummary,
  seededShuffle,
  nextDateForDay,
};
