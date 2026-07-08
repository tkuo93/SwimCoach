const mongoose = require('mongoose');

const InsightSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sourceType: {
    type: String,
    enum: ['system', 'personal'],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  qdrantId: String,
  weight: {
    type: Number,
    default: 0.6,
    min: 0,
    max: 1
  },
  tags: [String],
  priority: {
    type: Number,
    default: 0
  },
  openNotebookId: String, // reference to original OpenNotebook note ID
}, {
  timestamps: true
});

InsightSchema.index({ userId: 1, sourceType: 1 });
InsightSchema.index({ userId: 1, tags: 1 });
InsightSchema.index({ openNotebookId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Insight', InsightSchema);