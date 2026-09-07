//!/usr/bin/env node

// Fixed verification script for model-routes.js

const fs = require('fs');
const path = require('path');

function main() {
  console.log('=== SWIMCOACH MODEL-ROUTES VERIFICATION ===\n');

  const filePath = path.join(__dirname, 'SwimCoach-project/src/config/model-routes.js');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log('1. Checking UNIVERSAL_FALLBACKS...');
  if (content.includes("const UNIVERSAL_FALLBACKS = ['/openrouter/free']")) {
    console.log('   ✅ PASS: UNIVERSAL_FALLBACKS = [\'/openrouter/free\']');
  } else {
    console.log('   ❌ FAIL: UNIVERSAL_FALLBACKS not found or incorrect');
    console.log('   Expected: const UNIVERSAL_FALLBACKS = [\'/openrouter/free\'];');
    return;
  }

  console.log('\n2. Checking workout:generate route...');
  const generatePattern = /'workout:generate':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?fallbacks:\s*\[(.*?)\]/s;
  const generateMatch = content.match(generatePattern);

  if (generateMatch) {
    const primary = generateMatch[1];
    const fallbacks = generateMatch[2];
    console.log('   Primary model:', primary);
    console.log('   Fallbacks:', fallbacks);

    // Check if fallbacks contain openrouter/free (with or without quotes)
    if (fallbacks.includes("'/openrouter/free'") || fallbacks.includes('"openrouter/free"') || fallbacks.includes("openrouter/free")) {
      console.log('   ✅ PASS: openrouter/free in fallbacks');
    } else {
      console.log('   ❌ FAIL: openrouter/free not found in fallbacks');
      return;
    }

    // Check order - nvidia/nemotron-3-nano-30b-a3b:free should come before openrouter/free
    const nvidiaIndex = fallbacks.indexOf('nvidia/nemotron-3-nano-30b-a3b:free');
    const universalIndex = fallbacks.indexOf("'/openrouter/free'") >= 0 ? fallbacks.indexOf("'/openrouter/free'") :
                          (fallbacks.includes('"openrouter/free"') ? fallbacks.indexOf('"openrouter/free"') :
                          (fallbacks.includes('openrouter/free') ? fallbacks.indexOf('openrouter/free') : -1));

    if (nvidiaIndex >= 0 && universalIndex >= 0 && nvidiaIndex < universalIndex) {
      console.log('   ✅ PASS: Fallback order is correct (nvidia/nemotron-3-nano-30b-a3b:free → openrouter/free)');
    } else {
      console.log('   ❌ FAIL: Fallback order is incorrect');
      console.log('   Expected: nvidia/nemotron-3-nano-30b-a3b:free → openrouter/free');
      return;
    }
  } else {
    console.log('   ❌ FAIL: workout:generate route not found');
    return;
  }

  console.log('\n3. Checking workout:generate:high-volume route...');
  const highVolumePattern = /'workout:generate:high-volume':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?fallbacks:\s*\[(.*?)\]/s;
  const highVolumeMatch = content.match(highVolumePattern);

  if (highVolumeMatch) {
    const primary = highVolumeMatch[1];
    const fallbacks = highVolumeMatch[2];
    console.log('   Primary model:', primary);
    console.log('   Fallbacks:', fallbacks);

    if (fallbacks.includes("'/openrouter/free'") || fallbacks.includes('"openrouter/free"') || fallbacks.includes('openrouter/free')) {
      console.log('   ✅ PASS: openrouter/free in fallbacks');
    } else {
      console.log('   ❌ FAIL: openrouter/free not found in fallbacks');
      return;
    }

    // Check order - openrouter:poolside:laguna-s-2.1-free should come before openrouter/free
    const poolsideIndex = fallbacks.indexOf('openrouter:poolside:laguna-s-2.1-free');
    const universalIndex = fallbacks.indexOf("'/openrouter/free'") >= 0 ? fallbacks.indexOf("'/openrouter/free'") :
                          (fallbacks.includes('"openrouter/free"') ? fallbacks.indexOf('"openrouter/free"') :
                          (fallbacks.includes('openrouter/free') ? fallbacks.indexOf('openrouter/free') : -1));

    if (poolsideIndex >= 0 && universalIndex >= 0 && poolsideIndex < universalIndex) {
      console.log('   ✅ PASS: Fallback order is correct (openrouter:poolside:laguna-s-2.1-free → openrouter/free)');
    } else {
      console.log('   ❌ FAIL: Fallback order is incorrect');
      console.log('   Expected: openrouter:poolside:laguna-s-2.1-free → openrouter/free');
      return;
    }
  } else {
    console.log('   ❌ FAIL: workout:generate:high-volume route not found');
    return;
  }

  console.log('\n=== ALL VERIFICATIONS PASSED ===');
  console.log('\nSummary:');
  console.log('✅ UNIVERSAL_FALLBACKS correctly contains /openrouter/free');
  console.log('✅ workout:generate fallback chain: nvidia/nemotron-3-nano-30b-a3b:free → openrouter/free');
  console.log('✅ workout:generate:high-volume fallback chain: openrouter:poolside:laguna-s-2.1-free → openrouter/free');
  console.log('\nThe fallback configuration is correct for the chat issue!');
}

main();