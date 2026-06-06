const mongoose = require('mongoose');

// Define the Knowledge Source Schema
const knowledgeSourceSchema = new mongoose.Schema({
  // Source Identification
  title: {
    type: String,
    required: true,
    trim: true
  },
  sourceType: {
    type: String,
    enum: ['research-paper', 'social-media-post', 'coach-note', 'training-manual', 'video', 'article', 'curated-content'],
    required: true
  },
  sourceId: {
    type: String, // External ID (DOI, URL, handle, etc.)
    trim: true
  },
  url: {
    type: String,
    trim: true
  },
  platform: {
    type: String, // For social media: Instagram, Twitter/X, YouTube, TikTok, Facebook
    trim: true
  },
  authorHandle: {
    type: String, // For social media: @coachname, @athlete_handle, etc.
    trim: true
  },

  // Content Information
  authors: [{
    type: String,
    trim: true
  }],
  publicationDate: {
    type: Date
  },
  journalOrPlatform: {
    type: String,
    trim: true
  },
  abstract: {
    type: String,
    trim: true
  },
  keywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // Content Classification for Swimming
  swimmingCategories: [{
    type: String,
    enum: [
      'technique-freestyle',
      'technique-backstroke',
      'technique-breaststroke',
      'technique-butterfly',
      'starts-turns',
      'race-strategy',
      'nutrition',
      'recovery',
      'strength-training',
      'endurance-training',
      'sprint-training',
      'mental-preparation',
      'injury-prevention',
      'equipment',
      'physiology',
      'biomechanics'
    ]
  }],
  targetAudience: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'elite', 'masters', 'youth'],
    default: 'intermediate'
  },

  // Source Quality and Trust Metrics (Updated for curated content focus)
  sourceTrustLevel: {
    type: String,
    enum: ['verified-expert', 'trusted-source', 'reputable-source', 'emerging-source'],
    default: 'trusted-source'
  },
  contentQuality: {
    type: String,
    enum: ['high-quality', 'good-quality', 'fair-quality'],
    default: 'good-quality'
  },
  relevanceScore: {
    type: Number, // 0-100 score for relevance to swimmer's goals
    min: 0,
    max: 100,
    default: 50
  },

  // NotebookLM Integration Fields (Supporting Both Standardized & Ad-Hoc)
  notebooklmInsights: {
    // Flag to indicate if insights are standardized or ad-hoc
    insightType: {
      type: String,
      enum: ['standardized', 'ad-hoc', 'hybrid'],
      default: 'standardized'
    },

    // Standardized Insight Templates (Pre-generated for common scenarios)
    standardizedTemplate: {
      // Which standard template was used
      templateId: {
        type: String,
        enum: [
          'technique-analysis',
          'workout-design',
          'periodization-guidance',
          'equipment-recommendation',
          'nutrition-advice',
          'mental-preparation',
          'injury-prevention',
          'race-strategy',
          'recovery-protocols',
          'strength-programming'
        ]
      },
      // Parameters used with the template
      templateParameters: {
        // Examples: { stroke: 'freestyle', distance: '100m', focus: 'sprint' }
        type: mongoose.Schema.Types.Mixed
      }
    },

    // The actual insights generated (whether from template or ad-hoc)
    summary: {
      type: String,
      trim: true
    },
    keyFindings: [{
      type: String,
      trim: true
    }],
    trainingApplications: [{
      type: String,
      trim: true
    }],
    workoutModifications: [{
      type: String,
      trim: true
    }],
    periodizationRecommendations: [{
      type: String,
      trim: true
    }],
    techniqueAdjustments: [{
      type: String,
      trim: true
    }],
    equipmentRecommendations: [{
      type: String,
      trim: true
    }],
    confidenceLevel: {
      type: String,
      enum: ['high-confidence', 'moderate-confidence', 'low-confidence'],
      default: 'moderate-confidence'
    },
    generatedAt: {
      type: Date,
      default: Date.now
    },
    sourceReference: {
      type: String, // Reference to original source in NotebookLM
      trim: true
    },

    // For ad-hoc insights: store the specific prompt used
    generationPrompt: {
      type: String,
      trim: true
    },

    // Cache key for standardized insights to enable reuse
    insightCacheKey: {
      type: String,
      trim: true,
      index: true
    }
  },

  // Usage Tracking (Enhanced)
  usageMetrics: {
    timesReferenced: {
      type: Number,
      default: 0
    },
    lastUsedInWorkout: {
      type: Date
    },
    effectivenessRating: {
      type: Number, // Average rating from workouts that used this source
      min: 1,
      max: 5,
      default: 0
    },
    // Track which specific insights were most useful
    usefulInsights: [{
      insightType: {
        type: String,
        enum: ['trainingApplications', 'workoutModifications', 'periodizationRecommendations',
               'techniqueAdjustments', 'equipmentRecommendations']
      },
      insightIndex: Number, // Which item in the array was useful
      count: { type: Number, default: 0 }
    }],
    // Track insight generation method effectiveness
    generationMethodPerformance: {
      standardized: {
        timesUsed: { type: Number, default: 0 },
        avgEffectiveness: { type: Number, default: 0 }
      },
      adHoc: {
        timesUsed: { type: Number, default: 0 },
        avgEffectiveness: { type: Number, default: 0 }
      }
    }
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
knowledgeSourceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for common queries
knowledgeSourceSchema.index({ sourceType: 1 });
knowledgeSourceSchema.index({ platform: 1 });
knowledgeSourceSchema.index({ authorHandle: 1 });
knowledgeSourceSchema.index({ swimmingCategories: 1 });
knowledgeSourceSchema.index({ targetAudience: 1 });
knowledgeSourceSchema.index({ sourceTrustLevel: 1 });
knowledgeSourceSchema.index({ contentQuality: 1 });
knowledgeSourceSchema.index({ relevanceScore: -1 });
knowledgeSourceSchema.index({ 'notebooklmInsights.sourceReference': 1 });
knowledgeSourceSchema.index({ 'notebooklmInsights.insightType': 1 });
knowledgeSourceSchema.index({ 'notebooklmInsights.standardizedTemplate.templateId': 1 });
knowledgeSourceSchema.index({ 'notebooklmInsights.insightCacheKey': 1 });
knowledgeSourceSchema.index({ publicationDate: -1 });

// Create and export the model
const KnowledgeSource = mongoose.model('KnowledgeSource', knowledgeSourceSchema);

module.exports = KnowledgeSource;