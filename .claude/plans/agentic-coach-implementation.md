# Agentic Coach Implementation Plan

## Overview

Implement a personal coach agent with two entry points: (1) a general coach chat accessible from the main navigation, and (2) the existing workout-scoped chat on the workout page. The agent uses tool calling to interact with the knowledge base, swimmer history, feedback trends, and workout modifications — replacing the current structured-text response format with a proper tool-calling loop.

---

## Step 1: CoachingMemory Model

**Create `src/models/CoachingMemory.js`**

A structured store for the coach's accumulated understanding of the swimmer — replacing the flat MEMORY.md approach with queryable data.

**Schema:**
```
swimmerId         - ObjectId ref to SwimmerProfile
type              - enum: 'observation', 'preference', 'trend', 'injury', 'goal-update', 'insight'
category          - enum: 'intensity', 'volume', 'recovery', 'technique', 'stroke-preference', 'equipment', 'scheduling', 'general'
content           - String (the observation or insight, e.g. "Recovers slower after lactate sessions")
source            - enum: 'feedback-derivation', 'coach-analysis', 'user-stated', 'trend-detection'
confidence        - Number 0-1 (how confident the coach is in this observation)
relevantWorkoutIds - [ObjectId] (workouts that contributed to this insight)
relevantFeedbackIds - [String] (feedback entries that contributed)
active            - Boolean (soft delete — insights can be superseded)
supersededBy      - ObjectId ref to self (chain of updated insights)
createdAt         - Date
updatedAt         - Date
```

**Indexes:** `{ swimmerId: 1, type: 1 }`, `{ swimmerId: 1, category: 1, active: 1 }`, `{ swimmerId: 1, createdAt: -1 }`

**Update `src/models/index.js`** to export CoachingMemory.

---

## Step 2: Coach Tools

**Create `src/services/coach/coach-tools.js`**

Define the tool specifications (OpenAI function-calling format) and their implementations. Each tool is a `{ definition, execute }` pair where `definition` is the JSON schema sent to the LLM and `execute` is the async function that runs it.

### General Mode Tools (available in both entry points)

| Tool | Description | Implementation |
|------|-------------|---------------|
| `queryKnowledgeBase` | Search the swimming knowledge base for scientific training principles | Calls `open-notebook.query()` |
| `getSwimmerHistory` | Get recent workout history with feedback, filtered by type/timeframe | Queries `Workout` model, includes feedback if present |
| `getProgressSummary` | Analyze trends across workouts — volume, intensity, completion, ratings | Aggregates from Workout collection: avg rating by type, volume trends, difficulty perception distribution |
| `getCoachingMemory` | Retrieve accumulated coach observations about the swimmer | Queries `CoachingMemory` model, filtered by type/category, sorted by confidence × recency |
| `addCoachingObservation` | Store a new observation or insight about the swimmer | Creates `CoachingMemory` document |

### Workout-Scoped Tools (only available on workout page)

| Tool | Description | Implementation |
|------|-------------|---------------|
| `explainWorkout` | Get the reasoning behind the current workout's design | Returns training notes + generation parameters from the workout document |
| `modifyWorkout` | Propose an incremental edit to the current workout (single field/field change) | Returns a diff-style proposal to the frontend for approval, does NOT auto-apply |
| `regenerateWorkout` | Regenerate the entire workout with modified preferences | Calls `regenerateWorkout()` from workout-generator |

### Key design decisions:
- `modifyWorkout` returns a *proposal* that the frontend confirms before applying — the agent suggests, the user approves
- `regenerateWorkout` is the existing pipeline, just triggered by the agent instead of the chat parser
- `addCoachingObservation` is how the agent builds lasting memory — e.g., after detecting "user prefers shorter warm-ups", it stores that observation
- Tool implementations receive `{ profile, workout? }` context so they can enforce ownership

---

## Step 3: Coach Agent Service

