# SwimCoach System Architecture

```mermaid
graph TB
    subgraph Client["🖥️ CLIENT (Browser)"]
        HTML["index.html + CSS"]
        AppJS["app.js<br/>routing + state"]
        Components["components.js<br/>UI widgets"]
        APIJS["api.js<br/>fetch wrapper"]
    end

    subgraph Server["⚙️ EXPRESS SERVER (Node.js 18)"]
        Routes["API ROUTES<br/>/api/profiles · /api/workouts · /api/knowledge<br/>/api/memory · /api/coach · /api/debug"]

        subgraph Services["SERVICES"]
            CoachAgent["coach-agent.js<br/>agentic LLM loop (5 iter)"]
            CoachTools["coach-tools.js<br/>8 tool defs + executors"]
            WorkoutGen["workout-generator.js<br/>orchestrator + filters"]
            WorkoutAI["workout-ai.js<br/>LLM prompt + RAG cache"]
            OpenNotebook["open-notebook.js<br/>RAG client + circuit breaker"]
            Memory["memory.js<br/>MEMORY.md read/write"]
            CoachSync["coaching-memory-sync.js<br/>feedback sync + trend detect"]
        end

        subgraph Data["DATA LAYER (Mongoose)"]
            Profile["SwimmerProfile<br/>goals, equipment, schedule"]
            Workout["Workout<br/>pool + gym sets, feedback"]
            CoachingMem["CoachingMemory<br/>observations, confidence"]
            Knowledge["KnowledgeSource<br/>uploaded doc metadata"]
        end
    end

    subgraph External["🌐 EXTERNAL SERVICES"]
        OpenRouter["OpenRouter API<br/>LLM chat + tool calling<br/>POST /chat/completions"]
        OpenBook["Open Notebook<br/>RAG knowledge base<br/>SSE /api/search/ask"]
        SurrealDB["SurrealDB<br/>vector store for RAG<br/>ws://surrealdb:8000/rpc"]
        MongoDB[("MongoDB 5.0<br/>primary database<br/>mongodb://mongodb:27017")]
    end

    APIJS -->|HTTP/REST| Routes
    Routes --> Services
    Services --> Data
    Services --> External

    CoachAgent -->|tool calls| CoachTools
    CoachAgent -->|axios POST| OpenRouter
    CoachAgent -->|queries| OpenBook
    WorkoutGen --> WorkoutAI
    WorkoutAI -->|RAG| OpenBook
    CoachSync -->|reads| Memory
    OpenBook -->|vectors| SurrealDB
    Data -->|Mongoose| MongoDB

    style Client fill:#eff6ff,stroke:#2563eb
    style Server fill:#f0fdf4,stroke:#16a34a
    style External fill:#faf5ff,stroke:#9333ea
    style Services fill:#fef2f2,stroke:#dc2626
    style Data fill:#dcfce7,stroke:#16a34a
```

## Coach Chat Request Flow

```mermaid
sequenceDiagram
    participant U as User
    participant R as /api/coach/chat
    participant CA as coach-agent.js
    participant DB as MongoDB
    participant OR as OpenRouter LLM
    participant ON as Open Notebook

    U->>R: POST { message, swimmerId }
    R->>CA: chat({ profile, messages })
    CA->>DB: CoachingMemory.find() [assemble context]
    CA->>OR: callLLM(messages, tools)

    loop Agent Loop (max 5 iterations)
        alt LLM returns tool_calls
            CA->>ON: queryKnowledgeBase() [SSE]
            CA->>DB: getSwimmerHistory() / getProgressSummary()
            CA->>DB: addCoachingObservation()
            CA->>OR: append tool result, continue loop
        else LLM returns final text
            CA->>CA: extractConversationLearnings()
        end
    end

    CA->>DB: CoachingMemory.insertMany()
    CA->>R: { reply, actions[], conversationId }
    R->>U: JSON response

    Note over U: User confirms proposal
    U->>R: POST /chat/:id/confirm
    R->>DB: Workout.findByIdAndUpdate()
    R->>U: { applied: true }
```

## Workout Generation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant R as /api/workouts
    participant WG as workout-generator.js
    participant AI as workout-ai.js
    participant MEM as MEMORY.md
    participant CM as CoachingMemory
    participant ON as Open Notebook
    participant OR as OpenRouter LLM
    participant DB as MongoDB

    U->>R: POST { profileId, customization }
    R->>WG: generateWorkout(profile, customization)
    WG->>AI: generateWorkoutAI(profile, customization)
    AI->>MEM: getFeedbackSummary()
    AI->>CM: CoachingMemory.find()
    AI->>ON: queryKnowledgeBase() [RAG]
    ON-->>AI: training insights
    AI->>OR: callLLM(prompt with context)
    OR-->>AI: structured JSON workout
    AI-->>WG: parsed workout data
    WG->>WG: filterGymExercises() + clampWeights()
    WG->>DB: workout.save()
    WG-->>R: Workout document
    R->>U: JSON response
```

## Deployment (Docker Compose)

```mermaid
graph LR
    subgraph Docker["🐳 Docker Compose Network"]
        App["app:3000<br/>Express Server<br/>(Node 18 Alpine)"]
        Mongo[("mongodb:27017<br/>MongoDB 5.0")]
        Surreal["surrealdb:8000<br/>SurrealDB<br/>(vector store)"]
        OpenBook["open-notebook:8502<br/>RAG Knowledge Base"]
    end

    App -->|Mongoose| Mongo
    App -->|SSE| OpenBook
    OpenBook -->|vectors| Surreal

    style Docker fill:#f3f4f6,stroke:#6b7280
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 18 (Alpine) |
| Server | Express 4.x |
| Database | MongoDB 5.0 (via Mongoose ODM) |
| Vector DB | SurrealDB 2.x (for Open Notebook) |
| LLM (chat) | OpenRouter (tool-calling models) |
| LLM (RAG) | Open Notebook (knowledge base with uploaded docs) |
| Frontend | Vanilla JS (no framework), served as static files |
| Build | Webpack (bundle), Babel (transpile) |
| Testing | Jest |
| Deployment | Docker Compose (4 containers) |

## Key Design Decisions

1. **Agentic coach with tool calling** — The coach uses an iterative agent loop (up to 5 LLM calls per user message) with OpenAI-format function calling. Tools let it query knowledge, fetch history, and propose workout modifications.

2. **Proposal pattern for mutations** — Coach-proposed workout changes (modify/regenerate) are stored in an in-memory Map with a `conversationId`. The user must explicitly confirm via a separate API call before mutations apply. This prevents the LLM from making uncommitted writes.

3. **Dual memory systems** — Feedback loop uses both `MEMORY.md` (file-based, human-readable) and `CoachingMemory` (MongoDB, structured queryable observations). The sync service bridges them.

4. **RAG-backed workout generation** — Workout generation queries a scientific swimming knowledge base (Open Notebook over SurrealDB vectors) before sending context to the LLM, grounding workouts in training science.

5. **Equipment-aware generation** — Gym exercises are filtered against the user's available equipment, and prescribed weights are clamped to their actual inventory.
