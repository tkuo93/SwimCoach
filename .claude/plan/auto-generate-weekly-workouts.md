# Plan: Auto-Generate Weekly Workouts

## Goal
Every time a user loads their workouts (GET /api/workouts), check if they have workouts planned for the **upcoming week** (next Monday–Sunday). If there are no workouts, generate a full week's program using the profile's schedule (pool days + gym days). If there are some workouts, fill in only the missing schedule days.

## Approach: On-Demand Weekly Check

The app runs on Render free tier with `min_machines_running: 0` (sleeps when idle), so an in-process cron won't fire reliably. Instead, we attach a lightweight check to the existing authenticated `GET /api/workouts` call — the first interaction each week triggers the check for that user.

### Weekly Check Logic

1. **When does the check run?**
   - On every authenticated `GET /api/workouts` call
   - A per-process in-memory guard (`Map` of `swimmerId → ISO week key of the TARGET week`) ensures we only run the check **once per user per target ISO week**

2. **What week do we check?**
   - **Always the upcoming week** (next Monday–Sunday), regardless of today's day
   - This means on Monday, we still generate for next Monday–Sunday, not the current week
   - `weekStartOffset` is always `1` (passed to the program generator)

3. **How do we check "no workouts for that week"?**
   - Query `Workout.countDocuments({ swimmerId, date: { $gte: nextMonday, $lt: nextSunday + 1day } })`
   - If the count is 0, generate a full week
   - If the count > 0, fetch existing dates and pass them as `existingDates` so the generator skips slots that already have workouts

4. **How do we generate?**
   - Call `generateWeeklyProgram(profile, { programPeriod: 'weekly', weekStartOffset: 1, existingDates }, { refDate: now })`
   - The generator reads `profile.trainingSchedule.poolDays` and `gymDays` to build the weekly pattern
   - For each scheduled day, if no existing workout exists, it generates a workout via `generateWorkout` (which saves to DB)

## Key Design Decisions

- **Always next week**: The requirement explicitly says "next week." On any day (Mon–Sun), we target the upcoming Monday–Sunday week. This avoids generating workouts for days that have already passed.
- **ISO week guard on target week**: The cache key is the ISO week of the *target* week (next Monday's ISO week), not today's ISO week. This prevents duplicate checks when the user loads the app on both Sunday and Monday — both target the same upcoming week.
- **Partial fill-in**: When some workouts exist for the target week, `existingDates` is passed so only missing days are generated. The generator compares dates using local date strings (`en-CA`) to avoid timezone mismatches.

## Files

| File | Action |
|---|---|
| `src/services/program-generator.js` | Extracted program generation logic (shared by scheduler and HTTP route) |
| `src/services/workout-scheduler.js` | Weekly check logic — always targets upcoming week |
| `src/routes/api/workouts.js` | Route calls scheduler via `setImmediate` after `GET /` returns |
| `tests/unit/workout-scheduler.test.js` | Scheduler tests (25 tests) |
| `tests/unit/program-generator.test.js` | Extracted logic tests (38 tests) |
