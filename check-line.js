const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'SwimCoach-project/src/config/model-routes.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
console.log('=== MODEL-ROUTES.JS VERIFICATION ===\n');

console.log('1. Checking UNIVERSAL_FALLBACKS...');
if (content.includes("const UNIVERSAL_FALLBACKS = ['/openrouter/free']")) {
  console.log('   ✅ PASS: UNIVERSAL_FALLBACKS = [\'/openrouter/free\']');
} else {
  console.log('   ❌ FAIL: UNIVERSAL_FALLBACKS not found or incorrect');
}

console.log('\n2. Checking workout:generate route...');
// Look for the exact pattern with fallbacks
const generatePattern = /'workout:generate':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?fallbacks:\s*\[(.*?)\]/s;
const generateMatch = content.match(generatePattern);
if (generateMatch) {
  const primary = generateMatch[1];
  const fallbacks = generateMatch[2];
  console.log('   Primary model:', primary);
  console.log('   Fallbacks raw:', fallbacks);
  // Check if it contains /openrouter/free or 'openrouter/free'
  if (fallbacks.includes('/openrouter/free') || fallbacks.includes('"/openrouter/free"') || fallbacks.includes("'/openrouter/free'")) {
    console.log('   ✅ PASS: /openrouter/free in fallbacks');
  } else {
    console.log('   ❌ FAIL: /openrouter/free not found in fallbacks');
    console.log('   Expected to find: /openrouter/free, "openrouter/free", or \'/openrouter/free\'');
    console.log('   Actual fallback values:', fallbacks.split(/['"/]/).filter(x => x.trim()));
  }
} else {
  console.log('   ❌ FAIL: workout:generate route not found');
}

console.log('\n3. Checking workout:generate:high-volume route...');
const highVolumePattern = /'workout:generate:high-volume':\s*\{[^}]+?primary:\s*'([^']+)'[^}]+?fallbacks:\s*\[(.*?)\]/s;
const highVolumeMatch = content.match(highVolumePattern);
if (highVolumeMatch) {
  const primary = highVolumeMatch[1];
  const fallbacks = highVolumeMatch[2];
  console.log('   Primary model:', primary);
  console.log('   Fallbacks raw:', fallbacks);
  if (fallbacks.includes('/openrouter/free') || fallbacks.includes('"/openrouter/free"') || fallbacks.includes("'/openrouter/free'")) {
    console.log('   ✅ PASS: /openrouter/free in fallbacks');
  } else {
    console.log('   ❌ FAIL: /openrouter/free not found in fallbacks');
    console.log('   Expected to find: /openrouter/free, "openrouter/free", or \'/openrouter/free\'');
    console.log('   Actual fallback values:', fallbacks.split(/['"/]/).filter(x => x.trim()));
  }
} else {
  console.log('   ❌ FAIL: workout:generate:high-volume route not found');
}

console.log('\n=== VERIFICATION COMPLETE ===');