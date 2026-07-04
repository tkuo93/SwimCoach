# SwimCoach — AI Product Manager (Platform) Interview Prep

> Use this to answer product questions about an AI-powered product from a **platform AI PM** frame: reliability, prompt/flow management, evals, trust, cost-latency tradeoffs, and how you represent the user to an engineering team.
>
> The app: **SwimCoach** — generates science-backed pool + gym workouts for Masters swimmers via RAG + an agentic coach. Full source lives in `SwimCoach-project/`.

---

## 1. The 60-Second Product Narrative

**"Tell me about an AI product you've shipped."**

"SwimCoach is an AI personal swim coach. A user builds a profile — goals, schedule, equipment, best times — and the system generates structured workouts that chain into multi-week programs.

The AI layer has three parts:
- **RAG-backed generation:** we query a scientific-swimming knowledge base (Open Notebook over SurrealDB vectors) for training principles, then inject those + the user's profile + past feedback into an LLM prompt that outputs structured JSON (pool sets, gym exercises, training notes).
- **An agentic coach loop:** an iterative tool-calling agent (≤5 LLM calls per message) that can search the knowledge base, read the swimmer's history, pull accumulated coaching observations, and propose workout edits — but can never unilaterally mutate data; proposals require user confirmation.
- **A feedback-to-memory flywheel:** every workout rating flows into structured observations plus trend detection, and that accumulated understanding feeds back into generation.

The hard parts were the ones you'd expect: keeping the LLM on the right pool unit, keeping weights within user inventory, keeping the agent honest, and actually **measuring** whether workouts improved. Those are the parts I'd dig into."

---

## 2. How to Frame SwimCoach as a **Platform** Product

Platform interviewers want to see you thinking past the feature. Reframe the internals as platform capabilities:

| SwimCoach feature | Platform capability it represents |
|---|---|
| `buildInsightsPrompt` / `buildWorkoutPrompt` | **Prompt pipeline**: templated, deterministic, inspectable prompt assembly with versioned context blocks |
| `OPENROUTER_MODEL` override + Debug mode | **Model routing**: a single knob the user/researcher can flip to swap the underlying LLM; debug UI surfaces the exact prompts sent |
| `ragCache` + `hashInsightsPrompt` | **Caching layer**: deterministic-response cache keyed on semantic inputs, with TTL + size cap |
| circuit breaker in `open-notebook.js` | **Resilience pattern**: graceful degradation when a model/knowledge backend is flaky |
| proposal-confirm pattern, allowlist `isAllowedField` | **Action-gating / approval workflow**: no LLM-driven mutation without explicit confirmation and validation |
| dual memory (`MEMORY.md` + `CoachingMemory`) | **Memory stack with trust tiers**: file for human-readability & backward compat, structured store with confidence scores for programmatic use |
| trend detection in `coaching-memory-sync.js` | **Pattern extraction over time**: moving from single-shot inference to longitudinal reasoning |
| `soul.md` as system prompt | **Behavioral spec-as-document**: persona logic lives in a document, reviewed by non-engineers, not buried in code |

**Say this:** "When I talk about SwimCoach as a platform product, what I mean is: every capability I just listed can be reused across any domain where an LLM generates structured, user-specific, safety-sensitive decisions. The prompt pipeline, the model router, the action-gating, the approval workflow — these are platform primitives."

---

## 3. Question Bank (AI-PM-flavored)

### Q: "How do you represent product requirements to the engineering team in an AI system?"

**Answer shape:** You wrote the PRD and then you *kept the spec alive in artifacts the code reads*.

"I represented product behavior in three layers:

1. **PRD.md** for 'why' and success metrics — shipped when success is science-backed, personalized, and goal-reaching.
2. **Behavioral spec that the model reads directly** — `soul.md` is the coach's persona. This is the AI analog of a design doc: it's reviewed by non-engineers, versioned alongside the prompt, and the agent can't drift from it without a diff. Treating personality as a reviewed artifact, not a comment in a prompt template, is the single biggest unlock for AI PMs.
3. **Guardrails as code with the spec attached** — each non-negotiable (pool-unit correctness, equipment-availability, weight inventory, no LLM-driven mutation without confirmation) is a function with a console log that says *what rule fired*: e.g. `Weight clamped: bench press 135lbs → 85lbs`, `Substituted 2 gym exercises requiring unavailable equipment`, `Pool unit correction: 800m → 500yd`. That makes the system observable.

For platform thinking: the spec format (`soul.md`) becomes the productized way all future agents in the org are configured — personality/philosophy/boundaries as a reviewed Markdown document, not a system prompt that only engineers can edit."

### Q: "How do you handle non-determinism and keep the system reliable?"

**Answer shape:** Defense in depth, at both generation-time and post-generation.

