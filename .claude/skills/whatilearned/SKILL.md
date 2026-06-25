# SKILL
---
name: whatilearned
description: Scans the SwimCoach codebase for AI/ML concepts and appends new learnings to docs/ai-concepts-learned.md. Triggers on /whatilearned slash command, or automatically after major git commits and pushes. Each entry states the concept, a summary explanation, and a concrete code example from the project.
---

# What I Learned — AI Concepts Tracker

Scans the SwimCoach codebase for AI/ML concepts and keeps a running document of learnings.

## When to Run

1. **Manual:** User types `/whatilearned`
2. **Automatic:** After a `git commit` followed by a `git push` (detect via commit size or user trigger)

## Instructions

### Step 1: Determine what to scan

Run `git log --oneline -10` to see recent commits. If triggered manually or after a push, scan the full target directories. If triggered after a commit, focus on diff since last scan.

Target directories (AI-relevant code lives here):
- `SwimCoach-project/src/services/coach/` — agent, tools, soul
- `SwimCoach-project/src/services/workout-ai.js` — RAG, prompt engineering, model calls
- `SwimCoach-project/src/services/workout-generator.js` — generation pipeline
- `SwimCoach-project/src/services/open-notebook.js` — knowledge base integration
- `SwimCoach-project/src/services/coaching-memory-sync.js` — memory sync
- `SwimCoach-project/src/models/` — schemas that power AI features

### Step 2: Read the existing document

Read `docs/ai-concepts-learned.md` if it exists. Note which concepts are already documented (check the `## Concept:` lines). We will only append NEW concepts.

### Step 3: Scan for AI concepts

Read the target files and identify AI/ML concepts. For each concept found, check if it's already in the document. If it's new, document it.

**What counts as an "AI concept":**
- LLM integration patterns (prompt engineering, system prompts, tool-calling, agent loops)
- RAG (retrieval-augmented generation) and knowledge base patterns
- Agent design (tool definition, execution loops, context assembly)
- Memory / learning systems (observation extraction, confidence scoring)
- Embeddings and semantic search
- Model input/output patterns (JSON mode, streaming, token budgets)
- Caching strategies for AI calls
- Feedback loops where AI output informs future AI input
- AI safety patterns (input sanitization, allowlists, rate limiting)
- Structured output parsing from LLM responses

**What does NOT count:**
- Standard CRUD / REST API patterns
- General JavaScript/Node.js techniques (async/await, error handling)
- Database queries that don't feed into AI features
- UI/UX code

### Step 4: Write new entries

For each NEW concept, append to `docs/ai-concepts-learned.md` in this format:

```markdown
## Concept: [Name of Concept]

**Discovered:** [Date]
**File(s):** [file paths]

### Summary
[2-3 sentences explaining the concept in plain language — what it is, why it matters]

### How SwimCoach Uses It
[1-2 sentences connecting it to the project specifically]

### Code Example
```javascript
// [file_path:line_number] — brief comment about what this does
[relevant code snippet, 5-15 lines]
```

---
```

### Step 5: Report

Tell the user:
- How many new concepts were found and added
- How many concepts the document now has total
- If no new concepts were found, say so

## Important Rules

- **Never duplicate** — if a concept is already documented (even with different wording), skip it
- **Be specific** — the code example must be real code from this codebase, not generic
- **Append only** — never rewrite or reorder existing entries
- **Depth over breadth** — a few well-explained concepts beats a long list of shallow ones
- **Plain language** — the summary should be understandable to someone who hasn't read the code
