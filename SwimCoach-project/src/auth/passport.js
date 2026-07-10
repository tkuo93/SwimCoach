const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { SwimmerProfile } = require('../models');

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await SwimmerProfile.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy
// SECURITY: Only allow sign-in via existing googleId match.
// Email-based linking is removed to prevent account takeover.
// For account linking, implement a separate authenticated flow.
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      const googleId = profile.id;
      let user = await SwimmerProfile.findOne({ googleId });

      if (user) {
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      // No existing account with this Google ID - create new profile
      // User will complete their profile on first login
      const email = profile.emails?.[0]?.value?.toLowerCase();
      user = new SwimmerProfile({
        firstName: profile.name?.givenName || 'User',
        lastName: profile.name?.familyName || '',
        email: email || `${googleId}@google.oauth.placeholder`,
        gender: 'prefer-not-to-say',
        dateOfBirth: new Date('2000-01-01'), // Placeholder, user must update
        googleId,
        lastLogin: new Date()
      });
      await user.save();

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;