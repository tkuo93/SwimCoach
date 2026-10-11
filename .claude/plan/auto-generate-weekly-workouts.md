# Plan: Auto-Generate Weekly Workouts

## Goal
A day before the beginning of a new week (i.e., on Sunday for a Monday-start week), check if the swimmer has any workouts planned for the upcoming week. If not, generate a week's worth of workouts using their default profile settings.

## Approach: On-Demand Weekly Check (Chosen)

Because the app runs on Render free tier with `min_machines_running: 0` (sleeps when idle), an in-process cron won't fire reliably. Instead, we attach a lightweight check to the existing `GET /api/workouts` endpoint — the first authenticated API call each week triggers the check for that user.

**Why `GET /api/workouts`:** It's already authenticated, already called on app load (`public/js/api.js` fetches workouts on dashboard/history load). No extra infra needed.

### Daily Check Logic

1. **When does the check run?**
   - On every authenticated `GET /api/workouts` call
   - A per-process in-memory guard (`Map` of `swimmerId → ISO week key`) ensures we only run the check **once per user per ISO week** (not on every API call — the endpoint is called frequently)

2. **How do we determine "upcoming week"?**
   - Week starts on Monday
   - If today is **Sunday**: target the *upcoming week* (next Monday–Sunday), use `weekStartOffset: 1`
   - If today is **Monday–Saturday**: target the *current week* (this Monday–Sunday), use `weekStartOffset: 0`
   - This ensures the user gets workouts even if they didn't open the app on Sunday

3. **How do we check "no workouts for that week"?**
   - Query `Workout.countDocuments({ swimmerId, date: { $gte: weekStart, $lt: weekEnd } })`
   - If the count is 0, proceed to generate

4. **How do we generate?**
   - Call the extracted `generateWeeklyProgram(profile, { programPeriod: 'weekly', weekStartOffset })`
   - Uses profile defaults (no user customization) — "default generations"

## Implementation Steps

### Step 1: Extract program generation into a reusable service function

**File:** `src/services/workout-scheduler.js` (new file)

Create a function `checkAndGenerateUpcomingWeek(profile, swimmerId)` that:
- Computes the upcoming Monday-Sunday date range
- Queries for existing workouts in that range
- If zero workouts, calls the program generation logic with `weekStartOffset: 1`
- Logs results, swallows errors (so a failed generation doesn't break the API)

Also extract the core program generation logic from `routes/api/workouts.js` into `src/services/program-generator.js` so it can be called both from the HTTP handler and the scheduler. This avoids duplicating 300+ lines.

**File:** `src/services/program-generator.js` (new file)
- Move `generateWorkoutsParallel`, `buildPredictedSessionSummary`, `hasWorkoutContent`, `checkTaper`, `DAY_ORDER`, `DAY_TO_NUM`, `nextDateForDay`, `seededShuffle` out of the route file into this module
- Export a single `generateWeeklyProgram(profile, customization, opts)` function
- The existing `POST /api/workouts/generate/program` route handler calls this function

### Step 2: Add the scheduler check to the workouts list endpoint

**File:** `src/routes/api/workouts.js`

In `GET /` (line 85), after fetching and returning workouts:
```js
// Trigger weekly auto-generation check (runs at most once per user per day)
if (req.user._id.toString()) {
  setImmediate(async () => {
    await checkAndGenerateUpcomingWeek(req.user._id.toString());
  });
}
```

Using `setImmediate` so it doesn't delay the response. The check is fire-and-forget.

### Step 3: In-memory daily guard

**File:** `src/services/workout-scheduler.js`

```js
// In-memory cache: swimmerId -> last check date (YYYY-MM-DD)
const lastCheckCache = new Map();

async function checkAndGenerateUpcomingWeek(swimmerId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().split('T')[0];

  // Only run once per day per swimmer
  if (lastCheckCache.get(swimmerId) === todayKey) {
    return;
  }
  lastCheckCache.set(swimmerId, todayKey);

  const profile = await SwimmerProfile.findById(swimmerId);
  if (!profile) return;

  // Only check on Sundays (day before Monday-start week)
  const dayOfWeek = today.getDay(); // 0 = Sunday
  if (dayOfWeek !== 0) return;

  // Compute upcoming Monday
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + 1);
  nextMonday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  // Check if any workouts exist for next week
  const existingCount = await Workout.countDocuments({
    swimmerId,
    date: { $gte: nextMonday, $lt: new Date(nextSunday.getTime() + 24 * 60 * 60 * 1000) },
  });

  if (existingCount === 0) {
    console.log(`Auto-generating weekly program for swimmer ${swimmerId}`);
    const { generateWeeklyProgram } = require('../services/program-generator');
    await generateWeeklyProgram(profile, { programPeriod: 'weekly', weekStartOffset: 1 });
    console.log(`Auto-generation complete for swimmer ${swimmerId}`);
  }
}
```

### Step 4: Update the program route to use the extracted service

**File:** `src/routes/api/workouts.js`

Simplify `POST /generate/program` to call the extracted `generateWeeklyProgram` function, removing the ~250 lines of inline logic that was moved to the service.

### Step 5: Tests

**File:** `tests/workout-scheduler.test.js` (new file)

- Test `checkAndGenerateUpcomingWeek` skips non-Sunday days
- Test it skips if workouts already exist for next week
- Test it triggers generation when no workouts exist (mock the generator)
- Test the daily guard prevents duplicate runs

## Files to Create/Modify

| File | Action |
|---|---|
| `src/services/program-generator.js` | **Create** — extracted program generation logic |
| `src/services/workout-scheduler.js` | **Create** — weekly check logic |
| `src/routes/api/workouts.js` | **Modify** — route calls extracted service; GET `/` triggers scheduler |
| `tests/workout-scheduler.test.js` | **Create** — scheduler tests |
| `tests/program-generator.test.js` | **Create** — extracted logic tests |

## Trade-offs & Notes

- **In-memory guard**: If the server restarts, the guard is lost and the check could run twice in a day. Acceptable — generation is idempotent per week, and the `existingCount === 0` check prevents duplicate weeks.
- **Sunday-only check**: Hardcodes Sunday as the trigger day. Could be made configurable via `profile.trainingSchedule` if needed later.
- **No user notification**: The generated workouts appear in the History/Today views automatically. Could add a toast notification on the frontend when new auto-generated workouts appear (nice-to-have, not blocking).
- **Render free tier wake-up**: When the server sleeps, the first `GET /api/workouts` after wake-up runs the check. If that happens to be after Sunday, the check is missed for that week (the `dayOfWeek !== 0` guard). Mitigation: broaden the check to "Sunday OR if we haven't checked this week." For v1, Sunday-only is acceptable — users who load the app on or after Sunday get their week pre-filled.
