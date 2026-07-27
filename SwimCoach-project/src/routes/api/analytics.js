const express = require('express');
const router = express.Router();
const { track, identify } = require('../../services/posthog');

/**
 * Allowed event names for the generic event endpoint
 */
const ALLOWED_EVENTS = new Set([
  'workout_started',
  'workout_completed',
  'workout_feedback_submitted',
  'quick_workout_started',
  'onboarding_completed',
  'google_sign_in_clicked',
  'workout_generated',
  'coach_chat_opened',
  'coach_message_sent',
]);

/**
 * Sanitize an object for analytics - remove prototype pollution risks,
 * limit depth, and only allow safe types
 */
function sanitizeAnalyticsObject(obj, maxDepth = 3, currentDepth = 0) {
  if (obj === null || obj === undefined) return undefined;
  if (currentDepth > maxDepth) return '[max depth exceeded]';

  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map(item => sanitizeAnalyticsObject(item, maxDepth, currentDepth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    const keys = Object.keys(obj).slice(0, 50); // Limit number of keys
    for (const key of keys) {
      // Block prototype pollution vectors
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.startsWith('__')) {
        continue;
      }
      const value = obj[key];
      if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
        sanitized[key] = sanitizeAnalyticsObject(value, maxDepth, currentDepth + 1);
      }
    }
    return sanitized;
  }

  // Primitive values - limit string length
  if (typeof obj === 'string') {
    return obj.slice(0, 1000);
  }

  if (typeof obj === 'number') {
    return Number.isFinite(obj) ? obj : 0;
  }

  if (typeof obj === 'boolean') {
    return obj;
  }

  return String(obj).slice(0, 1000);
}

/**
 * Extract only allowed profile fields
 */
function pickAllowedProfileData(profileData) {
  if (!profileData || typeof profileData !== 'object') return {};

  const allowedFields = [
    'experienceLevel',
    'goals',
    'poolFrequency',
    'gymFrequency',
    'duration',
    'event',
    'level'
  ];

  const result = {};
  for (const field of allowedFields) {
    if (profileData[field] !== undefined) {
      result[field] = profileData[field];
    }
  }
  return result;
}

// Simple in-memory rate limiter for public analytics endpoint
// Uses fixed-size LRU with TTL to prevent unbounded growth
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP
const MAX_IPS = 5000; // Hard cap on tracked IPs
const EVICTION_BATCH = 100; // Evict this many random entries when cap reached

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Evict expired entries for this IP
  let requests = rateLimitMap.get(ip) || [];
  requests = requests.filter(t => t > windowStart);

  if (requests.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.'
    });
  }

  requests.push(now);
  rateLimitMap.set(ip, requests);

  // Global eviction: remove random entries when cap reached (O(1) per eviction)
  if (rateLimitMap.size > MAX_IPS) {
    const keys = rateLimitMap.keys();
    for (let i = 0; i < EVICTION_BATCH; i++) {
      const { done, value } = keys.next();
      if (done) break;
      rateLimitMap.delete(value);
    }
  }

  next();
}

// POST /api/analytics/onboarding-acknowledged - Track onboarding privacy acknowledgment
router.post('/onboarding-acknowledged', rateLimiter, async (req, res) => {
  try {
    const { timestamp, userId, sessionId, appVersion, profileData } = req.body;

    // Validate required fields
    if (!timestamp) {
      return res.status(400).json({ success: false, error: 'Timestamp required' });
    }

    const distinctId = userId || `anon_${sessionId || req.ip}`;

    // Sanitize profile data to only allowed fields
    const allowedProfileData = pickAllowedProfileData(profileData);

    // Track onboarding completion event
    track('onboarding_completed', sanitizeAnalyticsObject({
      timestamp,
      app_version: appVersion,
      profile_data: allowedProfileData,
      source: 'web',
    }), distinctId, sessionId);

    // Identify user with profile info if available
    if (userId && profileData) {
      identify(userId, sanitizeAnalyticsObject({
        onboarding_completed: true,
        onboarding_date: new Date(timestamp).toISOString(),
        experience_level: allowedProfileData.experienceLevel,
        goals: allowedProfileData.goals,
        pool_frequency: allowedProfileData.poolFrequency,
        gym_frequency: allowedProfileData.gymFrequency,
      }));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to track acknowledgment' });
  }
});

// POST /api/analytics/event - Generic event tracking endpoint
router.post('/event', rateLimiter, async (req, res) => {
  try {
    const { event, properties, userId, sessionId } = req.body;

    // Validate required fields
    if (!event) {
      return res.status(400).json({ success: false, error: 'Event name required' });
    }

    // Validate event name against allowlist
    if (!ALLOWED_EVENTS.has(event)) {
      return res.status(400).json({ success: false, error: 'Invalid event name' });
    }

    const distinctId = userId || `anon_${sessionId || req.ip}`;

    // Track custom event with sanitized properties
    track(event, sanitizeAnalyticsObject(properties || {}), distinctId, sessionId);

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics event error:', err);
    res.status(500).json({ success: false, error: 'Failed to track event' });
  }
});

// POST /api/analytics/identify - Identify user with properties
router.post('/identify', rateLimiter, async (req, res) => {
  try {
    const { userId, properties } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    // Validate userId format (basic sanity check)
    if (typeof userId !== 'string' || userId.length > 200) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    // Sanitize properties with strict allowlist for user profile fields
    const allowedProfileFields = new Set([
      'email', 'firstName', 'lastName', 'experienceLevel', 'goals',
      'poolFrequency', 'gymFrequency', 'onboarding_completed',
      'onboarding_date', 'created_at', 'last_active'
    ]);

    const sanitizedProps = {};
    if (properties && typeof properties === 'object') {
      for (const [key, value] of Object.entries(properties)) {
        if (allowedProfileFields.has(key) && value !== undefined) {
          sanitizedProps[key] = sanitizeAnalyticsObject({ [key]: value })[key];
        }
      }
    }

    identify(userId, sanitizedProps);

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics identify error:', err);
    res.status(500).json({ success: false, error: 'Failed to identify user' });
  }
});

module.exports = router;