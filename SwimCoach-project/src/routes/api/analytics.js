const express = require('express');
const router = express.Router();

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
    const { timestamp, userId, sessionId, appVersion } = req.body;

    // Validate required fields
    if (!timestamp) {
      return res.status(400).json({ success: false, error: 'Timestamp required' });
    }

    // Log the acknowledgment (in production, you'd save to DB or send to analytics service)
    console.log('Onboarding acknowledged:', {
      timestamp,
      userId: userId || 'anonymous',
      sessionId,
      appVersion,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // In a real app, you might:
    // - Save to an analytics collection in MongoDB
    // - Send to PostHog, Mixpanel, Amplitude, etc.
    // - Forward to a data warehouse

    res.json({ success: true });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to track acknowledgment' });
  }
});

module.exports = router;