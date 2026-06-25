# AI Concepts Learned

A running document of AI/ML concepts discovered in the SwimCoach codebase, with real code examples.

---

## Concept: Agentic Tool-Calling Loop

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`, `SwimCoach-project/src/services/coach/coach-tools.js`

### Summary
An agent loop lets an LLM decide when it needs to call external tools (query a database, search a knowledge base, propose changes) and iteratively refine its response based on tool results. The loop runs up to a max iteration count, with each tool result fed back into the conversation for the LLM to see.

### How SwimCoach Uses It
The coach agent uses this pattern to give richer answers — it can look up a swimmer's history, query the training knowledge base, or store observations about preferences, all within a single conversation turn.

### Code Example
```javascript
// coach-agent.js:64-112 — core agent loop
for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
  const response = await callLLM(model, agentMessages, tools);
  const choice = response.choices?.[0];
  const message = choice.message;
  agentMessages.push(message);

  if (message.tool_calls?.length > 0) {
    for (const toolCall of message.tool_calls) {
      const result = await executeTool(toolName, toolArgs, { profile, workout });
      agentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
    }
  } else {
    reply = message.content || '';
    break;
  }
}
```

---

## Concept: Observation Extraction from Conversations (Lightweight NLU)

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`

### Summary
Pattern-matching on user messages and coach replies to extract structured observations (preferences, injuries, insights) without making a separate LLM call. Uses regex patterns to detect categories like injury mentions, training preferences, and coaching recommendations, each with a confidence score.

### How SwimCoach Uses It
After every coaching conversation, the system silently extracts learnings and stores them in CoachingMemory. These accumulate over time to personalize future coaching and workout generation.

### Code Example
```javascript
// coach-agent.js:297-309 — injury detection from user message
const injuryKeywords = /\b(hurt|hurts|pain|painful|sore|injury|injured|can't|cannot)\b/;
const bodyParts = /\b(shoulder|knee|back|elbow|wrist|hip|ankle|neck|rotator|calf)\b/;
if (injuryKeywords.test(lowerUser) && bodyParts.test(lowerUser)) {
  const bodyMatch = lowerUser.match(bodyParts);
  observations.push({
    type: 'injury',
    category: 'general',
    content: `User mentioned ${bodyMatch[0]} issue: "${userMessage.slice(0, 100)}"`,
    source: 'user-stated',
    confidence: 0.9,
  });
}
```

---

## Concept: Retrieval-Augmented Generation (RAG) with Knowledge Base

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`, `SwimCoach-project/src/services/open-notebook.js`

### Summary
RAG retrieves relevant documents or passages from a knowledge base and includes them in the LLM prompt as context. This grounds the model's responses in domain-specific knowledge rather than relying solely on its training data.

### How SwimCoach Uses It
Workout generation queries a swimming training knowledge base (Open Notebook) for scientific principles about the swimmer's specific training focus, then includes those insights in the prompt so the generated workout is evidence-based.

### Code Example
```javascript
// workout-ai.js:72-102 — RAG query with fallback
async function getTrainingInsights(profile, customization) {
  const prompt = buildInsightsPrompt(profile, customization);
  try {
    const { query } = require('./open-notebook');
    const answer = await query(prompt);
    if (answer && answer !== 'No answer generated') return answer;
  } catch { /* fall through */ }

  // Fallback: direct REST call to knowledge base
  const res = await onClient.post('/api/search/ask/simple', {
    question: prompt,
    strategy_model: modelId,
    answer_model: modelId,
  });
  return res.data?.answer || '';
}
```

---

## Concept: Prompt Caching for Expensive AI Calls

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
An in-memory cache (Map with TTL and max size) stores RAG query results keyed by a hash of the input parameters. This avoids re-running expensive knowledge base queries when the same swimmer profile and customization are requested again within the TTL window.

### How SwimCoach Uses It
Knowledge base queries can be slow and send 167K+ tokens to the model. The cache prevents redundant queries when generating multiple workouts for the same swimmer in quick succession.

### Code Example
```javascript
// workout-ai.js:35-55 — RAG cache with TTL and LRU eviction
const ragCache = new Map();
const RAG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RAG_CACHE_MAX = 200;

