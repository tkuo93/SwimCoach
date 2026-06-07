/**
 * MEMORY.md Service
 *
 * Reads and appends feedback entries to the MEMORY.md file.
 * This provides a persistent feedback loop for the workout generation model.
 */

const fs = require('fs');
const path = require('path');

const MEMORY_PATH = process.env.MEMORY_PATH || path.join(__dirname, '..', '..', 'MEMORY.md');

/**
 * Read the full contents of MEMORY.md.
 * Returns empty string if file doesn't exist.
 */
function readMemory() {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return '';
    return fs.readFileSync(MEMORY_PATH, 'utf8');
  } catch (err) {
    console.error('Failed to read MEMORY.md:', err.message);
    return '';
  }
}

/**
 * Extract the feedback entries section from MEMORY.md.
 * Returns an array of entry strings.
 */
function parseEntries(content) {
  const entries = [];
  // Split on ### headers, skip the preamble before the first entry
  const parts = content.split(/^### \[/m);
  for (let i = 1; i < parts.length; i++) {
    const entry = '### [' + parts[i].trim();
    if (entry.length > 5) entries.push(entry);
  }
  return entries;
}

/**
 * Get a summary of recent feedback for inclusion in workout generation prompts.
 * Returns a formatted string of the last N entries.
 *
 * @param {number} maxEntries — max number of recent entries to include (default 10)
 * @returns {string} formatted summary
 */
function getFeedbackSummary(maxEntries = 10) {
  const content = readMemory();
  if (!content) return '';

  const entries = parseEntries(content);
  if (!entries.length) return '';

  // Entries are stored newest-first (prepended after ## Entries header)
  const recent = entries.slice(0, maxEntries);

  return recent
    .map(e => {
      // Extract key fields for a compact summary
      const lines = e.split('\n');
      const summary = lines
        .filter(l => l.startsWith('- **'))
        .map(l => l.replace(/^- \*\*/, '').replace(/\*\*:?/, ':').trim())
        .join('; ');
      return `- ${summary}`;
    })
    .join('\n');
}

/**
 * Append a feedback entry to MEMORY.md.
 *
 * @param {Object} params
 * @param {string} params.profileName — swimmer name
 * @param {string} params.workoutType — type of workout
 * @param {number} params.rating — 1-5 star rating
 * @param {string} params.difficultyPerception — too-easy/easy/just-right/hard/too-hard
 * @param {string} params.enjoyment — did-not-enjoy/neutral/enjoyed/loved
 * @param {string} params.comments — user's free-text comments
 * @param {string} params.learning — derived insight for future generation
 */
function appendFeedback({
  profileName,
  workoutType,
  rating,
  difficultyPerception,
  enjoyment,
  comments,
  learning,
}) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const entry = [
    `### [${dateStr}] — ${profileName}`,
    `- **Workout Type**: ${workoutType || 'unknown'}`,
    `- **Rating**: ${rating || 'N/A'}`,
  ];

  if (difficultyPerception) entry.push(`- **Difficulty**: ${difficultyPerception}`);
  if (enjoyment) entry.push(`- **Enjoyment**: ${enjoyment}`);
  if (comments) entry.push(`- **Comments**: ${comments}`);
  if (learning) entry.push(`- **Learning**: ${learning}`);

  const entryBlock = entry.join('\n') + '\n';

  try {
    let content = readMemory();

    // Find the "Entries" section and insert after the header
    const entriesHeader = '## Entries';
    const idx = content.indexOf(entriesHeader);
    if (idx === -1) {
      // Fallback: append to end
      content += '\n' + entriesHeader + '\n\n' + entryBlock;
    } else {
      // Find the position after the header line
      const afterHeader = idx + entriesHeader.length;
      // Skip past the header line and any blank lines
      let insertPos = afterHeader;
      while (insertPos < content.length && content[insertPos] === '\n') insertPos++;
      // Skip past the "No feedback entries yet" placeholder if present
      const placeholderIdx = content.indexOf('_No feedback entries yet', insertPos);
      if (placeholderIdx !== -1 && placeholderIdx < insertPos + 60) {
        // Replace placeholder with our entry
        const before = content.slice(0, placeholderIdx);
        const after = content.indexOf('\n\n', placeholderIdx);
        const afterPart = after !== -1 ? content.slice(after) : '';
        content = before + entryBlock + afterPart;
      } else {
        content = content.slice(0, insertPos) + '\n' + entryBlock + '\n' + content.slice(insertPos);
      }
    }

    fs.writeFileSync(MEMORY_PATH, content, 'utf8');
    console.log(`MEMORY.md: appended feedback for ${profileName}`);
  } catch (err) {
    console.error('Failed to write to MEMORY.md:', err.message);
  }
}

/**
 * Derive a learning insight from feedback data.
 * Simple heuristic based on difficulty and enjoyment.
 */
function deriveLearning({ rating, difficultyPerception, enjoyment, workoutType }) {
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

  return insights.join(' ') || `User rated ${workoutType} workout ${rating}/5.`;
}

module.exports = {
  readMemory,
  getFeedbackSummary,
  appendFeedback,
  deriveLearning,
  parseEntries,
};
