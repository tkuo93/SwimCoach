/**
 * Simple authentication middleware.
 *
 * In a production app this would use JWT sessions, OAuth, etc.
 * For now we use a shared secret via the X-API-Key header to protect
 * sensitive endpoints (debug, memory, workout ownership).
 */

const API_KEY = process.env.SWIMCOACH_API_KEY || '';

/**
 * Require a valid API key. Returns 401 if missing/invalid.
 */
function requireApiKey(req, res, next) {
  if (!API_KEY) {
    // No key configured — allow through (dev mode)
    return next();
  }
  const provided = req.headers['x-api-key'] || req.query.apiKey;
  if (provided !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

/**
 * Resolve the current user from the X-Swimmer-Id header.
 * In production this would come from a session/JWT.
 * Returns the swimmerId string or null.
 */
function resolveSwimmerId(req) {
  return req.headers['x-swimmer-id'] || req.query.swimmerId || req.body?.swimmerId || null;
}

/**
 * Require that the resolved swimmerId matches the resource owner.
 * Must be called after resolveSwimmerId. Returns 403 on mismatch.
 */
function requireOwnership(req, res, swimmerId, ownerId) {
  if (!swimmerId) {
    return res.status(401).json({ success: false, error: 'Swimmer ID required. Provide X-Swimmer-Id header.' });
  }
  if (swimmerId !== ownerId.toString()) {
    return res.status(403).json({ success: false, error: 'Forbidden — you do not own this resource.' });
  }
  return null; // OK
}

/**
 * Sanitize a string to prevent path traversal.
 * Returns null if the path is suspicious.
 */
function safePath(input) {
  if (typeof input !== 'string') return null;
  // Reject paths with traversal attempts
  if (input.includes('..') || input.includes('//') || path.isAbsolute(input)) return null;
  return input;
}

module.exports = {
  requireApiKey,
  resolveSwimmerId,
  requireOwnership,
  safePath,
};
