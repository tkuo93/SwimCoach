const express = require('express');
const router = express.Router();
const telegramBot = require('../telegram/bot');

// Webhook endpoint - Telegram POSTs here
router.post('/telegram', express.json(), (req, res) => {
  try {
    telegramBot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.sendStatus(500);
  }
});

// Health check for Telegram
router.get('/telegram', (req, res) => {
  res.json({ status: 'ok', bot: 'Telegram webhook endpoint' });
});

module.exports = router;