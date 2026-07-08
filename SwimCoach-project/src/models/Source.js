const mongoose = require('mongoose');

const SourceSchema = new mongoose.Schema({
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
  sourceUrl: String,
  fileName: String,
  chunks: [{
    index: Number,
    text: String,
    qdrantId: String
  }],
  metadata: {
    author: String,
    publishedDate: Date,
    tags: [String]
  },
  openNotebookId: String, // reference to original OpenNotebook source ID
}, {
  timestamps: true
});

// Compound indexes for common queries
SourceSchema.index({ userId: 1, sourceType: 1 });
SourceSchema.index({ userId: 1, 'metadata.tags': 1 });
SourceSchema.index({ openNotebookId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Source', SourceSchema);