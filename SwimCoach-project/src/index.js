const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { connectDB } = require('./models');
const profileRoutes = require('./routes/api/profiles');
const workoutRoutes = require('./routes/api/workouts');
const knowledgeRoutes = require('./routes/api/knowledge');
const customizationRoutes = require('./routes/api/customization');
const memoryRoutes = require('./routes/api/memory');
const debugRoutes = require('./routes/api/debug');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/profiles', profileRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/workouts/customize', customizationRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/debug', debugRoutes);

// Health endpoint
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

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Catch-all: serve index.html for any non-API route (hash-based routing on the frontend)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server (connect to MongoDB first)
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`SwimCoach server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to start SwimCoach:', err.message);
  process.exit(1);
});

module.exports = app;
