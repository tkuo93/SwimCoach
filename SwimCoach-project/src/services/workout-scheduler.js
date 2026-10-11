/**
 * Weekly auto-generation scheduler.
 *
 * On-demand trigger: when a user loads their workouts, we check if they
 * have workouts planned for the current week (Monday–Sunday). If they
 * have zero workouts, we generate a full week's program. If they have
 * some, we fill in only the missing schedule days.
 *
 * This runs on free-tier hosts (Render/Fly) where in-process cron can't
 * fire reliably because the container sleeps when idle. By piggybacking
 * on the existing authenticated GET /api/workouts call, we ensure the check
 * runs whenever a user interacts with the app.
 *
 * The "day before a new week" concept is handled as follows:
 *  - On Sunday, we check the *upcoming week* (next Monday–Sunday). If no
 *    workouts exist, we generate them — so the user wakes up Monday to a
 *    full week of workouts.
 *  - On any other day of the week, we check the *current week*. If the
 *    user hasn't opened the app yet that week and has no workouts, we
 *    generate them on demand.
 */

const Workout = require('../models/Workout');
const SwimmerProfile = require('../models/SwimmerProfile');
const { generateWeeklyProgram } = require('./program-generator');

// ─── In-memory weekly guard ─────────────────────────────────────────────
// swimmerId -> last check week key (YYYY-WW, ISO week)
// Prevents running the check more than once per user per ISO week.
// Lost on server restart — acceptable since the actual generation is
// guarded by the "no existing workouts" check.
const lastCheckCache = new Map();

/**
 * Returns true if today is Sunday (the day before a Monday-start week).
 */
function isDayBeforeNewWeek(date) {
  const d = new Date(date || new Date());
  d.setHours(0, 0, 0, 0);
  return d.getDay() === 0; // 0 = Sunday
}

/**
 * Compute the Monday-Sunday date range for a given week.
 * When called on Sunday, returns the *upcoming* week (next Mon–Sun).
 * On any other day, returns the *current* week (this Mon–Sun).
 *
 * @param {Date} [refDate] - Reference date (defaults to now)
 * @returns {{ start: Date, end: Date }} - Monday 00:00 to Sunday 23:59:59.999
 */
