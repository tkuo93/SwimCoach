---
name: SwimCoach v3 build plan
description: Phased build plan for the Morning Lap redesign of SwimCoach
metadata:
  type: project
---

# SwimCoach v3 Build Plan — "Morning Lap"

## Key decisions (from owner, 2026-06-27)
- Onboarding collects name + email for unique user identification
- Default landing is today's workout timeline
- Week view shows the full week (past workouts, today, future/rest days)
- History view: list + detail + feedback mechanism (required) + edit/delete capability
- Execute mode: no timer, just set info + coaching notes
- Coach is always one tap away (FAB on every screen)

---

## Codebase context (from existing app)
- Express + MongoDB (Mongoose), serves static files from /public
- SwimmerProfile schema: firstName, lastName, email, phone, dateOfBirth, gender, goals (primaryEvents, outcomes, targetImprovement, trainingFocus), trainingSchedule (weeklyPoolSessions, weeklyGymSessions, sessionDuration, poolDays, gymDays, preferredTimes, competitionDates), equipment (poolLength, poolEquipment, gymEquipment, weightInventory), bestTimes, experienceLevel, healthConsiderations
- Workout schema: swimmerId, workoutName, workoutType, date, duration, intensity, poolWorkout (warmUp, mainSet, coolDown, totalDistance, trainingNotes), gymWorkout, userFeedback (rating, difficultyPerception, enjoyment, quality, accuracy, comments), generationInfo
- API endpoints: /api/profiles (CRUD), /api/workouts (CRUD + /generate + /generate/program + /:id/feedback + /:id/chat + /:id/regenerate), /api/coach/chat, /api/workouts/customize/options, /api/debug (profiles, prompts)
- Auth: X-Swimmer-Id header or swimmerId in body
- Frontend: vanilla JS SPA, served as static files

---

## Phase 1: Conversational Onboarding + API Integration (Days 1-3)
**Goal:** First-time user has a conversation with the coach, profile saved to MongoDB, lands on their first workout

Build:
- Coach avatar + greeting screen
- Question/answer flow (6 steps):
  1. First name + last name (text inputs)
  2. Email (text input) — unique identifier, checked against MongoDB
  3. Primary goal (multi-select pills: improve time, build endurance, maintain fitness, technique)
  4. Primary event (stroke + distance + pool length unit)
  5. Experience level (single select: beginner/intermediate/advanced/elite)
  6. Session duration (number input)
- Optional step: best times, pool/gym sessions per week, equipment, schedule
- Progress dots showing which step they're on
- Each answer appears as a user bubble, coach responds with next question
- On completion: POST to /api/profiles → save to MongoDB → generate workout → redirect to timeline
- Landing page: load profiles from /api/profiles, show as selectable cards
- Profile selection: load profile from /api/profiles/:id, set as active

**API endpoints used:**
- GET /api/profiles — list all profiles (landing page)
- POST /api/profiles — create new profile (onboarding), body maps to SwimmerProfile schema
- GET /api/profiles/:id — load profile for selection
- PUT /api/profiles/:id — update profile (profile edit screen)

**Onboarding maps to schema:**
- firstName, lastName → SwimmerProfile.firstName, lastName
- email → SwimmerProfile.email (unique)
- goal (multi-select) → SwimmerProfile.goals.outcomes (enum: drop-time, build-muscle, lose-weight, maintain, technique)
- event (stroke+distance) → SwimmerProfile.goals.primaryEvents[0]
- level → SwimmerProfile.experienceLevel (enum: beginner, intermediate, advanced, elite)
- duration → SwimmerProfile.trainingSchedule.sessionDuration
- Optional: best times → SwimmerProfile.bestTimes[], pool/gym sessions → trainingSchedule.weeklyPoolSessions/GymSessions

**Exit condition:** User can create profile (saved to MongoDB), see it on landing page on return, and load it

---

## Phase 2: Workout Timeline View (Days 3-4)
**Goal:** Returning user opens the app and sees today's workout as a timeline

Build:
- App load logic: load profile from localStorage, fetch workouts from GET /api/workouts?swimmerId=xxx
- Timeline view with chronological set sections from poolWorkout.mainSet
- Three states per set: done (dimmed + checkmark), active (highlighted coral), upcoming (gray dot)
- Stats row (totalDistance, duration, intensity) as large serif cards
- Overall workout note from trainingNotes
- "Why this workout" collapsible
- Per-set coaching notes from trainingNotes array
- "Start Workout" button → execute view
- "Coach" FAB in top-right

**Exit condition:** User can open the app, see their workout timeline, and navigate to execute mode

---

## Phase 3: Execute Mode (Day 4-5)
**Goal:** User can follow the workout set-by-set with coaching guidance

Build:
- Execute screen shows current set name, send-off/zone, and coaching notes
- No timer — just information relay
- "Next Set" button advances through the timeline
- Sets transition: active set moves to done, next set becomes active
- State tracked in memory (which set is current)
- "← Overview" button returns to timeline
- Coach FAB always accessible

**Exit condition:** User can swim through a workout, seeing only the info they need for each set

---

## Phase 4: Coach Chat (Day 5-6)
**Goal:** User can ask the coach questions with full workout context

Build:
- Coach overlay slides in from right (fixed positioning, not clipped)
- On open: automatically send workout context to coach
- Chat bubbles: user (sage green, right), coach (white card, left)
- Proposal cards with Apply/Dismiss buttons
- Apply modifies the workout in-place (updates timeline state)
- Text input with visual mic button placeholder
- Coach FAB visible from every screen