function cacheGet(key) {
  const entry = ragCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > RAG_CACHE_TTL_MS) {
    ragCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (ragCache.size >= RAG_CACHE_MAX) {
    const oldestKey = ragCache.keys().next().value;
    ragCache.delete(oldestKey);
  }
  ragCache.set(key, { value, ts: Date.now() });
}
```

---

## Concept: Structured Output Parsing from LLM Responses

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
LLMs often wrap JSON in markdown code blocks or add explanatory text around it. Robust parsing extracts the JSON by stripping code fences, finding the first `{...}` block, and handling edge cases like truncation or malformed output.

### How SwimCoach Uses It
Workout generation returns structured JSON that must be parsed reliably every time, since the entire workout display depends on it. The parser handles markdown wrapping, embedded text, and truncation errors.

### Code Example
```javascript
// workout-ai.js:391-408 — multi-strategy JSON extraction
let jsonStr = content.trim();

// Strip markdown code blocks
const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

// Find first JSON object if there's surrounding text
if (!jsonStr.startsWith('{')) {
  const braceMatch = jsonStr.match(/\{[\s\S]+\}/);
  if (braceMatch) jsonStr = braceMatch[0];
}

try {
  return JSON.parse(jsonStr);
} catch (parseErr) {
  throw new Error(`Failed to parse workout JSON: ${parseErr.message}`);
}
```

---

## Concept: Token Budget Management for Conversation History

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`

### Summary
LLMs have context window limits. A token budget system estimates token usage (using a rough chars/4 heuristic) and walks backwards through conversation history, including only as many messages as fit within the remaining budget.

### How SwimCoach Uses It
The coach agent keeps conversations going across many turns without exceeding the model's context window. Older messages are dropped first, preserving the most recent and relevant context.

### Code Example
```javascript
// coach-agent.js:254-277 — token-budgeted history
const MAX_HISTORY_TOKENS = 1500;

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function buildConversationHistory(messages, userMessage) {
  const history = [];
  let tokenBudget = MAX_HISTORY_TOKENS - estimateTokens(userMessage);

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].text);
    if (tokens > tokenBudget) break;
    history.unshift({
      role: messages[i].role === 'user' ? 'user' : 'assistant',
      content: messages[i].text,
    });
    tokenBudget -= tokens;
  }
  history.push({ role: 'user', content: userMessage });
  return history;
}
```

---

## Concept: Model Input Sanitization (Allowlist Pattern)

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
User-supplied values that get sent to external APIs are validated against a strict regex pattern or allowlist before use. This prevents injection attacks where a malicious user could specify an arbitrary model ID, API endpoint, or other sensitive parameter.

### How SwimCoach Uses It
Users can override the LLM model via a query parameter. The sanitization ensures only `openrouter/*` model IDs are accepted, falling back to a safe default for anything else.

### Code Example
```javascript
// workout-ai.js:23-32 — model allowlist via regex
const MODEL_PATTERN = /^openrouter\/[\w\-./:@]+$/;

function sanitizeModel(model) {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  return MODEL_PATTERN.test(model.trim()) ? model.trim() : DEFAULT_MODEL;
}
```

---

## Concept: AI Feedback Loop (Coaching Memory Informing Generation)

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`, `SwimCoach-project/src/services/coach/coach-agent.js`

### Summary
AI outputs from one system become inputs to another, creating a feedback loop. Coaching observations extracted from conversations are stored, then retrieved and injected into future workout generation prompts, making each workout smarter than the last.

### How SwimCoach Uses It
The coach agent extracts preferences and patterns from chat. The workout generator reads these observations and includes them in its prompt ("User prefers shorter warm-ups", "Shoulder discomfort on overhead press"), creating a virtuous cycle.

### Code Example
```javascript
// workout-ai.js:597-603 — coaching observations injected into prompt
if (coachingObservations) {
  parts.push('## Coach Observations');
  parts.push('Your coaching system has derived the following insights about this swimmer over time.');
  parts.push('');
  parts.push(coachingObservations);
}
```

---

## Concept: Tool Definition Schema (OpenAI Function-Calling Format)

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-tools.js`

