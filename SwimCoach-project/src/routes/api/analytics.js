const express = require('express');
const router = express.Router();

// Simple in-memory rate limiter for public analytics endpoint
// Uses fixed-size LRU with TTL to prevent unbounded growth
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP
const MAX_IPS = 5000; // Hard cap on tracked IPs

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

  // Global eviction: remove oldest IPs when cap reached
  if (rateLimitMap.size > MAX_IPS) {
    const entries = [...rateLimitMap.entries()];
    // Sort by oldest request timestamp (ascending)
    entries.sort((a, b) => a[1][0] - b[1][0]);
    // Evict oldest 20%
    const evictCount = Math.floor(MAX_IPS * 0.2);
    for (let i = 0; i < evictCount; i++) {
      rateLimitMap.delete(entries[i][0]);
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