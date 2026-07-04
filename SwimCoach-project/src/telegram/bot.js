/**
 * Telegram Bot Service for SwimCoach
 * Webhook-based (not long-polling) for free hosting compatibility
 */

const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const SwimmerProfile = require('../models/SwimmerProfile');
const { generateWorkout } = require('../services/workout-generator');
const { chat: coachChat } = require('../services/coach/coach-agent');

// MarkdownV2 escaping - required for safe user content
function escapeMarkdown(text) {
  if (text == null) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.webhookUrl = null;
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

    // Set webhook
    try {
      await this.bot.setWebHook(webhookUrl);
      console.log(`Telegram: Webhook set to ${webhookUrl}`);
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

    // /workout - Generate today's workout
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
   * Handle /start - Link Telegram account to SwimCoach profile
   */
  async handleStart(msg, payload) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    // Check if payload contains a linking token (from web OAuth flow)
    if (payload && payload.startsWith('link_')) {
      const token = payload.replace('link_', '');
      await this.linkAccount(chatId, telegramId, token);
      return;
    }

    // Check if already linked
    const existingProfile = await SwimmerProfile.findOne({ telegramId });
    if (existingProfile) {
      await this.bot.sendMessage(chatId,
        `Welcome back, ${escapeMarkdown(existingProfile.firstName)}! 🏊\n\n` +
        `Your Telegram is already linked to SwimCoach.\n\n` +
        `Use /workout to generate a workout, or /coach to chat with your coach.`,
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    // Not linked - show linking instructions
    const linkUrl = `${process.env.FRONTEND_URL}/telegram-link?telegramId=${telegramId}`;
    await this.bot.sendMessage(chatId,
      `Welcome to SwimCoach! 🏊\n\n` +
      `To use this bot, you need to link it to your SwimCoach account.\n\n` +
      `1\\. Open SwimCoach on the web: ${escapeMarkdown(process.env.FRONTEND_URL)}\n` +
      `2\\. Go to Settings \\u2192 Telegram\n` +
      `3\\. Click \"Link Telegram\" and enter your Telegram ID: \`${telegramId}\`\n\n` +
      `Or use this direct link: ${escapeMarkdown(linkUrl)}\n\n` +
      `Once linked, you can:\n` +
      `\\u2022 /workout \\- Generate today's workout\n` +
      `\\u2022 /coach \\- Chat with your AI coach\n` +
      `\\u2022 /help \\- Show this help`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  /**
   * Link Telegram account using secure token from web
   * Token is a cryptographically random string stored on profile with expiry
   */
  async linkAccount(chatId, telegramId, token) {
    try {
      // Find profile by linking token (not by raw ID)
      const profile = await SwimmerProfile.findOne({
        telegramLinkToken: token,
        telegramLinkExpires: { $gt: new Date() }
      });

      if (!profile) {
        await this.bot.sendMessage(chatId, '❌ Invalid or expired link token.', { parse_mode: 'MarkdownV2' });
        return;
      }

      // Check if this Telegram ID is already linked to another account
      const existingLink = await SwimmerProfile.findOne({ telegramId });
      if (existingLink && existingLink._id.toString() !== profile._id.toString()) {
        await this.bot.sendMessage(chatId, '❌ This Telegram account is already linked to another SwimCoach profile.', { parse_mode: 'MarkdownV2' });
        return;
      }

      // Link the account
      profile.telegramId = telegramId;
      profile.telegramLinkToken = undefined;
      profile.telegramLinkExpires = undefined;
      await profile.save();

      await this.bot.sendMessage(chatId,
        `✅ Linked to ${escapeMarkdown(profile.firstName)}!`,
        { parse_mode: 'MarkdownV2' }
      );
      await this.sendMainMenu(chatId);
    } catch (err) {
      console.error('Telegram link error:', err);
      await this.bot.sendMessage(chatId, '❌ Failed to link account.', { parse_mode: 'MarkdownV2' });
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
      await this.bot.sendMessage(chatId, '❌ Account not linked. Use /start first.', { parse_mode: 'MarkdownV2' });
      return;
    }

    await this.bot.sendMessage(chatId, '🏋️ Generating your workout...');

    try {
      const workout = await generateWorkout(profile, {}, { mode: 'direct' });
      await this.sendWorkout(chatId, workout);
    } catch (err) {
      console.error('Telegram workout error:', err);
      await this.bot.sendMessage(chatId, '❌ Failed to generate workout. Try again later.', { parse_mode: 'MarkdownV2' });
    }
  }

  /**
   * Format and send workout to Telegram with safe MarkdownV2
   */
  async sendWorkout(chatId, workout) {
    const pool = workout.poolWorkout || {};
    const gym = workout.gymWorkout || {};
    const unit = pool.poolUnit === 'yards' ? 'yd' : 'm';

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
      await this.bot.sendMessage(chatId, '❌ Account not linked. Use /start first.', { parse_mode: 'MarkdownV2' });
      return;
    }

    // Store conversation state (in-memory for simplicity, could use Redis)
    if (!this.coachSessions) this.coachSessions = new Map();
    this.coachSessions.set(chatId, { profile, messages: [] });

    await this.bot.sendMessage(chatId,
      `💬 *Coach Chat Started*\n\nAsk me anything about your training\!\n\nType your question, or /cancel to end.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  /**
   * Handle regular messages during coach chat
   */
  async handleCoachMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!this.coachSessions?.has(chatId)) return; // Not in coach mode

    const session = this.coachSessions.get(chatId);
    session.messages.push({ role: 'user', text });

    try {
      const result = await coachChat({
        profile: session.profile,
        workout: null,
        messages: session.messages,
        userMessage: text,
        mode: 'general',
      });

      session.messages.push({ role: 'coach', text: result.reply });

      await this.bot.sendMessage(chatId, escapeMarkdown(result.reply), { parse_mode: 'MarkdownV2' });

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
      await this.bot.sendMessage(chatId, '❌ Coach error. Try again.', { parse_mode: 'MarkdownV2' });
    }
  }

  /**
   * Send proposal as inline keyboard
   */
  async sendProposal(chatId, action) {
    const desc = escapeMarkdown(action.description || 'Suggested change');
    const detail = escapeMarkdown(action.detail || '');

    await this.bot.sendMessage(chatId,
      `🤔 *Coach suggests:* ${desc}\n\n${detail}`,
      {
        parse_mode: 'MarkdownV2',
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
    await this.bot.sendMessage(chatId,
      `🏊 *SwimCoach Bot Commands*\n\n` +
      `/start \\- Link your account\n` +
      `/workout \\- Generate today's workout\n` +
      `/coach \\- Chat with your AI coach\n` +
      `/help \\- Show this help\n\n` +
      `*In coach chat:* Just type naturally\!\n` +
      `Type /cancel to exit coach mode.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  /**
   * Send main menu keyboard
   */
  async sendMainMenu(chatId, text = '') {
    const safeText = escapeMarkdown(text);
    await this.bot.sendMessage(chatId, safeText || '🏊 *SwimCoach Menu*', {
      parse_mode: 'MarkdownV2',
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

  /**
   * Process incoming webhook update
   * Call this from your Express route
   */
  processUpdate(update) {
    if (this.bot) {
      this.bot.processUpdate(update);
    }
  }
}

// Singleton instance
const telegramBot = new TelegramBotService();
module.exports = telegramBot;