### Summary
Tools are defined as JSON Schema objects describing the function name, description, and parameter types. The LLM receives these definitions and decides when to invoke each tool by generating a structured function call in its response.

### How SwimCoach Uses It
Eight tools are defined (queryKnowledgeBase, getSwimmerHistory, getProgressSummary, etc.) each with typed parameters. The LLM autonomously decides which to call based on the athlete's question.

### Code Example
```javascript
// coach-tools.js:16-42 — tool definition in OpenAI format
const queryKnowledgeBaseTool = {
  definition: {
    type: 'function',
    function: {
      name: 'queryKnowledgeBase',
      description: 'Search the swimming training knowledge base for scientific principles...',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The specific question to search for' },
        },
        required: ['question'],
      },
    },
  },
  async execute({ question }, _context) {
    const result = await queryKnowledgeBase(question);
    return typeof result === 'string' ? result : JSON.stringify(result);
  },
};
```

---

## Concept: Context Assembly for LLM Prompts

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`

### Summary
Multiple data sources (personality docs, user profile, memory, current context) are assembled into a single coherent system prompt. Each section serves a distinct purpose: personality/behavioral guidance, user-specific context, accumulated knowledge, and mode-specific instructions.

### How SwimCoach Uses It
The system prompt combines soul.md (personality), swimmer profile, coaching memory, and workout context into one structured prompt that gives the LLM everything it needs to respond helpfully.

### Code Example
```javascript
// coach-agent.js:153-185 — multi-section system prompt assembly
function buildSystemPrompt(profile, workout, coachingMemoryContext, mode) {
  const parts = [];
  if (soulContent) parts.push(soulContent);           // personality
  parts.push(buildProfileSummary(profile));             // user context
  if (coachingMemoryContext) parts.push(coachingMemoryContext); // memory
  if (mode === 'workout' && workout) {
    parts.push(buildWorkoutContext(workout, profile));  // current workout
  }
  parts.push(`You are in ${mode} coaching mode...`);   // mode instructions
  return parts.join('\n');
}
```

---

## Concept: Confidence Scoring for Machine-Generated Insights

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`, `SwimCoach-project/src/models/CoachingMemory.js`

### Summary
Extracted observations are assigned a confidence score (0-1) based on the source and method of extraction. Direct user statements get higher confidence (0.9), while AI-inferred patterns get lower confidence (0.5). This lets downstream systems weight observations appropriately.

### How SwimCoach Uses It
When the workout generator reads coaching memories, it sorts by confidence so the most reliable observations have more influence. A user saying "I hate long warm-ups" (0.9) outweighs an inferred pattern (0.5).

### Code Example
```javascript
// coach-agent.js:302-347 — confidence varies by source
// Direct user statement → high confidence
confidence: 0.9   // user-stated injury

// AI-inferred pattern → lower confidence
confidence: 0.5   // coach-analysis insight
```

---

## Concept: Proposal Pattern for AI-Suggested Mutations

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-tools.js`

### Summary
Tools don't directly mutate state — they return a "proposal" object that the user must confirm before being applied. This keeps the AI's suggestions visible and gives humans veto power over changes.

### How SwimCoach Uses It
Both `modifyWorkout` and `regenerateWorkout` return proposal objects instead of applying changes directly. The frontend shows the proposal to the athlete, who can approve or reject it.

### Code Example
```javascript
// coach-tools.js:322-331 — proposal pattern
return JSON.stringify({
  proposal: true,
  action: 'modifyWorkout',
  description,
  field,
  currentValue,
  newValue,
  workoutId: workout._id.toString(),
});
```

---

## Concept: Knowledge Note Pre-generation with RAG Fallback

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
A two-tier knowledge retrieval strategy: first try pre-generated condensed notes (fast, cheap), and only fall back to a full RAG query on raw sources if notes are missing. This optimizes for both cost and speed.

### How SwimCoach Uses It
Workout generation first fetches pre-generated notebook notes. Only if those are empty does it run the expensive RAG query against raw sources, avoiding sending 167K+ tokens unnecessarily.

### Code Example
```javascript
// workout-ai.js:319-334 — two-tier knowledge retrieval
const notebookNotes = await getAllNotebookNotes(notesTopic);

