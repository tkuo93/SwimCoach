/**
 * Model Routes Configuration
 *
 * Maps each feature/task to the optimal free OpenRouter model.
 * Edit this file to change model assignments without touching service code.
 *
 * All models are FREE tier on OpenRouter ($0 input/output).
 * Rate limits are per-model daily estimates based on weekly token allocations.
 */

// ─── Model Input Sanitization ──────────────────────────────────────────
// Validates user-supplied model IDs against a strict allowlist pattern
// to prevent injection of arbitrary model IDs into outbound API calls.
const MODEL_PATTERN = /^openrouter\/[\w\-./:@]+$/;
const DEFAULT_MODEL = 'inclusionai/ling-3.0-flash:free';

/**
 * Sanitize a user-supplied model ID.
 * Only allows models matching the openrouter/* pattern.
 * @param {string} model - User-supplied model ID
 * @returns {string} Sanitized model ID or default
 */
function sanitizeModel(model) {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  return MODEL_PATTERN.test(model.trim()) ? model.trim() : DEFAULT_MODEL;
}

// ─── Model Definitions ─────────────────────────────────────────────────
const MODELS = {
  // Poolside models - specialized for code/structured output
  'poolside/laguna-s-2.1:free': {
    name: 'Poolside Laguna S 2.1',
    params: '118B (8B active)',
    context: 262144,
    latencyMs: 1520,
    throughput: 31,
    weeklyTokens: 472e9,
    dailyLimit: 1300,
    strengths: ['code', 'structured JSON', 'workout schemas'],
    bestFor: ['workout:generate', 'workout:modify']
  },

  'poolside/laguna-xs-2.1:free': {
    name: 'Poolside Laguna XS 2.1',
    params: '33B (3B active)',
    context: 262144,
    latencyMs: 776,
    throughput: 64,
    weeklyTokens: 190e9,
    dailyLimit: 5400,
    strengths: ['fast code', 'structured edits', 'lower latency'],
    bestFor: ['workout:modify', 'workout:quick-edit']
  },

  // InclusionAI - best general reasoning/speed balance
  'inclusionai/ling-3.0-flash:free': {
    name: 'InclusionAI Ling 3.0 Flash',
    params: '124B MoE (5.1B active)',
    context: 262144,
    latencyMs: 1946,
    throughput: 80,
    weeklyTokens: 1.41e12,
    dailyLimit: 40000,
    strengths: ['reasoning', 'conversation', 'analysis'],
    bestFor: ['coach:chat', 'coach:technique', 'analysis:progress']
  },

  // NVIDIA Nemotron 3 Ultra - only 1M context model
  'nvidia/nemotron-3-ultra:free': {
    name: 'NVIDIA Nemotron 3 Ultra',
    params: '550B MoE (55B active)',
    context: 1000000,
    latencyMs: 24813,
    throughput: 8,
    weeklyTokens: 2.88e12,
    dailyLimit: 50, // Very conservative - 25s per request
    strengths: ['long context', 'deep reasoning', 'season analysis'],
    bestFor: ['analysis:season', 'analysis:full-history']
  },

  // NVIDIA Nemotron 3 Super - balanced
  'nvidia/nemotron-3-super:free': {
    name: 'NVIDIA Nemotron 3 Super',
    params: '~300B+',
    context: 262144,
    latencyMs: 1549,
    throughput: 53,
    weeklyTokens: 380e9,
    dailyLimit: 15000,
    strengths: ['balanced', 'reasoning', 'good speed'],
    bestFor: ['analysis:progress', 'fallback:general']
  },

  // NVIDIA Nemotron 3 Nano 30B A3B - fast MoE
  'nvidia/nemotron-3-nano-30b-a3b:free': {
    name: 'NVIDIA Nemotron 3 Nano 30B A3B',
    params: '30B MoE (3B active)',
    context: 256000,
    latencyMs: 615,
    throughput: 75,
    weeklyTokens: 49.4e9,
    dailyLimit: 100000,
    strengths: ['speed', 'efficiency', 'high rate limit'],
    bestFor: ['ui:autocomplete', 'ui:validate', 'util:classify', 'fallback:fast', 'workout:generate:high-volume']
  },

  // NVIDIA Nemotron 3 Nano - fastest overall
  'nvidia/nemotron-3-nano:free': {
    name: 'NVIDIA Nemotron 3 Nano',
    params: '~37B',
    context: 256000,
    latencyMs: 664,
    throughput: 94,
    weeklyTokens: 36.8e9,
    dailyLimit: 100000,
    strengths: ['fastest', 'multimodal ready', 'unlimited rate limit'],
    bestFor: ['ui:autocomplete', 'ui:validate', 'util:classify', 'fallback:fastest']
  },

  // Google Gemma 4 31B - solid backup
  'google/gemma-4-31b:free': {
    name: 'Google Gemma 4 31B',
    params: '31B',
    context: 262144,
    latencyMs: 1171,
    throughput: 18,
    weeklyTokens: 1.67e9,
    dailyLimit: 4700,
    strengths: ['general chat', 'fast', 'reliable'],
    bestFor: ['fallback:chat', 'coach:chat']
  },

  // Cohere North Mini Code - code specialized
  'cohere/north-mini-code:free': {
    name: 'Cohere North Mini Code',
    params: '30B MoE (3B active)',
    context: 256000,
    latencyMs: 1597,
    throughput: 19,
    weeklyTokens: 300e9,
    dailyLimit: 8500,
    strengths: ['code', 'structured output'],
    bestFor: ['fallback:code', 'workout:modify']
  }
};