**Exit condition:** User can chat about the workout, apply proposals, and see the timeline update

---

## Phase 5: Week View (Day 6-7)
**Goal:** User can see their week at a glance — past workouts, today, future

Build:
- Accessible from Today screen via toggle/tab
- 7-day horizontal or vertical strip
- Day states:
  - Past with workout: sage checkmark, distance + type visible
  - Today: coral highlight, "Today" label, tap to see full workout
  - Future: muted, "Rest day" or dashed outline
  - Past rest day: gray, no check
- Tapping a past day opens that day's workout in read-only timeline view
- Generate CTA for today if no workout exists
- Week stats at top: total distance, workouts completed, streak

**Exit condition:** User can browse their week, see what they've done, and jump to any day's workout

---

## Phase 6: History View + Empty State + App Shell (Day 7-8)
**Goal:** App handles all states gracefully with proper navigation and history

Build:
- History view:
  - Reverse chronological list of past workouts (GET /api/workouts)
  - Each entry: date, workout name, distance, duration, zone, completion status
  - Tap to view full workout details
  - Stats summary at top: total distance this week, current streak, avg distance/workout
  - Feedback mechanism (REQUIRED):
    - Star rating (1-5) per workout
    - "How did this feel?" emoji selector (too easy / just right / too hard)
    - Optional text note
    - Feedback POST to /api/workouts/:id/feedback
    - Feeds into CoachingMemory for next generation
  - Edit workout: modify sets, PUT /api/workouts/:id
  - Delete workout: DELETE /api/workouts/:id, confirm dialog
  - Filter by: date range, workout type, rating
- Empty state: illustration + "Generate Today's Workout" CTA
- Bottom nav bar: Today | Coach | Profile
- Nav state persists across screens

**Exit condition:** History, feedback, edit, delete all working with API

---

## Phase 7: Profile + Settings + Debug (Day 8-9)
**Goal:** All existing app features available in v3 design language, connected to MongoDB

### Profile (restructure of existing SwimmerProfile schema)
- Accessible from bottom nav
- Sections (all editable, PUT /api/profiles/:id):
  - Identity: firstName, lastName, email, phone, dateOfBirth, gender
  - Training: primaryEvents (stroke + distance), outcomes, trainingFocus, targetImprovement
  - Schedule: weeklyPoolSessions, weeklyGymSessions, sessionDuration, poolDays, gymDays, preferredTimes, competitionDates
  - Pool setup: poolLength (value + unit), poolEquipment (all 6 items)
  - Gym setup: gymEquipment (all 10 items), weightInventory
  - Performance: bestTimes (stroke + distance + poolLength + time + dateAchieved)
  - Health: injuries, limitations, allergies
- "Generate New Workout" button at bottom
- All fields pre-populated from GET /api/profiles/:id
- Edits save immediately

### Settings
- LLM model selector (preset list + custom)
- Current model display
- Reset to default option

### Debug
- Hidden behind secret gesture (tap logo 5x or ?debug=1)
- Profile selector (switch between profiles from MongoDB)
- LLM model tester (preset + custom)
- Test generation with workout type + duration selector
- View prompts (expandable sections showing system/user prompts)
- All existing debug functionality from debug.js route preserved

### Workout Generation Options
- When generating, user chooses:
  - Single session (one workout, today)
  - Weekly block (7 interconnected workouts, Mon-Sun)
- Weekly block: generate 7 workouts, each visible in week view
- Each day individually editable/regeneratable
- Generation POST to /api/workouts with programPeriod: 'single' | 'weekly' | 'monthly'

**Exit condition:** Every feature from the existing app is available in v3, connected to MongoDB

---

## Phase 8: Polish + Pool-Deck Readiness (Day 10-11)
**Goal:** High contrast, touch-friendly, works in sunlight

Build:
- Verify all tap targets ≥ 48px
- Pool deck mode: toggle that increases font sizes, boosts contrast, enlarges tap targets
- Offline: cache last workout + week data in localStorage
- Loading states for generation (skeleton screens)
- Staggered entrance animations for timeline sets
- Test in bright environments

**Exit condition:** App is usable at the pool with wet hands in sunlight

---

## Phase 7: Polish + Pool-Deck Readiness (Day 8-9)
**Goal:** High contrast, touch-friendly, works in sunlight

Build:
- Verify all tap targets ≥ 48px
- Pool deck mode: toggle that increases font sizes, boosts contrast, enlarges tap targets
- Offline: cache last workout + week data in localStorage
- Loading states for generation (skeleton screens)
- Staggered entrance animations for timeline sets
- Test in bright environments

**Exit condition:** App is usable at the pool with wet hands in sunlight

---

## Dependency Map

```
Phase 1 (Onboarding + Profile) ──→ Phase 2 (Timeline) ──→ Phase 3 (Execute)
                                                          ↓
                              Phase 4 (Coach) ←──────────┘
                                   ↓
                              Phase 5 (Week View)
                                   ↓
                              Phase 6 (History + Empty + Nav)
                                   ↓
                              Phase 7 (Profile + Settings + Debug)
                                   ↓
                              Phase 8 (Polish)
```

---

## Why:
v2 was dense and dark — too much information competing for attention. v3 is light, warm, and conversational. The coach is the product. The timeline mirrors how workouts actually feel (one piece at a time). History is scoped to read-only because the v3 goal is proving the core loop works before adding complexity.

## How to apply:
Start with Phase 1. Each phase is independently testable. Don't build Phase 5 (week view) until Phase 2 (timeline) is solid — week view is just a different arrangement of the same data.
