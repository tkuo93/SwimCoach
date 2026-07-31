/**
 * Model Router Service
 *
 * Centralized LLM calling with automatic model routing, fallbacks, and rate limiting.
 * Reads configuration from model-routes.js config file.
 */

const axios = require('axios');
const {
  getRoute,
  getModel,
  DAILY_LIMITS,
  validateRoutes
} = require('../config/model-routes');
const { rateLimitedAxiosCall } = require('./openrouter-rate-limiter');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// In-memory daily usage tracking (resets on server restart)
// For production, consider persisting to Redis/database
const dailyUsage = new Map();
let usageResetDate = new Date().toDateString();

/**
 * Reset daily usage counters if date changed
 */
function checkAndResetDailyUsage() {
  const today = new Date().toDateString();
  if (today !== usageResetDate) {
    dailyUsage.clear();
    usageResetDate = today;
    console.log('[ModelRouter] Daily usage counters reset');
  }
}

/**
 * Get current daily usage for a model
 * @param {string} modelId
 * @returns {number}
 */
function getDailyUsage(modelId) {
  checkAndResetDailyUsage();
  return dailyUsage.get(modelId) || 0;
}

/**
 * Increment daily usage for a model
 * @param {string} modelId
 * @param {number} tokens - Estimated tokens used
 */
function incrementDailyUsage(modelId, tokens = 5000) {
  checkAndResetDailyUsage();
  const current = dailyUsage.get(modelId) || 0;
  dailyUsage.set(modelId, current + tokens);
}

/**
 * Check if model has exceeded daily limit
 * @param {string} modelId
 * @returns {boolean}
 */
function isRateLimited(modelId) {
  const limit = DAILY_LIMITS[modelId];
  if (!limit || limit >= 100000) return false; // Effectively unlimited
  return getDailyUsage(modelId) >= limit;
}

/**
 * Recursively sanitize an object to remove secrets/PII
 * @param {any} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {any} Sanitized object
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 5) return '[max depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9\-._~]+/g, '[REDACTED]')
      .replace(/api[_-]?key["\s:=]+[a-zA-Z0-9\-._~]+/gi, 'api_key=[REDACTED]')
      .replace(/secret["\s:=]+[a-zA-Z0-9\-._~]+/gi, 'secret=[REDACTED]')
      .replace(/token["\s:=]+[a-zA-Z0-9\-._~]+/gi, 'token=[REDACTED]')
      .substring(0, 500);
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 10).map(item => sanitizeObject(item, depth + 1));
  if (typeof obj === 'object') {
    const sanitized = {};
    const sensitiveKeys = ['authorization', 'api_key', 'apikey', 'secret', 'token', 'password', 'key', 'access_token', 'refresh_token', 'client_secret', 'private_key'];
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(k => lowerKey.includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }
  return '[unknown type]';
}

/**
 * Sanitize error for safe logging - removes potential secrets from error messages
 * @param {Error|Object} err - Error object
 * @returns {string} Safe error description
 */
function sanitizeError(err) {
  if (!err) return 'unknown error';

  // If it's an axios error with response, extract only safe fields
  if (err.response) {
    const status = err.response.status;
    const errorData = err.response.data?.error;
    let errorCode = '';
    let errorMsg = '';

    if (errorData && typeof errorData === 'object') {
      errorCode = errorData.code || errorData.type || '';
      // Only include message if it doesn't look like it contains secrets
      const msg = errorData.message || '';
      if (msg && !msg.includes('key') && !msg.includes('token') && !msg.includes('secret') && !msg.includes('authorization') && msg.length < 200) {
        errorMsg = sanitizeObject(msg);
      }
    }

    // Also sanitize any request echo in response data
    const sanitizedResponse = sanitizeObject(err.response.data);

    return `${status}${errorCode ? ` ${errorCode}` : ''}${errorMsg ? ` - ${errorMsg}` : ''}`;
  }

  // Network/request errors
  if (err.request) {
    return `network_error: ${err.code || err.message?.substring(0, 100) || 'connection_failed'}`;
  }

  // Other errors - sanitize message
  const msg = err.message || String(err);
  return sanitizeObject(msg);
}

