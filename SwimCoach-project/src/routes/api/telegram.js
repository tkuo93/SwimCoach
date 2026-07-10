const express = require('express');
const router = express.Router();
const telegramBot = require('../../services/telegram-bot');

router.post('/', express.json(), (req, res) => {
  telegramBot.processUpdate(req, res);
});

router.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'Telegram webhook endpoint' });
});

module.exports = router;