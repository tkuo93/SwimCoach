const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'coach'], required: true },
  text: { type: String, required: true },
}, { _id: false });

const proposalSchema = new mongoose.Schema({
  action: { type: String, required: true },
  field: { type: String },
  newValue: { type: String },
  workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
  overrides: { type: mongoose.Schema.Types.Mixed },
  proposal: { type: Boolean, default: true },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  swimmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SwimmerProfile', required: true, index: true },
  title: { type: String, default: 'New Conversation' },
  messages: [messageSchema],
  proposals: [proposalSchema],
  contextWorkoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

conversationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Auto-generate title from first user message if not set
  if (this.title === 'New Conversation' && this.messages.length > 0) {
    const firstUserMsg = this.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      this.title = firstUserMsg.text.substring(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '');
    }
  }
  next();
});

conversationSchema.index({ swimmerId: 1, updatedAt: -1 });
conversationSchema.index({ contextWorkoutId: 1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Conversation', conversationSchema);
