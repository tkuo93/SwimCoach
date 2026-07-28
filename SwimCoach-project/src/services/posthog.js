const { PostHog } = require('posthog-node');

/**
 * PostHog Analytics Service
 * Server-side event tracking for SwimCoach
 * Uses PostHog's free tier (1M events/month)
 */

let posthog = null;

/**
 * Initialize PostHog client
 * Call once at app startup
 */
function initPostHog() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    console.log('PostHog: API key not configured, analytics disabled');
    return null;
  }

  posthog = new PostHog(apiKey, {
    host,
    flushAt: 10,        // Flush after 10 events
    flushInterval: 5000, // Or every 5 seconds
    maxBatchSize: 100,
  });

  // Handle errors gracefully
  posthog.on('error', (err) => {
    console.error('PostHog error:', err.message);
  });

  console.log('PostHog initialized');
  return posthog;
}

/**
 * Track an event
 * @param {string} event - Event name (e.g., 'workout_created', 'onboarding_completed')
 * @param {object} properties - Event properties
 * @param {string} distinctId - User identifier (required)
 * @param {string} [sessionId] - Optional session ID
 */
function track(event, properties = {}, distinctId, sessionId) {
  if (!posthog) {
    return; // Silently skip if not initialized
  }

  try {
    posthog.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $session_id: sessionId,
        app_version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('PostHog track error:', err.message);
  }
}

/**
 * Identify a user (set user properties)
 * @param {string} distinctId - User identifier
 * @param {object} properties - User properties
 */
function identify(distinctId, properties = {}) {
  if (!posthog) {
    return;
  }

  try {
    posthog.identify({
      distinctId,
      properties: {
        ...properties,
        $set: {
          ...properties,
          last_active: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('PostHog identify error:', err.message);
  }
}

/**
 * Track page view (server-side)
 * @param {string} distinctId - User identifier
 * @param {string} url - Page URL
 * @param {object} properties - Additional properties
 */
function trackPageView(distinctId, url, properties = {}) {
  track('$pageview', { $current_url: url, ...properties }, distinctId);
}

/**
 * Flush pending events (call on shutdown)
 */
async function shutdown() {
  if (posthog) {
    await posthog.shutdown();
    console.log('PostHog shut down');
  }
}

/**
 * Get the PostHog instance (for advanced usage)
 */
function getClient() {
  return posthog;
}

module.exports = {
  initPostHog,
  track,
  identify,
  trackPageView,
  shutdown,
  getClient,
};