const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const SwimmerProfile = require('../../models/SwimmerProfile');

// POST /api/profiles - Create new profile (for migration/linking)
router.post('/', async (req, res) => {
  try {
    const profile = new SwimmerProfile({
      ...req.body,
      swimmerId: req.user._id // Override with authenticated user
    });
    await profile.save();
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors: messages });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A profile with this email already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles - Get all profiles for authenticated user
router.get('/', async (req, res) => {
  try {
    const profiles = await SwimmerProfile.find({ googleId: req.user.googleId }).sort({ createdAt: -1 });
    res.json({ success: true, count: profiles.length, data: profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles/:id - Get profile (must belong to authenticated user)
router.get('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findOne({
      _id: req.params.id,
      googleId: req.user.googleId
    });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/profiles/:id/telegram-link - Generate Telegram linking token
router.post('/:id/telegram-link', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findOne({
      _id: req.params.id,
      googleId: req.user.googleId
    });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Generate secure linking token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    profile.telegramLinkToken = token;
    profile.telegramLinkExpires = expires;
    await profile.save();

    const linkUrl = `${process.env.FRONTEND_URL}/telegram-link?telegramId=${req.body.telegramId}&token=${token}`;
    res.json({ success: true, data: { token, expires, linkUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/profiles/migrate - Migrate localStorage profile to authenticated user
router.post('/migrate', async (req, res) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId required' });
    }

    // SECURITY: Verify ownership - profile must either be unlinked (no googleId)
    // or already belong to the current user
    const profile = await SwimmerProfile.findOne({
      _id: profileId,
      $or: [
        { googleId: { $exists: false } },
        { googleId: req.user.googleId }
      ]
    });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found or already linked to another account' });
    }

    // Check if already linked to a different Google account
    if (profile.googleId && profile.googleId !== req.user.googleId) {
      return res.status(409).json({ success: false, error: 'Profile already linked to another account' });
    }

    profile.googleId = req.user.googleId;
    profile.migratedAt = new Date();
    await profile.save();

    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/profiles/:id - Update profile (must belong to authenticated user)
router.put('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findOneAndUpdate(
      { _id: req.params.id, googleId: req.user.googleId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors: messages });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/profiles/:id - Delete profile (must belong to authenticated user)
router.delete('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findOneAndDelete({
      _id: req.params.id,
      googleId: req.user.googleId
    });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;