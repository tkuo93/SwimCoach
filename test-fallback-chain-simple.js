//!/usr/bin/env node
// Simple test to verify the updated fallback chains for workout generation routes

const path = require('path');
const fs = require('fs');

function loadModelRoutes() {
  try {
    const modelRoutesPath = path.join(__dirname, 'SwimCoach-project/src/config/model-routes.js');
    const moduleContent = fs.readFileSync(modelRoutesPath, 'utf8');

    // Create a clean module execution
    const exports = {};
    const module = { exports };

    // Execute the JavaScript module - to avoid runtime errors from different Node versions,
    // we replace common unsafe JavaScript functions before eval
    const sanitizedModuleContent = moduleContent
      .replace(/process\.env\./g, 'process.env.')
      .replace(/require\s*\(\s*[\'\"]process[\'\"]\s*\)/g, 'null')
      .replace(/module\.exports/g, 'exports.')
      .replace(/console\.log/g, 'console.log')
      .replace(/console\.error/g, 'console.error')
      .replace(/console\.warn/g, 'console.warn')
      .replace(/console\.info/g, 'console.info');

    // Execute the sanitized module
    eval(sanitizedModuleContent);

    return exports;
  } catch (error) {
    console.error('Error loading model-routes.js:', error.message);
    return null;
  }
}

function runTests() {
  console.log('🧪 Testing Fallback Chains for Workout Generation\n');

  const config = loadModelRoutes();
  if (!config) {
    console.error('❌ Failed to load model-routes configuration');
    process.exit(1);
  }

  const { ROUTES, MODELS, UNIVERSAL_FALLBACKS } = config;
  let allPassed = true;
  let testCount = 0;
  let passedCount = 0;

  // Test 1: Check UNIVERSAL_FALLBACKS
  testCount++;
  console.log('Test 1: UNIVERSAL_FALLBACKS contains /openrouter/free');
  if (Array.isArray(UNIVERSAL_FALLBACKS) && UNIVERSAL_FALLBACKS.includes('/openrouter/free')) {
    console.log('   ✅ PASS');
    passedCount++;
  } else {
    console.log('   ❌ FAIL: Expected: ["/openrouter/free"]');
    console.log(`   Actual: ${JSON.stringify(UNIVERSAL_FALLBACKS)}`);
    allPassed = false;
  }

  // Test 2: Check workout:generate fallback chain
  testCount++;
  console.log('\nTest 2: workout:generate fallback chain');
  const route1 = ROUTES['workout:generate'];
  if (route1) {
    if (route1.fallbacks && route1.fallbacks.includes('/openrouter/free')) {
      console.log('   ✅ PASS: /openrouter/free in fallbacks');
      console.log(`   Chain: ${route1.primary} → ${route1.fallbacks.join(' → ')}`);
      passedCount++;
    } else {
      console.log('   ❌ FAIL: /openrouter/free not found');
      allPassed = false;
    }
  } else {
    console.log('   ❌ FAIL: Route not found');
    allPassed = false;
  }

  // Test 3: Check workout:generate:high-volume fallback chain
  testCount++;
  console.log('\nTest 3: workout:generate:high-volume fallback chain');
  const route2 = ROUTES['workout:generate:high-volume'];
  if (route2) {
    if (route2.fallbacks && route2.fallbacks.includes('/openrouter/free')) {
      console.log('   ✅ PASS: /openrouter/free in fallbacks');
      console.log(`   Chain: ${route2.primary} → ${route2.fallbacks.join(' → ')}`);
      passedCount++;
    } else {
      console.log('   ❌ FAIL: /openrouter/free not found');
      allPassed = false;
    }
  } else {
    console.log('   ❌ FAIL: Route not found');
    allPassed = false;
  }

  // Test 4: Verify all fallback models exist in MODELS
  testCount++;
  console.log('\nTest 4: All fallback models defined in MODELS');
  let modelsValid = true;

  for (const routeKey of ['workout:generate', 'workout:generate:high-volume']) {
    const route = ROUTES[routeKey];
    if (route) {
      for (const fallback of route.fallbacks) {
        if (!MODELS[fallback]) {
          console.log(`   ❌ FAIL: ${fallback} not defined in MODELS`);
          modelsValid = false;
        }
      }
    }
  }

  if (modelsValid) {
    console.log('   ✅ PASS: All fallback models defined');
    passedCount++;
  } else {
    allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passedCount}/${testCount} passed`);

  if (allPassed) {
    console.log('\n🎉 All tests passed! Fallback chains are working correctly.');
  } else {
    console.log('\n❌ Some tests failed.');
    process.exit(1);
  }
}

runTests();