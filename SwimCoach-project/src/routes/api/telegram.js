const express = require('express');
const router = express.Router();
const telegramBot = require('../../services/telegram-bot');

// Webhook endpoint - Telegram POSTs here
router.post('/telegram', express.json(), (req, res) => {
  // Pass full req/res to processUpdate for secret verification
  telegramBot.processUpdate(req, res);
});

// Health check for Telegram
router.get('/telegram', (req, res) => {
  res.json({ status: 'ok', bot: 'Telegram webhook endpoint' });
});

module.exports = router;