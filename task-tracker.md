# SwimCoach Task Tracker

## Phase 1: Project Setup and Foundation ✅
- [x] 1.1 Initialize project structure
- [x] 1.2 Set up development environment
- [x] 1.3 Configure version control (git)
- [x] 1.4 Create basic project documentation

## Phase 2: Data Models Design ✅
- [x] 2.1 Swimmer Profile Model (with gender option)
- [x] 2.2 Workout Model
- [x] 2.3 Knowledge Base Integration Model

## Phase 3: API Endpoints Design ✅
- [x] 3.1 Swimmer Profile API — `src/routes/api/profiles.js`
- [x] 3.2 Workout Generation API — `src/routes/api/workouts.js`
- [x] 3.3 Knowledge Base API — `src/routes/api/knowledge.js`
- [x] 3.4 Workout Customization API — `src/routes/api/customization.js`

## Phase 4: Core Features Implementation (partial)
- [x] 4.1 Swimmer Profile Management — API endpoints done
- [x] 4.2 Workout Generation Engine — bridge + generator service done
- [ ] 4.3 Workout Customization Interface — backend done, UI needed
- [ ] 4.4 Workout Presentation and Interaction — UI needed

## Phase 5: Integration and Testing
- [x] 5.1 Open Notebook Integration — REST API client with streaming RAG
- [x] 5.1b Integration tests — `tests/integration/open-notebook-api.test.js` (17 tests, all passing)
- [ ] 5.2 Quality Assurance — integration tests done; unit tests pending
- [x] 5.3 Deployment Preparation — Docker optimized for local dev

## Success Criteria Tracking
- [x] Ability to generate science-backed workouts — Open Notebook RAG produces detailed, cited workouts
- [x] Workouts customized to swimmer's goals, schedule, equipment — prompt builder uses profile data
- [x] API stores and retrieves workouts with feedback — all CRUD endpoints tested live
- [ ] Easy and quick UI interaction — UI not yet built

---

## Completed Tasks Log

### 2026-05-30: Phase 1 — Project Setup and Foundation
- Initialized project structure, package.json, git, Docker config

### 2026-05-30: Phase 2 — Data Models Design
- SwimmerProfile, Workout, KnowledgeSource models with validation

### 2026-05-31: Phase 3 — API Endpoints
- profiles.js (CRUD), workouts.js (generate/list/get/feedback/regenerate)
- knowledge.js (sources/query/categories), customization.js (options)
- Fixed database.js: `require('require')` → `require('mongoose')`
- Fixed database.js: removed deprecated Mongoose 6.x options
- Fixed SwimmerProfile.js: `max=180` → `max: 180` syntax error

### 2026-05-31: Phase 4.2 — Workout Generation Engine
- Built Open Notebook REST API client (replaced `notebooklm-bridge.js`)
- `workout-generator.js`: builds context-rich queries for Open Notebook RAG
- `.mcp.json` project MCP configuration (used for hybrid ingestion workflow)

### 2026-05-31: E2E Testing on Live Server ✅
- MongoDB running in Docker (mongo:5.0, port 27017)
- Server running on port 3000, all endpoints responding
- Verified: create profile (201), create workout (201), list workouts (200), get workout (200), feedback (200), options (200)
- Open Notebook RAG produces high-quality, science-backed workouts with specific intervals, paces, and rationale

### 2026-05-31: Open Notebook Integration
- Added SurrealDB + Open Notebook services to docker-compose.yml
- Replaced NotebookLM bridge with Open Notebook REST API client (axios)
- Rewrote `workout-generator.js`: parses structured JSON from RAG response, maps to Workout schema
- Updated `knowledge.js`: simplified to use `query()` directly (no queue mode)
- Updated `.env`: replaced NOTEBOOKLM_* vars with OPEN_NOTEBOOK_URL
- Added `trainingNotes` field to Workout model
- Installed `axios` dependency
- Open Notebook available at `localhost:8502` for document upload and API docs

