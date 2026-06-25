# Plan: Stroke Variety & Session-Aware Workout Generation

## Problem
Workout generation only uses `primaryEvents[0]` and generates each session independently, causing repetitive/stroke-biased workouts (e.g., mostly butterfly).

## Changes

### 1. `src/services/workout-ai.js` — Use ALL primary events

**`resolvePrimaryEvent()` → `resolvePrimaryEvents()`**
- Return the full `primaryEvents` array instead of just `[0]`
- When `customization.stroke` is set, still return a single synthetic event
- Export the new function name

**`buildInsightsPrompt()`**
- Change `distance` from single event to all events: `"100m freestyle, 200m backstroke"`
- This makes the RAG query retrieve insights for ALL events

**`buildWorkoutPrompt()`**
- Change the events line from single event to: `- Events: 50m butterfly, 100m freestyle, 200m backstroke`
- Add `trainingFocus` array to the profile section
- Add new section: `## Stroke Distribution Guidelines`:
  - "The swimmer trains for these events: [all events listed]"
  - "You MAY combine multiple events in a single workout when the training concept aligns (e.g., butterfly sprint + freestyle sprint in the same session)"
  - "You MAY dedicate a session to a single event when appropriate (e.g., technique-focused session)"
  - "Use the trainingFocus to decide: speed/sprint workouts pair well across strokes; distance/endurance workouts should match the target event"
- Update the system prompt to note all valid strokes the swimmer trains

**`hashInsightsPrompt()`**
- Include all events in the cache key hash

### 2. `src/routes/api/workouts.js` — Pass past session summaries & competition context

**Program generation loop (line ~462)**
- After each `generateWorkout()` call, build a compact summary of the generated workout
- Pass accumulated summaries into the next iteration's `sessionCustomization` as `previousSessionSummaries`
- Summarize: strokes used, muscle groups targeted, total distance, workoutType

**`buildSessionSummary(workout)` — new helper**
- Returns a compact string like: `"Session 1: speed, butterfly+freestyle, 2400m, gym: chest+back+shoulders"`
- Strips PII, focuses on training-relevant details

**Competition taper**
- At the top of the program generation, check `profile.trainingSchedule.competitionDates`
- If a session's date falls within 14 days of a competition start date, add `taper: true` and the competition `label`/`date` to customization
- Instead of hardcoding taper rules, query the knowledge base: add a second RAG call in `buildInsightsPrompt()` (or a separate call) for `"taper training principles for [event] competition preparation"` when `customization.taper` is true
- The notebook's taper/scientific competition-prep sources inform the LLM with evidence-based protocols (volume reduction %, intensity targets, race-pace work, rest intervals) — much better than a hardcoded rule
- Pass the taper insights into the LLM prompt as `"## Competition Taper Insights"` ahead of the workout generation, so the AI builds the session following the notebook's science

### 3. `src/services/workout-ai.js` — New prompt sections

**Past Session Context**
- When `customization.previousSessionSummaries` is present, add a `## Previous Sessions in This Program` section listing them
- Instruction: "Design this workout to complement the previous sessions above. Avoid repeating the same sets, strokes, or exercises. If a previous session focused on sprint butterfly, consider focusing this session on a different event or training focus."

**Training Focus + Event Alignment**
- When building the prompt, cross-reference `trainingFocus` with `primaryEvents` to suggest smart pairings
- E.g., if focus is "speed" and events are ["butterfly", "freestyle"], emphasize sprint work across both

### 4. Export updates

- `workout-ai.js` exports updated: `resolvePrimaryEvents` (replaces `resolvePrimaryEvent`)
- `workout-generator.js` imports updated accordingly

## Files Changed
| File | Changes |
|------|---------|
| `src/services/workout-ai.js` | Core logic: all events, stroke distribution, training focus weighting, competition taper, past session context |
| `src/routes/api/workouts.js` | Build session summaries, pass to next iteration, competition taper detection |
| `src/services/workout-generator.js` | Import `resolvePrimaryEvents` instead of `resolvePrimaryEvent` |

## Not Changed
- Workout model schema (no schema changes needed)
- Swimmer profile schema
- Tests (existing tests don't test the AI-dependent paths; we'll verify manually)

## Verification
- Run the existing test suite: `npx jest tests/unit/workout-generator.test.js`
- Manual integration test: generate a weekly program with a profile that has multiple primary events (e.g., butterfly + freestyle + backstroke) and verify the workouts show variety across sessions
