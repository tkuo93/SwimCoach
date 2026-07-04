const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { connectDB } = require('./models');
const profileRoutes = require('./routes/api/profiles');
const workoutRoutes = require('./routes/api/workouts');
const knowledgeRoutes = require('./routes/api/knowledge');
const customizationRoutes = require('./routes/api/customization');
const memoryRoutes = require('./routes/api/memory');
const debugRoutes = require('./routes/api/debug');
const coachRoutes = require('./routes/api/coach');
const conversationRoutes = require('./routes/api/conversations');
const authRoutes = require('./routes/api/auth');
const telegramRoutes = require('./routes/api/telegram');

require('./auth/passport');
const telegramBot = require('./telegram/bot');

const app = express();
const PORT = process.env.PORT || 10000;  // Render uses PORT=10000

// Trust proxy for secure cookies behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 30 * 24 * 60 * 60, // 30 days
    autoRemove: 'native'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax'
  },
  rolling: true // reset TTL on each request
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Telegram webhook (public - no auth required)
app.use('/api/telegram', telegramRoutes);

// Protected API routes
const requireAuth = require('./middleware/auth');
app.use('/api/profiles', requireAuth, profileRoutes);
app.use('/api/workouts', requireAuth, workoutRoutes);
app.use('/api/knowledge', requireAuth, knowledgeRoutes);
app.use('/api/workouts/customize', requireAuth, customizationRoutes);
app.use('/api/memory', requireAuth, memoryRoutes);
app.use('/api/debug', requireAuth, debugRoutes);
app.use('/api/coach', requireAuth, coachRoutes);
app.use('/api/conversations', requireAuth, conversationRoutes);

// Health endpoint (public)
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    db: states[dbState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

// Serve login page for root if not authenticated, otherwise serve app
app.get('/', (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next(); // Continue to static file serving
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Catch-all: serve index.html for any non-API route (hash-based routing on the frontend)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize Telegram bot after DB connection
let botInitialized = false;
async function initTelegramBot() {
  if (botInitialized) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (token && webhookUrl) {
    try {
      await telegramBot.init(token, webhookUrl);
      botInitialized = true;
    } catch (err) {
      console.error('Telegram bot init failed:', err.message);
    }
  } else {
    console.log('Telegram: Bot token or webhook URL not configured, bot disabled');
  }
}

// Start server (connect to MongoDB first)
connectDB().then(() => {
  initTelegramBot();
  app.listen(PORT, () => {
    console.log(`SwimCoach server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to start SwimCoach:', err.message);
  process.exit(1);
});

module.exports = app;
