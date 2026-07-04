const mongoose = require('mongoose');

const coachSessionSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SwimmerProfile',
    required: true
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'coach', 'context'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // MongoDB TTL index
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

coachSessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// TTL index on expiresAt - MongoDB will auto-delete expired sessions
coachSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CoachSession', coachSessionSchema);