"LLMs are stochastic, so we never trust raw output. Our reliability stack:

- **Prompt-level guardrails:** rigid JSON schema defined in the system prompt; strict constraints ('ALL pool distances MUST be in yards', 'match exact weight from inventory').
- **Post-generation validation:** if JSON doesn't parse, we repair truncated JSON; once parsed, we run `validateYardsDistances` (meter→yards mapping), `filterGymExercises` (substitute unavailable equipment with bodyweight), `clampWeightsToInventory` (snap prescribed weights to actual inventory, adjusting reps to match).
- **On length-truncated output** (`finish_reason=length`), we retry with the heavy RAG context stripped and 16384 tokens — a reliability escape hatch.
- **The agent loop is bounded:** max 5 iterations with `tool_choice=auto`, so we never infinite-loop the LLM.
- **Resilience with the circuit breaker in `open-notebook.js`:** after 3 consecutive failures, stop hitting the backend for 30s and fail fast.
- **Feedback flywheel:** every workout rating → `deriveLearning` → observation → trend detection → future prompt, so systematic failures compound into fixes rather than repeated hallucinations.

What I'd add next (and would pitch as PM): a structured **eval suite** that runs canned profiles against canned requests and checks pool-unit-correctness, weight-inventory compliance, JSON-parse success rate, and training-focus match — run on every prompt/model change. Right now I review manually via the debug endpoint; that's too slow to scale."

### Q: "How do you measure success for a generative AI product?"

**Answer shape:** separate **quality metrics** (is the output good?) from **outcome metrics** (does it help the user?).

"Tier 1 — system health (cheap, high-signal): JSON-parse success rate, RAG-cache hit rate, agent-loop completion rate, average iterations per message, circuit-breaker trips, retry-on-length rate. These are the p95 latency/error-rate equivalents for a generative system.

Tier 2 — output quality proxy metrics: pool-unit correctness, weight-inventory compliance, equipment-availability compliance. These are all programmatic checks I can run against the DB. If 15% of workouts require pool-unit correction, the prompt is broken.

Tier 3 — user-perceived quality: our feedback fields — `difficultyPerception` (too-easy … too-hard), `enjoyment`, `rating` (1–5), `quality`, `accuracy`. These are the real signals. We specifically track `just-right` % and `accuracy=spot-on` % over time.

Tier 4 — outcome metrics (the ones that actually matter): did the user hit their stated goal (e.g. drop time)? These require longitudinal tracking we don't have yet. **This is the gap I'd own** — shipping the `targetImprovement` field connects Tier 4 backwards through the whole pipeline.

For a platform product, Tier 2 becomes the productized **eval reporter**: attach any eval to any model/prompt combination and surface alerts when it regresses."

### Q: "How do you build user trust in an AI system?"

**Answer shape:** transparency + user control + reversible actions.

"Three concrete mechanisms:

1. **Explainability.** Every generated workout has `trainingNotes` explaining the rationale for the sets, rest, and loading. The coach tool `explainWorkout` lets a user ask 'why this workout?' and get the design rationale. We ground training notes in the knowledge base (`'Include 3-5 overall notes… each note must reference something concrete from the workout you generated'`).

2. **Confirmation gating.** The coach can propose a modification but cannot apply it — proposals sit in `pendingProposals`, user confirms via explicit API call, and we enforce an allowlist on what fields can be modified (`isAllowedField`) plus swimmerId ownership verification. No silent mutations.

3. **Human-readable audit log.** `MEMORY.md` is an append-only, human-readable file. A user can literally read the file and see every feedback-derived learning. For tech-comfortable users, the Debug endpoint shows the *exact* prompts sent to the knowledge base and to the generator — full transparency.

Say on the platform angle: 'Trust primitives become product features' — offer every agent the same gating and explainability config."

### Q: "How do you think about cost and latency?"

**Answer shape:** recognize the LLM cost curve and pick architectural levers.

