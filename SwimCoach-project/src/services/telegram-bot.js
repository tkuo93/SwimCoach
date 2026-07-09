/**
 * Telegram Bot Service for SwimCoach
 * Webhook-based (not long-polling) for free hosting compatibility
 */

const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const SwimmerProfile = require('../models/SwimmerProfile');
const CoachSession = require('../models/CoachSession');
const { generateWorkout } = require('../services/workout-generator');
const { chat: coachChat } = require('../services/coach/coach-agent');

// MarkdownV2 escaping - required for safe user content
function escapeMarkdown(text) {
  if (text == null) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// Safe sender - ensures all dynamic content is escaped
async function safeSendMessage(bot, chatId, template, values = {}, options = {}) {
  let text = template;
  for (const [key, value] of Object.entries(values)) {
    const escaped = escapeMarkdown(String(value));
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), escaped);
  }
  await bot.sendMessage(chatId, text, { ...options, parse_mode: 'MarkdownV2' });
}

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.webhookUrl = null;
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

  /**
   * Initialize the bot with webhook
   * @param {string} token - Telegram bot token from BotFather
   * @param {string} webhookUrl - Public HTTPS URL for webhook (e.g., https://app.onrender.com/api/telegram)
   */
  async init(token, webhookUrl) {
    if (!token) {
      console.log('Telegram: No token provided, bot disabled');
      return;
    }

    this.webhookUrl = webhookUrl;

    // Create bot WITHOUT polling
    this.bot = new TelegramBot(token, { polling: false });

    // Set webhook with secret token for security
    const webhookOptions = {};
    if (this.webhookSecret) {
      webhookOptions.secret_token = this.webhookSecret;
    }

    try {
      await this.bot.setWebHook(webhookUrl, webhookOptions);
      console.log(`Telegram: Webhook set to ${webhookUrl}${this.webhookSecret ? ' (with secret token)' : ''}`);
    } catch (err) {
      console.error('Telegram: Failed to set webhook:', err.message);
    }

    // Register handlers
    this.registerHandlers();

    console.log('Telegram: Bot initialized (webhook mode)');
  }

  /**
   * Register command and message handlers
   */
  registerHandlers() {
    if (!this.bot) return;

    // /start - Welcome and link account
    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      await this.handleStart(msg, match?.[1]?.trim());
    });

    // /workout - Generate today\\'s workout
    this.bot.onText(/\/workout/, async (msg) => {
      await this.handleWorkout(msg);
    });

    // /coach - Chat with coach
    this.bot.onText(/\/coach/, async (msg) => {
      await this.handleCoach(msg);
    });

    // /help - Show commands
    this.bot.onText(/\/help/, async (msg) => {
      await this.handleHelp(msg);
    });

    // Handle regular messages (coach chat)
    this.bot.on('message', async (msg) => {
      // Skip commands (already handled above)
      if (msg.text?.startsWith('/')) return;

      // Check if user has an active coach conversation
      await this.handleCoachMessage(msg);
    });

    // Handle callback queries (inline buttons)
    this.bot.on('callback_query', async (query) => {
      await this.handleCallback(query);
    });

    // Error handling
    this.bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });
  }

  /**
   * Get or create coach session from MongoDB
   */
  async getCoachSession(chatId, profile) {
    let session = await CoachSession.findOne({ chatId });
    const now = new Date();
    const ttl = 30 * 60 * 1000; // 30 minutes

    if (!session || (session.expiresAt && session.expiresAt < now)) {
      // Create new session
      session = await CoachSession.findOneAndUpdate(
        { chatId },
        {
          chatId,
          profileId: profile._id,
          messages: [],
          expiresAt: new Date(now.getTime() + ttl)
        },
        { upsert: true, new: true }
      );
    } else {
      // Refresh TTL and update profile
      session.expiresAt = new Date(now.getTime() + ttl);
      session.profileId = profile._id;
      await session.save();
    }
    return session;
  }

  /**
   * Verify webhook secret token
   * Always requires secret - never fail open
   */
  verifyWebhookSecret(req) {
    if (!this.webhookSecret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be configured');
    }
    return req.headers['x-telegram-bot-api-secret-token'] === this.webhookSecret;
  }

  /**
   * Process incoming webhook update
   * Call this from your Express route
   */
  processUpdate(req, res) {
    // Verify secret token
    try {
      if (!this.verifyWebhookSecret(req)) {
        console.warn('Telegram: Invalid webhook secret token');
        return res.status(401).send('Unauthorized');
      }
    } catch (err) {
      console.error('Telegram webhook secret error:', err.message);
      return res.status(500).send('Internal Server Error');
    }

    if (this.bot) {
      this.bot.processUpdate(req.body);
    }
    res.sendStatus(200);
  }

  /**
   * Handle /start - Link Telegram account to SwimCoach profile
   * Supports two formats:
   * - /start link_<token> (legacy token-based)
   * - /start link_<code> (new code-based, token validated server-side)
   */
  async handleStart(msg, payload) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    // Check if payload contains a linking code/token (from web OAuth flow)
    if (payload && payload.startsWith('link_')) {
      const codeOrToken = payload.replace('link_', '');

      // Try new code-based linking first (shorter code)
      if (codeOrToken.length <= 32) {
        await this.linkAccountByCode(chatId, telegramId, codeOrToken);
        return;
      }

      // Fall back to legacy token-based linking
      await this.linkAccount(chatId, telegramId, codeOrToken);
      return;
    }

    // Check if already linked
    const existingProfile = await SwimmerProfile.findOne({ telegramId });
    if (existingProfile) {
      await safeSendMessage(this.bot, chatId,
        'Welcome back, {name}\\! 🏊\n\nYour Telegram is already linked to SwimCoach.\n\nUse /workout to generate a workout, or /coach to chat with your coach.',
        { name: existingProfile.firstName }
      );
      return;
    }

