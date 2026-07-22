/**
 * Embeddings Service
 * Uses nvidia/llama-nemotron-embed-vl-1b-v2:free (1024-dim vectors)
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-vl-1b-v2:free';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';
const { rateLimitedFetchCall } = require('./openrouter-rate-limiter');

// SSRF protection: model allowlist
const ALLOWED_MODELS = new Set([
  'nvidia/llama-nemotron-embed-vl-1b-v2:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free', // backup
]);
if (!ALLOWED_MODELS.has(EMBEDDING_MODEL)) {
  throw new Error(`Invalid EMBEDDING_MODEL: ${EMBEDDING_MODEL}. Must be one of: ${[...ALLOWED_MODELS].join(', ')}`);
}

// SSRF protection: validate hostname + resolved IPs at startup
const ALLOWED_HOSTNAMES = new Set(['openrouter.ai']);
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
  // Simple CIDR check for IPv4
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
  // IPv6 - simplified: just check loopback/link-local
  return ip === '::1' || ip.startsWith('fe80:');
}

async function validateUrlRuntime(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
      throw new Error(`SSRF blocked: hostname ${parsed.hostname} not in allowlist`);
    }
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error(`SSRF blocked: non-HTTPS URL for external host`);
    }

    // Resolve DNS and validate IPs
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
          throw new Error(`SSRF blocked: resolved IP ${ip} is in private range ${range}`);
        }
      }
    }

    console.log(`SSRF check passed for ${parsed.hostname}: ${allIps.join(', ')}`);
    return true;
  } catch (e) {
    throw new Error(`SSRF validation failed for ${url}: ${e.message}`);
  }
}

// Validate at load time (async IIFE)
(async () => {
  try {
    await validateUrlRuntime(OPENROUTER_URL);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY not set — embeddings will fail');
}

// Cache validated IPs for 5 minutes to avoid repeated DNS lookups
let validatedIpsCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getValidatedIps() {
  const now = Date.now();
  if (validatedIpsCache && now < cacheExpiry) {
    return validatedIpsCache;
  }
  await validateUrlRuntime(OPENROUTER_URL);
  const dns = require('dns/promises');
  const [ipv4, ipv6] = await Promise.allSettled([
    dns.resolve4('openrouter.ai'),
    dns.resolve6('openrouter.ai')
  ]);
  const ips = [
    ...(ipv4.status === 'fulfilled' ? ipv4.value : []),
    ...(ipv6.status === 'fulfilled' ? ipv6.value : [])
  ];
  validatedIpsCache = ips;
  cacheExpiry = now + CACHE_TTL_MS;
  return ips;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with exponential backoff retry for 429/5xx errors
 */
async function fetchWithRetry(url, options, attempt = 1) {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay

  try {
    // Use rate limiter to prevent hitting free tier limits
    const res = await rateLimitedFetchCall(() => fetch(url, options));

    // Check for retryable status codes
    const isRateLimited = res.status === 429;
    const isServerError = res.status >= 500 && res.status < 600;
    const isRetryableError = isRateLimited || isServerError;

    if (isRetryableError && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      // Try to get error body for logging
      let errorBody = '';
      try {
        const clonedRes = res.clone();
        const errData = await clonedRes.json();
        errorBody = errData.error?.message || errData.error || JSON.stringify(errData);
      } catch {
        errorBody = await res.text().catch(() => 'Unable to read error body');
      }
      console.warn(`Embedding request failed (attempt ${attempt}/${maxRetries}): ${res.status}. Error: ${errorBody}. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }

    return res;
  } catch (err) {
    // Network errors - retry
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`Embedding request network error (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

// Helper to safely stringify error response data
function errorJSON(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Embed a single text with per-request DNS validation
 * @param {string} text
 * @returns {Promise<number[]>} 1024-dim vector
 */
async function embed(text) {
  if (!text || !text.trim()) {
    throw new Error('Empty text provided for embedding');
  }

  // Per-request DNS validation (cached)
  await getValidatedIps();

  const res = await fetchWithRetry(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    }),
    redirect: 'manual', // SSRF protection
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter embedding failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * Embed multiple texts in one request (batch)
 * @param {string[]} texts
 * @returns {Promise<number[][]>} Array of 1024-dim vectors
 */
async function embedBatch(texts) {
  if (!texts?.length) return [];

  // Filter empty texts but keep index mapping
  const validInputs = texts.map((t, i) => ({ text: t?.trim() || ' ', index: i }));
  const inputs = validInputs.map(v => v.text);

  const res = await fetchWithRetry(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs
    }),
    redirect: 'manual', // SSRF protection
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter batch embedding failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  // Restore original order
  const embeddings = new Array(texts.length);
  data.data.forEach((d, i) => {
    embeddings[validInputs[i].index] = d.embedding;
  });
  return embeddings;
}

/**
 * Chunk text for embedding (semantic-aware for markdown, fixed fallback)
 * @param {string} text
 * @param {Object} opts
 * @returns {string[]}
 */
function chunkText(text, opts = {}) {
  const { maxTokens = 500, overlap = 50 } = opts;

  if (!text || !text.trim()) return [];

  // Try semantic chunking by markdown headings first
  const headingChunks = chunkByHeadings(text);
  if (headingChunks.length > 1) {
    return headingChunks.flatMap(chunk =>
      chunk.length > maxTokens * 4 ? fixedChunk(chunk, maxTokens, overlap) : [chunk]
    );
  }

  // Fallback: fixed-size chunking (~4 chars per token)
  return fixedChunk(text, maxTokens, overlap);
}

function chunkByHeadings(text) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      // Save previous chunk
      if (currentChunk.length) {
        chunks.push(currentChunk.join('\n'));
      }
      currentChunk = [line];
      currentLevel = headingMatch[1].length;
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length) {
    chunks.push(currentChunk.join('\n'));
  }
  return chunks.length > 1 ? chunks : [text];
}

function fixedChunk(text, maxTokens, overlap) {
  const charsPerToken = 4;
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlap * charsPerToken;
  const minAdvance = Math.max(100, maxChars - overlapChars); // Ensure reasonable progress

  if (text.length <= maxChars) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Try to break at sentence boundary (only if not near end)
    if (end < text.length - 100) {
      const sentenceEnd = text.lastIndexOf('. ', end);
      if (sentenceEnd > start + maxChars * 0.5) {
        end = sentenceEnd + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    // Move start forward by at least minAdvance
    const chunkSize = end - start;
    const advance = Math.max(minAdvance, chunkSize - overlapChars);
    start += advance;
  }

  return chunks;
}

module.exports = {
  embed,
  embedBatch,
  chunkText,
  EMBEDDING_DIM: 2048
};