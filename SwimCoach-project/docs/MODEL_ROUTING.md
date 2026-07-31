# Model Routing System

SwimCoach uses a **model routing system** that assigns different free OpenRouter models to different features based on their strengths. This ensures optimal quality, speed, and cost (free) for each task.

## Quick Reference

| Feature | Primary Model | Why |
|---------|--------------|-----|
| **Generate Workout** | `poolside/laguna-s-2.1:free` | Best code/JSON quality for structured workout schemas |
| **Modify Workout** | `poolside/laguna-xs-2.1:free` | Fast structured edits, good code quality |
| **Chat with Coach** | `inclusionai/ling-3.0-flash:free` | Best reasoning/speed balance for conversation |
| **Technique Advice** | `inclusionai/ling-3.0-flash:free` | Strong reasoning for explanations |
| **Season Analysis** | `nvidia/nemotron-3-ultra:free` | Only model with 1M context for full history |
| **Progress Analysis** | `nvidia/nemotron-3-super:free` | Balanced reasoning, 262K context |
| **Autocomplete/Validate** | `nvidia/nemotron-3-nano-omni:free` | Sub-second latency, effectively unlimited |
| **Quick Suggestions** | `nvidia/nemotron-3-nano-30b-a3b:free` | Fast, high rate limit |

## Configuration Files

### `src/config/model-routes.js` — **Edit this to change model assignments**
- `MODELS` — Model definitions with specs, strengths, daily limits
- `ROUTES` — Feature-to-model mappings with fallbacks
- `DAILY_LIMITS` — Conservative daily request limits per model

### `src/services/model-router.js` — Runtime service
- `callByRoute(routeKey, messages, options)` — Main entry point
- Automatic fallback chain on failure/rate limit
- Daily usage tracking per model

### `src/scripts/model-routes.js` — CLI tool
```bash
# List all routes with details
node src/scripts/model-routes.js

# List all available models
node src/scripts/model-routes.js models

# Show daily usage stats
node src/scripts/model-routes.js usage

# Validate configuration
node src/scripts/model-routes.js validate

# Show details for specific route
node src/scripts/model-routes.js info workout:generate
```

## How to Update Model Assignments

1. **Edit `src/config/model-routes.js`**
2. **Change the `primary` field** in the relevant route
3. **Optionally adjust fallbacks** in the `fallbacks` array
4. **Run validation**: `node src/scripts/model-routes.js validate`

### Example: Change chat model to Gemma
```javascript
// In ROUTES.coach:chat
'coach:chat': {
  primary: 'google/gemma-4-31b:free',  // Changed from ling-3.0-flash
  fallbacks: ['inclusionai/ling-3.0-flash:free', 'nvidia/nemotron-3-super:free'],
  ...
}
```

### Example: Add a new route
```javascript
// In ROUTES
'analysis:injury': {
  description: 'Injury-specific training adjustments',
  primary: 'inclusionai/ling-3.0-flash:free',
  fallbacks: ['nvidia/nemotron-3-super:free'],
  maxTokens: 4096,
  timeout: 60000,
  temperature: 0.5
}
```

## Adding a New Model

1. Add to `MODELS` object with specs
2. Add daily limit to `DAILY_LIMITS`
3. Update routes to use it as primary or fallback
4. Run validation

## Fallback Behavior

- **Automatic**: If primary fails (error, timeout, rate limit), tries fallbacks in order
- **Route-specific first**: Each route has 2-4 tailored fallbacks
- **Universal last-resort**: If ALL route-specific fallbacks fail, tries 4 universal backups:
  1. `nvidia/nemotron-3-super:free` — Best all-rounder (balanced reasoning/speed)
  2. `nvidia/nemotron-3-nano-omni:free` — Fastest, high rate limit
  3. `google/gemma-4-31b:free` — Good for conversation
  4. `cohere/north-mini-code:free` — Good for structured output
- **Rate limit aware**: Tracks daily usage per model, skips rate-limited models
- **Logged**: Console warns when fallbacks are used (shows "route fallback" or "universal fallback")

## Rate Limits

Daily limits are conservative estimates based on weekly token allocations ÷ 7, assuming ~5K tokens/request:
- **High limits (100K+)**: Nano models — effectively unlimited
- **Medium limits (4K-20K)**: Laguna XS, Ling, Gemma, Super
- **Low limits (50-1K)**: Laguna S, Ultra — use sparingly

## Using in Code

```javascript
const { callByRoute } = require('./services/model-router');

// Workout generation
const result = await callByRoute('workout:generate', messages, { maxTokens: 16384 });

// Chat
const result = await callByRoute('coach:chat', messages);

// With options override
const result = await callByRoute('workout:modify', messages, { 
  maxTokens: 8192, 
  temperature: 0.5 
});

// Result includes:
// { content, model, finishReason, usage, route, fallbackUsed, primaryModel }
```

## Monitoring

Check usage anytime:
```javascript
const { getUsageStats } = require('./services/model-router');
console.log(getUsageStats());
// { 'poolside/laguna-s-2.1:free': { used: 150, limit: 1000, remaining: 850, percentUsed: 15 }, ... }
```

Reset for testing:
```javascript
const { resetModelUsage } = require('./services/model-router');
resetModelUsage('poolside/laguna-s-2.1:free');
```