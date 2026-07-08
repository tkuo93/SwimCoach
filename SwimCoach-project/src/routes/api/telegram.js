const express = require('express');
const router = express.Router();
console.log('[Telegram] Route module loading...');
const telegramBot = require('../../services/telegram-bot');
console.log('[Telegram] Bot service loaded:', !!telegramBot);

router.post('/', express.json(), (req, res) => {
  console.log('[Telegram] Webhook received');
  telegramBot.processUpdate(req, res);
});

router.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'Telegram webhook endpoint' });
});

console.log('[Telegram] Route module loaded');
module.exports = router;