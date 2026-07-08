#!/usr/bin/env node
/**
 * Sync Script: OpenNotebook → SwimCoach Cloud
 * Run locally: node scripts/sync-notebook.js
 *
 * Reads from local OpenNotebook API, embeds via OpenRouter,
 * upserts to MongoDB Atlas + Qdrant Cloud.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Source = require('../src/models/Source');
const Insight = require('../src/models/Insight');
const { embed, embedBatch, chunkText } = require('../src/services/embeddings');
const { upsertSources, upsertInsights, initCollections } = require('../src/services/qdrant');

const OPEN_NOTEBOOK_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';
const OPEN_NOTEBOOK_API_KEY = process.env.OPEN_NOTEBOOK_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID; // Your user ID in SwimCoach

// SSRF protection: validate hostname + resolved IPs at startup
const ALLOWED_NOTEBOOK_HOSTS = new Set(['localhost', '127.0.0.1', 'host.docker.internal']);
const PRIVATE_IP_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '127.0.0.0/8',
  '::1/128',
  'fe80::/10'
];

function ipInRange(ip, range) {
  if (ip.includes('.')) {
    const [base, bits] = range.split('/');
    const mask = parseInt(bits, 10);
    const ipParts = ip.split('.').map(Number);
    const baseParts = base.split('.').map(Number);
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const baseNum = (baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3];
    const maskNum = ~((1 << (32 - mask)) - 1);
    return (ipNum & maskNum) === (baseNum & maskNum);
  }
  return ip === '::1' || ip.startsWith('fe80:');
}

async function validateNotebookUrlRuntime(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_NOTEBOOK_HOSTS.has(parsed.hostname)) {
      throw new Error(`SSRF blocked: ${parsed.hostname} not in allowlist (localhost only)`);
    }
    if (parsed.protocol !== 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error(`SSRF blocked: unexpected protocol for notebook`);
    }

    const dns = require('dns/promises');
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(parsed.hostname),
      dns.resolve6(parsed.hostname)
    ]);

    const allIps = [
      ...(ipv4.status === 'fulfilled' ? ipv4.value : []),
      ...(ipv6.status === 'fulfilled' ? ipv6.value : [])
    ];

    for (const ip of allIps) {
      for (const range of PRIVATE_IP_RANGES) {
        if (ipInRange(ip, range)) {
          // Allow private IPs for localhost — that's expected
          if (!['localhost', '127.0.0.1', 'host.docker.internal'].includes(parsed.hostname)) {
            throw new Error(`SSRF blocked: resolved IP ${ip} is in private range ${range}`);
          }
        }
      }
    }

    console.log(`SSRF check passed for ${parsed.hostname}: ${allIps.join(', ')}`);
    return true;
  } catch (e) {
    throw new Error(`SSRF validation failed for ${url}: ${e.message}`);
  }
}

// Validate at load time
(async () => {
  try {
    await validateNotebookUrlRuntime(OPEN_NOTEBOOK_URL);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();

if (!MONGODB_URI) {
  console.error('MONGODB_URI required in .env.local');
  process.exit(1);
}
if (!SYSTEM_USER_ID) {
  console.error('SYSTEM_USER_ID required in .env.local (your SwimCoach user ID)');
  process.exit(1);
}

const headers = OPEN_NOTEBOOK_API_KEY
  ? { 'Authorization': `Bearer ${OPEN_NOTEBOOK_API_KEY}` }
  : {};

async function fetchOpenNotebookSources() {
  const res = await fetch(`${OPEN_NOTEBOOK_URL}/api/sources`, { headers, redirect: 'manual' });
  if (!res.ok) throw new Error(`Failed to fetch sources: ${res.status}`);
  return res.json();
}

async function fetchSourceDetail(sourceId) {
  const res = await fetch(`${OPEN_NOTEBOOK_URL}/api/sources/${sourceId}`, { headers, redirect: 'manual' });
  if (!res.ok) throw new Error(`Failed to fetch source detail: ${res.status}`);
  return res.json();
}

async function fetchOpenNotebookNotes() {
  const res = await fetch(`${OPEN_NOTEBOOK_URL}/api/notes`, { headers, redirect: 'manual' });
  if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
  return res.json();
}

async function connectMongo() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected');
}

async function syncInsights(notes) {
  console.log(`\n=== Syncing ${notes.length} insights (notes) ===`);

  let synced = 0;
  for (const note of notes) {
    try {
      const existing = await Insight.findOne({ openNotebookId: note.id });
      if (existing) {
        console.log(`  ↻ Skipping (already synced): ${note.title}`);
        continue;
      }

      const content = note.content || '';
      if (!content.trim()) {
        console.log(`  ⚠ Empty content: ${note.title}`);
        continue;
      }

      console.log(`  📦 Embedding: ${note.title}`);
      const vector = await embed(content);

      const qdrantId = uuidv4();

      // Upsert to Qdrant
      await upsertInsights([{
        id: qdrantId,
        vector,
        payload: {
          insightId: note.id,
          userId: SYSTEM_USER_ID,
          sourceType: 'system',
          title: note.title,
          content,
          tags: note.tags || [],
          weight: 0.6,
          priority: note.priority || 0
        }
      }]);

      // Save to MongoDB
      const insightDoc = new Insight({
        userId: SYSTEM_USER_ID,
        sourceType: 'system',
        title: note.title,
        content,
        qdrantId,
        weight: 0.6,
        tags: note.tags || [],
        priority: note.priority || 0,
        openNotebookId: note.id
      });
      await insightDoc.save();

      synced++;
      console.log(`  ✅ Synced: ${note.title}`);
    } catch (err) {
      console.error(`  ❌ Failed: ${note.title} — ${err.message}`);
      if (err.stack) console.error(`     Stack: ${err.stack.split('\n')[1]?.trim()}`);
    }
  }
  console.log(`Insights synced: ${synced}/${notes.length}`);
}

async function main() {
  console.log('🔄 OpenNotebook → SwimCoach Sync');
  console.log(`OpenNotebook: ${OPEN_NOTEBOOK_URL}`);
  console.log(`System User: ${SYSTEM_USER_ID}`);

  await connectMongo();
  await initCollections();

  const sourcesList = await fetchOpenNotebookSources();
  const notes = await fetchOpenNotebookNotes();

  console.log(`\nFetched: ${sourcesList.length} sources, ${notes.length} notes`);

  // Sync sources one at a time to avoid memory issues
  for (const src of sourcesList) {
    try {
      console.log(`\n=== Processing: ${src.title} ===`);
      // Fetch full content
      const fullSrc = await fetchSourceDetail(src.id);

      // Check if already synced
      const existing = await Source.findOne({ openNotebookId: fullSrc.id });
      if (existing) {
        console.log(`  ↻ Skipping (already synced): ${fullSrc.title}`);
        continue;
      }

      // Check content availability
      const content = fullSrc.full_text || fullSrc.content || '';
      const status = fullSrc.status || 'unknown';
      if (!content.trim()) {
        console.log(`  ⚠ Skipping (no content, status: ${status}): ${fullSrc.title}`);
        console.log(`     → Process this source in OpenNotebook UI first (click "Process")`);
        continue;
      }

      // Chunk content
      const chunks = chunkText(content, { maxTokens: 500, overlap: 50 });
      if (!chunks.length) {
        console.log(`  ⚠ No chunks generated: ${fullSrc.title}`);
        continue;
      }

      // Embed chunks in small batches
      console.log(`  📦 Embedding ${chunks.length} chunks...`);
      const BATCH_SIZE = 10;
      const vectors = [];
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchVectors = await embedBatch(batch);
        vectors.push(...batchVectors);
        if (i + BATCH_SIZE < chunks.length) await new Promise(r => setTimeout(r, 100));
      }

      // Prepare Qdrant points
      const qdrantPoints = chunks.map((text, i) => ({
        id: uuidv4(),
        vector: vectors[i],
        payload: {
          sourceId: fullSrc.id,
          chunkIndex: i,
          userId: SYSTEM_USER_ID,
          sourceType: 'system',
          title: fullSrc.title,
          text,
          tags: fullSrc.tags || [],
          metadata: fullSrc.metadata || {}
        }
      }));

      // Upsert to Qdrant
      await upsertSources(qdrantPoints);

      // Save to MongoDB
      const sourceDoc = new Source({
        userId: SYSTEM_USER_ID,
        sourceType: 'system',
        title: fullSrc.title,
        content,
        sourceUrl: fullSrc.metadata?.url || fullSrc.url,
        fileName: fullSrc.metadata?.file_name,
        chunks: qdrantPoints.map((p, i) => ({
          index: i,
          text: chunks[i],
          qdrantId: p.id
        })),
        metadata: {
          author: fullSrc.metadata?.author,
          publishedDate: fullSrc.metadata?.published_date ? new Date(fullSrc.metadata.published_date) : null,
          tags: fullSrc.tags || []
        },
        openNotebookId: fullSrc.id
      });
      await sourceDoc.save();

      console.log(`  ✅ Synced: ${fullSrc.title} (${chunks.length} chunks)`);
    } catch (err) {
      console.error(`  ❌ Failed: ${src.title} — ${err.message}`);
      if (err.stack) console.error(`     Stack: ${err.stack.split('\n')[1]?.trim()}`);
    }
  }

  await syncInsights(notes);

  console.log('\n✅ Sync complete!');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});