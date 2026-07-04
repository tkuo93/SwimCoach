/**
 * Authentication middleware for session-based auth (Passport).
 * Replaces the old X-Swimmer-Id header-based auth.
 */

function requireAuth(req, res, next) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED'
    });
  }
  next();
}

function optionalAuth(req, res, next) {
  // Attach user if authenticated, but don't require it
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};