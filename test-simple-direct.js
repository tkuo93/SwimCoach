//!/usr/bin/env node

// Simple direct test - manually verify the actual file content

console.log('🧪 Testing Fallback Chains for Workout Generation\n');

const fs = require('fs');
const path = require('path');

const configPath = path.join('/c/Users/tkuo9/.claude/projects/SwimCoach', 'SwimCoach-project/src/config/model-routes.js');
const content = fs.readFileSync(configPath, 'utf8');

// Extract UNIVERSAL_FALLBACKS from the file using regex
const universalFallbacksMatch = content.match(/const UNIVERSAL_FALLBACKS = \[(.*?)\]/s);
let UNIVERSAL_FALLBACKS = [];
if (universalFallbacksMatch) {
  const fallbackString = universalFallbacksMatch[1];
  // Simple parsing - just looking for /openrouter/free
  if (fallbackString.includes('/openrouter/free')) {
    UNIVERSAL_FALLBACKS = ['/openrouter/free'];
  }
}

console.log('Test 1: Checking UNIVERSAL_FALLBACKS in source file');
if (content.includes('const UNIVERSAL_FALLBACKS = [\'openrouter/free\']') ||
    content.includes('const UNIVERSAL_FALLBACKS = ["openrouter/free"]') ||
    content.includes('const UNIVERSAL_FALLBACKS = [\'/openrouter/free\']') ||
    content.includes('const UNIVERSAL_FALLBACKS = ["/openrouter/free"]') ||
    content.includes('const UNIVERSAL_FALLBACKS = [\'openrouter/free\']')) {
  console.log('   ✅ PASS: UNIVERSAL_FALLBACKS defined in source file');
  console.log(`   Content: const UNIVERSAL_FALLBACKS = ['/openrouter/free'];`);
} else {
  console.log('   ❌ FAIL: UNIVERSAL_FALLBACKS not found or incorrect');
  console.log('   Looking for: const UNIVERSAL_FALLBACKS = [\'/openrouter/free\'];');
}

console.log('\nTest 2: Checking workout:generate fallback chain in source file');
// Look for the pattern: 'workout:generate': {\s+primary: ..., \s+fallbacks: \[ ..., \s+\],'
const workoutGeneratePattern = /'workout:generate':\s*\{[^}]+?'fallbackss?:\s*\[[^\]]*?\//g;
if (content.includes('\"fallbackss?:') || content.includes("'fallbackss?:")) {
  console.log('   ❌ FAIL: Found typo in fallbackss: key');
} else if (content.includes("'fallbackss?: '/openrouter/free'") || content.includes('"fallbackss?: \"/openrouter/free"')) {
  console.log('   ❌ FAIL: Found typo in fallbackss: value');
} else if (content.includes('\"fallbackss?:') || content.includes("'fallbackss?:")) {
  console.log('   ❌ FAIL: Found typo in fallbackss: key');
} else {
  // Look for the actual pattern
  const pattern = /'workout:generate':\s*\{[^}]+?'fallbackss?:\s*\[[^\]]+?'\//g;
  if (pattern.test(content)) {
    console.log('   ✅ PASS: Found correct workout:generate fallback chain');

    // Extract and show the actual chain
    const routePattern = /'workout:generate':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?'fallbackss?:\s*\[(.*?)\]/s;
    const match = content.match(routePattern);
    if (match) {
      console.log(`   Primary: ${match[1]}`);
      const fallbacks = match[2].split(',').map(fb => fb.trim().replace(/['"/]/g, ''));
      console.log(`   Fallbacks: ${fallbacks.join(', ')}`);
    }
  } else {
    console.log('   ❌ FAIL: Could not find correct fallback pattern');
  }
}

console.log('\nTest 3: Checking workout:generate:high-volume fallback chain in source file');
const highVolumePattern = /'workout:generate:high-volume':\s*\{[^}]+?'fallbackss?:\s*\[[^\]]+?'\//g;
if (highVolumePattern.test(content)) {
  console.log('   ✅ PASS: Found correct workout:generate:high-volume fallback chain');

  const routePattern = /'workout:generate:high-volume':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?'fallbackss?:\s*\[(.*?)\]/s;
  const match = content.match(routePattern);
  if (match) {
    console.log(`   Primary: ${match[1]}`);
    const fallbacks = match[2].split(',').map(fb => fb.trim().replace(/['"/]/g, ''));
    console.log(`   Fallbacks: ${fallbacks.join(', ')}`);
  }
} else {
  console.log('   ❌ FAIL: Could not find correct fallback pattern for high-volume');
}

console.log('\nTest 4: Checking for /openrouter/free in MODELS (if defined)');
const modelPattern = /'\/openrouter\/free'/g;
if (modelPattern.test(content)) {
  console.log('   ✅ PASS: /openrouter/free found in MODELS section');
} else {
  console.log('   Note: /openrouter/free not explicitly defined in MODELS (this might be expected)');
}

console.log('\n' + '='.repeat(50));
console.log('✅ Direct file inspection complete.');
console.log('\nTo run a full test, execute: node test-fallback-chain.js');
console.log('\n📝 Summary of what to check:');
console.log('1. Look for: const UNIVERSAL_FALLBACKS = [\'/openrouter/free\']; in the source file');
console.log('2. Look for the correct fallback chains in ROUTES definitions');
console.log('3. Verify the fallback order is correct for both workout generation routes');