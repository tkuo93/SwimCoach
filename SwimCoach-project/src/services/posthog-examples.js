/**
 * PostHog Analytics Usage Examples for SwimCoach
 *
 * This file demonstrates how to track events from both client and server.
 * Import these functions and use them throughout your codebase.
 */

// ============================================
// SERVER-SIDE (Node.js/Express)
// ============================================
// Import the PostHog service
// const { track, identify, trackPageView } = require('./services/posthog');

/*
// Track a workout creation
track('workout_created', {
  workout_type: 'pool',           // 'pool' | 'gym' | 'mixed'
  duration_minutes: 60,
  distance_meters: 3000,
  strokes: ['freestyle', 'backstroke'],
  is_ai_generated: true,
  difficulty: 'intermediate',
}, userId, sessionId);

// Track onboarding completion
track('onboarding_completed', {
  experience_level: 'intermediate',
  goals: ['drop-time', 'build-muscle'],
  pool_frequency: 3,
  gym_frequency: 2,
  primary_events: ['freestyle 100m', 'freestyle 200m'],
}, userId, sessionId);

// Track profile updates
track('profile_updated', {
  fields_changed: ['experienceLevel', 'goals', 'weeklyPoolSessions'],
  previous_experience: 'beginner',
  new_experience: 'intermediate',
}, userId, sessionId);

// Track coach interactions
track('coach_message_sent', {
  message_type: 'question',       // 'question' | 'feedback' | 'modification'
  conversation_length: 5,
  has_context: true,
}, userId, sessionId);

// Track workout completion
track('workout_completed', {
  workout_id: 'abc123',
  planned_duration: 60,
  actual_duration: 58,
  completion_rate: 0.95,
  rpe: 7,                         // Rate of Perceived Exertion (1-10)
  notes: 'Felt strong on main set',
}, userId, sessionId);

// Track feature usage
track('feature_used', {
  feature: 'workout_customization',
  action: 'drag_drop_reorder',
  workout_type: 'pool',
}, userId, sessionId);

// Identify user with properties (call on login, profile update)
identify(userId, {
  email: 'user@example.com',
  first_name: 'John',
  experience_level: 'intermediate',
  created_at: '2024-01-15T10:30:00Z',
  total_workouts: 42,
  total_pool_meters: 125000,
  subscription_tier: 'free',      // 'free' | 'pro' | 'coach'
  last_active: new Date().toISOString(),
});

// Track page views (server-side rendering)
trackPageView(userId, '/dashboard', {
  page_category: 'dashboard',
  has_active_workout: true,
});
*/

// ============================================
// CLIENT-SIDE (Browser JavaScript)
// ============================================
// The posthog-client.js script exposes window.ph with helper functions:
/*
// Track custom event
window.ph.track('workout_started', {
  workout_id: 'abc123',
  workout_type: 'pool',
  planned_sets: 12,
});

// Track button clicks / UI interactions
window.ph.track('button_clicked', {
  button: 'generate_workout',
  location: 'dashboard',
  workout_type: 'pool',
});

// Identify user after login
window.ph.identify(userId, {
  email: 'user@example.com',
  first_name: 'John',
  experience_level: 'intermediate',
});

// Reset on logout
window.ph.reset();

// Manual page view (for SPA navigation)
window.ph.pageview('/workouts/abc123', {
  page_category: 'workout_detail',
  workout_type: 'pool',
});
*/

// ============================================
// EVENT NAMING CONVENTIONS
// ============================================
/*
Use snake_case for event names:
- object_action format: workout_created, profile_updated, coach_message_sent
- feature_used for feature adoption tracking
- onboarding_step_completed for funnel analysis

Properties should be:
- Flat objects (no deep nesting)
- Consistent naming: snake_case for keys
- Include context: workout_type, source, version
- Avoid PII in event properties (use identify for user info)
*/

// ============================================
// RECOMMENDED EVENTS FOR SWIMCOACH
// ============================================
/*
Core Events (must track):
1. onboarding_completed - Funnel conversion
2. workout_created - Core feature usage
3. workout_completed - Retention metric
4. profile_created - Activation
5. coach_conversation_started - AI feature adoption

Secondary Events (track for insights):
6. workout_customized - Customization feature
7. workout_shared - Social/viral
8. best_time_logged - Progress tracking
9. gym_workout_completed - Cross-training
10. feedback_submitted - User sentiment
11. feature_used - Feature adoption (with feature property)
12. error_occurred - Error tracking (with error_type, page)

User Properties (identify):
- experience_level: beginner | intermediate | advanced | elite
- primary_goals: array of goals
- weekly_pool_sessions: number
- weekly_gym_sessions: number
- subscription_tier: free | pro
- total_workouts_logged: number
- lifetime_pool_meters: number
- last_workout_date: ISO string
*/

module.exports = {};