function getWeekRange(refDate) {
  const today = new Date(refDate || new Date());
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // On Sunday, target the upcoming week (next Monday).
  // On other days, target the current week (most recent Monday).
  const mondayOffset = dayOfWeek === 0 ? 1 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Get the ISO week key for a date (e.g., "2025-W01").
 * Used as the cache key to prevent duplicate weekly checks.
 */
function getISOWeekKey(date) {
  const d = new Date(date || new Date());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Check if a swimmer has any workouts scheduled in the given week.
 *
 * @param {string} swimmerId - Mongoose ObjectId as string
 * @param {Date} [refDate] - Reference date for computing the week
 * @returns {Promise<number>} - Count of workouts in the week (-1 on error)
 */
async function countWorkoutsInWeek(swimmerId, refDate) {
  const { start, end } = getWeekRange(refDate);
  try {
    return await Workout.countDocuments({
      swimmerId,
      date: { $gte: start, $lt: new Date(end.getTime() + 1) }, // exclusive end
    });
  } catch (err) {
    console.error(`[Scheduler] Failed to count workouts for swimmer ${swimmerId}:`, err.message);
    return -1; // signal error
  }
}

/**
 * Fetch the dates of existing workouts in the given week.
 *
 * @param {string} swimmerId - Mongoose ObjectId as string
 * @param {Date} [refDate] - Reference date for computing the week
 * @returns {Promise<Date[]>} - Array of workout dates in the week (empty on error)
 */
async function getExistingWorkoutDates(swimmerId, refDate) {
  const { start, end } = getWeekRange(refDate);
  try {
    const docs = await Workout.find({
      swimmerId,
      date: { $gte: start, $lt: new Date(end.getTime() + 1) },
    }).select('date -_id').lean();
    return docs.map(d => new Date(d.date));
  } catch (err) {
    console.error(`[Scheduler] Failed to fetch workout dates for swimmer ${swimmerId}:`, err.message);
    return [];
  }
}

/**
 * Main entry point: check whether a swimmer needs an auto-generated weekly program.
 *
 * Called from the authenticated GET /api/workouts route (via setImmediate).
 * Runs at most once per swimmer per ISO week thanks to an in-memory cache.
 *
 * Logic:
 *  - On Sunday: target the upcoming week (offset=1). If zero workouts, generate
 *    full week. If some exist, fill in missing schedule days.
 *  - On Monday–Saturday: target the current week (offset=0). If zero workouts,
 *    generate full week. If some exist, fill in missing schedule days.
 *
 * @param {string} swimmerId - Mongoose ObjectId as string
 * @param {Date} [now] - Override current time (for testing)
 */
async function checkAndGenerateUpcomingWeek(swimmerId, now) {
  // Weekly guard — prevent duplicate runs within the same ISO week
  const weekKey = getISOWeekKey(now);
  if (lastCheckCache.get(swimmerId) === weekKey) {
    return { skipped: true, reason: 'Already checked this week' };
  }
  lastCheckCache.set(swimmerId, weekKey);

  // Fetch profile
  const profile = await SwimmerProfile.findById(swimmerId);
  if (!profile) {
    return { skipped: true, reason: 'Profile not found' };
  }

  // Compute the week to check
  // - On Sunday: check the upcoming week (next Mon–Sun)
  // - On other days: check the current week (this Mon–Sun)
  const isSunday = isDayBeforeNewWeek(now);
  const { start: weekStart } = getWeekRange(now);

  // Determine weekStartOffset for generateWeeklyProgram
  // weekStartOffset is relative to "today" in the program generator:
  //   0 = current week's Monday, 1 = next week's Monday
  // On Sunday, offset 1 targets next Monday (upcoming week).
  // On Monday–Saturday, offset 0 targets this week's Monday (current week).
  const weekStartOffset = isSunday ? 1 : 0;

  // Check for existing workouts in the target week
  const existingCount = await countWorkoutsInWeek(swimmerId, now);
  if (existingCount < 0) {
    return { skipped: true, reason: 'DB query failed' };
  }

  // If workouts exist, fetch their dates so we can fill in only the missing days
  let existingDates = [];
  if (existingCount > 0) {
    existingDates = await getExistingWorkoutDates(swimmerId, now);
    console.log(`[Scheduler] Swimmer ${swimmerId} already has ${existingCount} workout(s) for ${weekStart.toISOString().split('T')[0]} week — filling in missing days`);
  }

  // Generate a default weekly program for the target week
  console.log(`[Scheduler] Generating ${existingCount === 0 ? 'full week' : 'missing days'} for swimmer ${swimmerId} (weekStartOffset: ${weekStartOffset})`);
  try {
    // Pass refDate so the generator's Monday calculation matches our week range.
    // Pass existingDates so the generator skips slots that already have workouts.
    const result = await generateWeeklyProgram(profile, {
      programPeriod: 'weekly',
      weekStartOffset,
      existingDates: existingDates.map(d => d.toISOString()),
    }, { refDate: now });

    console.log(`[Scheduler] Generated ${result.generatedCount}/${result.totalSessions} workouts for swimmer ${swimmerId}`);
    return { generated: true, programId: result.programId, count: result.generatedCount, total: result.totalSessions };
  } catch (err) {
    console.error(`[Scheduler] Failed to generate program for swimmer ${swimmerId}:`, err.message);
    return { error: err.message };
  }
}

/**
 * Clear the in-memory cache. Useful for testing.
 */
function clearCache() {
  lastCheckCache.clear();
}

module.exports = {
  checkAndGenerateUpcomingWeek,
  isDayBeforeNewWeek,
  getWeekRange,
  countWorkoutsInWeek,
  getExistingWorkoutDates,
  getISOWeekKey,
  clearCache,
  // Exported for testing
  lastCheckCache,
};
