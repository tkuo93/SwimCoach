/**
 * Weekly auto-generation scheduler.
 *
 * On-demand trigger: when a user loads their workouts (GET /api/workouts), we
 * check if they have workouts planned for the *upcoming week* (next Monday–Sunday).
 * If they have zero workouts, we generate a full week's program. If they have
 * some, we fill in only the missing schedule days.
 *
 * This runs on free-tier hosts (Render/Fly) where in-process cron can't
 * fire reliably because the container sleeps when idle. By piggybacking
 * on the existing authenticated GET /api/workouts call, we ensure the check
 * runs whenever a user interacts with the app.
 */

const Workout = require('../models/Workout');
const SwimmerProfile = require('../models/SwimmerProfile');
const { generateWeeklyProgram } = require('./program-generator');

// ─── In-memory weekly guard ─────────────────────────────────────────────
// swimmerId -> last check week key (YYYY-WW, ISO week of the TARGET week)
// Prevents running the check more than once per user per target ISO week.
// Lost on server restart — acceptable since the actual generation is
// guarded by the "no existing workouts" check.
const lastCheckCache = new Map();

/**
 * Compute the Monday-Sunday date range for the *upcoming* week
 * (next Monday–Sunday), regardless of what day it is today.
 *
 * Always targets next week:
 * - If today is Monday, next week starts the following Monday.
 * - If today is Sunday, next week starts tomorrow (Monday).
 *
 * @param {Date} [refDate] - Reference date (defaults to now)
 * @returns {{ start: Date, end: Date }} - Monday 00:00 to Sunday 23:59:59.999
 */
function getUpcomingWeekRange(refDate) {
  const today = new Date(refDate || new Date());
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Days from today until next Monday (always > 0, so we always go forward).
  // On Monday, (8 - 1) % 7 = 0, so we need || 7 to push to next Monday.
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
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
 * @param {Date} weekStart - Monday of the target week
 * @param {Date} weekEnd - Sunday end of the target week
 * @returns {Promise<number>} - Count of workouts in the week (-1 on error)
 */
async function countWorkoutsInWeek(swimmerId, weekStart, weekEnd) {
  try {
    return await Workout.countDocuments({
      swimmerId,
      date: { $gte: weekStart, $lt: new Date(weekEnd.getTime() + 1) }, // exclusive end
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
 * @param {Date} weekStart - Monday of the target week
 * @param {Date} weekEnd - Sunday end of the target week
 * @returns {Promise<Date[]>} - Array of workout dates in the week (empty on error)
 */
async function getExistingWorkoutDates(swimmerId, weekStart, weekEnd) {
  try {
    const docs = await Workout.find({
      swimmerId,
      date: { $gte: weekStart, $lt: new Date(weekEnd.getTime() + 1) },
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
 * Runs at most once per swimmer per ISO week of the TARGET week (next week).
 *
 * Logic (always targets next week, Mon–Sun):
 *  1. Check the upcoming week (next Monday–Sunday) for existing workouts.
 *  2. If zero workouts, generate a full week.
 *  3. If some exist, fill in only the missing schedule days.
 *
 * @param {string} swimmerId - Mongoose ObjectId as string
 * @param {Date} [now] - Override current time (for testing)
 */
async function checkAndGenerateUpcomingWeek(swimmerId, now) {
  const refDate = new Date(now || new Date());

  // Compute the target week (always next Monday–Sunday)
  const { start: weekStart, end: weekEnd } = getUpcomingWeekRange(refDate);

  // Weekly guard — prevent duplicate runs within the same target ISO week.
  // We key the cache on the ISO week of the *target* week, not today,
  // so Sunday and Monday both targeting the same upcoming week are guarded.
  const weekKey = getISOWeekKey(weekStart);
  if (lastCheckCache.get(swimmerId) === weekKey) {
    return { skipped: true, reason: 'Already checked this week' };
  }
  lastCheckCache.set(swimmerId, weekKey);

  // Fetch profile
  const profile = await SwimmerProfile.findById(swimmerId);
  if (!profile) {
    return { skipped: true, reason: 'Profile not found' };
  }

  // Check for existing workouts in the target (upcoming) week
  const existingCount = await countWorkoutsInWeek(swimmerId, weekStart, weekEnd);
  if (existingCount < 0) {
    return { skipped: true, reason: 'DB query failed' };
  }

  // If workouts exist, fetch their dates so we can fill in only the missing days
  let existingDates = [];
  if (existingCount > 0) {
    existingDates = await getExistingWorkoutDates(swimmerId, weekStart, weekEnd);
    console.log(`[Scheduler] Swimmer ${swimmerId} already has ${existingCount} workout(s) for ${weekStart.toISOString().split('T')[0]} week — filling in missing days`);
  }

  // Generate workouts for the upcoming week
  console.log(`[Scheduler] Generating ${existingCount === 0 ? 'full week' : 'missing days'} for swimmer ${swimmerId} (weekStart: ${weekStart.toISOString().split('T')[0]})`);
  try {
    // weekStartOffset is always 1 (next week), relative to refDate in the generator.
    // Pass refDate so the generator computes the same week range we just computed.
    const result = await generateWeeklyProgram(profile, {
      programPeriod: 'weekly',
      weekStartOffset: 1,
      existingDates: existingDates.map(d => d.toISOString()),
    }, { refDate: refDate });

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
  getUpcomingWeekRange,
  countWorkoutsInWeek,
  getExistingWorkoutDates,
  getISOWeekKey,
  clearCache,
  // Exported for testing
  lastCheckCache,
};