**Create `src/services/coach/coach-agent.js`**

This replaces `chat-with-coach.js` as the core coaching service. The old service stays for backward compat during migration.

**`src/services/coach/soul.md`** — already created. Defines the coach's personality, coaching philosophy, communication style, decision principles, and boundaries. Read at service startup and injected into the system prompt.

### Architecture:

```
coachAgent.chat({ profile, workout?, messages, userMessage, mode, modelOverride })
  │
  ├─ 1. Assemble context
  │     ├── General mode: profile + coaching memory + recent trends + goals
  │     └── Workout mode: profile + coaching memory + current workout summary
  │
  ├─ 2. Select tool set
  │     ├── General: all general tools
  │     └── Workout: all general tools + workout-scoped tools
  │
  ├─ 3. Agent loop (max 5 iterations)
  │     ├── Call OpenRouter with messages + tools
  │     ├── If response has tool_calls → execute tools → append results → loop
  │     └── If response is final text → break
  │
  ├─ 4. Post-process
  │     ├── Extract any coaching observations the agent made → store in CoachingMemory
  │     └── Return { reply, actions } where actions = [{ type: 'modifyWorkout', diff }, { type: 'regenerate', overrides }]
  │
  └─ Return to caller
```

### Key details:

- **Agent loop**: Max 5 tool-calling iterations to prevent runaway loops. Each iteration appends the tool result as a `tool` role message.
- **Model**: Uses OpenRouter with the same model selection as today. Tool calling requires models that support it (most OpenRouter models do via the OpenAI-compatible API).
- **System prompt**: Built from `soul.md` + mode-specific context. `soul.md` defines personality, philosophy, and decision principles. Mode-specific sections add swimmer profile summary, coaching memory, and (in workout mode) the current workout.
- **Coaching memory injection**: Before the agent loop, fetch the top N active observations from CoachingMemory (filtered by recency and confidence) and include them in the system prompt as "What you know about this swimmer."
- **Observation extraction**: After the agent loop, parse the final response for structured observation blocks (or use a separate LLM call to extract observations from the conversation). Store them via `addCoachingObservation`.
- **Backward compat**: The existing `chat-with-coach.js` `parseCoachResponse` format is no longer needed — the agent returns structured `{ reply, actions }` directly.

---

## Step 4: Chat Route Updates

**Modify `src/routes/api/workouts.js`**

Update the `POST /:id/chat` endpoint:
- Replace `chat()` call from `chat-with-coach` with `coachAgent.chat()` in workout mode
- Handle the new `{ reply, actions }` return format
- If `actions` includes `regenerate`, trigger `regenerateWorkout()` and return the new workout
- If `actions` includes `modifyWorkout`, apply the diff to the workout document and save

**Create `src/routes/api/coach.js`**

New route for the general coach:
```
POST /api/coach/chat
  Body: { swimmerId, messages, userMessage }
  Response: { reply, actions, conversationId }
```

- No workout ID required
- Calls `coachAgent.chat()` in general mode
- Returns the reply to the frontend

**Create `POST /api/coach/chat/:conversationId/confirm`**
- When the agent proposes a modification (via `modifyWorkout` tool), the frontend sends confirmation
- Applies the proposed change

**Update `src/index.js`** to mount the new route: `app.use('/api/coach', coachRoutes)`

---

## Step 5: Frontend — Coach Page

**Modify `public/index.html`**

Add a "Coach" navigation item in the main nav bar (between Generate and History).

**Modify `public/js/app.js`**

Add a new route handler for `#coach`:
- Renders the general coach chat page
- Maintains conversation state (messages array) in memory (no persistence needed initially — conversation resets on page load)
- Sends messages to `POST /api/coach/chat`
- Handles actions returned by the agent (display modification proposals, confirmation buttons)

**Modify `public/js/components.js`**