let insights = '';
if (!notebookNotes) {
  // Only run expensive RAG if no pre-generated notes exist
  const cacheKey = hashInsightsPrompt(profile, customization);
  insights = cacheGet(cacheKey);
  if (insights === null) {
    insights = await getTrainingInsights(profile, customization);
    cacheSet(cacheKey, insights);
  }
}
```

---

## Concept: Field Path Validation for AI-Driven Mutations

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-tools.js`

### Summary
When an AI model specifies which field to modify, the field path is validated against injection patterns (no `$`, `..`, or `_` prefixes) to prevent the LLM from accessing or modifying internal/sensitive fields like `_id`, `__v`, or Mongo operator injections.

### How SwimCoach Uses It
The `modifyWorkout` tool accepts a dot-path from the LLM (e.g., `poolWorkout.mainSet.0.repetitions`). Before using it, the system validates the path can't reach dangerous fields.

### Code Example
```javascript
// coach-tools.js:317-319 — field path sanitization
if (field.includes('$') || field.includes('..') || field.startsWith('_')) {
  return `Invalid field path: "${field}". Only workout data fields can be modified.`;
}
```

---

## Concept: Parameterized Prompt Construction

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
Prompts are built dynamically by assembling sections conditionally based on available data. Each section adds constraints, context, or instructions relevant to the specific request, avoiding generic prompts in favor of highly-targeted ones.

### How SwimCoach Uses It
The workout prompt includes pool constraints, gym constraints, equipment lists, previous session summaries, taper context, and coaching observations — all conditionally included based on what's relevant to this specific generation.

### Code Example
```javascript
// workout-ai.js:486-497 — conditional program context
if (customization.programId && customization.totalSessions > 1) {
  parts.push('## Program Context');
  parts.push(`This is session ${customization.programIndex + 1} of ${customization.totalSessions}...`);
  if (customization.programIndex === 0) {
    parts.push('This is the first session — start at moderate intensity...');
  } else if (customization.programIndex === customization.totalSessions - 1) {
    parts.push('This is the final session — close out the program...');
  }
}
```

---

## Concept: Structured JSON Schema in System Prompts

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/workout-ai.js`

### Summary
The system prompt includes an explicit JSON schema defining the exact structure the LLM should return. This constrains the model's output format, making it more likely to produce valid, parseable JSON that matches the application's expected shape.

### How SwimCoach Uses It
The workout generator specifies every field (warmUp, mainSet, coolDown, exercises, trainingNotes) with types and descriptions, so the LLM produces exactly the structure the frontend expects.

### Code Example
```javascript
// workout-ai.js:641-698 — JSON schema in system prompt
`"mainSet": [
  {
    "distancePerRep": number,
    "reps": number,
    "stroke": "freestyle|backstroke|breaststroke|butterfly|im|kick|drill",
    "restInterval": "e.g., 1:30, 2:00, 15s",
    "focus": "e.g., technique, speed, endurance, power",
    "notes": "Additional instructions"
  }
]`
```

---

## Concept: Multi-Source Context Ranking by Confidence

**Discovered:** 2026-06-25
**File(s):** `SwimCoach-project/src/services/coach/coach-agent.js`, `SwimCoach-project/src/services/workout-ai.js`

### Summary
When assembling context from multiple sources (coaching memory, feedback history, observations), results are sorted by confidence score descending. This ensures the most reliable information appears first in the prompt, giving it more weight in the LLM's attention.

### How SwimCoach Uses It
Both the coach agent and workout generator sort CoachingMemory results by confidence before including them, so a user's direct statement ("I prefer shorter warm-ups") appears before an inferred pattern.

### Code Example
```javascript
// coach-agent.js:134-140 — sort by confidence for prompt ordering
const memories = await CoachingMemory.find({
  swimmerId: profile._id,
  active: true,
})
  .sort({ confidence: -1, createdAt: -1 })
  .limit(15)
  .select('type category content source confidence');
```

---
