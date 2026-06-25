const mongoose = require('mongoose');

const coachingMemorySchema = new mongoose.Schema({
  swimmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SwimmerProfile',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['observation', 'preference', 'trend', 'injury', 'goal-update', 'insight'],
    required: true,
  },
  category: {
    type: String,
    enum: ['intensity', 'volume', 'recovery', 'technique', 'stroke-preference', 'equipment', 'scheduling', 'general'],
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  source: {
    type: String,
    enum: ['feedback-derivation', 'coach-analysis', 'user-stated', 'trend-detection'],
    required: true,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5,
  },
  relevantWorkoutIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workout',
  }],
  relevantFeedbackIds: [{
    type: String,
  }],
  active: {
    type: Boolean,
    default: true,
  },
  supersededBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoachingMemory',
  },
}, {
  timestamps: true,
});

// Compound indexes for common query patterns
coachingMemorySchema.index({ swimmerId: 1, type: 1 });
coachingMemorySchema.index({ swimmerId: 1, category: 1, active: 1 });
coachingMemorySchema.index({ swimmerId: 1, createdAt: -1 });

const CoachingMemory = mongoose.model('CoachingMemory', coachingMemorySchema);
module.exports = CoachingMemory;
