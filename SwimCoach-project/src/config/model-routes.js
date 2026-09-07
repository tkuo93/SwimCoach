// Model Routes Configuration for SwimCoach
// Pilot: Routes for fallback models with parameters from OpenRouter

const MODELS = {
  // Universal fallback model - default safety net for all routes
  'openrouter/free': {
    name: 'OpenRouter Free (Universal Fallback)',
    params: 'Various',
    context: 262144,
    latencyMs: 5000,
    throughput: 10,
    weeklyTokens: 140e9,
    dailyLimit: 10000,
    strengths: ['general purpose', 'reliable fallback', 'fallback safety net'],
    bestFor: ['fallback:general']
  },
  // Poolside models - specialized for code/structured output

  'openrouter:poolside:laguna-s-2.1-free': {
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

  'openrouter:dots-studio:dots3-note-preview-free': {
    name: 'Dots Studio Dots3-Note Preview',
    params: '204B',
    context: 512000,
    latencyMs: 1200,
    throughput: 63,
    weeklyTokens: 8.04e10,
    dailyLimit: 4700,
    strengths: ['structured output', 'good throughput', 'medium latency'],
    bestFor: ['workout:generate:high-volume', 'workout:modify']
  },

  // InclusionAI - best general reasoning/speed balance
  'inclusionai/ling-3.0-flash:free': {
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
    dailyLimit: 5000,
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

  // NVIDIA Ling 3.0 Flash FIN - NEW primary model for fallback:fast route
  'nvidia/ling-3.0-flash-fin:free': {
    name: 'NVIDIA Ling 3.0 Flash FIN',
    params: '124B MoE (5.1B active)',
    context: 262144,
    latencyMs: 1946,
    throughput: 80,
    weeklyTokens: 1.41e12,
    dailyLimit: 40000,
    strengths: ['reasoning', 'conversation', 'analysis', 'speed'],
    bestFor: ['fallback:fast', 'workout:generate', 'coach:chat', 'workout:modify', 'analysis:progress']
  },

  // NVIDIA Ling 3.0 Flash - NEW fallback model for workout:generate routes
  'nvidia/ling-3.0-flash:free': {
    name: 'NVIDIA Ling-3.0 Flash',
    params: '3M tokens',
    context: 32000,
    latencyMs: 850,
    throughput: 120,
    dailyLimit: 1000,
    strengths: ['speed', 'efficiency'],
    bestFor: ['conversational', 'quick tasks'],
    capabilities: ['chat', 'text', 'analysis']
  },
  'nvidia/nemotron-3-nano-30b-a3b:free': {
    name: 'NVIDIA Nemotron-3 Nano',
    params: '30B params',
    context: 128000,
    latencyMs: 1200,
    throughput: 80,
    dailyLimit: 1000,
    strengths: ['context', 'reasoning'],
    bestFor: ['analysis', 'long tasks'],
    capabilities: ['reasoning', 'analysis', 'code']
  },
  'google/gemma-4-31b:free': {
    name: 'Google Gemma 4-31B',
    params: '31B params',
    context: 128000,
    latencyMs: 900,
    throughput: 90,
    dailyLimit: 1000,
    strengths: ['instruction following', 'safety'],
    bestFor: ['instruction following', 'code generation'],
    capabilities: ['coding', 'instruction following', 'text generation']
  },
  'cohere/north-mini-code:free': {
    name: 'Cohere North Mini Code',
    params: '7B params',
    context: 16000,
    latencyMs: 700,
    throughput: 150,
    dailyLimit: 1000,
    strengths: ['coding', 'speed'],
    bestFor: ['code generation', 'debugging'],
    capabilities: ['coding', 'debugging', 'text generation']
  },
  'inclusionai/ling-3.0-flash:free': {
    name: 'Inclusion AI Ling-3.0 Flash',
    params: '3M tokens',
    context: 32000,
    latencyMs: 800,
    throughput: 130,
    dailyLimit: 1000,
    strengths: ['multilingual', 'efficiency'],
    bestFor: ['multilingual', 'international'],
    capabilities: ['chat', 'translation', 'multilingual']
  }
};

const UNIVERSAL_FALLBACKS = ['/openrouter/free']; // Universal fallback model - default safety net for all routes

const ROUTES = {
  // ─── Workout Generation ──────────────────────────────────────────────
  'workout:generate': {
    description: 'Generate new structured workout from profile + preferences',
    primary: 'openrouter:poolside:laguna-s-2.1-free',
    fallbacks: [
      'nvidia/nemotron-3-nano-30b-a3b:free',  // Speed-optimized fallback
      'openrouter/free',  // Universal fallback - guaranteed to exist
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:generate:high-volume': {
    description: 'High-volume workout generation for multiple users - uses highest rate limit models',
    primary: 'openrouter:dots-studio:dots3-note-preview-free',
    fallbacks: [
      'openrouter:poolside:laguna-s-2.1-free',  // Primary if Dots3 is slow
      'openrouter/free',  // Universal fallback - guaranteed to exist
    ],
    maxTokens: 16384,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:modify': {
    description: 'Modify existing workout (swap stroke, change intensity, etc.)',
    primary: 'poolside/laguna-xs-2.1:free',
    fallbacks: ['inclusionai/ling-3.0-flash:free', 'nvidia/nemotron-3-super:free'],
    maxTokens: 8192,
    timeout: 60000,
    temperature: 0.7
  },

  'workout:quick-edit': {
    description: 'Small targeted edits (single set change, equipment swap)',
    primary: 'poolside/laguna-xs-2.1:free',
    fallbacks: ['nvidia/nemotron-3-super:free', 'inclusionai/ling-3.0-flash:free'],
    maxTokens: 4096,
    timeout: 30000,
    temperature: 0.5
  },

  // ─── Coach Chat ──────────────────────────────────────────────────────
  'coach:chat': {
    primary: 'nvidia/ling-3.0-flash:free',
    fallbacks: [
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'inclusionai/ling-3.0-flash:free'
    ],
    maxTokens: 4096,
    timeout: 60000,
    temperature: 0.7,
    description: 'Chat with SwimCoach - Conversational coaching and guidance'
  }
};

const DAILY_LIMITS = {
  'nvidia/ling-3.0-flash:free': 1000,
  'nvidia/nemotron-3-nano-30b-a3b:free': 1000,
  'google/gemma-4-31b:free': 1000,
  'cohere/north-mini-code:free': 1000,
  'inclusionai/ling-3.0-flash:free': 1000
};

const FALLBACK_CHAINS = {
  'nvidia/ling-3.0-flash:free': [],
  'nvidia/nemotron-3-nano-30b-a3b:free': ['nvidia/ling-3.0-flash:free'],
  'google/gemma-4-31b:free': ['nvidia/nemotron-3-nano-30b-a3b:free', 'nvidia/ling-3.0-flash:free'],
  'cohere/north-mini-code:free': ['nvidia/nemotron-3-nano-30b-a3b:free', 'google/gemma-4-31b:free'],
  'inclusionai/ling-3.0-flash:free': ['nvidia/ling-3.0-flash:free', 'nvidia/nemotron-3-nano-30b-a3b:free']
};

// Model validation pattern - validates model IDs in format: provider/model-name:variant
const MODEL_PATTERN = /^([a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+(:[a-zA-Z0-9._-]+)?$/;

/**
 * Validate model ID format
 * @param {string} modelId - Model ID to validate
 * @returns {boolean} - True if valid
 */
function validateModel(modelId) {
  return MODEL_PATTERN.test(modelId);
}

/**
 * Validate all routes in the configuration
 * @returns {Object} Validation result with errors if any
 */
function validateRoutes() {
  const errors = [];
  const routeKeys = Object.keys(ROUTES);

  for (const routeKey of routeKeys) {
    const route = ROUTES[routeKey];

    // Validate primary model
    if (!validateModel(route.primary)) {
      errors.push(`Route '${routeKey}': Invalid primary model ID format: '${route.primary}'`);
    }

    // Validate fallback models
    if (route.fallbacks) {
      for (const fallback of route.fallbacks) {
        if (!validateModel(fallback)) {
          errors.push(`Route '${routeKey}': Invalid fallback model ID format: '${fallback}'`);
        }
      }
    }

    // Validate required properties
    if (!route.primary) {
      errors.push(`Route '${routeKey}': Missing primary model`);
    }

    if (!route.description) {
      errors.push(`Route '${routeKey}': Missing description`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all route keys
 * @returns {Array} Array of route keys
 */
function getAllRoutes() {
  return Object.keys(ROUTES);
}

/**
 * Get route by key
 * @param {string} routeKey - Route key
 * @returns {Object} Route configuration
 */
function getRoute(routeKey) {
  return ROUTES[routeKey];
}

/**
 * Get model by ID
 * @param {string} modelId - Model ID
 * @returns {Object} Model configuration
 */
function getModel(modelId) {
  return MODELS[modelId];
}

/**
 * Get all models
 * @returns {Array} Array of model configurations
 */
function getAllModels() {
  return Object.values(MODELS);
}

module.exports = {
  MODELS,
  ROUTES,
  DAILY_LIMITS,
  FALLBACK_CHAINS,
  MODEL_PATTERN,
  validateModel,
  validateRoutes,
  getAllRoutes,
  getRoute,
  getModel,
  getAllModels
};