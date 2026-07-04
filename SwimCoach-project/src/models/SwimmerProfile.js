const mongoose = require('mongoose');
const { validateEmail, validatePhone, validateAgeRange } = require('../utils/validation');

// Define the Swimmer Profile Schema
const swimmerProfileSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true,
    validate: {
      validator: validateAgeRange,
      message: 'Date of birth must be for a person aged between 5 and 100 years'
    }
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: validateEmail,
      message: 'Please provide a valid email address'
    }
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: validatePhone,
      message: 'Please provide a valid phone number'
    }
  },

  // Swimming Goals
  goals: {
    primaryEvents: [{
      stroke: {
        type: String,
        enum: ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'individual-medley'],
        required: true
      },
      distance: {
        type: Number, // in meters (or yards equivalent)
        enum: [50, 100, 200, 400, 500, 800, 1500, 1650],
        required: true
      }
    }],
    // Multi-select desired outcomes
    outcomes: [{
      type: String,
      enum: ['drop-time', 'build-muscle', 'lose-weight', 'maintain', 'technique']
    }],
    targetImprovement: {
      type: String, // e.g., "drop 5 seconds in 100m freestyle"
      trim: true
    },
    trainingFocus: [{
      type: String,
      enum: ['sprint', 'distance', 'technique', 'endurance', 'speed', 'maintenance', 'lactate', 'resistance-power', 'mobility', 'recovery']
    }],
  },

  // Training Schedule
  trainingSchedule: {
    weeklyPoolSessions: {
      type: Number,
      min: 0,
      max: 10,
      default: 3
    },
    weeklyGymSessions: {
      type: Number,
      min: 0,
      max: 10,
      default: 2
    },
    sessionDuration: {
      type: Number, // in minutes
      min: 15,
      max: 180,
      default: 60
    },
    // Days of the week for pool and gym
    poolDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    gymDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    preferredTimes: [{
      dayOfWeek: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      startTime: String, // HH:mm format
      endTime: String // HH:mm format
    }],
    availabilityNotes: {
      type: String,
      trim: true
    },
    // Competition date ranges (multiple blocks)
    competitionDates: [{
      start: { type: Date, required: true },
      end: { type: Date, required: true },
      label: { type: String, trim: true }
    }]
  },

  // Performance Metrics
  bestTimes: [{
    stroke: {
      type: String,
      enum: ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'individual-medley'],
      required: true
    },
    distance: {
      type: Number,
      enum: [50, 100, 200, 400, 500, 800, 1500, 1650],
      required: true
    },
    poolLength: {
      type: String,
      enum: ['scy', 'scm', 'lcm'],
      required: true
    },
    time: {
      type: String, // MM:ss.hh format
      required: true,
      validate: {
        validator: function(v) {
          return require('../utils/validation').validateTimeFormat(v);
        },
        message: 'Time must be in MM:ss.hh format (e.g., 01:30.25)'
      }
    },
    dateAchieved: {
      type: Date,
      default: Date.now,
      validate: {
        validator: function(v) {
          return require('../utils/validation').validatePastDate(v);
        },
        message: 'Date achieved cannot be in the future'
      }
    }
  }],

  // Equipment Availability
  equipment: {
    poolLength: {
      value: { type: Number, default: 25 },
      unit: { type: String, enum: ['meters', 'yards'], default: 'meters' }
    },
    poolEquipment: {
      fins: { type: Boolean, default: false },
      paddles: { type: Boolean, default: false },
      pullBuoy: { type: Boolean, default: false },
      snorkel: { type: Boolean, default: false },
      parachute: { type: Boolean, default: false },
      resistanceBands: { type: Boolean, default: false }
    },
    gymEquipment: {
      barbell: { type: Boolean, default: false },
      dumbbell: { type: Boolean, default: false },
      kettlebell: { type: Boolean, default: false },
      resistanceMachine: { type: Boolean, default: false },
      pullUpBar: { type: Boolean, default: false },
      plyometricBox: { type: Boolean, default: false },
      medicineBall: { type: Boolean, default: false },
      yogaMat: { type: Boolean, default: true },
      bands: { type: Boolean, default: false },
      sliders: { type: Boolean, default: false }
    },
    // Specific weight inventory — e.g. [{ type: 'dumbbell', weight: 25, unit: 'lbs' }, { type: 'plate', weight: 45, unit: 'lbs' }]
    weightInventory: [{
      type: { type: String, enum: ['dumbbell', 'barbell', 'plate', 'kettlebell'], required: true },
      weight: { type: Number, required: true },
      unit: { type: String, enum: ['lbs', 'kg'], default: 'lbs' }
    }]
  },

  // Experience Level
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'elite'],
    default: 'beginner'
  },

  // Health Considerations
  healthConsiderations: {
    injuries: [{
      type: String,
      trim: true
    }],
    limitations: [{
      type: String,
      trim: true
    }],
    allergies: [{
      type: String,
      trim: true
    }]
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // OAuth
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  migratedAt: {
    type: Date
  },
  // Telegram
  telegramId: {
    type: String,
    unique: true,
    sparse: true
  },
  telegramLinkToken: {
    type: String,
    sparse: true
  },
  telegramLinkExpires: {
    type: Date
  },
  telegramLinkCode: {
    type: String,
    sparse: true
  },
  telegramLinkCodeExpires: {
    type: Date
  }
});

// Update the updatedAt timestamp before saving
swimmerProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for common queries
swimmerProfileSchema.index({ email: 1 });
swimmerProfileSchema.index({ 'goals.primaryEvents.stroke': 1, 'goals.primaryEvents.distance': 1 });
swimmerProfileSchema.index({ experienceLevel: 1 });

// Create and export the model
const SwimmerProfile = mongoose.model('SwimmerProfile', swimmerProfileSchema);

module.exports = SwimmerProfile;