/**
 * Model Routes Configuration
 *
 * Maps each feature/task to an OpenRouter model.
 * Model IDs intentionally use the existing openrouter/... format.
 */

const MODEL_PATTERN = /^openrouter\/[\w\-./:@]+$/;
const DEFAULT_MODEL = 'openrouter/nvidia/nemotron-3.5-lightning:free';

// ─── Model Definitions ─────────────────────────────────────────────────

const MODELS = {
  'openrouter/nvidia/nemotron-3.5-lightning:free': {
    name: 'NVIDIA Nemotron 3.5 Lightning',
    params: '30B MoE (3B active)',
    context: 1000000,
    latencyMs: 2500,
    throughput: 33,
    weeklyTokens: null,
    dailyLimit: 1000,
    strengths: [
      'fast',
      'reasoning',
      'long context',
      'tool use',
      'high-throughput workloads'
    ],
    bestFor: [
      'fallback:general',
      'fallback:fast',
      'coach:chat',
      'ui:autocomplete',
      'ui:validate',
      'util:classify',
      'util:extract',
      'workout:modify'
    ]
  },

  'openrouter/minimax/minimax-m3:free': {
    name: 'MiniMax M3',
    params: 'Large-scale reasoning model',
    context: 1048576,
    latencyMs: 2570,
    throughput: 33,
    weeklyTokens: null,
    dailyLimit: 1000,
    strengths: [
      'complex reasoning',
      'structured planning',
      'long context',
      'workout generation',
      'season analysis'
    ],
    bestFor: [
      'workout:generate',
      'workout:modify',
      'analysis:season',
      'analysis:progress',
      'analysis:taper',
      'fallback:general',
      'fallback:chat'
    ]
  },

  'openrouter/poolside/laguna-s-2.1:free': {
    name: 'Poolside Laguna S 2.1',
    params: '118B (8B active)',
    context: 262144,
    latencyMs: 1520,
    throughput: 31,
    weeklyTokens: 472e9,
    dailyLimit: 1000,
    strengths: ['code', 'structured JSON', 'workout schemas'],
    bestFor: ['workout:generate', 'workout:modify']
  },

  'openrouter/poolside/laguna-xs-2.1:free': {
    name: 'Poolside Laguna XS 2.1',
    params: '33B (3B active)',
    context: 262144,
    latencyMs: 776,
    throughput: 64,
    weeklyTokens: 190e9,
    dailyLimit: 4000,
    strengths: ['fast code', 'structured edits', 'lower latency'],
    bestFor: ['workout:modify', 'workout:quick-edit']
  },

  'openrouter/inclusionai/ling-3.0-flash:free': {
    name: 'InclusionAI Ling 3.0 Flash',
    params: '124B MoE (5.1B active)',
    context: 262144,
    latencyMs: 1946,
    throughput: 80,
    weeklyTokens: 1.41e12,
    dailyLimit: 20000,
    strengths: ['reasoning', 'conversation', 'analysis'],
    bestFor: ['coach:chat', 'coach:technique', 'analysis:progress']
  },

  'openrouter/nvidia/nemotron-3-ultra:free': {
    name: 'NVIDIA Nemotron 3 Ultra',
    params: '550B MoE (55B active)',
    context: 1000000,
    latencyMs: 24813,
    throughput: 8,
    weeklyTokens: 2.88e12,
    dailyLimit: 50,
    strengths: ['long context', 'deep reasoning', 'season analysis'],
    bestFor: ['analysis:season', 'analysis:full-history']
  },

  'openrouter/nvidia/nemotron-3-super:free': {
    name: 'NVIDIA Nemotron 3 Super',
    params: '~300B+',
    context: 262144,
    latencyMs: 1549,
    throughput: 53,
    weeklyTokens: 380e9,
    dailyLimit: 5000,
    strengths: ['balanced', 'reasoning', 'good speed'],
    bestFor: ['analysis:progress', 'fallback:general']
  },

  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free': {
    name: 'NVIDIA Nemotron 3 Nano 30B A3B',
    params: '30B MoE (3B active)',
    context: 256000,
    latencyMs: 615,
    throughput: 75,
    weeklyTokens: 49.4e9,
    dailyLimit: 100000,
    strengths: ['speed', 'efficiency', 'high rate limit'],
    bestFor: [
      'ui:autocomplete',
      'ui:validate',
      'util:classify',
      'fallback:fast',
      'workout:generate:high-volume'
    ]
  },

  'openrouter/nvidia/nemotron-3-nano:free': {
    name: 'NVIDIA Nemotron 3 Nano',
    params: '~37B',
    context: 256000,
    latencyMs: 664,
    throughput: 94,
    weeklyTokens: 36.8e9,
    dailyLimit: 100000,
    strengths: ['fastest', 'multimodal ready', 'high rate limit'],
    bestFor: [
      'ui:autocomplete',
      'ui:validate',
      'util:classify',
      'fallback:fast'
    ]
  },

  'openrouter/google/gemma-4-31b:free': {
    name: 'Google Gemma 4 31B',
    params: '31B',
    context: 262144,
    latencyMs: 1171,
    throughput: 18,
    weeklyTokens: 1.67e9,
    dailyLimit: 4000,
    strengths: ['general chat', 'fast', 'reliable'],
    bestFor: ['fallback:chat', 'coach:chat']
  },

  'openrouter/cohere/north-mini-code:free': {
    name: 'Cohere North Mini Code',
    params: '30B MoE (3B active)',
    context: 256000,
    latencyMs: 1597,
    throughput: 19,
    weeklyTokens: 300e9,
    dailyLimit: 8000,
    strengths: ['code', 'structured output'],
    bestFor: ['fallback:code', 'workout:modify']
  }
};