// ─── Route Definitions ─────────────────────────────────────────────────
// Each route maps to a primary model + fallback chain
const ROUTES = {
  // ─── Workout Generation ──────────────────────────────────────────────
  'workout:generate': {
    description: 'Generate new structured workout from profile + preferences',
    primary: 'inclusionai/ling-3.0-flash:free',
    fallbacks: [
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-nano:free',
      'cohere/north-mini-code:free',
      'nvidia/nemotron-3-super:free',
      'poolside/laguna-s-2.1:free',
      'poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:generate:high-volume': {
    description: 'High-volume workout generation for multiple users - uses highest rate limit models',
    primary: 'nvidia/nemotron-3-super:free',
    fallbacks: [
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-nano:free',
      'inclusionai/ling-3.0-flash:free',
      'cohere/north-mini-code:free'
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:modify': {
    description: 'Modify existing workout (swap stroke, change intensity, etc.)',
    primary: 'poolside/laguna-xs-2.1:free',
    fallbacks: ['inclusionai/ling-3.0-flash:free', 'poolside/laguna-s-2.1:free', 'cohere/north-mini-code:free'],
    maxTokens: 8192,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:quick-edit': {
    description: 'Small targeted edits (single set change, equipment swap)',
    primary: 'poolside/laguna-xs-2.1:free',
    fallbacks: ['nvidia/nemotron-3-nano:free', 'nvidia/nemotron-3-nano-30b-a3b:free'],
    maxTokens: 4096,
    timeout: 30000,
    temperature: 0.5
  },

  // ─── Coach Chat ──────────────────────────────────────────────────────
  'coach:chat': {
    description: 'Conversational chat with the AI coach',
    primary: 'inclusionai/ling-3.0-flash:free',
    fallbacks: ['google/gemma-4-31b:free', 'nvidia/nemotron-3-super:free'],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.7
  },

  'coach:technique': {
    description: 'Technique-specific questions and explanations',
    primary: 'inclusionai/ling-3.0-flash:free',
    fallbacks: ['google/gemma-4-31b:free', 'nvidia/nemotron-3-super:free'],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.6
  },

  // ─── Analysis ────────────────────────────────────────────────────────
  'analysis:season': {
    description: 'Full season analysis - requires 1M context for all workouts',
    primary: 'nvidia/nemotron-3-ultra:free',
    fallbacks: ['nvidia/nemotron-3-super:free'],
    maxTokens: 8192,
    timeout: 180000,
    temperature: 0.5,
    rateLimitNote: 'Use sparingly - 25s latency, ~50 req/day practical limit'
  },

  'analysis:progress': {
    description: 'Progress insights over recent workouts (fits in 262K context)',
    primary: 'nvidia/nemotron-3-super:free',
    fallbacks: ['inclusionai/ling-3.0-flash:free', 'google/gemma-4-31b:free'],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.5
  },

  'analysis:taper': {
    description: 'Competition taper planning and guidance',
    primary: 'inclusionai/ling-3.0-flash:free',
    fallbacks: ['nvidia/nemotron-3-super:free'],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.5
  },

  // ─── Real-time UI ────────────────────────────────────────────────────
  'ui:autocomplete': {
    description: 'Typeahead suggestions for workout builder',
    primary: 'nvidia/nemotron-3-nano:free',
    fallbacks: ['nvidia/nemotron-3-nano-30b-a3b:free', 'poolside/laguna-xs-2.1:free'],
    maxTokens: 512,
    timeout: 2000,
    temperature: 0.3
  },

  'ui:validate': {
    description: 'Real-time form validation feedback',
    primary: 'nvidia/nemotron-3-nano:free',
    fallbacks: ['nvidia/nemotron-3-nano-30b-a3b:free'],
    maxTokens: 512,
    timeout: 1500,
    temperature: 0.2
  },

  'ui:suggest': {
    description: 'Quick workout suggestions/recommendations',
    primary: 'nvidia/nemotron-3-nano-30b-a3b:free',
    fallbacks: ['nvidia/nemotron-3-nano:free', 'poolside/laguna-xs-2.1:free'],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.6
  },

  // ─── Utility ─────────────────────────────────────────────────────────
  'util:classify': {
    description: 'Classify/extract workout tags, intervals, stroke types',
    primary: 'nvidia/nemotron-3-nano-30b-a3b:free',
    fallbacks: ['nvidia/nemotron-3-nano:free', 'poolside/laguna-xs-2.1:free'],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.3
  },

  'util:extract': {
    description: 'Extract structured data from unstructured text',
    primary: 'nvidia/nemotron-3-nano:free',
    fallbacks: ['nvidia/nemotron-3-nano-30b-a3b:free', 'poolside/laguna-xs-2.1:free'],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.2
  },

  // ─── Fallback Categories ─────────────────────────────────────────────
  'fallback:general': {
    description: 'General purpose fallback',
    primary: 'nvidia/nemotron-3-super:free',
    fallbacks: ['inclusionai/ling-3.0-flash:free', 'google/gemma-4-31b:free'],
    maxTokens: 4096,
    timeout: 30000,
    temperature: 0.7
  },

  'fallback:code': {
    description: 'Code/structured output fallback',
    primary: 'cohere/north-mini-code:free',
    fallbacks: ['poolside/laguna-xs-2.1:free', 'poolside/laguna-s-2.1:free'],
    maxTokens: 8192,
    timeout: 60000,
    temperature: 0.5
  },

  'fallback:fast': {
    description: 'Fastest available model fallback',
    primary: 'nvidia/nemotron-3-nano:free',
    fallbacks: ['nvidia/nemotron-3-nano-30b-a3b:free'],
    maxTokens: 2048,
    timeout: 5000,
    temperature: 0.5
  },

  'fallback:chat': {
    description: 'Chat/conversation fallback',
    primary: 'google/gemma-4-31b:free',
    fallbacks: ['nvidia/nemotron-3-super:free', 'inclusionai/ling-3.0-flash:free'],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.7
  }
};

// ─── Daily Rate Limits (Conservative) ─────────────────────────────────
// Based on weekly token allocations ÷ 7, assuming ~5K tokens/request average
const DAILY_LIMITS = {
  'poolside/laguna-s-2.1:free': 1000,
  'poolside/laguna-xs-2.1:free': 4000,
  'inclusionai/ling-3.0-flash:free': 20000,
  'nvidia/nemotron-3-ultra:free': 50,
  'nvidia/nemotron-3-super:free': 5000,
  'nvidia/nemotron-3-nano-30b-a3b:free': 100000,
  'nvidia/nemotron-3-nano:free': 100000,
  'google/gemma-4-31b:free': 4000,
  'cohere/north-mini-code:free': 8000
};

// ─── Helper Functions ──────────────────────────────────────────────────

/**
 * Get route configuration by route key
 * @param {string} routeKey - e.g., 'workout:generate', 'coach:chat'
 * @returns {Object|null} Route config or null if not found
 */
function getRoute(routeKey) {
  return ROUTES[routeKey] || null;
}

/**
 * Get model configuration by model ID
 * @param {string} modelId - Full model ID (e.g., 'poolside/laguna-s-2.1:free')
 * @returns {Object|null} Model config or null if not found
 */
function getModel(modelId) {
  return MODELS[modelId] || null;
}

/**
 * Get all routes as a formatted summary (for debugging/display)
 * @returns {Array} Array of route summaries
 */
function getAllRoutes() {
  return Object.entries(ROUTES).map(([key, config]) => ({
    route: key,
    description: config.description,
    primary: config.primary,
    primaryName: MODELS[config.primary]?.name || config.primary,
    fallbacks: config.fallbacks.map(fb => ({ id: fb, name: MODELS[fb]?.name || fb })),
    maxTokens: config.maxTokens,
    timeout: config.timeout,
    dailyLimit: DAILY_LIMITS[config.primary] || 'unknown'
  }));
}

/**
 * Get all models as a formatted summary
 * @returns {Array} Array of model summaries
 */
function getAllModels() {
  return Object.entries(MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    params: config.params,
    context: config.context,
    latencyMs: config.latencyMs,
    throughput: config.throughput,
    dailyLimit: DAILY_LIMITS[id] || config.dailyLimit,
    strengths: config.strengths,
    bestFor: config.bestFor
  }));
}

/**
 * Validate that all route primary models and fallbacks exist in MODELS
 * @returns {Object} Validation result with any errors
 */
function validateRoutes() {
  const errors = [];
  const allModelIds = new Set(Object.keys(MODELS));

  for (const [routeKey, config] of Object.entries(ROUTES)) {
    if (!allModelIds.has(config.primary)) {
      errors.push(`Route ${routeKey}: primary model "${config.primary}" not defined in MODELS`);
    }
    for (const fallback of config.fallbacks) {
      if (!allModelIds.has(fallback)) {
        errors.push(`Route ${routeKey}: fallback model "${fallback}" not defined in MODELS`);
      }
    }
  }

  // Check for models without daily limits
  for (const modelId of allModelIds) {
    if (!DAILY_LIMITS[modelId]) {
      errors.push(`Model ${modelId}: no daily limit defined in DAILY_LIMITS`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  MODELS,
  ROUTES,
  DAILY_LIMITS,
  getRoute,
  getModel,
  getAllRoutes,
  getAllModels,
  validateRoutes,
  sanitizeModel,
};