/**
 * Call OpenRouter API with retry logic
 * @param {string} model - Model ID
 * @param {Array} messages - Chat messages
 * @param {Object} options - Additional options (maxTokens, temperature, timeout)
 * @param {number} attempt - Retry attempt number
 * @returns {Promise<Object>} Response data
 */
async function callOpenRouter(model, messages, options = {}, attempt = 1) {
  const maxRetries = 3;
  const baseDelay = 2000;
  const {
    maxTokens = 4096,
    temperature = 0.7,
    timeout = 60000
  } = options;

  try {
    const response = await rateLimitedAxiosCall(() => axios.post(
      `${OPENROUTER_BASE}/chat/completions`,
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        provider: { order: ['openai'], sort: 'throughput' },
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://swimcoach.app',
          'X-Title': 'SwimCoach',
        },
        timeout,
      },
    ));

    const choice = response.data?.choices?.[0];
    return {
      content: choice?.message?.content,
      finishReason: choice?.finish_reason,
      usage: response.data?.usage,
      model: response.data?.model
    };
  } catch (err) {
    const isRateLimited = err.response?.status === 429;
    const isServerError = err.response?.status >= 500 && err.response?.status < 600;
    const isRetryableError = isRateLimited || isServerError;

    const safeErrorMsg = sanitizeError(err);

    if (isRetryableError && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`[ModelRouter] ${model} attempt ${attempt}/${maxRetries} failed: ${safeErrorMsg}. Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
      return callOpenRouter(model, messages, options, attempt + 1);
    }

    console.error(`[ModelRouter] ${model} failed after ${attempt} attempts: ${safeErrorMsg}`);
    // Throw sanitized error to avoid leaking secrets in stack traces
    if (err.response) {
      throw new Error(`OpenRouter API error: ${safeErrorMsg}`);
    } else if (err.request) {
      throw new Error(`OpenRouter network error: ${safeErrorMsg}`);
    } else {
      throw new Error(`OpenRouter request error: ${safeErrorMsg}`);
    }
  }
}

/**
 * Main entry point: Call LLM by route key
 * Automatically handles model selection, fallbacks, and rate limiting.
 *
 * @param {string} routeKey - Route identifier (e.g., 'workout:generate', 'coach:chat')
 * @param {Array} messages - Chat messages [{role, content}]
 * @param {Object} options - Override route defaults (maxTokens, temperature, timeout)
 * @returns {Promise<Object>} { content, model, finishReason, usage, route, fallbackUsed }
 */
async function callByRoute(routeKey, messages, options = {}) {
  const route = getRoute(routeKey);
  if (!route) {
    throw new Error(`Unknown route: ${routeKey}. Available: ${Object.keys(require('../config/model-routes').ROUTES).join(', ')}`);
  }

  // Validate routes on first call
  if (!callByRoute._validated) {
    const validation = validateRoutes();
    if (!validation.valid) {
      console.error('[ModelRouter] Route validation errors:', validation.errors);
    }
    callByRoute._validated = true;
  }

  // Universal last-resort fallbacks (used only if ALL route-specific fallbacks fail)
  const UNIVERSAL_FALLBACKS = [
    'nvidia/nemotron-3-super:free',      // fallback:general - best all-rounder
    'nvidia/nemotron-3-nano-omni:free',  // fallback:fast - fastest, high rate limit
    'google/gemma-4-31b:free',           // fallback:chat - good for conversation
    'cohere/north-mini-code:free'        // fallback:code - good for structured output
  ];

  // Build model chain: primary + route fallbacks + universal fallbacks
  const routeModelChain = [route.primary, ...route.fallbacks];
  const modelChain = [...routeModelChain, ...UNIVERSAL_FALLBACKS.filter(m => !routeModelChain.includes(m))];
  let lastError;

  // All route-specific models exhausted, try universal fallbacks
  const routeExhausted = modelChain.length > routeModelChain.length;
  if (routeExhausted) {
    console.warn(`[ModelRouter] Route ${routeKey}: all route-specific fallbacks exhausted, trying universal fallbacks...`);
  }

  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i];
    const isFallback = i > 0;
    const isUniversalFallback = i >= routeModelChain.length;

    // Skip if rate limited
    if (isRateLimited(model)) {
      console.warn(`[ModelRouter] ${model} rate limited (daily), trying fallback...`);
      continue;
    }

    try {
      const result = await callOpenRouter(model, messages, {
        maxTokens: options.maxTokens || route.maxTokens,
        temperature: options.temperature ?? route.temperature,
        timeout: options.timeout || route.timeout,
      });

      // Track usage
      const tokensUsed = result.usage?.total_tokens || options.maxTokens || route.maxTokens || 5000;
      incrementDailyUsage(model, tokensUsed);

      if (isFallback) {
        const fallbackType = isUniversalFallback ? 'universal' : 'route';
        console.log(`[ModelRouter] Route ${routeKey}: used ${fallbackType} fallback ${model} (primary was ${route.primary})`);
      }

      return {
        ...result,
        route: routeKey,
        model,
        fallbackUsed: isFallback,
        universalFallbackUsed: isUniversalFallback,
        primaryModel: route.primary
      };
    } catch (err) {
      lastError = err;
      const fallbackType = isUniversalFallback ? 'universal' : 'route';
      const safeErrorMsg = sanitizeError(err);
      console.warn(`[ModelRouter] ${model} (${fallbackType} fallback) failed for route ${routeKey}: ${safeErrorMsg}`);

      // If this was a rate limit error (429), mark as rate limited for rest of session
      if (err.response?.status === 429 || safeErrorMsg.includes('429') || safeErrorMsg.includes('rate limit')) {
        // Set usage to limit to prevent retries
        const limit = DAILY_LIMITS[model];
        if (limit && limit < 100000) {
          dailyUsage.set(model, limit);
        }
      }

      // Continue to next fallback
      continue;
    }
  }

  // All models exhausted (including universal fallbacks)
  const safeLastError = sanitizeError(lastError);
  throw new Error(`All models exhausted for route ${routeKey} (including universal fallbacks). Last error: ${safeLastError}`);
}

/**
 * Get usage stats for all models
 * @returns {Object}
 */
function getUsageStats() {
  checkAndResetDailyUsage();
  const stats = {};
  for (const [modelId, limit] of Object.entries(DAILY_LIMITS)) {
    const used = dailyUsage.get(modelId) || 0;
    stats[modelId] = {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      percentUsed: limit > 0 ? Math.round((used / limit) * 100) : 0
    };
  }
  return stats;
}

/**
 * Reset usage for a specific model (for testing/admin)
 * @param {string} modelId
 */
function resetModelUsage(modelId) {
  dailyUsage.delete(modelId);
  console.log(`[ModelRouter] Usage reset for ${modelId}`);
}

/**
 * Get route configuration summary
 * @param {string} routeKey
 * @returns {Object|null}
 */
function getRouteInfo(routeKey) {
  const route = getRoute(routeKey);
  if (!route) return null;

  const model = getModel(route.primary);
  return {
    route: routeKey,
    description: route.description,
    primaryModel: route.primary,
    primaryModelName: model?.name || route.primary,
    fallbacks: route.fallbacks.map(fb => {
      const m = getModel(fb);
      return { id: fb, name: m?.name || fb };
    }),
    maxTokens: route.maxTokens,
    timeout: route.timeout,
    temperature: route.temperature,
    dailyLimit: DAILY_LIMITS[route.primary] || 'unlimited',
    rateLimitNote: route.rateLimitNote
  };
}

/**
 * List all available routes with info
 * @returns {Array}
 */
function listRoutes() {
  return Object.keys(require('../config/model-routes').ROUTES).map(key => getRouteInfo(key));
}

module.exports = {
  callByRoute,
  getUsageStats,
  resetModelUsage,
  getRouteInfo,
  listRoutes,
  validateRoutes
};