// ─── Route Definitions ─────────────────────────────────────────────────

const ROUTES = {
  'workout:generate': {
    description: 'Generate new structured workout from profile and preferences',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/cohere/north-mini-code:free',
      'openrouter/poolside/laguna-s-2.1:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:generate:high-volume': {
    description: 'High-volume workout generation for multiple users',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/minimax/minimax-m3:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/cohere/north-mini-code:free'
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:modify': {
    description: 'Modify an existing workout',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/minimax/minimax-m3:free',
      'openrouter/poolside/laguna-xs-2.1:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/cohere/north-mini-code:free'
    ],
    maxTokens: 8192,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:quick-edit': {
    description: 'Make a small targeted workout edit',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 4096,
    timeout: 30000,
    temperature: 0.5
  },

  'coach:chat': {
    description: 'Conversational chat with the AI coach',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/minimax/minimax-m3:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/google/gemma-4-31b:free'
    ],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.7
  },

  'coach:technique': {
    description: 'Technique-specific questions and explanations',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/google/gemma-4-31b:free'
    ],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.6
  },

  'analysis:season': {
    description: 'Full season analysis',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/nvidia/nemotron-3-super:free'
    ],
    maxTokens: 8192,
    timeout: 180000,
    temperature: 0.5,
    rateLimitNote: 'Use sparingly because free-model limits are account-level'
  },

  'analysis:progress': {
    description: 'Progress insights over recent workouts',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/nvidia/nemotron-3-super:free'
    ],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.5
  },

  'analysis:taper': {
    description: 'Competition taper planning and guidance',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/nvidia/nemotron-3-super:free'
    ],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.5
  },

  'ui:autocomplete': {
    description: 'Typeahead suggestions for workout builder',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 512,
    timeout: 5000,
    temperature: 0.3
  },

  'ui:validate': {
    description: 'Real-time form validation feedback',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free'
    ],
    maxTokens: 512,
    timeout: 5000,
    temperature: 0.2
  },

  'ui:suggest': {
    description: 'Quick workout suggestions',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.6
  },

  'util:classify': {
    description: 'Classify or extract workout tags and stroke types',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.3
  },

  'util:extract': {
    description: 'Extract structured data from unstructured text',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/poolside/laguna-xs-2.1:free'
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.2
  },

  'fallback:general': {
    description: 'General purpose fallback',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/minimax/minimax-m3:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/nvidia/nemotron-3-super:free'
    ],
    maxTokens: 4096,
    timeout: 30000,
    temperature: 0.7
  },

  'fallback:code': {
    description: 'Code and structured-output fallback',
    primary: 'openrouter/cohere/north-mini-code:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      'openrouter/minimax/minimax-m3:free',
      'openrouter/poolside/laguna-xs-2.1:free',
      'openrouter/poolside/laguna-s-2.1:free'
    ],
    maxTokens: 8192,
    timeout: 60000,
    temperature: 0.5
  },

  'fallback:fast': {
    description: 'Fast available model fallback',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      'openrouter/nvidia/nemotron-3-nano-30b-a3b:free'
    ],
    maxTokens: 2048,
    timeout: 10000,
    temperature: 0.5
  },

  'fallback:chat': {
    description: 'Chat and conversation fallback',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/minimax/minimax-m3:free',
      'openrouter/inclusionai/ling-3.0-flash:free',
      'openrouter/google/gemma-4-31b:free'
    ],
    maxTokens: 2048,
    timeout: 30000,
    temperature: 0.7
  }
};

// ─── Daily Rate Limits ─────────────────────────────────────────────────

const DAILY_LIMITS = {
  'openrouter/nvidia/nemotron-3.5-lightning:free': 1000,
  'openrouter/minimax/minimax-m3:free': 1000,
  'openrouter/poolside/laguna-s-2.1:free': 1000,
  'openrouter/poolside/laguna-xs-2.1:free': 4000,
  'openrouter/inclusionai/ling-3.0-flash:free': 20000,
  'openrouter/nvidia/nemotron-3-ultra:free': 50,
  'openrouter/nvidia/nemotron-3-super:free': 5000,
  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free': 100000,
  'openrouter/nvidia/nemotron-3-nano:free': 100000,
  'openrouter/google/gemma-4-31b:free': 4000,
  'openrouter/cohere/north-mini-code:free': 8000
};

