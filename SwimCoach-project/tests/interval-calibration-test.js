/**
 * Interval Calibration Test Script
 *
 * Generates 20 workouts (5 per type × old/new method) for the single swimmer profile
 * and analyzes interval quality with auto-scoring.
 *
 * Run: node tests/interval-calibration-test.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SwimmerProfile = require('../src/models/SwimmerProfile');
const { generateWorkout: generateWorkoutAI } = require('../src/services/workout-ai');
const Workout = require('../src/models/Workout');

// ─── Configuration ───
const SWIMMER_ID = '6a2364b9b8a0b9d733c131f8';
const WORKOUT_TYPES = ['speed', 'lactate', 'endurance', 'recovery'];
const WORKOUTS_PER_TYPE = 3; // Back to 3 runs per type
const SESSION_DURATION = 40; // from profile
const POOL_UNIT = 'yards'; // SCY
const SEED = 42; // For reproducibility (if supported)

// ─── Pace/Interval Utilities ───

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).trim();

  // Handle "45s" format (rest duration with 's' suffix)
  if (str.endsWith('s') && !str.includes(':')) {
    const secs = parseFloat(str.slice(0, -1));
    if (!isNaN(secs)) return secs;
  }

  // Handle formats: "1:30", "1:30.5", "90", "1m30s", "1:30.50"
  const match = str.match(/^(?:(\d+):)?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const minutes = parseInt(match[1] || 0, 10);
  const seconds = parseInt(match[2], 10);
  const hundredths = match[3] ? parseInt(match[3].padEnd(2, '0').slice(0, 2), 10) : 0;
  return minutes * 60 + seconds + hundredths / 100;
}

function formatSeconds(seconds) {
  if (seconds == null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds % 1) * 100);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }
  return `${secs}.${hundredths.toString().padStart(2, '0')}`;
}

function secondsToTimeString(seconds) {
  return formatSeconds(seconds);
}

// ─── CSS Calculation from Best Times ───

function calculateCSS(profile) {
  // Use 100 and 200 free for CSS calculation (standard method)
  const times100 = profile.bestTimes.filter(t => t.distance === 100 && t.stroke === 'freestyle' && t.poolLength === 'scy');
  const times200 = profile.bestTimes.filter(t => t.distance === 200 && t.stroke === 'freestyle' && t.poolLength === 'scy');

  if (times100.length === 0 || times200.length === 0) {
    console.warn('Insufficient data for CSS calculation, using 100 free pace');
    const t100 = times100[0];
    return t100 ? parseTimeToSeconds(t100.time) : 60; // fallback
  }

  // CSS = (T200 - T100) / 2  (pace per 100)
  const t100 = parseTimeToSeconds(times100[0].time);
  const t200 = parseTimeToSeconds(times200[0].time);
  const css = (t200 - t100) / 2;

  console.log(`CSS Calculation: 100 free = ${formatSeconds(t100)}, 200 free = ${formatSeconds(t200)}`);
  console.log(`CSS = (${formatSeconds(t200)} - ${formatSeconds(t100)}) / 2 = ${formatSeconds(css)}/100yd`);

  return css; // seconds per 100yd
}

// ─── Calibrated Interval Calculation ───

const PACE_MULTIPLIERS = {
  // distance-focus -> multiplier vs CSS
  '50-speed': 0.90,
  '50-lactate': 0.93,
  '50-endurance': 1.00,
  '50-recovery': 1.15,
  '100-speed': 0.93,
  '100-lactate': 0.98,
  '100-endurance': 1.03,
  '100-recovery': 1.12,
  '200-speed': 0.95,
  '200-lactate': 1.00,
  '200-endurance': 1.05,
  '200-recovery': 1.10,
  '400-endurance': 1.08,
  '400-recovery': 1.12,
};

const MIN_REST_BY_FOCUS = {
  speed: 30,
  lactate: 20,
  endurance: 12,
  technique: 15,
  recovery: 20,
  mobility: 20,
};

function calculateCalibratedInterval({ distance, focus, cssPacePer100 }) {
  const key = `${distance}-${focus}`;
  const multiplier = PACE_MULTIPLIERS[key] || 1.05;
  const targetPacePer100 = cssPacePer100 * multiplier;
  const targetPace = targetPacePer100 * (distance / 100);
  const minRest = MIN_REST_BY_FOCUS[focus] || 15;
  const sendOff = targetPace + minRest;

  return {
    targetPace: formatSeconds(targetPace),
    targetPaceSeconds: targetPace,
    sendOff: formatSeconds(sendOff),
    sendOffSeconds: sendOff,
    rest: `${minRest}s`,
    restSeconds: minRest,
    multiplier,
  };
}

// ─── Interval Analysis ───

function analyzeInterval(set, cssPacePer100) {
  // Handle actual AI response format
  const distance = set.distancePerRep || set.distance;
  const reps = set.reps || set.repetitions;
  const sendOffStr = set.restInterval || set.interval?.sendOff || set.interval;
  const targetPaceStr = set.targetPacePerRep || set.targetPace || set.interval?.targetPace;

  if (!sendOffStr) return { valid: false, reason: 'No sendOff/restInterval field' };

  const sendOffSec = parseTimeToSeconds(sendOffStr);
  if (sendOffSec == null) return { valid: false, reason: 'Invalid sendOff format', sendOff: sendOffStr };

  // If no target pace provided, estimate from CSS
  let paceSec = null;
  let targetPaceSource = 'provided';
  if (targetPaceStr) {
    paceSec = parseTimeToSeconds(targetPaceStr);
    if (paceSec == null) return { valid: false, reason: 'Invalid targetPace format', sendOff: sendOffSec };
  } else {
    // Estimate target pace from CSS for this distance/focus
    const focus = set.focus || 'endurance';
    const calibrated = calculateCalibratedInterval({ distance, focus, cssPacePer100 });
    paceSec = calibrated.targetPaceSeconds;
    targetPaceSource = 'estimated-from-CSS';
  }

  const restSec = sendOffSec - paceSec;
  const focus = set.focus || 'endurance';
  const minRest = MIN_REST_BY_FOCUS[focus] || 15;

  // Calculate expected from calibration
  const calibrated = calculateCalibratedInterval({ distance, focus, cssPacePer100 });

  const deviation = calibrated.sendOffSeconds > 0
    ? (sendOffSec - calibrated.sendOffSeconds) / calibrated.sendOffSeconds
    : 0;

  return {
    valid: true,
    sendOff: sendOffStr,
    targetPace: targetPaceStr || `~${formatSeconds(paceSec)} (estimated)`,
    targetPaceSource,
    restSeconds: restSec,
    restFormatted: `${restSec.toFixed(1)}s`,
    minRestRequired: minRest,
    restAdequate: restSec >= minRest,
    focus,
    distance,
    stroke: set.stroke,
    repetitions: reps,
    calibratedSendOff: calibrated.sendOff,
    calibratedTargetPace: calibrated.targetPace,
    calibratedRest: calibrated.rest,
    deviationPercent: (deviation * 100).toFixed(1),
    violation: restSec < minRest ? `UNDER by ${(minRest - restSec).toFixed(1)}s` : 'OK',
  };
}

// ─── Workout Generation ───

async function generateTestWorkout(profile, workoutType, method, runIndex) {
  const customization = {
    workoutType,
    duration: SESSION_DURATION,
    sessionType: 'pool', // Pool only for cleaner interval analysis
    poolLength: { value: 25, unit: 'yards' },
    poolLengthUnit: 'yards',
  };

  // For NEW method, inject calibration context via customization
  if (method === 'new') {
    const css = calculateCSS(profile);
    customization.calibrationContext = {
      cssPacePer100: css,
      method: 'calibrated',
    };
  }

  // We need to call the AI directly to get raw output before validation
  // Use generateWorkoutAI which returns the parsed AI response
  // Pass programContext with pre-filled notes to skip RAG calls
  const aiWorkout = await generateWorkoutAI(profile, customization, {
    programContext: {
      notebookNotes: '', // Empty to skip notebook fetch
      feedbackSummary: '',
      coachingObservations: '',
    },
    // Pass seed if supported
    seed: SEED + (WORKOUT_TYPES.indexOf(workoutType) * 10) + runIndex,
  });

  return aiWorkout;
}

// ─── Main Test Runner ───

async function runTest() {
  console.log('🔬 Starting Interval Calibration Test\n');
  console.log(`Swimmer: ${SWIMMER_ID}`);
  console.log(`Types: ${WORKOUT_TYPES.join(', ')}`);
  console.log(`Runs per type: ${WORKOUTS_PER_TYPE}`);
  console.log(`Total workouts: ${WORKOUT_TYPES.length * WORKOUTS_PER_TYPE * 2}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB\n');

  const profile = await SwimmerProfile.findById(SWIMMER_ID);
  if (!profile) throw new Error('Profile not found');

  const css = calculateCSS(profile);
  console.log(`\n📊 CSS Baseline: ${formatSeconds(css)}/100yd\n`);

  const results = [];

  for (const workoutType of WORKOUT_TYPES) {
    console.log(`\n{'='.repeat(60)}`);
    console.log(`Testing: ${workoutType.toUpperCase()}`);
    console.log(`{'='.repeat(60)}`);

    for (const method of ['old', 'new']) {
      console.log(`\n--- Method: ${method.toUpperCase()} ---`);

      for (let i = 0; i < WORKOUTS_PER_TYPE; i++) {
        try {
          console.log(`  Run ${i + 1}/${WORKOUTS_PER_TYPE}...`);
          const aiWorkout = await generateTestWorkout(profile, workoutType, method, i);

          const mainSet = aiWorkout.mainSet || [];
          console.log(`    Generated ${mainSet.length} main sets`);

          for (const set of mainSet) {
            const analysis = analyzeInterval(set, css);
            results.push({
              workoutType,
              method,
              run: i + 1,
              setIndex: mainSet.indexOf(set),
              distance: set.distancePerRep || set.distance,
              stroke: set.stroke,
              reps: set.reps || set.repetitions,
              focus: set.focus,
              ...analysis,
            });
          }
        } catch (err) {
          console.error(`    ✗ Error: ${err.message}`);
          results.push({
            workoutType,
            method,
            run: i + 1,
            error: err.message,
          });
        }
      }
    }
  }

  // ─── Output CSV ───
  console.log('\n\n📝 RESULTS CSV:');
  console.log('='.repeat(80));

  const headers = [
    'workoutType', 'method', 'run', 'setIndex',
    'distance', 'stroke', 'reps', 'focus',
    'valid', 'sendOff', 'targetPace', 'targetPaceSource', 'restSeconds', 'restFormatted',
    'minRestRequired', 'restAdequate', 'violation',
    'calibratedSendOff', 'calibratedTargetPace', 'calibratedRest',
    'deviationPercent', 'error'
  ];

  console.log(headers.join(','));

  for (const r of results) {
    if (r.error) {
      console.log([r.workoutType, r.method, r.run, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', r.error].join(','));
      continue;
    }
    console.log(headers.map(h => r[h] ?? '').join(','));
  }

  // ─── Summary Statistics ───
  console.log('\n\n📈 SUMMARY:');
  console.log('='.repeat(80));

  for (const method of ['old', 'new']) {
    const methodResults = results.filter(r => r.method === method && r.valid);
    const total = methodResults.length;
    const violations = methodResults.filter(r => !r.restAdequate).length;
    const avgDeviation = methodResults.reduce((sum, r) => sum + Math.abs(parseFloat(r.deviationPercent || 0)), 0) / total;

    console.log(`\n${method.toUpperCase()} Method (${total} sets analyzed):`);
    console.log(`  Rest violations: ${violations}/${total} (${((violations/total)*100).toFixed(1)}%)`);
    console.log(`  Avg deviation from calibrated: ${avgDeviation.toFixed(1)}%`);

    // By workout type
    for (const wt of WORKOUT_TYPES) {
      const typeResults = methodResults.filter(r => r.workoutType === wt);
      const v = typeResults.filter(r => !r.restAdequate).length;
      console.log(`  ${wt}: ${v}/${typeResults.length} violations`);
    }
  }

  // ─── Save detailed JSON for manual review ───
  const fs = require('fs');
  const outputPath = `tests/interval-test-results-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify({ css, results }, null, 2));
  console.log(`\n💾 Detailed results saved to: ${outputPath}`);

  await mongoose.disconnect();
  console.log('\n✅ Test complete');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});