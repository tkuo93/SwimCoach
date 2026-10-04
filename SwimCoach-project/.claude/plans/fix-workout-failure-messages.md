# Plan: Fix False Failure Messages in Workout Generation

## Problem
When all workouts generate successfully (generatedCount === totalSessions), users still see failure messages. The root cause is that a "successful" generation can produce a workout document with empty content (empty `mainSet` arrays, empty `warmUp.description`), which renders as "No structured workout generated" in the card component — even though the API returned `success: true`.

## Three Failure Scenarios

1. **`app.js` `generateWorkout()` (lines 1286-1292):** Shows partial warning toast when `result.data.partial === true`. Backend sets `partial: errors.length > 0`, which only happens when some workouts fail — correct behavior. BUT: a workout with empty content is treated as a success by the backend (it gets saved), so no error is recorded, and the user sees "No structured workout generated" in the card with no generation error message.

2. **`index.html` `generateWeek()` (lines 1582-1602):** Does NOT check `partial` or compare counts at all. Blindly shows "Done!" even when some workouts failed silently.

3. **`index.html` `genNewWorkout()` (lines 2198-2208):** Generates single workout, shows success alert. If the workout has empty content, the card shows "No structured workout generated" with no prior warning.

## Fix Strategy

### Fix 1: Backend — Treat empty-content workouts as failures
**File:** `src/routes/api/workouts.js`, `generateWorkoutsParallel` function (line 523)

Change the success check from:
```javascript
if (result.status === 'fulfilled' && result.value) {
```
to validate that the workout has actual content:
```javascript
if (result.status === 'fulfilled' && result.value && hasWorkoutContent(result.value)) {
```

Where `hasWorkoutContent` checks if the workout has meaningful pool or gym content:
```javascript
function hasWorkoutContent(workout) {
  const pool = workout.poolWorkout || {};
  const gym = workout.gymWorkout || {};
  const hasPoolContent = pool.mainSet?.length > 0 || pool.warmUp?.description || pool.coolDown?.description;
  const hasGymContent = gym.mainSet?.length > 0 || gym.warmUp?.description || gym.coolDown?.description;
  return hasPoolContent || hasGymContent;
}
```

This ensures that if `generatedCount === totalSessions`, ALL workouts have real content. If any workout has empty content, it's counted as an error, making `partial: true` and showing the partial warning.

### Fix 2: Frontend `app.js` — Defensive count comparison  
**File:** `public/js/app.js`, line 1286

Add explicit count comparison to the partial check:
```javascript
if (result.data.partial && generated < total) {
```
This is defensive — redundant with the backend change but makes the intent explicit.

### Fix 3: Frontend `index.html` `generateWeek()` — Add partial checking
**File:** `public/index.html`, lines 1585-1596

After checking `res.success`, add:
```javascript
if (res.data.partial || (res.data.generatedCount && res.data.generatedCount < res.data.totalSessions)) {
  const generated = res.data.generatedCount || res.data.workouts.length;
  const total = res.data.totalSessions;
  const failed = total - generated;
  showToast(`Generated ${generated}/${total} workouts. ${failed} failed. Try regenerating.`, 'warning');
}
```
Then proceed with the success path (it already handles partial by using whatever workouts were returned).

### Fix 4: Frontend `index.html` `genNewWorkout()` — Validate single workout content
**File:** `public/index.html`, lines 2198-2208

After checking `res.success && res.data`, add content validation:
```javascript
if(res.success && res.data) {
  const hasPoolContent = res.data.poolWorkout?.mainSet?.length > 0 || res.data.poolWorkout?.warmUp?.description;
  const hasGymContent = res.data.gymWorkout?.mainSet?.length > 0 || res.data.gymWorkout?.warmUp?.description;
  if (!hasPoolContent && !hasGymContent) {
    alert('Failed to generate a structured workout. Please try again.');
    showScreen('s-empty');
    return;
  }
  // existing success path
}
```

### Fix 5: `components.js` — Better "No structured workout" message
**File:** `public/js/components.js`, lines 124-143

Enhance the empty workout message to suggest specific actions:
```html
<h3>Incomplete workout generated</h3>
<p>The AI coach generated this workout but it's missing structured content. Try regenerating or adjusting your preferences.</p>
<button onclick="regenerateWorkout('${w._id}')">Regenerate</button>
```

## Implementation Order
1. Fix 1 (backend) — highest impact, affects all generation paths
2. Fix 2 (app.js) — aligns frontend with backend
3. Fix 3 (index.html generateWeek) — closes the gap in legacy path
4. Fix 4 (index.html genNewWorkout) — handles single workout edge case
5. Fix 5 (components.js) — improves UX for already-saved empty workouts
