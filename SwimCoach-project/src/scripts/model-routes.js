#!/usr/bin/env node
/**
 * Model Routes CLI
 *
 * View and manage model route assignments.
 * Usage:
 *   node src/scripts/model-routes.js           # List all routes
 *   node src/scripts/model-routes.js routes    # List all routes (detailed)
 *   node src/scripts/model-routes.js models    # List all models
 *   node src/scripts/model-routes.js usage     # Show current usage stats
 *   node src/scripts/model-routes.js validate  # Validate route configuration
 *   node src/scripts/model-routes.js info <routeKey>  # Show details for specific route
 */

const {
  getAllRoutes,
  getAllModels,
  validateRoutes,
  getRoute,
  getModel,
  DAILY_LIMITS
} = require('../config/model-routes');

const { getUsageStats, listRoutes, getRouteInfo } = require('../services/model-router');

function printRoutes() {
  const routes = getAllRoutes();
  console.log('\n📋 MODEL ROUTES\n');
  console.log('='.repeat(100));
  routes.forEach(r => {
    console.log(`\n🔹 ${r.route}`);
    console.log(`   Description: ${r.description}`);
    console.log(`   Primary:     ${r.primaryName} (${r.primary})`);
    console.log(`   Fallbacks:   ${r.fallbacks.map(f => `${f.name} (${f.id})`).join(' → ')}`);
    console.log(`   Max Tokens:  ${r.maxTokens}`);
    console.log(`   Timeout:     ${r.timeout}ms`);
    console.log(`   Daily Limit: ${r.dailyLimit}`);
  });
  console.log('\n' + '='.repeat(100));
}

function printModels() {
  const models = getAllModels();
  console.log('\n🤖 AVAILABLE MODELS\n');
  console.log('='.repeat(100));
  models.forEach(m => {
    console.log(`\n🔹 ${m.name} (${m.id})`);
    console.log(`   Params:      ${m.params}`);
    console.log(`   Context:     ${m.context.toLocaleString()} tokens`);
    console.log(`   Latency:     ${m.latencyMs}ms`);
    console.log(`   Throughput:  ${m.throughput} t/s`);
    console.log(`   Daily Limit: ${m.dailyLimit.toLocaleString()} requests`);
    console.log(`   Strengths:   ${m.strengths.join(', ')}`);
    console.log(`   Best For:    ${m.bestFor.join(', ')}`);
  });
  console.log('\n' + '='.repeat(100));
}

function printUsage() {
  const stats = getUsageStats();
  console.log('\n📊 DAILY USAGE STATS\n');
  console.log('='.repeat(80));
  console.log('Model'.padEnd(45) + ' Used'.padStart(10) + ' Limit'.padStart(10) + ' Remaining'.padStart(10) + ' %'.padStart(6));
  console.log('-'.repeat(80));
  for (const [modelId, stat] of Object.entries(stats)) {
    const bar = '█'.repeat(Math.min(20, Math.floor(stat.percentUsed / 5)));
    const usedStr = stat.used.toLocaleString().padStart(10);
    const limitStr = stat.limit.toLocaleString().padStart(10);
    const remainingStr = stat.remaining.toLocaleString().padStart(10);
    const percentStr = stat.percentUsed.toString().padStart(4);
    console.log(modelId.padEnd(45) + usedStr + limitStr + remainingStr + percentStr + '% ' + bar);
  }
  console.log('='.repeat(80));
}

function printValidation() {
  const result = validateRoutes();
  if (result.valid) {
    console.log('\n✅ All routes valid!');
  } else {
    console.log('\n❌ Validation Errors:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }
}

function printRouteInfo(routeKey) {
  const info = getRouteInfo(routeKey);
  if (!info) {
    console.log(`\n❌ Route not found: ${routeKey}`);
    console.log('Available routes:', Object.keys(require('../config/model-routes').ROUTES).join(', '));
    return;
  }

  console.log(`\n🔍 ROUTE DETAILS: ${routeKey}\n`);
  console.log('='.repeat(60));
  console.log(`Description: ${info.description}`);
  console.log(`Primary:     ${info.primaryModelName} (${info.primaryModel})`);
  console.log(`Fallbacks:   ${info.fallbacks.map(f => `${f.name} (${f.id})`).join(', ')}`);
  console.log(`Max Tokens:  ${info.maxTokens}`);
  console.log(`Timeout:     ${info.timeout}ms`);
  console.log(`Temperature: ${info.temperature}`);
  console.log(`Daily Limit: ${info.dailyLimit}`);
  if (info.rateLimitNote) console.log(`Note:        ${info.rateLimitNote}`);
  console.log('='.repeat(60));
}

// Main
const command = process.argv[2] || 'routes';

switch (command) {
  case 'routes':
    printRoutes();
    break;
  case 'models':
    printModels();
    break;
  case 'usage':
    printUsage();
    break;
  case 'validate':
    printValidation();
    break;
  case 'info':
    if (process.argv[3]) {
      printRouteInfo(process.argv[3]);
    } else {
      console.log('Usage: node model-routes.js info <routeKey>');
    }
    break;
  case 'list':
    const routes = listRoutes();
    console.log('\n📋 ROUTES (from model-router)\n');
    console.log('='.repeat(80));
    routes.forEach(r => {
      console.log(r.route.padEnd(30) + ' ' + r.primaryModelName);
    });
    console.log('='.repeat(80));
    break;
  default:
    console.log(`
Usage: node model-routes.js [command]

Commands:
  routes      - List all routes with details (default)
  models      - List all available models
  usage       - Show current daily usage stats
  validate    - Validate route configuration
  info <key>  - Show details for specific route
  list        - Simple route listing

Examples:
  node src/scripts/model-routes.js
  node src/scripts/model-routes.js models
  node src/scripts/model-routes.js usage
  node src/scripts/model-routes.js info workout:generate
`);
}