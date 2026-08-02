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
    // Ensure posthog exists as no-op stub
    if (!window.posthog) {
      window.posthog = createNoopStub();
    }
    return;
  }

  // If posthog already initialized (from inline script), don't re-initialize
  if (window.posthog && window.posthog.__loaded) {
    console.log('PostHog already initialized');
    return;
  }

  // Load PostHog script
  const script = document.createElement('script');
  script.src = 'https://app.posthog.com/static/array.js';
  script.async = true;
  script.onerror = function() {
    console.log('PostHog blocked by tracking protection, using no-op stub');
    window.posthog = createNoopStub();
  };
  script.onload = initPostHog;
  document.head.appendChild(script);

  function initPostHog() {
    if (!window.posthog) {
      console.warn('PostHog: Failed to load');
      window.posthog = createNoopStub();
      return;
    }

    // Check if already initialized (might be stub)
    if (window.posthog.__loaded) {
      return;
    }

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,           // Auto-capture clicks, form submissions
      capture_pageview: true,      // Auto-capture page views
      capture_pageleave: true,     // Capture when user leaves
      persistence: 'localStorage', // Persist across sessions
      loaded: function(posthog) {
        // Mark as loaded
        posthog.__loaded = true;
        // Set global properties
        posthog.register({
          app_version: APP_VERSION,
          environment: window.NODE_ENV || 'development',
        });
        console.log('PostHog client initialized');
      },
    });
  }

  function createNoopStub() {
    const methods = [
      'init', 'capture', 'register', 'register_once', 'register_for_session',
      'unregister', 'unregister_for_session', 'getFeatureFlag', 'getFeatureFlagResult',
      'isFeatureEnabled', 'reloadFeatureFlags', 'updateEarlyAccessFeatureEnrollment',
      'getEarlyAccessFeatures', 'on', 'onFeatureFlags', 'onSessionId', 'getSurveys',
      'getActiveMatchingSurveys', 'renderSurvey', 'canRenderSurvey', 'getNextSurveyStep',
      'identify', 'setPersonProperties', 'group', 'resetGroups', 'setPersonPropertiesForFlags',
      'resetPersonPropertiesForFlags', 'setGroupPropertiesForFlags', 'resetGroupPropertiesForFlags',
      'reset', 'get_distinct_id', 'getGroups', 'get_session_id', 'get_session_replay_url',
      'alias', 'set_config', 'startSessionRecording', 'stopSessionRecording',
      'sessionRecordingStarted', 'captureException', 'loadToolbar', 'get_property',
      'getSessionProperty', 'createPersonProfile', 'opt_in_capturing', 'opt_out_capturing',
      'has_opted_in_capturing', 'has_opted_out_capturing', 'clear_opt_in_out_capturing', 'debug'
    ];

    const noop = function() {};
    const stub = {
      _i: [],
      __loaded: true,  // Mark as loaded so we don't try to init again
      people: { _i: [], toString: function() { return 'posthog.people (stub)'; } }
    };

    methods.forEach(function(method) {
      stub[method] = noop;
    });

    stub.toString = function() { return 'posthog (stub)'; };
    stub.people.toString = function() { return 'posthog.people (stub)'; };

    return stub;
  }

  // Expose helper functions for manual tracking
  window.ph = {
    /**
     * Track a custom event
     * @param {string} event - Event name
     * @param {object} properties - Event properties
     */
    track: function(event, properties = {}) {
      if (window.posthog && typeof window.posthog.capture === 'function') {
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
      if (window.posthog && typeof window.posthog.identify === 'function') {
        window.posthog.identify(distinctId, properties);
      }
    },

    /**
     * Reset user (on logout)
     */
    reset: function() {
      if (window.posthog && typeof window.posthog.reset === 'function') {
        window.posthog.reset();
      }
    },

    /**
     * Track page view manually
     * @param {string} url - Page URL
     * @param {object} properties - Additional properties
     */
    pageview: function(url, properties = {}) {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture('$pageview', {
          $current_url: url,
          ...properties,
        });
      }
    },
  };
})();