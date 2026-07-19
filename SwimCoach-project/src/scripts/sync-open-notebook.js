#!/usr/bin/env node
/**
 * Sync OpenNotebook Sources to SwimCoach Database
 *
 * This script:
 * 1. Connects to OpenNotebook API
 * 2. Fetches all sources/notes
 * 3. Transforms them to KnowledgeSource format
 * 4. Stores in MongoDB
 * 5. Generates embeddings and stores in Qdrant for RAG
 *
 * Usage: node src/scripts/sync-open-notebook.js [--dry-run] [--source-id <id>]
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const KnowledgeSource = require('../models/KnowledgeSource');
const { embed, embedBatch, chunkText } = require('../services/embeddings');
const { initCollections, upsertSources, upsertInsights, SOURCES_COLLECTION, INSIGHTS_COLLECTION } = require('../services/qdrant');
const { client: openNotebookClient } = require('../services/open-notebook');

const BASE_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceId = args.includes('--source-id') ? args[args.indexOf('--source-id') + 1] : null;

async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/swimcoach';
    const conn = await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Fetch all sources from OpenNotebook
 */
async function fetchOpenNotebookSources() {
  try {
    console.log('📡 Fetching sources from OpenNotebook...');

    // OpenNotebook API endpoints - try common ones
    const endpoints = [
      '/api/sources',
      '/api/notebooks',
      '/api/documents',
      '/api/notes'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await openNotebookClient.get(endpoint);
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          console.log(`✅ Found sources at ${endpoint}: ${response.data.length} items`);
          return response.data;
        }
      } catch (err) {
        console.log(`  ⚠️  ${endpoint}: ${err.message}`);
      }
    }

    // If standard endpoints don't work, try to get notebook content
    console.log('🔍 Trying to fetch notebook content...');
    const notebooksResponse = await openNotebookClient.get('/api/notebooks');
    if (notebooksResponse.data && notebooksResponse.data.length > 0) {
      // Get sources from the first notebook
      const notebookId = notebooksResponse.data[0].id;
      const sourcesResponse = await openNotebookClient.get(`/api/notebooks/${notebookId}/sources`);
      if (sourcesResponse.data && sourcesResponse.data.length > 0) {
        console.log(`✅ Found sources in notebook ${notebookId}: ${sourcesResponse.data.length} items`);
        return sourcesResponse.data;
      }
    }

    console.log('⚠️  No sources found via standard endpoints');
    return [];
  } catch (error) {
    console.error(`❌ Error fetching OpenNotebook sources: ${error.message}`);
    return [];
  }
}

/**
 * Transform OpenNotebook source to KnowledgeSource format
 */
function transformSource(onSource) {
  // Extract content from various possible fields
  const content = onSource.content || onSource.text || onSource.body || onSource.abstract || '';
  const title = onSource.title || onSource.name || 'Untitled Source';

  // Determine source type
  let sourceType = 'curated-content';
  if (onSource.url && onSource.url.includes('doi.org')) sourceType = 'research-paper';
  else if (onSource.platform) sourceType = 'social-media-post';
  else if (onSource.authorHandle) sourceType = 'social-media-post';
  else if (onSource.type === 'video') sourceType = 'video';
  else if (onSource.type === 'article') sourceType = 'article';

  // Extract authors
  const authors = onSource.authors || (onSource.author ? [onSource.author] : []);

  // Extract swimming categories from tags or content
  const swimmingCategories = extractSwimmingCategories(onSource);

  // Generate insight cache key
  const insightCacheKey = generateCacheKey(onSource);

  return {
    title,
    sourceType,
    sourceId: onSource.id || onSource.sourceId || onSource._id,
    url: onSource.url,
    platform: onSource.platform,
    authorHandle: onSource.authorHandle,
    authors,
    publicationDate: onSource.publicationDate || onSource.createdAt || onSource.date,
    journalOrPlatform: onSource.journalOrPlatform || onSource.source || onSource.platform,
    abstract: content.substring(0, 500),
    keywords: onSource.keywords || onSource.tags || [],
    swimmingCategories,
    targetAudience: determineTargetAudience(onSource),
    sourceTrustLevel: determineTrustLevel(onSource),
    contentQuality: determineContentQuality(onSource),
    relevanceScore: calculateRelevanceScore(onSource),
    notebooklmInsights: {
      insightType: 'ad-hoc',
      summary: content.substring(0, 1000),
      keyFindings: extractKeyFindings(content),
      trainingApplications: extractTrainingApplications(content),
      workoutModifications: [],
      periodizationRecommendations: [],
      techniqueAdjustments: [],
      equipmentRecommendations: [],
      confidenceLevel: 'moderate-confidence',
      generatedAt: new Date(),
      sourceReference: onSource.id || onSource.sourceId || onSource._id,
      generationPrompt: 'Auto-generated from OpenNotebook sync',
      insightCacheKey
    },
    usageMetrics: {
      timesReferenced: 0,
      effectivenessRating: 0,
      usefulInsights: [],
      generationMethodPerformance: {
        standardized: { timesUsed: 0, avgEffectiveness: 0 },
        adHoc: { timesUsed: 0, avgEffectiveness: 0 }
      }
    }
  };
}

