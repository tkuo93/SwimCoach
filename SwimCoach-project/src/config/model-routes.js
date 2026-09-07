/**
 * Model Routes Configuration
 *
 * Every route has exactly:
 *   1. primary model
 *   2. secondary model
 *   3. openrouter/free as the ultimate fallback
 *
 * Model IDs use the existing openrouter/... format used by this project.
 */

const MODEL_PATTERN = /^openrouter\/[\w\-./:@]+$/;
const DEFAULT_MODEL = 'openrouter/nvidia/nemotron-3.5-lightning:free';
const ULTIMATE_FALLBACK = 'openrouter/free';

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
      'workout:modify',
      'workout:quick-edit',
      'coach:chat',
      'ui:autocomplete',
      'ui:validate',
      'util:classify',
      'util:extract',
      'fallback:general',
      'fallback:fast'
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
      'analysis:season',
      'analysis:progress',
      'analysis:taper',
      'coach:technique',
      'fallback:chat'
    ]
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
    bestFor: [
      'coach:chat',
      'coach:technique',
      'analysis:progress',
      'fallback:general'
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
    strengths: ['fast', 'efficient', 'high rate limit'],
    bestFor: [
      'workout:generate:high-volume',
      'ui:autocomplete',
      'ui:validate',
      'util:classify',
      'util:extract',
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
    bestFor: ['coach:chat', 'fallback:chat']
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
    bestFor: ['fallback:code']
  },

  // Dynamic OpenRouter router. OpenRouter selects an available free model.
  'openrouter/free': {
    name: 'OpenRouter Dynamic Free Router',
    params: 'Provider-selected',
    context: null,
    latencyMs: null,
    throughput: null,
    weeklyTokens: null,
    dailyLimit: 1000,
    strengths: [
      'dynamic provider selection',
      'availability fallback',
      'free models'
    ],
    bestFor: ['ultimate fallback'],
    dynamic: true
  }
};

// ─── Route Definitions ─────────────────────────────────────────────────

const ROUTES = {
  'workout:generate': {
    description: 'Generate a new structured workout',
    primary: 'openrouter/minimax/minimax-m3:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      ULTIMATE_FALLBACK
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:generate:high-volume': {
    description: 'High-volume workout generation',
    primary: 'openrouter/nvidia/nemotron-3-nano:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3.5-lightning:free',
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
    ],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.5
  },

  'ui:autocomplete': {
    description: 'Typeahead suggestions for the workout builder',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.6
  },

  'util:classify': {
    description: 'Classify workout tags, intervals, and stroke types',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      ULTIMATE_FALLBACK
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.3
  },

  'util:extract': {
    description: 'Extract structured data from unstructured text',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/nvidia/nemotron-3-nano:free',
      ULTIMATE_FALLBACK
    ],
    maxTokens: 1024,
    timeout: 5000,
    temperature: 0.2
  },

  'fallback:general': {
    description: 'General-purpose fallback',
    primary: 'openrouter/nvidia/nemotron-3.5-lightning:free',
    fallbacks: [
      'openrouter/minimax/minimax-m3:free',
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
      ULTIMATE_FALLBACK
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
  'openrouter/inclusionai/ling-3.0-flash:free': 20000,
  'openrouter/nvidia/nemotron-3-nano:free': 100000,
  'openrouter/google/gemma-4-31b:free': 4000,
  'openrouter/cohere/north-mini-code:free': 8000,
  'openrouter/free': 1000
};

// ─── Helpers ────────────────────────────────────────────────────────────

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
    secondary: config.fallbacks[0],
    ultimateFallback: config.fallbacks[1],
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
    bestFor: config.bestFor,
    dynamic: config.dynamic === true
  }));
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

// ─── Rate Limiting ──────────────────────────────────────────────────────

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
      resetInMs: data.resetTime - now
    };
  }

  return stats;
}

// ─── Validation ─────────────────────────────────────────────────────────

function validateRoutes() {
  const errors = [];
  const allModelIds = new Set(Object.keys(MODELS));

  for (const [routeKey, config] of Object.entries(ROUTES)) {
    if (config.fallbacks.length !== 2) {
      errors.push(
        `Route ${routeKey}: expected exactly 2 fallbacks`
      );
    }

    if (config.fallbacks[1] !== ULTIMATE_FALLBACK) {
      errors.push(
        `Route ${routeKey}: ultimate fallback must be "${ULTIMATE_FALLBACK}"`
      );
    }

    if (!allModelIds.has(config.primary)) {
      errors.push(
        `Route ${routeKey}: primary model "${config.primary}" is not defined`
      );
    }

    for (const fallback of config.fallbacks) {
      if (!allModelIds.has(fallback)) {
        errors.push(
          `Route ${routeKey}: fallback model "${fallback}" is not defined`
        );
      }
    }
  }

  for (const modelId of allModelIds) {
    if (!Object.prototype.hasOwnProperty.call(DAILY_LIMITS, modelId)) {
      errors.push(
        `Model ${modelId}: no daily limit is defined`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ─── Exports ────────────────────────────────────────────────────────────

module.exports = {
  MODELS,
  ROUTES,
  DAILY_LIMITS,
  DEFAULT_MODEL,
  ULTIMATE_FALLBACK,
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