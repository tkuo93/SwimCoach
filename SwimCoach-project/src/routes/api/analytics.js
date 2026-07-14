const express = require('express');
const router = express.Router();

// Simple in-memory rate limiter for public analytics endpoint
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const requests = rateLimitMap.get(ip).filter(t => t > windowStart);

  if (requests.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.'
    });
  }

  requests.push(now);
  rateLimitMap.set(ip, requests);

  // Clean up old entries periodically
  if (rateLimitMap.size > 1000) {
    for (const [key, timestamps] of rateLimitMap.entries()) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, valid);
      }
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