const SwimmerProfile = require('./SwimmerProfile');
const Workout = require('./Workout');
const KnowledgeSource = require('./KnowledgeSource');
const connectDB = require('../utils/database');

module.exports = {
  SwimmerProfile,
  Workout,
  KnowledgeSource,
  connectDB
};