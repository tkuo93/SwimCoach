/**
 * RAG Service: Unified retrieval for coach context
 * Merges personal (coach's) + system (your) sources with weighted scoring
 */

const { embed } = require('./embeddings');
const { searchSources, searchInsights } = require('./qdrant');

/**
 * Build coach context from blended sources
 * @param {Object} params
 * @param {string} params.userId - Coach's user ID (for personal sources)
 * @param {string} params.systemUserId - Your user ID (for system insights)
 * @param {string} params.query - User's question
 * @param {Object} params.opts - Options
 * @returns {Promise<Array<{text, source, score, weight, type}>>}
 */
async function buildCoachContext({ userId, systemUserId, query, opts = {} }) {
  const {
    personalSourceLimit = 5,
    systemInsightLimit = 3,
    systemSourceLimit = 2,
    personalWeight = 1.0,
    systemInsightWeight = 0.6,
    systemSourceWeight = 0.4,
    minScore = 0.3
  } = opts;

  const queryVector = await embed(query);

  // Parallel searches
  const [personalSources, systemInsights, systemSources] = await Promise.all([
    searchSources({
      vector: queryVector,
      userId,
      sourceType: 'personal',
      limit: personalSourceLimit
    }),
    searchInsights({
      vector: queryVector,
      userId: systemUserId,
      sourceType: 'system',
      limit: systemInsightLimit
    }),
    searchSources({
      vector: queryVector,
      userId: systemUserId,
      sourceType: 'system',
      limit: systemSourceLimit
    })
  ]);

  // Combine with weights
  const results = [
    ...personalSources
      .filter(r => r.score >= minScore)
      .map(r => ({
        text: r.payload.text || r.payload.content,
        source: r.payload.title,
        score: r.score * personalWeight,
        weight: personalWeight,
        type: 'personal_source',
        tags: r.payload.tags
      })),
    ...systemInsights
      .filter(r => r.score >= minScore)
      .map(r => ({
        text: r.payload.content,
        source: r.payload.title,
        score: r.score * systemInsightWeight,
        weight: systemInsightWeight,
        type: 'system_insight',
        tags: r.payload.tags
      })),
    ...systemSources
      .filter(r => r.score >= minScore)
      .map(r => ({
        text: r.payload.text || r.payload.content,
        source: r.payload.title,
        score: r.score * systemSourceWeight,
        weight: systemSourceWeight,
        type: 'system_source',
        tags: r.payload.tags
      }))
  ];

  // Sort by weighted score descending
  results.sort((a, b) => b.score - a.score);

  // Cap total context chunks
  const maxChunks = opts.maxChunks || 8;
  return results.slice(0, maxChunks);
}

/**
 * Format context chunks for LLM prompt
 * @param {Array} chunks
 * @returns {string}
 */
function formatContext(chunks) {
  if (!chunks.length) return '';

  let text = '## Relevant Knowledge\n\n';
  chunks.forEach((chunk, i) => {
    const tagStr = chunk.tags?.length ? ` [${chunk.tags.join(', ')}]` : '';
    text += `### Source ${i + 1}: ${chunk.source}${tagStr} (${chunk.type}, weight: ${chunk.weight})\n`;
    text += `${chunk.text}\n\n`;
  });
  return text;
}

module.exports = {
  buildCoachContext,
  formatContext
};