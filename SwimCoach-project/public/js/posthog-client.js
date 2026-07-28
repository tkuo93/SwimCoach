// PostHog Client-Side Analytics for SwimCoach
// Initialize PostHog on the frontend

(function() {
  'use strict';

  const POSTHOG_KEY = window.POSTHOG_KEY || '';
  const POSTHOG_HOST = window.POSTHOG_HOST || 'https://app.posthog.com';
  const APP_VERSION = window.APP_VERSION || '1.0.0';

  // Don't initialize if no key (e.g., local development without analytics)
  if (!POSTHOG_KEY) {
    console.log('PostHog: No API key, client-side analytics disabled');
    window.posthog = null;
    return;
  }

  // Load PostHog script
  const script = document.createElement('script');
  script.src = 'https://app.posthog.com/static/array.js';
  script.async = true;
  script.onload = initPostHog;
  document.head.appendChild(script);

  function initPostHog() {
    if (!window.posthog) {
      console.warn('PostHog: Failed to load');
      return;
    }

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,           // Auto-capture clicks, form submissions
      capture_pageview: true,      // Auto-capture page views
      capture_pageleave: true,     // Capture when user leaves
      persistence: 'localStorage', // Persist across sessions
      loaded: function(posthog) {
        // Set global properties
        posthog.register({
          app_version: APP_VERSION,
          environment: window.NODE_ENV || 'development',
        });
        console.log('PostHog client initialized');
      },
    });
  }

  // Expose helper functions for manual tracking
  window.ph = {
    /**
     * Track a custom event
     * @param {string} event - Event name
     * @param {object} properties - Event properties
     */
    track: function(event, properties = {}) {
      if (window.posthog) {
        window.posthog.capture(event, {
          ...properties,
          app_version: APP_VERSION,
        });
      }
    },

    /**
     * Identify user
     * @param {string} distinctId - User ID
     * @param {object} properties - User properties
     */
    identify: function(distinctId, properties = {}) {
      if (window.posthog) {
        window.posthog.identify(distinctId, properties);
      }
    },

    /**
     * Reset user (on logout)
     */
    reset: function() {
      if (window.posthog) {
        window.posthog.reset();
      }
    },

    /**
     * Track page view manually
     * @param {string} url - Page URL
     * @param {object} properties - Additional properties
     */
    pageview: function(url, properties = {}) {
      if (window.posthog) {
        window.posthog.capture('$pageview', {
          $current_url: url,
          ...properties,
        });
      }
    },
  };
})();