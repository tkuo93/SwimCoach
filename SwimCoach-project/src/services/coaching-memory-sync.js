/**
 * Coaching Memory Sync Service
 *
 * Keeps CoachingMemory in sync with feedback submissions and
 * detects trends that the coach can act on.
 */

const CoachingMemory = require('../models/CoachingMemory');
const Workout = require('../models/Workout');
const { deriveLearning } = require('./memory');

/**
 * Store a feedback-derived observation in CoachingMemory.
 * Called after every feedback submission.
 *
 * @param {Object} params
 * @param {string} params.swimmerId
 * @param {string} params.workoutId
 * @param {string} params.workoutType
 * @param {Object} params.feedback - { rating, difficultyPerception, enjoyment, quality, accuracy }
 */
async function syncFeedbackToMemory({ swimmerId, workoutId, workoutType, feedback }) {
  const learning = deriveLearning({ ...feedback, workoutType });
  if (!learning) return null;

  // Map deriveLearning output to a category
  const category = inferCategory(learning, workoutType);

  return CoachingMemory.create({
    swimmerId,
    type: 'observation',
    category,
    content: learning,
    source: 'feedback-derivation',
    confidence: 0.6,
    relevantWorkoutIds: [workoutId],
    active: true,
  });
}

/**
 * Run trend detection across a swimmer's recent feedback.
 * Creates trend-type observations when patterns emerge.
 * Call this every Nth feedback submission.
 *
 * @param {string} swimmerId
 * @param {number} lookbackWeeks - How far back to look (default 8)
 */
async function detectTrends(swimmerId, lookbackWeeks = 8) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackWeeks * 7);

  const workouts = await Workout.find({
    swimmerId,
    date: { $gte: since },
    'userFeedback.rating': { $exists: true },
  }).select('workoutType duration userFeedback');

  if (workouts.length < 3) return []; // Need at least 3 data points

  const trends = [];

  // Check: any workout type consistently rated too hard?
  const byType = groupBy(workouts, 'workoutType');
  for (const [type, group] of Object.entries(byType)) {
    if (group.length < 2) continue;

    const tooHard = group.filter(w => w.userFeedback?.difficultyPerception === 'too-hard');
    const ratio = tooHard.length / group.length;
    if (ratio >= 0.5) {
      trends.push({
        type: 'trend',
        category: 'intensity',
        content: `${type} sessions consistently rated too-hard (${tooHard.length}/${group.length}) — consider reducing intensity or volume for this type`,
        source: 'trend-detection',
        confidence: 0.7,
      });
    }

    const lowRated = group.filter(w => w.userFeedback?.rating && w.userFeedback.rating <= 2);
    const lowRatio = lowRated.length / group.length;
    if (lowRatio >= 0.5 && group.length >= 3) {
      trends.push({
        type: 'trend',
        category: 'general',
        content: `${type} sessions have low ratings (avg ≤ 2/5) — this training type may need restructuring`,
        source: 'trend-detection',
        confidence: 0.65,
      });
    }
  }

  // Check: any workout type consistently enjoyed?
  for (const [type, group] of Object.entries(byType)) {
    if (group.length < 2) continue;
    const loved = group.filter(w => w.userFeedback?.enjoyment === 'loved' || w.userFeedback?.enjoyment === 'enjoyed');
    if (loved.length / group.length >= 0.7) {
      trends.push({
        type: 'trend',
        category: strokeCategory(type),
        content: `Consistently enjoys ${type} sessions — good candidate for progression or increased frequency`,
        source: 'trend-detection',
        confidence: 0.5,
      });
    }
  }

  // Store detected trends
  const created = [];
  for (const trend of trends) {
    // Avoid duplicates: check if a similar trend already exists
    const existing = await CoachingMemory.findOne({
      swimmerId,
      type: 'trend',
      category: trend.category,
      content: { $regex: new RegExp(`^${escapeRegex(trend.content.slice(0, 30))}`) },
      active: true,
      createdAt: { $gte: since },
    });

    if (!existing) {
      const mem = await CoachingMemory.create({
        swimmerId,
        ...trend,
        active: true,
      });
      created.push(mem);
    }
  }

  return created;
}

/**
 * Backfill CoachingMemory from existing MEMORY.md entries.
 * Run once on deploy. After backfill, MEMORY.md remains for
 * backward compat but new feedback writes to CoachingMemory.
 *
 * @param {string} swimmerId - Profile to backfill for
 * @param {Array} entries - Parsed MEMORY.md entries [{ date, profileName, workoutType, rating, learning, ... }]
 */
async function backfillFromMemoryMd(swimmerId, entries) {
  const created = [];
  for (const entry of entries) {
    if (!entry.learning) continue;

    const category = inferCategory(entry.learning, entry.workoutType);

    // Skip if a similar observation already exists
    const existing = await CoachingMemory.findOne({
      swimmerId,
      content: entry.learning,
      source: 'feedback-derivation',
    });
    if (existing) continue;

    const mem = await CoachingMemory.create({
      swimmerId,
      type: 'observation',
      category,
      content: entry.learning,
      source: 'feedback-derivation',
      confidence: 0.6,
      active: true,
    });
    created.push(mem);
  }
  return created;
}

// ─── Helpers ────────────────────────────────────────────────────────

function inferCategory(learning, workoutType) {
  if (!learning) return 'general';
  const lower = learning.toLowerCase();
  if (lower.includes('intensity') || lower.includes('harder') || lower.includes('easier')) return 'intensity';
  if (lower.includes('volume') || lower.includes('distance') || lower.includes('length')) return 'volume';
  if (lower.includes('recover') || lower.includes('rest')) return 'recovery';
  if (lower.includes('technique') || lower.includes('form') || lower.includes('stroke')) return 'technique';
  if (lower.includes('equipment') || lower.includes('weight')) return 'equipment';
  return 'general';
}

function strokeCategory(workoutType) {
  const map = {
    speed: 'intensity',
    lactate: 'intensity',
    endurance: 'volume',
    technique: 'technique',
    recovery: 'recovery',
    mobility: 'recovery',
    'resistance-power': 'intensity',
  };
  return map[workoutType] || 'general';
}

function groupBy(arr, key) {
  const result = {};
  for (const item of arr) {
    const k = item[key];
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  syncFeedbackToMemory,
  detectTrends,
  backfillFromMemoryMd,
};
