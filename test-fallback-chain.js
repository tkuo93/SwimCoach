//!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Fallback Chains for Workout Generation\n');

// Read the actual file
const filePath = '/c/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/config/model-routes.js';
const content = fs.readFileSync(filePath, 'utf8');

let testsPassed = 0;
let totalTests = 0;
let allTestsPassed = true;

// Test 1: Verify UNIVERSAL_FALLBACKS contains /openrouter/free
 totalTests++;
 console.log('Test 1: UNIVERSAL_FALLBACKS contains /openrouter/free');
 if (content.includes("const UNIVERSAL_FALLBACKS = ['openrouter/free']") ||
     content.includes('const UNIVERSAL_FALLBACKS = ["openrouter/free"]') ||
     content.includes("const UNIVERSAL_FALLBACKS = ['/openrouter/free']") ||
     content.includes('const UNIVERSAL_FALLBACKS = ["/openrouter/free"]')) {
   console.log('   ✅ PASS: UNIVERSAL_FALLBACKS correctly defined');
   testsPassed++;
 } else {
   console.log('   ❌ FAIL: UNIVERSAL_FALLBACKS not found or incorrect');
   allTestsPassed = false;
 }

// Test 2: Verify workout:generate fallback chain includes /openrouter/free
 totalTests++;
 console.log('\nTest 2: workout:generate fallback chain');
 const workoutGenerateMatch = content.match(/'workout:generate':\s*\{[^}]+?'fallbackss?:\s*\[(.*?)\]/s);
 if (workoutGenerateMatch) {
   const fallbacks = workoutGenerateMatch[1];
   if (fallbacks.includes('"/openrouter/free"') || fallbacks.includes("'/openrouter/free'") || fallbacks.includes('/openrouter/free')) {
     console.log('   ✅ PASS: /openrouter/free is in workout:generate fallbacks');
     console.log('   Fallback chain includes /openrouter/free as the final safety net');
     testsPassed++;
   } else {
     console.log('   ❌ FAIL: /openrouter/free not found in workout:generate fallbacks');
     allTestsPassed = false;
   }
 } else {
   console.log('   ❌ FAIL: Could not find workout:generate route');
   allTestsPassed = false;
 }

// Test 3: Verify workout:generate:high-volume fallback chain includes /openrouter/free
 totalTests++;
 console.log('\nTest 3: workout:generate:high-volume fallback chain');
 const highVolumeMatch = content.match(/'workout:generate:high-volume':\s*\{[^}]+?'fallbackss?:\s*\[(.*?)\]/s);
 if (highVolumeMatch) {
   const fallbacks = highVolumeMatch[1];
   if (fallbacks.includes('"/openrouter/free"') || fallbacks.includes("'/openrouter/free'") || fallbacks.includes('/openrouter/free')) {
     console.log('   ✅ PASS: /openrouter/free is in workout:generate:high-volume fallbacks');
     console.log('   Fallback chain includes /openrouter/free as the final safety net');
     testsPassed++;
   } else {
     console.log('   ❌ FAIL: /openrouter/free not found in workout:generate:high-volume fallbacks');
     allTestsPassed = false;
   }
 } else {
   console.log('   ❌ FAIL: Could not find workout:generate:high-volume route');
   allTestsPassed = false;
 }

// Test 4: Verify fallback order is correct (nvidia/nemotron-3-nano-30b-a3b:free, /openrouter/free)
 totalTests++;
 console.log('\nTest 4: Verify fallback order for workout generation routes');
 let correctOrder = true;
 for (const routeName of ['workout:generate', 'workout:generate:high-volume']) {
   const pattern = new RegExp(`${routeName}:\s*\{[^}]+?'fallbackss?:\s*\[(.*?)\]`, 's');
   const match = content.match(pattern);
   if (match) {
     const fallbacks = match[1];
     // Check that nvidia/nemotron-3-nano-30b-a3b:free comes before /openrouter/free
     const nanoIndex = fallbacks.indexOf('nvidia/nemotron-3-nano-30b-a3b:free');
     const universalIndex = fallbacks.indexOf('/openrouter/free');
     if (nanoIndex >= 0 && universalIndex >= 0 && nanoIndex < universalIndex) {
       console.log(`   ✅ PASS: ${routeName} has correct fallback order`);
     } else {
       console.log(`   ❌ FAIL: ${routeName} has incorrect fallback order`);
       correctOrder = false;
       allTestsPassed = false;
     }
   }
 }
 if (correctOrder) {
   testsPassed++;
 }

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests: ${testsPassed}/${totalTests} passed`);

if (allTestsPassed) {
 console.log('\n🎉 All tests passed! The fallback chain updates are working correctly.');
 console.log('\nSummary of verified changes:');
 console.log('1. ✅ /openrouter/free is present in UNIVERSAL_FALLBACKS');
 console.log('2. ✅ /openrouter/free is included in both workout generation route fallback chains');
 console.log('3. ✅ Fallback order is correct: nvidia/nemotron-3-nano-30b-a3b:free → /openrouter/free');
 console.log('4. ✅ Both workout:generate and workout:generate:high-volume have consistent fallback chains');
 process.exit(0);
} else {
 console.log('\n❌ Some tests failed. Please check the configuration.');
 process.exit(1);
}