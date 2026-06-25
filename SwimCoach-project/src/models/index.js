const SwimmerProfile = require('./SwimmerProfile');
const Workout = require('./Workout');
const KnowledgeSource = require('./KnowledgeSource');
const CoachingMemory = require('./CoachingMemory');
const connectDB = require('../utils/database');

module.exports = {
  SwimmerProfile,
  Workout,
  KnowledgeSource,
  CoachingMemory,
  connectDB
};