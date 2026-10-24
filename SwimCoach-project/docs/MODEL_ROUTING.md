# Model Routing System

SwimCoach uses a **model routing system** that assigns different free OpenRouter models to different features based on their strengths. This ensures optimal quality, speed, and cost (free) for each task.

## Quick Reference

| Feature | Primary Model | Why |
|---------|--------------|-----|
| **Generate Workout** | `nvidia/nemotron-3.5-lightning:free` | Fast reasoning, 1M context for structured workout schemas |
| **Modify Workout** | `nvidia/nemotron-3.5-lightning:free` | Fast reasoning and structured output for edits |
| **Chat with Coach** | `nvidia/nemotron-3.5-lightning:free` | Good reasoning/speed balance for conversation |
| **Technique Advice** | `nvidia/nemotron-3.5-lightning:free` | Good reasoning for explanations |
| **Season Analysis** | `nvidia/nemotron-3.5-lightning:free` | Strong reasoning for full-season analysis |
| **Progress Analysis** | `nvidia/nemotron-3.5-lightning:free` | Good reasoning for progress insights |
| **Autocomplete/Validate** | `nvidia/nemotron-3.5-lightning:free` | Fast structured output for quick tasks |
| **Quick Suggestions** | `nvidia/nemotron-3.5-lightning:free` | Fast reasoning for suggestions |

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
  primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
  fallbacks: ['openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter/free'],
  ...
}
```

### Example: Add a new route
```javascript
// In ROUTES
'analysis:injury': {
  description: 'Injury-specific training adjustments',
  primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
  fallbacks: ['openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter/free'],
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
- **Route-specific first**: Each route has 2 tailored fallbacks
- **Universal last-resort**: If ALL route-specific fallbacks fail, tries `openrouter/free` (dynamic provider selection)
- **Rate limit aware**: Tracks daily usage per model, skips rate-limited models
- **Logged**: Console warns when fallbacks are used (shows "route fallback" or "universal fallback")

## Rate Limits

Daily limits are conservative estimates based on weekly token allocations ÷ 7, assuming ~5K tokens/request:
- **High limits (1K)**: All models — use with rate limiting

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

## User Model Preferences

Users can override the default model tiers from the **Settings** page in the app. Each user can set:

- **Primary Model** — the first model tried for every request
- **Secondary Model** — used if the primary fails or is rate-limited
- **Fallback Model** — used if both primary and secondary fail

Preferences are stored on the `SwimmerProfile.modelPreferences` sub-document and applied automatically by `callByRoute()` via the `options.modelPreferences` parameter. Setting a tier to "Auto (default)" reverts that tier to the server default.

You can also type a custom OpenRouter model slug (e.g. `openai/gpt-4.1`) in the "Custom Model" field — this overrides the primary tier.

### How It Works

```javascript
// buildModelChain merges user preferences with route defaults
const { buildModelChain } = require('../config/model-routes');

// Returns the effective model chain with user preferences applied
const { modelChain, primaryOverride } = buildModelChain('workout:generate', {
  primary: 'openrouter/openai/gpt-4.1',
  secondary: 'openrouter/anthropic/claude-3.5-sonnet',
  // fallback left unset → uses server default (openrouter/free)
});

// callByRoute accepts preferences via options:
await callByRoute('workout:generate', messages, {
  modelPreferences: profile.modelPreferences
});
```

### API

```
PUT /api/profiles/:id/model-preferences
Body: { primary?: string, secondary?: string, fallback?: string }
```

Pass `null` or an empty string for any tier to revert it to the server default.

## Monitoring

Check usage anytime:
```javascript
const { getUsageStats } = require('./services/model-router');
console.log(getUsageStats());
// { 'openrouter/nvidia/nemotron-3.5-lightning:free': { used: 150, limit: 1000, remaining: 850, percentUsed: 15 }, ... }
```

Reset for testing:
```javascript
const { resetModelUsage } = require('./services/model-router');
resetModelUsage('openrouter/nvidia/nemotron-3.5-lightning:free');
```