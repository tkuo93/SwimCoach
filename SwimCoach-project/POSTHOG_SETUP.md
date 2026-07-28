# PostHog Analytics Implementation for SwimCoach

## Overview
Implemented comprehensive event tracking using **PostHog** (free tier: 1M events/month) with both server-side and client-side tracking.

## Files Created/Modified

### New Files
1. **`src/services/posthog.js`** - Server-side PostHog service with:
   - `initPostHog()` - Initialize at app startup
   - `track(event, properties, distinctId, sessionId)` - Track custom events
   - `identify(distinctId, properties)` - Set user properties
   - `trackPageView(distinctId, url, properties)` - Track page views
   - `shutdown()` - Graceful shutdown

2. **`public/js/posthog-client.js`** - Client-side PostHog initialization with:
   - Auto-capture (clicks, form submissions, page views)
   - `window.ph.track(event, properties)` - Manual event tracking
   - `window.ph.identify(distinctId, properties)` - User identification
   - `window.ph.reset()` - Clear user on logout
   - `window.ph.pageview(url, properties)` - Manual page views

3. **`src/services/posthog-examples.js`** - Usage examples and recommended events

### Modified Files
1. **`package.json`** - Added `posthog-node` dependency
2. **`src/index.js`** - Initialize PostHog at startup, graceful shutdown handlers
3. **`src/routes/api/analytics.js`** - Updated to use PostHog for tracking
4. **`src/routes/api/coach.js`** - Added tracking for:
   - `coach_message_sent` - Coach interactions
   - `workout_modified` - Workout modifications via coach
   - `workout_regenerated` - Workout regeneration via coach
5. **`src/routes/api/workouts.js`** - Added tracking for:
   - `workout_generated` - AI workout generation
   - `workout_completed` - Workout feedback/completion
4. **`public/index.html`** - Added PostHog config injection and client script loading
5. **`.env.example`** - Added PostHog environment variables

## Configuration

### Environment Variables (add to `.env`)
```bash
# PostHog Analytics (Free Tier: 1M events/month)
# Get your API key from https://app.posthog.com/project/settings
POSTHOG_API_KEY=phc_your_api_key_here
POSTHOG_HOST=https://app.posthog.com
APP_VERSION=1.0.0
```

### Getting Your PostHog API Key
1. Sign up at https://posthog.com (free tier: 1M events/month)
2. Create a project
3. Go to Project Settings → API Keys
4. Copy the **Project API Key** (starts with `phc_`)
5. Add to your `.env` file

## Usage Examples

### Server-Side (Node.js)
```javascript
const { track, identify, trackPageView } = require('./services/posthog');

// Track workout generation
track('workout_generated', {
  workout_id: 'abc123',
  workout_type: 'pool',
  duration: 60,
  is_ai_generated: true,
}, userId, sessionId);

// Identify user on login
identify(userId, {
  email: 'user@example.com',
  experience_level: 'intermediate',
  weekly_pool_sessions: 3,
  subscription_tier: 'free',
});
```

### Client-Side (Browser)
```javascript
// Track custom events
window.ph.track('button_clicked', {
  button: 'generate_workout',
  location: 'dashboard',
});

// Identify user after login
window.ph.identify(userId, {
  email: 'user@example.com',
  first_name: 'John',
});

// Reset on logout
window.ph.reset();
```

## Tracked Events (Automatic)

| Event | Trigger | Properties |
|-------|---------|------------|
| `onboarding_completed` | Privacy modal acknowledged | experience_level, goals, frequencies |
| `workout_generated` | POST /api/workouts/generate | workout_type, duration, intensity, mode |
| `workout_completed` | POST /api/workouts/:id/feedback | rating, difficulty, enjoyment, quality |
| `coach_message_sent` | POST /api/coach/chat | message_type, proposals_count, workout_id |
| `workout_modified` | Coach confirm modifyWorkout | field_modified, via_coach: true |
| `workout_regenerated` | Coach confirm regenerateWorkout | original_id, new_id, via_coach: true |

## Recommended Additional Events to Track

Add these to your frontend code using `window.ph.track()`:

```javascript
// Feature adoption
window.ph.track('feature_used', { feature: 'workout_customization', action: 'drag_drop' });

// User progress
window.ph.track('best_time_logged', { stroke: 'freestyle', distance: 100, time: '1:05.2' });

// Engagement
window.ph.track('workout_shared', { workout_id: 'abc', platform: 'telegram' });

// Errors
window.ph.track('error_occurred', { error_type: 'generation_failed', page: '/workouts/generate' });
```

## User Properties (for identify)

Set these on login/profile update:
- `experience_level`: beginner | intermediate | advanced | elite
- `primary_goals`: array of goals
- `weekly_pool_sessions`: number
- `weekly_gym_sessions`: number
- `subscription_tier`: free | pro
- `total_workouts_logged`: number
- `lifetime_pool_meters`: number
- `last_workout_date`: ISO string

## Privacy & Compliance

- PostHog is GDPR/CCPA compliant
- No PII in event properties (use `identify` for user info)
- Respects Do Not Track header
- Client-side can be disabled by not setting `POSTHOG_API_KEY`
- Onboarding acknowledgment tracked via existing `/api/analytics/onboarding-acknowledged`

## Free Tier Limits

| Resource | Limit |
|----------|-------|
| Events/month | 1,000,000 |
| Session recordings | 5,000 |
| Data retention | 1 year |
| Team members | Unlimited |
| Projects | Unlimited |

For SwimCoach's "Masters Mac" scale (hundreds of users, ~3 workouts/week), this provides years of headroom.

## Self-Hosting Option

If you ever exceed limits, PostHog can be self-hosted:
```bash
docker run -d --name posthog -p 8000:8000 posthog/posthog
```
Then set `POSTHOG_HOST=http://your-server:8000`