// Not linked - show linking instructions
    const linkUrl = `${process.env.FRONTEND_URL}/telegram-link?telegramId=${telegramId}`;
    await safeSendMessage(this.bot, chatId,
      'Welcome to SwimCoach\\! 🏊\\n\\n' +
      'To use this bot, you need to link it to your SwimCoach account\\.\\n\\n' +
      '1\\. Open SwimCoach on the web: \\{frontendUrl\\}\\n' +
      '2\\. Go to Settings → Telegram\\n' +
      '3\\. Click "Link Telegram" and enter your Telegram ID: \\`\\{telegramId\\}\\`\\n\\n' +
      'Or use this direct link: \\{linkUrl\\}\\n\\n' +
      'Once linked, you can:\\n' +
      "\\u2022 /workout \\- Generate today\\'s workout\\n" +
      '\\u2022 /coach \\- Chat with your AI coach\\n' +
      '\\u2022 /help \\- Show this help',
      { frontendUrl: process.env.FRONTEND_URL, telegramId, linkUrl }
    );
  }

  /**
   * Link Telegram account using secure token from web
   */
  async linkAccount(chatId, telegramId, token) {
    try {
      // Find profile by linking token (not by raw ID)
      const profile = await SwimmerProfile.findOne({
        telegramLinkToken: token,
        telegramLinkExpires: { $gt: new Date() }
      });

      if (!profile) {
        await safeSendMessage(this.bot, chatId, '❌ Invalid or expired link token.');
        return;
      }

      // Check if this Telegram ID is already linked to another account
      const existingLink = await SwimmerProfile.findOne({ telegramId });
      if (existingLink && existingLink._id.toString() !== profile._id.toString()) {
        await safeSendMessage(this.bot, chatId, '❌ This Telegram account is already linked to another SwimCoach profile.');
        return;
      }

      // Link the account
      profile.telegramId = telegramId;
      profile.telegramLinkToken = undefined;
      profile.telegramLinkExpires = undefined;
      await profile.save();

      await safeSendMessage(this.bot, chatId, '✅ Linked to {name}!', { name: profile.firstName });
      await this.sendMainMenu(chatId);
    } catch (err) {
      console.error('Telegram link error:', err);
      await safeSendMessage(this.bot, chatId, '❌ Failed to link account.');
    }
  }

  /**
   * Link Telegram account using short code (new flow)
   * Code is validated server-side, token never exposed in URL
   * No fallback to legacy token - code-based flow is standalone
   */
  async linkAccountByCode(chatId, telegramId, code) {
    try {
      // Find profile by linking code (short code from URL)
      const profile = await SwimmerProfile.findOne({
        telegramLinkCode: code,
        telegramLinkCodeExpires: { $gt: new Date() }
      });

      if (!profile) {
        await safeSendMessage(this.bot, chatId, '❌ Invalid or expired link code.');
        return;
      }

      // Check if this Telegram ID is already linked to another account
      const existingLink = await SwimmerProfile.findOne({ telegramId });
      if (existingLink && existingLink._id.toString() !== profile._id.toString()) {
        await safeSendMessage(this.bot, chatId, '❌ This Telegram account is already linked to another SwimCoach profile.');
        return;
      }

      // Link the account
      profile.telegramId = telegramId;
      profile.telegramLinkCode = undefined;
      profile.telegramLinkCodeExpires = undefined;
      profile.telegramLinkToken = undefined;
      profile.telegramLinkExpires = undefined;
      await profile.save();

      await safeSendMessage(this.bot, chatId, '✅ Linked to {name}!', { name: profile.firstName });
      await this.sendMainMenu(chatId);
    } catch (err) {
      console.error('Telegram link by code error:', err);
      await safeSendMessage(this.bot, chatId, '❌ Failed to link account.');
    }
  }

  /**
   * Handle /workout - Generate and send workout
   */
  async handleWorkout(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const profile = await SwimmerProfile.findOne({ telegramId });
    if (!profile) {
      await safeSendMessage(this.bot, chatId, '❌ Account not linked. Use /start first.');
      return;
    }

    await safeSendMessage(this.bot, chatId, '🏋️ Generating your workout...');

    try {
      const workout = await generateWorkout(profile, {}, { mode: 'direct' });
      await this.sendWorkout(chatId, workout);
    } catch (err) {
      console.error('Telegram workout error:', err);
      await safeSendMessage(this.bot, chatId, '❌ Failed to generate workout. Try again later.');
    }
  }

  /**
   * Format and send workout to Telegram with safe MarkdownV2
   */
  async sendWorkout(chatId, workout) {
    const pool = workout.poolWorkout || {};
    const gym = workout.gymWorkout || {};
    const unit = pool.poolUnit === 'yards' ? 'yd' : 'm';

    // Build workout message with escaped values
    const name = escapeMarkdown(workout.workoutName || workout.workoutType || 'Workout');
    const distance = escapeMarkdown(String(pool.totalDistance || 0));
    const duration = escapeMarkdown(String(workout.duration || 60));
    const intensity = escapeMarkdown(workout.intensity || 'moderate');
    const unitEsc = escapeMarkdown(unit);

    let text = `🏊 *${name}*\n`;
    text += `📏 ${distance}${unitEsc} \\u2022 ⏱ ${duration}min \\u2022 🔥 ${intensity}\n\n`;

    if (pool.warmUp?.description) {
      text += `🔥 *Warmup:*\n${escapeMarkdown(pool.warmUp.description)}\n\n`;
    }

    if (pool.mainSet?.length) {
      text += `🏊 *Main Set:*\n`;
      for (const set of pool.mainSet) {
        const reps = escapeMarkdown(String(set.repetitions));
        const dist = escapeMarkdown(String(set.distance));
        const stroke = escapeMarkdown(set.stroke || 'freestyle');
        const interval = set.interval ? escapeMarkdown(set.interval) : '';
        text += `\\u2022 ${reps}\\u00d7 ${dist}${unitEsc} ${stroke}${interval ? ` @ ${interval}` : ''}\n`;
      }
      text += '\n';
    }

    if (pool.coolDown?.description) {
      text += `🧊 *Cooldown:*\n${escapeMarkdown(pool.coolDown.description)}\n\n`;
    }

    if (gym.mainSet?.length) {
      text += `🏋️ *Gym:*\n`;
      for (const ex of gym.mainSet) {
        const exercise = escapeMarkdown(ex.exercise);
        const sets = escapeMarkdown(String(ex.sets));
        const reps = escapeMarkdown(String(ex.repetitions));
        const weight = ex.weight ? escapeMarkdown(String(ex.weight)) : '';
        const weightUnit = ex.weightUnit ? escapeMarkdown(ex.weightUnit) : '';
        text += `\\u2022 ${exercise} \\- ${sets}\\u00d7${reps}${weight ? ` @ ${weight}${weightUnit}` : ''}\n`;
      }
      text += '\n';
    }

    // Send with MarkdownV2 parsing
    await this.bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
  }

  /**
   * Handle /coach - Start coach conversation
   */
  async handleCoach(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const profile = await SwimmerProfile.findOne({ telegramId });
    if (!profile) {
      await safeSendMessage(this.bot, chatId, '❌ Account not linked. Use /start first.');
      return;
    }

    // Get or create coach session from MongoDB
    await this.getCoachSession(chatId, profile);

    await safeSendMessage(this.bot, chatId,
      '💬 *Coach Chat Started*\n\nAsk me anything about your training\\!\n\nType your question, or /cancel to end.'
    );
  }

  /**
   * Handle regular messages during coach chat
   */
  async handleCoachMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Get session from MongoDB
    const session = await CoachSession.findOne({ chatId });
    const now = new Date();
    if (!session || (session.expiresAt && session.expiresAt < now)) return; // Not in coach mode or expired

    // Load profile
    const profile = await SwimmerProfile.findById(session.profileId);
    if (!profile) return;

    // Add user message
    session.messages.push({ role: 'user', text });

    try {
      const result = await coachChat({
        profile,
        workout: null,
        messages: session.messages,
        userMessage: text,
        mode: 'general',
      });

      // Add coach reply
      session.messages.push({ role: 'coach', text: result.reply });
      session.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Refresh TTL
      await session.save();

      await safeSendMessage(this.bot, chatId, '{reply}', { reply: result.reply });

      // Handle proposals if any
      if (result.actions?.length) {
        for (const action of result.actions) {
          if (action.proposal) {
            await this.sendProposal(chatId, action);
          }
        }
      }
    } catch (err) {
      console.error('Telegram coach error:', err);
      await safeSendMessage(this.bot, chatId, '❌ Coach error. Try again.');
    }
  }

  /**
   * Send proposal as inline keyboard
   */
  async sendProposal(chatId, action) {
    const desc = escapeMarkdown(action.description || 'Suggested change');
    const detail = escapeMarkdown(action.detail || '');

    await safeSendMessage(this.bot, chatId,
      '🤔 *Coach suggests:* {desc}\n\n{detail}',
      { desc, detail },
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Apply', callback_data: `apply_${action.action}_${Date.now()}` },
            { text: '❌ Dismiss', callback_data: 'dismiss' }
          ]]
        }
      }
    );
  }

  /**
   * Handle callback queries (inline button presses)
   */
  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    await this.bot.answerCallbackQuery(query.id);

    if (data === 'dismiss') {
      await this.bot.editMessageText('Dismissed.', { chat_id: chatId, message_id: query.message.message_id });
      return;
    }

    // Handle apply actions
    if (data.startsWith('apply_')) {
      await this.bot.editMessageText('✅ Applied!', { chat_id: chatId, message_id: query.message.message_id });
    }
  }

  /**
   * Handle /help
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;
    await safeSendMessage(this.bot, chatId,
      '🏊 *SwimCoach Bot Commands*\n\n' +
      '/start \\- Link your account\n' +
      '/workout \\- Generate today\'s workout\n' +
      '/coach \\- Chat with your AI coach\n' +
      '/help \\- Show this help\n\n' +
      '*In coach chat:* Just type naturally\\!\n' +
      'Type /cancel to exit coach mode.'
    );
  }

  /**
   * Send main menu keyboard
   */
  async sendMainMenu(chatId, text = '') {
    const safeText = escapeMarkdown(text);
    await safeSendMessage(this.bot, chatId, safeText || '🏊 *SwimCoach Menu*', {}, {
      reply_markup: {
        keyboard: [
          ['🏊 Workout', '💬 Coach'],
          ['📊 History', '⚙️ Settings']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
  }
}

// Singleton instance
const telegramBot = new TelegramBotService();
module.exports = telegramBot;