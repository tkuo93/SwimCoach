# Manual Test Steps — SwimCoach PoC

The auto mode classifier is temporarily blocking bash commands that spawn child processes.
These tests need to be run manually in your terminal until the classifier recovers.

## Prerequisites

1. **Install MongoDB** (choose one):
  - Docker: `docker-compose up -d mongodb` (requires Docker Desktop)
  - Or install MongoDB Community Edition locally
  - Or use MongoDB Atlas (cloud) — update MONGODB_URI in `.env`

2. **Ensure the notebooklm MCP is working** in Claude Code (it is — we tested it)

## Test 1: Start the Server

```bash
cd C:\Users\tkuo9\.claude\projects\SwimCoach\SwimCoach-project
npm start
```

Expected: `SwimCoach server running on port 3000`

## Test 2: Create a Swimmer Profile

```bash
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Mac",
    "lastName": "Tester",
    "dateOfBirth": "1989-06-15",
    "gender": "male",
    "email": "mac@test.com",
    "experienceLevel": "intermediate",
    "goals": {
      "primaryEvents": [{"stroke": "freestyle", "distance": 200}],
      "trainingFocus": "endurance",
      "targetImprovement": "Drop 10 seconds in 200m freestyle"
    },
    "trainingSchedule": {
      "weeklyPoolSessions": 3,
      "weeklyGymSessions": 2,
      "sessionDuration": 60
    },
    "bestTimes": [
      {"stroke": "freestyle", "distance": 200, "time": "03:10.00"}
    ],
    "equipment": {
      "poolLength": 25,
      "poolEquipment": {"fins": true, "paddles": true},
      "gymEquipment": {"weights": true, "yogaMat": true}
    }
  }'
```

Expected: 201 response with the created profile (note the `_id` field).

## Test 3: Generate a Workout

```bash
curl -X POST http://localhost:3000/api/workouts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "swimmerId": "<PASTE_ID_FROM_TEST_2>",
    "workoutType": "lactate",
    "duration": 45,
    "poolLength": 25,
    "availableEquipment": ["fins", "paddles"]
  }'
```

Expected: 201 response with a generated workout containing the NotebookLM response.

**Note:** This will take 30-60 seconds if it works. If it times out, see the
"Troubleshooting" section below.

## Test 4: List Workouts

```bash
curl http://localhost:3000/api/workouts?swimmerId=<PASTE_ID_FROM_TEST_2>
```

## Test 5: Submit Feedback

```bash
curl -X POST http://localhost:3000/api/workouts/<WORKOUT_ID>/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 4,
    "difficultyPerception": "just-right",
    "enjoyed": "enjoyed",
    "comments": "Great workout, felt challenging but doable"
  }'
```

## Test 6: Get Customization Options

```bash
curl http://localhost:3000/api/workouts/customize/options
```

## Test 7: Direct O Query

```bash
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the best training frequency for masters swimmers?"}'
```

---

## Troubleshooting

### If the workout generation endpoint hangs or returns 500:

The `notebooklm-bridge.js` spawns `claude -p` which requires MCP server access.
This is the riskiest part of the architecture. Two fallback approaches:

**Option A (Recommended for PoC):** Use the `claude -p` approach. It should work
if the MCP servers are available in the shell environment. Test this first:
```bash
claude -p "Query notebooklm: what is 2+2"
```

**Option B:** If Option A doesn't work, restructure the bridge to use the
Playwright MCP (already installed) to automate notebooklm.google.com directly,
bypassing the notebooklm MCP entirely. This is more code but more reliable.

**Option C:** For the PoC, create workouts manually through Claude Code's notebooklm
MCP and store them directly in MongoDB via the API. The API itself (profiles, workouts,
feedback) works fine — only the automated generation needs the bridge.