"Right now the dominant costs:
- RAG streaming calls into Open Notebook (per generation).
- OpenRouter calls: one for generation, up to 5 for a coach turn.
- Retries on truncated output (2x cost when the model can't finish in 8192 tokens).

Levers I pull:
- **Program-level pre-fetching (`programContext`)** — when generating a multi-week program, we fetch notebook notes, feedback summary, and coaching observations once and inject them into all 4–5 sessions instead of re-querying. That alone cuts ~80% of RAG calls per program.
- **Semantic cache (`ragCache`, 1-hour TTL, 200-entry cap, keyed on a deterministic hash of prompt inputs)** — identical focus/equipment/duration combos skip the RAG call entirely. High hit rate during program generation.
- **Bounded agent loop** — `MAX_AGENT_ITERATIONS=5` prevents unbounded cost per turn.
- **Circuit breaker** — avoid re-paying for calls to a backend that's down.

Tradeoff I'd be transparent about: I cache RAG aggressively because our knowledge base changes slowly; that's a product decision (acceptable staleness) tied to the domain. For a more dynamic domain, the TTL and invalidation story would be a product requirement."

### Q: "How do you think about prompt management across the org?"

**Answer shape:** treat prompts as first-class product artifacts.

"Currently our prompts live in code (`buildWorkoutPrompt`, `buildInsightsPrompt`) plus a behavioral spec (`soul.md`). That's fine for a two-person build; it doesn't scale.

What I'd productize as a platform capability:
- **Versioned prompt templates** with parameters, reviewed like PRs.
- **Test fixtures**: golden inputs with assertion-based checks (e.g. 'this profile must never generate meter distances').
- **A/B at the prompt layer:** route 10% of users to a new prompt variant, compare `just-right` % and `rating` — which we already collect.
- **Debug-mode observability** surfaced to non-engineers: `/api/debug/prompts` returns the full assembled prompt for any profile + customization. This is the prototype of the internal tool every AI PM needs.
- **Audit trail** tying each generated workout to the exact prompt/model/version that produced it (`generationInfo` already stores `generatedBy` and `generationParameters`; I'd extend it to store prompt version hash + RAG cache status)."

### Q: "Tell me about a tradeoff you made that you'd revisit."

"I kept memory dual-tracked — `MEMORY.md` for backward compat and human readability, plus a structured `CoachingMemory` collection with confidence scores and trend detection. The migration cost of collapsing them is low now but grows every month. I'd cut `MEMORY.md` entirely as soon as two conditions are met: (a) the structured memory has source attribution that lets a human reconstruct the 'why' of any observation, and (b) the trend detector proves it surfaces insights a human wouldn't. That's a product decision about when the new system fully supersedes the old — not a tech decision."

### Q: "How do you decide what the AI should NOT do?"

**Answer shape:** boundaries as a prioritized, tested spec.

"Our priority order — written in `soul.md` and also encoded in guardrails:

1. **Safety** — if an athlete reports pain, we stop. `extractConversationLearnings` flags injury keywords at confidence 0.9.
2. **Progression** — every session must build toward a goal; `programContext` enforces non-repetition across sessions and ramps first-to-last.
3. **Adaptability** — if the user's day changed, the plan changes; we don't override stated constraints.
4. **Variety** — `previousSessionSummaries` explicitly tell the model to avoid repeating sets.
5. **Preference** — only after the above.

Platform angle: that priority order is itself a reusable 'coach agent spec' that other teams could fork for their sport."

---

## 4. What to Admit Is Missing (AI-PMs respect product maturity)

- **No automated eval suite.** Manual review via `/api/debug/prompts`. I'd build assertions: JSON-parse rate, unit correctness, inventory compliance, focus match — run on every model/prompt change.
- **No outcome tracking.** We have `targetImprovement` in the schema but haven't wired it to actual time-over-time comparison. That's the gap between 'workouts look reasonable' and 'workouts work'.
- **In-memory `pendingProposals`.** Doesn't survive a restart; fine for single-process dev, not for production. Platform answer: push this to Redis or a `pending_actions` collection.
- **Trend detection trigger is arbitrary** ('every Nth feedback'). Should move to time-window / volume-based.
- **RAG cache TTL is a product knob.** 1-hour is fine for static science; for a more dynamic domain it'd need invalidation tied to content update events.

---

## 5. Cheat Sheet: One-Liners to Drop

- "I treat the agent's persona spec (`soul.md`) as a reviewed design doc, not a comment in a prompt."
- "We never accept raw LLM output — we repair truncated JSON, map pool units, snap weights to inventory, and substitute equipment."
- "Gating is product: proposals sit in a pending map with a 10-minute TTL, the user must explicit-confirm, and we enforce a field allowlist."
- "Reliability in generative systems is layered: prompt constraints, output validation, retries, a bounded loop, and a feedback flywheel."
- "I measure success in four tiers: system health → output compliance → perceived quality → actual outcomes. Most AI products stop at Tier 2."

---

## 6. Questions You Should Ask Them (platform role)

- "How do you version prompts and tie generated artifacts back to prompt versions today?"
- "Do you have a shared action-gating / approval primitive for agents that mutate user state, or does every team reinvent it?"
- "What does your eval harness look like — assertion-based checks on golden inputs, or human review?"
- "How do you surface model / prompt quality regressions to PMs who aren't in the codebase?"
- "How do you compose long-lived memory with short-lived context windows across sessions?"
- "When do you decide a prompt is a product surface that users / researchers should edit directly vs. something only engineers touch?"
