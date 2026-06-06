# SwimCoach Implementation Plan

## Architecture Decision: Open Notebook RAG (REST API + Streaming)

**Decision:** Use Open Notebook (self-hosted RAG) as the knowledge backend, with direct REST API calls for workout generation. The streaming SSE endpoint bypasses the Next.js proxy timeout on port 8502 by calling the Python backend directly on port 5055.

**Trade-offs:**
- ⚠️ Requires self-hosting SurrealDB + Open Notebook services
- ⚠️ More initial setup than NotebookLM free tier
- ✅ Fast API responses (no browser automation latency)
- ✅ No query limits
- ✅ Full control over knowledge base and data
- ✅ Streaming RAG answers (6000+ chars) with source citations

**Future path:** Scale knowledge base with more sources; consider fine-tuning for workout-specific generation.

## Phase 1: Project Setup and Foundation ✅
- [x] 1.1 Initialize project structure
- [x] 1.2 Set up development environment
- [x] 1.3 Configure version control (git)
- [x] 1.4 Create basic project documentation

## Phase 2: Data Models Design ✅
- [x] 2.1 Swimmer Profile Model
- [x] 2.2 Workout Model
- [x] 2.3 Knowledge Base Integration Model

## Phase 3: API Endpoints Design ✅
- [x] 3.1 Swimmer Profile API
  - `POST /api/profiles` — Create new swimmer profile
  - `GET /api/profiles/{id}` — Retrieve swimmer profile
  - `PUT /api/profiles/{id}` — Update swimmer profile
  - `DELETE /api/profiles/{id}` — Delete swimmer profile
  - `GET /api/profiles` — List all swimmer profiles
- [x] 3.2 Workout Generation API
  - `POST /api/workouts/generate` — Generate personalized workout (calls Open Notebook RAG)
  - `GET /api/workouts/{id}` — Retrieve specific workout
  - `GET /api/workouts?swimmerId=xxx` — List workouts for a swimmer
  - `POST /api/workouts/{id}/feedback` — Provide feedback on workout
  - `POST /api/workouts/{id}/regenerate` — Generate alternative workout
- [x] 3.3 Knowledge Base API
  - `GET /api/knowledge/sources` — Retrieve knowledge base sources
  - `POST /api/knowledge/query` — Direct query to Open Notebook
  - `GET /api/knowledge/categories` — Get training methodology categories
- [x] 3.4 Workout Customization API
  - `GET /api/workouts/customize/options` — Get available customization options (types, equipment, intensities)

## Phase 4: Core Features Implementation
- [x] 4.1 Swimmer Profile Management — API endpoints built (UI pending)
- [x] 4.2 Workout Generation Engine — Open Notebook REST API client + `workout-generator.js` built
- [x] 4.3 Workout Customization Interface — Full frontend UI with profile setup, workout customization form, equipment selection
- [x] 4.4 Workout Presentation and Interaction — Workout card with pool/gym sections, chat panel for regeneration, feedback form with adaptive response

## Phase 5: Integration and Testing
- [x] 5.1 Open Notebook Integration — REST API client with streaming RAG, 17 integration tests passing
- [x] 5.2 Quality Assurance — 17 integration tests + 4 unit test files (validation, workout-generator, profiles route, customization route)
- [x] 5.3 Deployment Preparation — Dockerfile + docker-compose optimized for local dev, healthchecks added, .dockerignore created

## File Structure
```
src/
  services/
    open-notebook.js        — REST API client to Open Notebook (streaming SSE + model resolution)
    workout-generator.js    — Orchestrates workout creation using profile + Open Notebook RAG
  routes/
    api/
      profiles.js           — CRUD endpoints for swimmer profiles
      workouts.js           — Workout generate/list/feedback/regenerate endpoints
      knowledge.js          — Knowledge base query and source listing
      customization.js      — Customization options config endpoint
  models/
    SwimmerProfile.js       — Swimmer profile schema
    Workout.js              — Workout schema (pool + gym + feedback + generationInfo)
    KnowledgeSource.js      — Knowledge source schema (NotebookLM integration fields)
public/
  index.html                — SPA shell (hash-routed) with all 3 views
  css/style.css             — Sporty theme (blues + oranges), responsive
  js/app.js                 — Router, page orchestration, form handlers
  js/api.js                 — Fetch wrapper for all API endpoints
  js/components.js          — Reusable UI builders (workout card, chat, feedback)

tests/
  integration/
    open-notebook-api.test.js — 17 integration tests for ON API layer
  unit/
    validation.test.js        — Validation utility tests (time, email, phone, age, date)
    workout-generator.test.js — Parser & helper function tests (parse, mapType, intensity, distance)
    profiles-route.test.js    — Profile CRUD route handler tests (mocked mongoose)
    customization-route.test.js — Customization options endpoint tests
  .mcp.json                 — MCP server configuration for the project
  test-server.js            — Smoke test to verify route loading
```

## Key Technical Details

### Open Notebook API Integration
- **Streaming endpoint**: `POST /api/search/ask` (SSE) — used instead of `/ask/simple` to avoid proxy timeout
- **Direct backend calls**: Python backend on port 5055 (bypasses Next.js proxy on 8502)
- **Model resolution**: `OPEN_NOTEBOOK_MODEL` env var → `/api/models/defaults` → `/api/models` fallback
- **SSE idle timeout**: 15s — destroys connection if no new data arrives
- **Required params**: `strategy_model`, `answer_model`, `final_answer_model` (all resolved from default model)
- **Config**: `OPEN_NOTEBOOK_URL` env var (default `http://localhost:8502`)

### Bugs Fixed
- `src/utils/database.js`: `require('require')` → `require('mongoose')`
- `src/utils/database.js`: Removed deprecated `useNewUrlParser`/`useUnifiedTopology` options (Mongoose 7.x)
- `src/models/SwimmerProfile.js`: `max=180` → `max: 180` (syntax error)
- `src/services/open-notebook.js`: Missing model params causing 422 errors
- `src/services/open-notebook.js`: Proxy timeout on non-streaming endpoint

## Success Criteria
- [x] Ability to generate science-backed workouts for pool and gym
- [x] Workouts customized to swimmer's goals, training schedule, and equipment
- [x] API stores and retrieves workouts with feedback
- [ ] Swimmers able to reach their stated goals with workouts (needs UI + validation)
- [ ] Easy and quick UI interaction for profile creation and workout customization