// ─── Lookup Helpers ────────────────────────────────────────────────────

function getRoute(routeKey) {
  return ROUTES[routeKey] || null;
}

function getModel(modelId) {
  return MODELS[modelId] || null;
}

function getAllRoutes() {
  return Object.entries(ROUTES).map(([key, config]) => ({
    key,
    description: config.description,
    primary: config.primary,
    fallbacks: [...config.fallbacks],
    maxTokens: config.maxTokens,
    timeout: config.timeout,
    temperature: config.temperature,
    rateLimitNote: config.rateLimitNote
  }));
}

function getAllModels() {
  return Object.entries(MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    params: config.params,
    context: config.context,
    latencyMs: config.latencyMs,
    throughput: config.throughput,
    dailyLimit: DAILY_LIMITS[id] ?? config.dailyLimit,
    strengths: config.strengths,
    bestFor: config.bestFor
  }));
}

// ─── Rate-Limited Sanitization ─────────────────────────────────────────

const clientRateLimit = new Map();

const DEFAULT_RATE_LIMIT_THRESHOLD = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function getRateLimitThreshold() {
  const configuredThreshold = Number.parseInt(
    process.env.RATE_LIMIT_THRESHOLD,
    10
  );

  return Number.isInteger(configuredThreshold) &&
    configuredThreshold > 0
    ? configuredThreshold
    : DEFAULT_RATE_LIMIT_THRESHOLD;
}

function sanitizeModel(model) {
  if (typeof model !== 'string') {
    return DEFAULT_MODEL;
  }

  const normalizedModel = model.trim();

  if (
    !MODEL_PATTERN.test(normalizedModel) ||
    !Object.prototype.hasOwnProperty.call(MODELS, normalizedModel)
  ) {
    return DEFAULT_MODEL;
  }

  return normalizedModel;
}

function sanitizeModelWithRateLimit(
  model,
  clientId = 'default'
) {
  const now = Date.now();
  const clientKey = String(clientId || 'default');
  const threshold = getRateLimitThreshold();

  let clientData = clientRateLimit.get(clientKey);

  if (!clientData || now >= clientData.resetTime) {
    clientData = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    };
  }

  clientData.count += 1;
  clientRateLimit.set(clientKey, clientData);

  if (clientData.count > threshold) {
    console.warn(
      `[Security] Rate limit exceeded for client ${clientKey}`
    );

    return DEFAULT_MODEL;
  }

  const sanitizedModel = sanitizeModel(model);

  if (
    typeof model === 'string' &&
    sanitizedModel === DEFAULT_MODEL &&
    model.trim() !== DEFAULT_MODEL
  ) {
    console.warn(
      `[Security] Model validation failed for client ${clientKey}`
    );
  }

  return sanitizedModel;
}

function resetClientRateLimit(clientId = 'default') {
  clientRateLimit.delete(String(clientId || 'default'));
}

function getRateLimitStats() {
  const now = Date.now();
  const stats = {};

  for (const [clientId, data] of clientRateLimit.entries()) {
    if (now >= data.resetTime) {
      clientRateLimit.delete(clientId);
      continue;
    }

    stats[clientId] = {
      attempts: data.count,
      resetInMs: Math.max(0, data.resetTime - now),
      windowRemaining: Math.max(0, data.resetTime - now)
    };
  }

  return stats;
}

// ─── Validation ────────────────────────────────────────────────────────

function validateRoutes() {
  const errors = [];
  const allModelIds = new Set(Object.keys(MODELS));

  for (const [routeKey, config] of Object.entries(ROUTES)) {
    if (!allModelIds.has(config.primary)) {
      errors.push(
        `Route ${routeKey}: primary model "${config.primary}" is not defined in MODELS`
      );
    }

    for (const fallback of config.fallbacks) {
      if (!allModelIds.has(fallback)) {
        errors.push(
          `Route ${routeKey}: fallback model "${fallback}" is not defined in MODELS`
        );
      }
    }
  }

  for (const modelId of allModelIds) {
    if (!Object.prototype.hasOwnProperty.call(DAILY_LIMITS, modelId)) {
      errors.push(
        `Model ${modelId}: no daily limit defined in DAILY_LIMITS`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ─── Exports ───────────────────────────────────────────────────────────

module.exports = {
  MODELS,
  ROUTES,
  DAILY_LIMITS,
  getRoute,
  getAllRoutes,
  getModel,
  getAllModels,
  validateRoutes,
  sanitizeModel,
  sanitizeModelWithRateLimit,
  resetClientRateLimit,
  getRateLimitStats
};