Add/extend:
- `buildCoachChatPanel()` — similar to existing `buildChatPanel()` but without workout context, possibly with a brief "What can I help with?" prompt
- `buildActionProposal()` — renders a proposed workout modification with Confirm/Dismiss buttons
- Reuse existing `buildChatPanel()` for workout-scoped chat with minor modifications

**Modify `public/js/api.js`**

Add:
- `api.coach.chat({ swimmerId, messages, userMessage })`
- `api.coach.confirmAction({ conversationId, actionId })`

---

## Step 6: Workout Page Chat Migration

**Modify `public/js/app.js`** (workout page chat section)

Update the workout page chat handler:
- Use `coachAgent.chat()` response format instead of parsing `reply:/regenerate:/overrides:`
- Handle `actions` array instead of `regenerate` + `overrides` flags
- Modification proposals render inline in the chat with confirm/dismiss buttons
- Regeneration triggers the same flow as today but through the actions interface

---

## Step 7: Coaching Memory Backfill & Feedback Integration

**Create `src/services/coaching-memory-sync.js`**

Sync service that:
1. **On feedback submission** (`POST /:id/feedback`): After saving feedback to the workout, run `deriveLearning()` and store the result in CoachingMemory (in addition to MEMORY.md for backward compat)
2. **Backfill**: One-time script to parse existing MEMORY.md entries and create CoachingMemory documents for each. Run once on deploy.
3. **Periodic trend detection**: After every Nth feedback submission, run a lightweight analysis that creates trend-type observations (e.g., "lactate sessions consistently rated too-hard → consider reducing lactate volume"). This can be a simple aggregation query, not an LLM call.

**Modify `src/routes/api/workouts.js`** feedback endpoint to call the sync service.

---

## Step 8: Testing

**Create `tests/unit/coach-agent.test.js`**
- Test tool definition schemas are valid
- Test tool execution with mock data (getSwimmerHistory, getProgressSummary, etc.)
- Test agent loop with mocked OpenRouter responses (tool call → result → final response)
- Test coaching memory creation from observations
- Test context assembly for general vs. workout mode

**Create `tests/unit/coaching-memory-sync.test.js`**
- Test feedback → CoachingMemory creation
- Test backfill from MEMORY.md

**Create `tests/integration/coach-routes.test.js`**
- Test `POST /api/coach/chat` with valid swimmer
- Test `POST /api/coach/chat/:conversationId/confirm`
- Test `POST /api/workouts/:id/chat` with new agent format

---

## Implementation Order

1. **CoachingMemory model** — foundation everything else depends on
2. **Coach tools** — tool definitions and implementations (can be tested in isolation)
3. **Coach agent service** — the core agent loop (depends on tools + model)
4. **Chat route updates** — backend API (depends on agent service)
5. **Coach page frontend** — general chat UI (depends on routes)
6. **Workout chat migration** — update existing chat (depends on agent service)
7. **Coaching memory sync** — backfill + feedback integration (depends on model)
8. **Testing** — throughout, but formalized last

---

## Files Changed/Created

### New files
- `src/models/CoachingMemory.js`
- `src/services/coach/coach-tools.js`
- `src/services/coach/coach-agent.js`
- `src/services/coach/soul.md`
- `src/services/coaching-memory-sync.js`
- `src/routes/api/coach.js`
- `tests/unit/coach-agent.test.js`
- `tests/unit/coaching-memory-sync.test.js`
- `tests/integration/coach-routes.test.js`

### Modified files
- `src/models/index.js` — add CoachingMemory export
- `src/index.js` — mount `/api/coach` routes
- `src/routes/api/workouts.js` — update chat endpoint to use coach-agent
- `src/services/chat-with-coach.js` — keep for backward compat, mark deprecated
- `public/index.html` — add Coach nav item + page container
- `public/js/app.js` — add #coach route, update workout chat handler
- `public/js/components.js` — add/extend chat components
- `public/js/api.js` — add coach API endpoints