/**
 * Extract swimming categories from source content/tags
 */
function extractSwimmingCategories(source) {
  const categories = [];
  const text = `${source.title || ''} ${source.content || ''} ${source.abstract || ''} ${(source.tags || []).join(' ')}`.toLowerCase();

  const categoryMap = {
    'freestyle': 'technique-freestyle',
    'backstroke': 'technique-backstroke',
    'breaststroke': 'technique-breaststroke',
    'butterfly': 'technique-butterfly',
    'start': 'starts-turns',
    'turn': 'starts-turns',
    'race': 'race-strategy',
    'nutrition': 'nutrition',
    'recovery': 'recovery',
    'strength': 'strength-training',
    'endurance': 'endurance-training',
    'sprint': 'sprint-training',
    'mental': 'mental-preparation',
    'injury': 'injury-prevention',
    'equipment': 'equipment',
    'physiology': 'physiology',
    'biomechanics': 'biomechanics'
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (text.includes(keyword)) {
      categories.push(category);
    }
  }

  // Default to general if none found
  return categories.length > 0 ? categories : ['endurance-training'];
}

/**
 * Determine target audience from source
 */
function determineTargetAudience(source) {
  const text = `${source.title || ''} ${source.content || ''}`.toLowerCase();

  if (text.includes('beginner') || text.includes('novice') || text.includes('learn to swim')) return 'beginner';
  if (text.includes('elite') || text.includes('olympic') || text.includes('world class')) return 'elite';
  if (text.includes('advanced') || text.includes('high performance')) return 'advanced';
  if (text.includes('masters') || text.includes('adult')) return 'masters';
  if (text.includes('youth') || text.includes('junior') || text.includes('age group')) return 'youth';

  return 'intermediate';
}

/**
 * Determine trust level from source
 */
function determineTrustLevel(source) {
  if (source.url && source.url.includes('doi.org')) return 'verified-expert';
  if (source.sourceTrustLevel) return source.sourceTrustLevel;
  if (source.verified) return 'verified-expert';
  if (source.platform === 'pubmed' || source.platform === 'scholar') return 'verified-expert';
  return 'trusted-source';
}

/**
 * Determine content quality
 */
function determineContentQuality(source) {
  const contentLength = (source.content || source.text || source.body || '').length;
  if (contentLength > 5000) return 'high-quality';
  if (contentLength > 1000) return 'good-quality';
  return 'fair-quality';
}

/**
 * Calculate relevance score
 */
function calculateRelevanceScore(source) {
  let score = 50; // base

  const text = `${source.title || ''} ${source.content || ''}`.toLowerCase();

  // Boost for swimming-specific terms
  const swimTerms = ['swim', 'swimming', 'pool', 'stroke', 'lap', 'pace', 'interval', 'training'];
  for (const term of swimTerms) {
    if (text.includes(term)) score += 5;
  }

  // Boost for research paper
  if (source.url && source.url.includes('doi.org')) score += 15;

  // Boost for verified expert
  if (determineTrustLevel(source) === 'verified-expert') score += 10;

  return Math.min(100, Math.max(0, score));
}

/**
 * Extract key findings from content
 */
function extractKeyFindings(content) {
  const findings = [];
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Look for sentences with key indicators
  const indicators = ['found that', 'showed that', 'demonstrated', 'concluded', 'recommend', 'suggest', 'indicates'];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const indicator of indicators) {
      if (lower.includes(indicator)) {
        findings.push(sentence.trim());
        break;
      }
    }
    if (findings.length >= 5) break;
  }

  return findings.length > 0 ? findings : [content.substring(0, 200)];
}

/**
 * Extract training applications
 */
function extractTrainingApplications(content) {
  const applications = [];
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);

  const indicators = ['training', 'workout', 'practice', 'session', 'set', 'interval', 'volume', 'intensity'];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const indicator of indicators) {
      if (lower.includes(indicator)) {
        applications.push(sentence.trim());
        break;
      }
    }
    if (applications.length >= 5) break;
  }

  return applications.length > 0 ? applications : ['General swimming training principles'];
}

/**
 * Generate cache key for insights
 */
function generateCacheKey(source) {
  const identifier = source.id || source.sourceId || source._id || source.title;
  return `open-notebook-${Buffer.from(identifier).toString('base64').substring(0, 32)}`;
}

/**
 * Process source: chunk, embed, store in Qdrant
 */
