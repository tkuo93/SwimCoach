const mongoose = require('mongoose');

// Define the Workout Schema
const workoutSchema = new mongoose.Schema({
  // Reference to the swimmer this workout is for
  swimmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SwimmerProfile',
    required: true
  },

  // Workout Identification
  workoutName: {
    type: String,
    required: true,
    trim: true
  },

  // Program grouping — links workouts that belong to the same program
  programId: {
    type: String,
    index: true,
    default: null,
  },
  workoutType: {
    type: String,
    enum: ['lactate', 'resistance-power', 'speed', 'technique', 'endurance', 'recovery', 'mobility'],
    required: true
  },

  // Workout Details
  date: {
    type: Date,
    default: Date.now
  },
  duration: {
    type: Number, // in minutes
    min: 10,
    max: 180,
    required: true
  },
  intensity: {
    type: String,
    enum: ['low', 'moderate', 'high', 'maximal'],
    default: 'moderate'
  },

  // Pool Workout Components
  poolWorkout: {
    poolUnit: { type: String, enum: ['meters', 'yards'], default: 'meters' },
    warmUp: {
      distance: { type: Number, default: 0 },
      duration: { type: Number, default: 0 }, // minutes
      description: { type: String, trim: true }
    },
    mainSet: [{
      distance: { type: Number, required: true },
      interval: {
        type: String,
        required: true,
        trim: true
      }, // e.g., "1:30", "on 1:45", "2:00 build"
      repetitions: { type: Number, required: true, min: 1 },
      stroke: {
        type: String,
        required: true,
        trim: true
      },
      equipment: {
        fins: { type: Boolean, default: false },
        paddles: { type: Boolean, default: false },
        pullBuoy: { type: Boolean, default: false },
        snorkel: { type: Boolean, default: false }
      },
      focus: {
        type: String,
        default: 'technique',
        trim: true
      },
      description: { type: String, trim: true }
    }],
    coolDown: {
      distance: { type: Number, default: 0 }, // meters
      duration: { type: Number, default: 0 }, // minutes
      description: { type: String, trim: true }
    },
    totalDistance: {
      type: Number, // meters
      default: 0
    },
    trainingNotes: [{ type: String }]
  },

  // Gym Workout Components
  gymWorkout: {
    warmUp: {
      duration: { type: Number, default: 0 }, // minutes
      description: { type: String, trim: true }
    },
    mainSet: [{
      exercise: { type: String, required: true, trim: true },
      sets: { type: Number, required: true, min: 1 },
      repetitions: { type: Number, required: true, min: 1 },
      weight: { type: Number, default: 0 }, // numeric value in the unit specified by weightUnit
      weightUnit: { type: String, enum: ['lbs', 'kg', null], default: null },
      restTime: { type: Number, default: 0 }, // in seconds
      equipment: {
        type: String,
        default: 'bodyweight',
        trim: true
      },
      muscleGroup: {
        type: String,
        enum: [
          'arms', 'legs', 'core', 'full-body',
          'chest', 'back', 'shoulders',
          'biceps', 'triceps', 'forearms',
          'quadriceps', 'hamstrings', 'glutes', 'calves',
          'hip-flexors', 'adductors', 'abductors',
          'rotator-cuff', 'lower-back', 'obliques',
        ],
        default: 'full-body',
        trim: true
      },
      focus: {
        type: String,
        default: 'strength',
        trim: true
      },
      description: { type: String, trim: true }
    }],
    coolDown: {
      duration: { type: Number, default: 0 }, // minutes
      description: { type: String, trim: true }
    },
    trainingNotes: [{ type: String }]
  },

  // Progression Tracking
  progression: {
    basedOnPreviousWorkout: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workout'
    },
    difficultyChange: {
      type: String,
      enum: ['easier', 'same', 'harder'],
      default: 'same'
    },
    notes: {
      type: String,
      trim: true
    }
  },

  // User Feedback and Ratings
  userFeedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    difficultyPerception: {
      type: String,
      enum: ['too-easy', 'easy', 'just-right', 'hard', 'too-hard']
    },
    enjoyment: {
      type: String,
      enum: ['did-not-enjoy', 'neutral', 'enjoyed', 'loved']
    },
    quality: {
      type: String,
      enum: ['poor', 'below-average', 'average', 'good', 'excellent']
    },
    accuracy: {
      type: String,
      enum: ['way-off', 'close-but-off', 'mostly-accurate', 'spot-on']
    },
    comments: {
      type: String,
      trim: true
    },
    completedAt: {
      type: Date
    }
  },

  // Training notes from the knowledge base (scientific rationale)
  trainingNotes: [{
    type: String,
  }],

  // Generation Metadata
  generationInfo: {
    generatedBy: {
      type: String,
      enum: ['system', 'user-customized', 'coach-modified'],
      default: 'system'
    },
    knowledgeSources: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeSource'
    }],
    generationParameters: {
      equipmentUsed: {
        poolLength: { type: String, default: '25m' },
        poolEquipment: mongoose.Schema.Types.Mixed,
        gymEquipment: mongoose.Schema.Types.Mixed
      },
      workoutPreferences: {
        type: String,
        enum: ['lactate', 'resistance-power', 'speed', 'technique', 'endurance', 'recovery', 'mobility']
      },
      durationPreference: Number,
      intensityPreference: String
    }
  },

  // Timestamps
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
workoutSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for common queries
workoutSchema.index({ swimmerId: 1, date: -1 });
workoutSchema.index({ workoutType: 1 });
workoutSchema.index({ 'userFeedback.rating': -1 });
workoutSchema.index({ date: -1 });

// Create and export the model
const Workout = mongoose.model('Workout', workoutSchema);

module.exports = Workout;