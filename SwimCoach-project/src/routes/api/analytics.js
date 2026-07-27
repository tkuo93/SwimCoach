const express = require('express');
const router = express.Router();
const { track, identify } = require('../../services/posthog');

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

    // Track onboarding completion event
    track('onboarding_completed', {
      timestamp,
      app_version: appVersion,
      profile_data: profileData || {},
      source: 'web',
    }, distinctId, sessionId);

    // Identify user with profile info if available
    if (userId && profileData) {
      identify(userId, {
        onboarding_completed: true,
        onboarding_date: new Date(timestamp).toISOString(),
        experience_level: profileData.experienceLevel,
        goals: profileData.goals,
        pool_frequency: profileData.poolFrequency,
        gym_frequency: profileData.gymFrequency,
      });
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

    const distinctId = userId || `anon_${sessionId || req.ip}`;

    // Track custom event
    track(event, properties || {}, distinctId, sessionId);

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

    identify(userId, properties || {});

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics identify error:', err);
    res.status(500).json({ success: false, error: 'Failed to identify user' });
  }
});

module.exports = router;