async function processSourceForRag(knowledgeSource) {
  try {
    console.log(`🔄 Processing for RAG: ${knowledgeSource.title.substring(0, 50)}...`);

    const content = knowledgeSource.notebooklmInsights.summary;
    const chunks = chunkText(content, { maxTokens: 500, overlap: 50 });

    if (chunks.length === 0) {
      console.log('  ⚠️  No content to embed');
      return;
    }

    console.log(`  📝 Created ${chunks.length} chunks`);

    // Generate embeddings
    const embeddings = await embedBatch(chunks);

    // Prepare points for Qdrant
    const points = chunks.map((chunk, index) => ({
      id: `${knowledgeSource._id}-chunk-${index}`,
      vector: embeddings[index],
      payload: {
        text: chunk,
        title: knowledgeSource.title,
        sourceId: knowledgeSource._id.toString(),
        sourceType: 'system',
        tags: knowledgeSource.swimmingCategories,
        userId: 'system',
        knowledgeSourceId: knowledgeSource._id.toString(),
        chunkIndex: index,
        totalChunks: chunks.length
      }
    }));

    // Upsert to Qdrant
    await upsertSources(points);
    console.log(`  ✅ Stored ${points.length} chunks in Qdrant`);

    // Also store insights separately
    const insightPoints = [];
    const insights = knowledgeSource.notebooklmInsights;

    if (insights.keyFindings?.length) {
      const findingEmbeddings = await embedBatch(insights.keyFindings);
      insights.keyFindings.forEach((finding, index) => {
        insightPoints.push({
          id: `${knowledgeSource._id}-finding-${index}`,
          vector: findingEmbeddings[index],
          payload: {
            content: finding,
            title: `${knowledgeSource.title} - Key Finding ${index + 1}`,
            sourceType: 'system',
            tags: knowledgeSource.swimmingCategories,
            userId: 'system',
            knowledgeSourceId: knowledgeSource._id.toString(),
            insightType: 'keyFinding'
          }
        });
      });
    }

    if (insights.trainingApplications?.length) {
      const appEmbeddings = await embedBatch(insights.trainingApplications);
      insights.trainingApplications.forEach((app, index) => {
        insightPoints.push({
          id: `${knowledgeSource._id}-application-${index}`,
          vector: appEmbeddings[index],
          payload: {
            content: app,
            title: `${knowledgeSource.title} - Training Application ${index + 1}`,
            sourceType: 'system',
            tags: knowledgeSource.swimmingCategories,
            userId: 'system',
            knowledgeSourceId: knowledgeSource._id.toString(),
            insightType: 'trainingApplication'
          }
        });
      });
    }

    if (insightPoints.length > 0) {
      await upsertInsights(insightPoints);
      console.log(`  ✅ Stored ${insightPoints.length} insights in Qdrant`);
    }

  } catch (error) {
    console.error(`  ❌ Error processing for RAG: ${error.message}`);
  }
}

/**
 * Main sync function
 */
async function syncOpenNotebookSources() {
  console.log('🚀 Starting OpenNotebook sync...');
  console.log(`📍 OpenNotebook URL: ${BASE_URL}`);
  console.log(`🧪 Dry run: ${dryRun}`);

  // Connect to databases
  await connectDB();

  // Initialize Qdrant collections
  console.log('🔧 Initializing Qdrant collections...');
  await initCollections();

  // Fetch sources from OpenNotebook
  const onSources = await fetchOpenNotebookSources();

  if (onSources.length === 0) {
    console.log('⚠️  No sources found to sync');
    return;
  }

  console.log(`\n📊 Found ${onSources.length} sources to process`);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const onSource of onSources) {
    try {
      // Filter by source ID if specified
      if (sourceId && onSource.id !== sourceId && onSource.sourceId !== sourceId && onSource._id !== sourceId) {
        continue;
      }

      console.log(`\n📄 Processing: ${onSource.title || onSource.name || 'Untitled'}`);

      // Transform to KnowledgeSource
      const transformed = transformSource(onSource);

      if (dryRun) {
        console.log(`  🧪 [DRY RUN] Would create:`);
        console.log(`     Title: ${transformed.title}`);
        console.log(`     Type: ${transformed.sourceType}`);
        console.log(`     Categories: ${transformed.swimmingCategories.join(', ')}`);
        console.log(`     Trust: ${transformed.sourceTrustLevel}`);
        console.log(`     Relevance: ${transformed.relevanceScore}`);
        synced++;
        continue;
      }

      // Check if already exists (by sourceId)
      const existing = await KnowledgeSource.findOne({ sourceId: transformed.sourceId });

      if (existing) {
        console.log(`  ⏭️  Already exists (ID: ${existing._id}), updating...`);

        // Update existing
        Object.assign(existing, transformed);
        existing.updatedAt = new Date();
        await existing.save();

        // Process for RAG
        await processSourceForRag(existing);
        synced++;
      } else {
        // Create new
        const knowledgeSource = new KnowledgeSource(transformed);
        await knowledgeSource.save();
        console.log(`  ✅ Created new source (ID: ${knowledgeSource._id})`);

        // Process for RAG
        await processSourceForRag(knowledgeSource);
        synced++;
      }

    } catch (error) {
      console.error(`  ❌ Error processing source: ${error.message}`);
      errors++;
    }
  }

  console.log('\n📈 Sync Summary:');
  console.log(`   ✅ Synced: ${synced}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);

  if (dryRun) {
    console.log('\n🧪 This was a dry run. No changes were made.');
  }

  // Close connections
  await mongoose.connection.close();
  console.log('\n🔌 Database connection closed');
  process.exit(0);
}

// Run the sync
syncOpenNotebookSources().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});