# PRD Update Plan — 2026-06-06

## Decisions
- MEMORY.md location: `SwimCoach-project/MEMORY.md` (project root)
- Debug mode: visible in nav as `#debug` route
- Comprehensive program: basic implementation (generate N sequential workouts)
- Pool length: change from Number to String enum (`25m`, `50m`, `scy`, `scm`, `lcm`)
- Profile editing: add edit capability to existing profile page/form
- Knowledge source ingestion: manual via Open Notebook UI (no SwimCoach UI needed)
- Open Notebook notes: SwimCoach system accesses both sources AND notes from the notebook
- Authentication: not needed yet

---

## Phase 1: Data Model & Profile ✅ COMPLETED

- [x] Task 1: Update SwimmerProfile model — distances (add 500/1650), poolLength (string enum), goal outcomes array, days-of-week in trainingSchedule
- [x] Task 2: Update Workout model — add "mobility" to workoutType enum; constrain muscleGroup to arms/legs/core
- [x] Task 3: Update customization options endpoint — mobility type, bands/sliders gym equipment, 500/1650 distances, pool length string options, distances/strokes/goalOutcomes/daysOfWeek config
- [x] Task 4: Update profile form UI — multi-select events, goal outcomes checkboxes, day-of-week toggles, best times manager, updated distance/pool/equipment options
- [x] Task 5: Add profile edit mode — edit button on profile card, enterEditMode/exitEditMode, PUT endpoint, edit mode banner, cancel button
- [x] Task 6: Update profile form JS — collect/submit new fields, best times CRUD, days of week, event rows
- [x] Task 7: Update generate form UI — mobility workout type (via API), bands/sliders equipment (via API), updated pool length options
- [x] Task 8: Update CSS — edit mode banner, events container, day toggles, best times rows, profile card actions, history page, debug page, responsive styles

---

## Phase 2: MEMORY.md Feedback Loop ✅ COMPLETED

- [x] Task 9: Create MEMORY.md file in project root with initial structure
- [x] Task 10: Add MEMORY.md service (`src/services/memory.js`) — read, append, parseEntries, getFeedbackSummary, deriveLearning
- [x] Task 11: Update workout feedback endpoint — write to MEMORY.md after saving to DB (non-blocking)
- [x] Task 12: Update workout-ai.js — read MEMORY.md via getFeedbackSummary, include past feedback in generation prompt, accept custom llmModel param, export buildInsightsPrompt/buildWorkoutPrompt for debug
- [x] Task 13: Add MEMORY.md API endpoints — GET /api/memory (read), GET /api/memory/summary (condensed), POST /api/memory (append)

---

## Phase 3: Comprehensive Program & Workout Editing ✅ COMPLETED

- [x] Task 14: Add comprehensive program generation — POST /api/workouts/generate/program with programId, generates N sequential workouts
- [x] Task 15: Update generate form JS — handle program period selection, call program endpoint, navigate to history
- [x] Task 16: Add workout history page to index.html — list of workout cards with date/type filters
- [x] Task 17: Add history page JS — fetch/display workout list with type + period filters, navigate to detail
- [x] Task 18: Add edit workout capability — PUT /api/workouts/:id endpoint for direct edits
- [x] Task 19: Add CSS for history page and edit mode (history cards, filters, debug prompts)

---

## Phase 4: Test & Debug Mode ✅ COMPLETED

- [x] Task 20: Add debug page to index.html — profile selector, LLM selector (with custom input), prompt viewer, test generation
- [x] Task 21: Add debug page JS — switch LLMs, test generation, view prompts used
- [x] Task 22: Add debug API endpoints — GET /api/debug/profiles, GET /api/debug/prompts (uses actual prompt builders)
- [x] Task 23: Update workout-ai.js — accept custom LLM model parameter from debug mode
- [x] Task 24: Add CSS for debug page (debug prompts viewer with dark code blocks)

---

## Phase 5: Testing & Verification ✅ COMPLETED

- [x] Task 25: Update unit tests for customization options
- [x] Task 26: Add unit tests for MEMORY.md service (`tests/unit/memory-service.test.js` — 16 tests)
- [x] Task 27: Add unit tests for updated profile model validation (`tests/unit/profile-model.test.js` — 15 tests)
- [x] Task 28: Add unit tests for debug endpoints (`tests/unit/debug-route.test.js` — 7 tests)
- [x] Task 29: Run full test suite — all 152 unit tests passing
- [x] Task 30: Manual E2E verification

---

## Phase 6: PRD Gap Remediation ✅ COMPLETED

### 6a: Comprehensive Program Viewing
- [x] Added `programId` field to Workout model (indexed, nullable string)
- [x] Updated program generation to assign shared `programId` to all workouts in a program
- [x] Added `GET /api/workouts/program/:programId` endpoint — returns program metadata + all workouts sorted by programIndex
- [x] Added program view page (`#program/:programId`) — shows all sessions in a program with view/edit per session
- [x] Updated history cards to show "Program" badge and "View Program" button for program workouts
- [x] Added `api.workouts.getProgram()` to API client
- [x] Added CSS for program page (session cards, program badge, actions)

### 6b: Open Notebook Notes Access
- [x] Enhanced `workout-ai.js` — `getTrainingInsights()` now uses the full `open-notebook.js` `query()` function (SSE streaming RAG) instead of only the simple REST endpoint
- [x] Added `getNotebookNotes(notebookId, topic)` — fetches notes from a specific notebook via `GET /api/notebooks/{id}/notes`
- [x] Added `getAllNotebookNotes(topic)` — fetches general notes via `GET /api/notes?topic=...`
- [x] Updated `generateWorkout()` to fetch notebook notes and pass them to the prompt
- [x] Added "Notebook Notes" section to the LLM generation prompt with context about using notes to inform workout design
- [x] All note fetching is graceful — returns empty string if endpoints unavailable

### 6c: Competition Timeline
- [x] Added competition timeline date picker to profile form (`<input type="date" id="competitionTimeline">)
- [x] Updated `collectProfileFormData()` to include `competitionTimeline` in goals
- [x] Updated `fillProfileForm()` to load competition timeline when editing

---

## Test Results

```
Test Suites: 7 passed, 7 total
Tests:       152 passed, 152 total
```
