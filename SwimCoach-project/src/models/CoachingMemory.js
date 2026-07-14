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
  resolvedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Compound indexes for common query patterns
coachingMemorySchema.index({ swimmerId: 1, type: 1 });
coachingMemorySchema.index({ swimmerId: 1, category: 1, active: 1 });
coachingMemorySchema.index({ swimmerId: 1, createdAt: -1 });

// TTL Indexes — auto-expire stale entries by type
// 1. Injuries/sickness: 14 days after resolvedAt, or 7 days after createdAt if never resolved
coachingMemorySchema.index(
  { resolvedAt: 1 },
  {
    expireAfterSeconds: 14 * 86400,
    partialFilterExpression: { type: 'injury', resolvedAt: { $exists: true, $ne: null } },
  }
);
coachingMemorySchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7 * 86400,
    partialFilterExpression: { type: 'injury', $or: [{ resolvedAt: { $exists: false } }, { resolvedAt: null }] },
  }
);

// 2. Observations & trends: 30 days
coachingMemorySchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 30 * 86400,
    partialFilterExpression: { type: { $in: ['observation', 'trend'] } },
  }
);

// 3. Insights: 180 days (coach-derived insights are more durable)
coachingMemorySchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 180 * 86400,
    partialFilterExpression: { type: 'insight' },
  }
);

// 4. Preferences & goal-updates: NO TTL (persist indefinitely)

const CoachingMemory = mongoose.model('CoachingMemory', coachingMemorySchema);
module.exports = CoachingMemory;
