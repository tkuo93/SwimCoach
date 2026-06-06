const express = require('express');
const router = express.Router();
const SwimmerProfile = require('../../models/SwimmerProfile'); // POST /api/profiles
router.post('/', async (req, res) => {
  try {
    const profile = new SwimmerProfile(req.body);
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

// GET /api/profiles
router.get('/', async (req, res) => {
  try {
    const profiles = await SwimmerProfile.find().sort({ createdAt: -1 });
    res.json({ success: true, count: profiles.length, data: profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles/:id
router.get('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/profiles/:id
router.put('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
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

// DELETE /api/profiles/:id
router.delete('/:id', async (req, res) => {
  try {
    const profile = await SwimmerProfile.findByIdAndDelete(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
