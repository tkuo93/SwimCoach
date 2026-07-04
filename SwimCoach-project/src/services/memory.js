/**
 * Memory Service - Reads from CoachingMemory DB
 *
 * Replaced MEMORY.md file with MongoDB CoachingMemory collection.
 * Provides feedback summary for workout generation prompts.
 */

const CoachingMemory = require('../models/CoachingMemory');
const { deriveLearning } = require('./memory');

/**
 * Get a summary of recent feedback for inclusion in workout generation prompts.
 * Returns a formatted string of the last N entries from CoachingMemory.
 *
 * @param {number} maxEntries — max number of recent entries to include (default 10)
 * @param {string} swimmerId — optional, if provided scopes to that swimmer
 * @returns {Promise<string>} formatted summary
 */
async function getFeedbackSummary(maxEntries = 10, swimmerId = null) {
  try {
    const filter = { type: 'observation', active: true };
    if (swimmerId) filter.swimmerId = swimmerId;

    const memories = await CoachingMemory.find(filter)
      .sort({ updatedAt: -1 })
      .limit(maxEntries)
      .lean();

    if (!memories.length) return '';

    return memories
      .map(m => `- ${m.content}`)
      .join('\n');
  } catch (err) {
    console.error('Failed to get feedback summary:', err.message);
    return '';
  }
}

/**
 * Derive a learning insight from feedback data.
 * Simple heuristic based on difficulty and enjoyment.
 */
function deriveLearning({ rating, difficultyPerception, enjoyment, quality, accuracy, workoutType }) {
  const insights = [];

  if (difficultyPerception === 'too-hard' || rating <= 2) {
    insights.push(`Reduce intensity/duration for ${workoutType} workouts. User found it too challenging.`);
  } else if (difficultyPerception === 'too-easy' || rating >= 5) {
    insights.push(`User can handle more intensity. Consider increasing difficulty for ${workoutType} workouts.`);
  }

  if (enjoyment === 'did-not-enjoy') {
    insights.push(`User did not enjoy this ${workoutType} workout. Try varying exercises or reducing monotony.`);
  } else if (enjoyment === 'loved') {
    insights.push(`User loved this ${workoutType} workout. Use as a template for future sessions.`);
  }

  if (difficultyPerception === 'just-right') {
    insights.push(`Difficulty was well-calibrated for this user. Maintain similar structure.`);
  }

  if (quality === 'poor' || quality === 'below-average') {
    insights.push(`Workout quality was rated ${quality}. Review set structure, rest periods, and exercise selection for ${workoutType} workouts.`);
  } else if (quality === 'excellent' || quality === 'good') {
    insights.push(`Workout quality was rated ${quality}. This structure is working well for ${workoutType}.`);
  }

  if (accuracy === 'way-off' || accuracy === 'close-but-off') {
    insights.push(`Prescribed paces/effort were ${accuracy}. Recalibrate intensity targets for this swimmer's ${workoutType} workouts.`);
  } else if (accuracy === 'spot-on') {
    insights.push(`Intensity targets were spot-on. Keep similar pace prescriptions for ${workoutType}.`);
  }

  return insights.join(' ') || `User rated ${workoutType} workout ${rating}/5.`;
}

module.exports = {
  getFeedbackSummary,
  deriveLearning,
};