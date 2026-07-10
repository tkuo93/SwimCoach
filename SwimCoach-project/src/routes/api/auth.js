const express = require('express');
const passport = require('passport');
const router = express.Router();

// GET /api/auth/google - Initiate Google OAuth flow
router.get('/google', (req, res, next) => {
  // Store the intended destination (if any) in session
  // Validate redirect to prevent open redirect attacks
  if (req.query.redirect) {
    const redirect = req.query.redirect;
    // Only allow relative paths starting with / that don't contain // or ..
    if (redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('..')) {
      req.session.oauthRedirect = redirect;
    }
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
});

// GET /api/auth/google/callback - Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=oauth_failed' }),
  (req, res) => {
    // Successful authentication
    const redirect = req.session.oauthRedirect || '/';
    delete req.session.oauthRedirect;
    // Use HTTPS redirect in production
    const finalRedirect = process.env.NODE_ENV === 'production'
      ? redirect.replace(/^http:/, 'https:')
      : redirect;
    res.redirect(finalRedirect);
  }
);

// GET /api/auth/logout - Logout and destroy session
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      // If AJAX request, return JSON; otherwise redirect
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Logged out successfully' });
      }
      res.redirect('/login.html');
    });
  });
});

// GET /api/auth/me - Get current authenticated user
router.get('/me', (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ authenticated: false });
  }

  // Return minimal user info (exclude sensitive fields)
  const { googleId, ...user } = req.user.toObject ? req.user.toObject() : req.user;
  res.json({
    authenticated: true,
    user
  });
});

module.exports = router;

// POST /api/auth/telegram-verify - Verify Telegram linking token
router.post('/telegram-verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token required' });
    }

    const { SwimmerProfile } = require('../../models');
    // Find profile by linking token
    const profile = await SwimmerProfile.findOne({
      telegramLinkToken: token,
      telegramLinkExpires: { $gt: new Date() }
    });

    if (!profile) {
      return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    }

    // Token is valid
    res.json({ success: true, profileId: profile._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/telegram-link-generate - Generate Telegram linking token for current user
router.post('/telegram-link-generate', async (req, res) => {
  try {
    const { telegramId } = req.body;
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Telegram ID required' });
    }

    // Require authentication - profileId derived from session
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { SwimmerProfile } = require('../../models');
    const profile = await SwimmerProfile.findById(req.user._id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Check if this Telegram ID is already linked to another account
    const existingLink = await SwimmerProfile.findOne({ telegramId });
    if (existingLink && existingLink._id.toString() !== profile._id.toString()) {
      return res.status(409).json({ success: false, error: 'This Telegram account is already linked to another SwimCoach profile' });
    }

    // Generate secure linking token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    profile.telegramLinkToken = token;
    profile.telegramLinkExpires = expires;
    await profile.save();

    // Return token separately - frontend should NOT put it in URL
    // Instead, frontend will use the token via Telegram Web App or direct deep link
    const linkCode = crypto.randomBytes(16).toString('hex'); // Short code for URL
    profile.telegramLinkCode = linkCode;
    profile.telegramLinkCodeExpires = expires;
    await profile.save();

    // Deep link format: https://t.me/SwimCoachBot?start=link_{code}
    // Token is NOT in URL - bot validates code → token server-side
    const deepLink = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'SwimCoachBot'}?start=link_${linkCode}`;
    res.json({ success: true, data: { linkCode, expires, deepLink } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});