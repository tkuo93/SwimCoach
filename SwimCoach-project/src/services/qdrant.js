/**
 * Qdrant Vector Database Service
 * Collections: swimcoach_sources, swimcoach_insights
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY; // Optional for local

// SSRF protection: validate hostname + resolved IPs at startup
const ALLOWED_QDRANT_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
  'cloud.qdrant.io',           // Qdrant Cloud
  'qdrant.io'                  // Legacy Qdrant Cloud
]);
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

async function validateQdrantUrlRuntime(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // Exact hostname matching only (no suffix matching)
    if (!ALLOWED_QDRANT_HOSTS.has(hostname)) {
      throw new Error(`SSRF blocked: ${hostname} not in Qdrant allowlist`);
    }
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', 'host.docker.internal'].includes(hostname)) {
      throw new Error(`SSRF blocked: non-HTTPS URL for external Qdrant host`);
    }

    const dns = require('dns/promises');
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname)
    ]);

    const allIps = [
      ...(ipv4.status === 'fulfilled' ? ipv4.value : []),
      ...(ipv6.status === 'fulfilled' ? ipv6.value : [])
    ];

    for (const ip of allIps) {
      for (const range of PRIVATE_IP_RANGES) {
        if (ipInRange(ip, range)) {
          // Allow private IPs for localhost hosts
          if (!['localhost', '127.0.0.1', 'host.docker.internal'].includes(hostname)) {
            throw new Error(`SSRF blocked: resolved IP ${ip} is in private range ${range}`);
          }
        }
      }
    }

    console.log(`SSRF check passed for Qdrant ${hostname}: ${allIps.join(', ')}`);
    return true;
  } catch (e) {
    throw new Error(`SSRF validation failed for QDRANT_URL: ${e.message}`);
  }
}

// Validate at load time (async IIFE)
(async () => {
  try {
    await validateQdrantUrlRuntime(QDRANT_URL);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();

const SOURCES_COLLECTION = 'swimcoach_sources';
const INSIGHTS_COLLECTION = 'swimcoach_insights';
const VECTOR_SIZE = 2048;  // nvidia/llama-nemotron-embed-vl-1b-v2:free outputs 2048 dims

let client = null;

function getClient() {
  if (!client) {
    client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY || undefined,
      checkCompatibility: false,  // Avoid version mismatch warning with local Qdrant 1.12.0
    });
  }
  return client;
}

/**
 * Initialize collections (call on app startup)
 */
async function initCollections() {
  const qdrant = getClient();

  // Sources collection
  const sourcesExists = await qdrant.collectionExists(SOURCES_COLLECTION);
  if (!sourcesExists) {
    await qdrant.createCollection(SOURCES_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      optimizers_config: { default_segment_number: 2 },
    });
    // Payload indexes for filtering
    await qdrant.createPayloadIndex(SOURCES_COLLECTION, {
      field_name: 'userId',
      field_schema: 'keyword'
    });
    await qdrant.createPayloadIndex(SOURCES_COLLECTION, {
      field_name: 'sourceType',
      field_schema: 'keyword'
    });
    await qdrant.createPayloadIndex(SOURCES_COLLECTION, {
      field_name: 'tags',
      field_schema: 'keyword'
    });
    console.log(`Qdrant: Created collection ${SOURCES_COLLECTION}`);
  }

  // Insights collection
  const insightsExists = await qdrant.collectionExists(INSIGHTS_COLLECTION);
  if (!insightsExists) {
    await qdrant.createCollection(INSIGHTS_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      optimizers_config: { default_segment_number: 2 },
    });
    await qdrant.createPayloadIndex(INSIGHTS_COLLECTION, {
      field_name: 'userId',
      field_schema: 'keyword'
    });
    await qdrant.createPayloadIndex(INSIGHTS_COLLECTION, {
      field_name: 'sourceType',
      field_schema: 'keyword'
    });
    await qdrant.createPayloadIndex(INSIGHTS_COLLECTION, {
      field_name: 'tags',
      field_schema: 'keyword'
    });
    console.log(`Qdrant: Created collection ${INSIGHTS_COLLECTION}`);
  }
}

/**
 * Upsert source chunks
 * @param {Array<{id: string, vector: number[], payload: object}>} points
 */
async function upsertSources(points) {
  const qdrant = getClient();
  await qdrant.upsert(SOURCES_COLLECTION, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload
    }))
  });
}

/**
 * Upsert insights
 */
async function upsertInsights(points) {
  const qdrant = getClient();
  await qdrant.upsert(INSIGHTS_COLLECTION, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload
    }))
  });
}

/**
 * Search sources with filters
 * @param {Object} opts
 * @returns {Promise<Array<{id, score, payload}>>}
 */
async function searchSources(opts = {}) {
  const {
    vector,
    userId,
    sourceType,
    tags,
    limit = 5
  } = opts;

  const qdrant = getClient();
  const must = [];

  if (userId) must.push({ key: 'userId', match: { value: userId } });
  if (sourceType) must.push({ key: 'sourceType', match: { value: sourceType } });
  if (tags?.length) {
    tags.forEach(tag => must.push({ key: 'tags', match: { value: tag } }));
  }

  const filter = must.length ? { must } : undefined;

  const results = await qdrant.search(SOURCES_COLLECTION, {
    vector,
    filter,
    limit,
    with_payload: true,
    with_vector: false,
  });

  return results.map(r => ({
    id: r.id,
    score: r.score,
    payload: r.payload
  }));
}

/**
 * Search insights with filters
 */
async function searchInsights(opts = {}) {
  const {
    vector,
    userId,
    sourceType,
    tags,
    limit = 5
  } = opts;

  const qdrant = getClient();
  const must = [];

  if (userId) must.push({ key: 'userId', match: { value: userId } });
  if (sourceType) must.push({ key: 'sourceType', match: { value: sourceType } });
  if (tags?.length) {
    tags.forEach(tag => must.push({ key: 'tags', match: { value: tag } }));
  }

  const filter = must.length ? { must } : undefined;

  const results = await qdrant.search(INSIGHTS_COLLECTION, {
    vector,
    filter,
    limit,
    with_payload: true,
    with_vector: false,
  });
  return results.map(r => ({
    id: r.id,
    score: r.score,
    payload: r.payload
  }));
}

module.exports = {
  initCollections,
  upsertSources,
  upsertInsights,
  searchSources,
  searchInsights,
  SOURCES_COLLECTION,
  INSIGHTS_COLLECTION,
  VECTOR_SIZE
};