### 2026-05-31: Infrastructure Fixes
- `.env` created from `.env.example`
- `.env` MONGODB_URI changed from `localhost` to `127.0.0.1` (IPv6 Docker issue)
- `database.js` and `index.js` use absolute path for dotenv config
- Added `POST /api/workouts` direct create endpoint

### 2026-05-31: Open Notebook API Integration Testing ✅
**Files changed:**
- `src/services/open-notebook.js` — major rewrite
- `.env.example` — updated config vars
- `tests/integration/open-notebook-api.test.js` — new test file (17 tests)

**What was fixed:**

1. **Missing model params (422 error)**: `query()` now sends `strategy_model`, `answer_model`, `final_answer_model` — auto-resolved from Open Notebook's `default_chat_model` setting or `OPEN_NOTEBOOK_MODEL` env var.

2. **Next.js proxy timeout**: Switched from `/api/search/ask/simple` (non-streaming) to `/api/search/ask` (SSE streaming). The Next.js proxy on port 8502 drops long-running connections. The streaming endpoint calls the Python backend directly on port 5055.

3. **SSE idle timeout**: Added 15s idle watcher — destroys the connection if no new SSE data arrives, preventing infinite hangs when models don't complete the full LangChain graph.

4. **`complete` event handling**: Fixed to resolve with collected answer content even when `final_answer` field is null on the completion event.

5. **Model resolution priority**: `OPEN_NOTEBOOK_MODEL` env var → `/api/models/defaults` `default_chat_model` (set in ON UI) → first `language` model from `/api/models` → null with clear error.

**Test results: 17/17 passing**
- Open Notebook Direct API: 4 tests (connectivity, embedding, RAG query, models)
- SwimCoach Service Layer: 6 tests (client config, model resolution, query, pollForResponse ×3)
- SwimCoach API Routes: 6 tests + 1 informational (gracefully skipped when server offline)

**Verified:**
- RAG returns 6071-character science-backed answers from the knowledge base
- 14 sources embedded with 4–84 chunks each (PDFs + YouTube transcripts)
- Default model: `openai/gpt-oss-120b:free` (configurable in Open Notebook UI)
- All 3 required model params included in API requests

### 2026-05-31: Phase 4.3 & 4.4 — Workout Customization Interface + Presentation
- Built full frontend SPA served by Express (no framework, vanilla HTML/CSS/JS)
- Hash-based routing: `#profile`, `#generate`, `#workout/:id`
- Profile page: progressive disclosure (basics required, schedule/equipment expandable)
- Generate page: quick generate + customizable form, pre-populated from profile
- Workout page: clean card layout, pool/gym interval tables, training notes, chat panel, feedback with adaptive response
- Sporty theme: deep blues + energetic orange, mobile-responsive
- Stored profile in localStorage for session persistence

### 2026-05-31: Phase 5.2 — Unit Tests
- `tests/unit/validation.test.js` — 25+ cases for time, email, phone, age, date validators
- `tests/unit/workout-generator.test.js` — Parser (direct JSON, code blocks, surrounding text, edge cases), mapWorkoutType, deriveIntensity, calculateTotalDistance
- `tests/unit/profiles-route.test.js` — Full CRUD route tests with mocked mongoose (POST/GET/PUT/DELETE × error cases)
- `tests/unit/customization-route.test.js` — Options endpoint structure, counts, values, labels

### 2026-05-31: Phase 5.3 — Deployment Preparation (Local Docker)
- Added `GET /health` endpoint (returns status, uptime, DB connection state)
- Created `.dockerignore` — excludes node_modules, .env, tests, docs from build context
- Rebuilt Dockerfile: non-root user, HEALTHCHECK instruction, `node src/index.js` entry
- Updated docker-compose.yml:
  - All env vars inlined (no .env dependency), service hostname-based connections
  - Removed volume mount override (uses built image properly)
  - Added healthchecks to app, mongodb, surrealdb, open-notebook services
  - `depends_on` with `condition: service_healthy` for proper startup ordering
  - `restart: unless-stopped` on all services
- Updated `.env.example` with Docker hostname hints
- Verified: app starts cleanly, connects to DB, 111/111 unit tests still passing
