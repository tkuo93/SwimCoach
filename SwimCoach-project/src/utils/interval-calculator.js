/**
 * Interval Calculator - Scientific swim interval calibration
 * Based on work-to-rest ratios, race-pace-referenced pacing, and stroke-specific adjustments
 */

const WORK_REST_RATIOS = {
  // work:rest ratios (rest = work * ratio)
  // Speed: full recovery for quality (1:3 to 1:4)
  // Lactate/Endurance: minimal rest to accumulate fatigue (1:0.1 to 1:0.3)
  'speed': { min: 3, max: 4 },           // Speed: 1:3 to 1:4 (full recovery for quality)
  'power': { min: 3, max: 4 },
  'lactate': { min: 0.1, max: 0.3 },     // Lactate tolerance: 1:0.1 to 1:0.3 (minimal rest, accumulate lactate)
  'lactate threshold': { min: 0.1, max: 0.3 },
  'speed endurance': { min: 0.5, max: 1 }, // Speed endurance: 1:0.5 to 1:1
  'endurance': { min: 0.1, max: 0.2 },   // Threshold/endurance: 1:0.1 to 1:0.2 (minimal rest, steady fast)
  'threshold': { min: 0.1, max: 0.2 },
  'aerobic': { min: 0.1, max: 0.2 },
  'recovery': { min: 1, max: 2 },        // Recovery: 1:1 to 1:2
  'warmup': { min: 1, max: 2 },
  'cooldown': { min: 1, max: 2 },
};

const STROKE_PACE_MULTIPLIERS = {
  'freestyle': 1.0,
  'free': 1.0,
  'backstroke': 1.04,
  'back': 1.04,
  'breaststroke': 1.14,
  'breast': 1.14,
  'butterfly': 1.10,
  'fly': 1.10,
  'im': 1.05,
  'individual medley': 1.05,
  'choice': 1.0,
};

const STROKE_REST_MULTIPLIERS = {
  'freestyle': 1.0,
  'free': 1.0,
  'backstroke': 1.05,
  'back': 1.05,
  'breaststroke': 1.15,
  'breast': 1.15,
  'butterfly': 1.25,
  'fly': 1.25,
  'im': 1.10,
  'individual medley': 1.10,
  'choice': 1.0,
};

const PACE_MULTIPLIERS = {
  // Multipliers applied to RACE PACE (PB for that distance/stroke) for each zone
  // Speed: ~107-108% PB (quality reps slightly slower than PB)
  // Lactate: ~120-130% PB with minimal rest (lactate tolerance - faster than threshold)
  // Endurance: ~115-120% PB with minimal rest (threshold training to raise lactate threshold)
  'speed': { min: 1.07, max: 1.10 },           // 107-110% of race pace
  'power': { min: 1.07, max: 1.10 },
  'lactate': { min: 1.20, max: 1.30 },         // 120-130% of race pace (lactate tolerance)
  'lactate threshold': { min: 1.20, max: 1.30 },
  'speed endurance': { min: 1.15, max: 1.25 }, // 115-125% of race pace
  'endurance': { min: 1.15, max: 1.20 },       // 115-120% of race pace (threshold training)
  'threshold': { min: 1.15, max: 1.20 },
  'aerobic': { min: 1.15, max: 1.25 },         // 115-125% of race pace
  'recovery': { min: 1.25, max: 1.45 },        // 125-145% of race pace
  'warmup': { min: 1.25, max: 1.45 },
  'cooldown': { min: 1.25, max: 1.45 },
};

const DEFAULT_REST_SECONDS = {
  '25': 5,
  '50': 10,
  '75': 15,
  '100': 10,    // Reduced for lactate/endurance zones
  '150': 15,
  '200': 15,    // Reduced for lactate/endurance zones
  '300': 20,
  '400': 25,
  '500': 30,
  '800': 40,
  '1000': 50,
  '1500': 60,
  '1650': 60,
};

/**
 * Calculate Critical Swim Speed from best times
 * CSS = (T200 - T100) / (200 - 100) in seconds per 100
 * Using 100 and 200 freestyle (standard method when 400 not available)
 */
function getCSS(profile) {
  const bestTimes = profile.bestTimes || [];

  // Handle array format (Mongoose documents)
  let t100 = null, t200 = null;
  if (Array.isArray(bestTimes)) {
    for (const bt of bestTimes) {
      if (bt.stroke.toLowerCase() === 'freestyle' && bt.poolLength === 'scy') {
        if (bt.distance === 100) t100 = parseTimeToSeconds(bt.time);
        if (bt.distance === 200) t200 = parseTimeToSeconds(bt.time);
      }
    }
  } else {
    // Handle object format (legacy)
    t100 = bestTimes['100'] || bestTimes['100 free'] || bestTimes['100 freestyle'];
    t200 = bestTimes['200'] || bestTimes['200 free'] || bestTimes['200 freestyle'];
    if (typeof t100 === 'string') t100 = parseTimeToSeconds(t100);
    if (typeof t200 === 'string') t200 = parseTimeToSeconds(t200);
  }

  if (t100 && t200) {
    const cssPacePer100 = t200 - t100; // seconds per 100 (since 200-100 = 100m difference)
    return Math.round(cssPacePer100 * 10) / 10;
  }
  return null;
}

/**
 * Estimate race pace from best time for a given distance
 * Returns pace per 100 in seconds
 */
function getRacePacePer100(bestTimeSeconds, distance) {
  if (!bestTimeSeconds || !distance) return null;
  return (bestTimeSeconds / distance) * 100;
}

/**
 * Find best time for a specific distance and stroke
 * Handles both array format (from SwimmerProfile) and object format
 * If exact distance not found, estimates from closest available distance for that stroke
 */
function findBestTime(bestTimes, distance, stroke) {
  const strokeKey = stroke.toLowerCase();
  const distanceNum = parseInt(distance);

  // Handle array format (Mongoose documents)
  if (Array.isArray(bestTimes)) {
    // First, try exact match
    for (const bt of bestTimes) {
      if (bt.distance === distanceNum && bt.stroke.toLowerCase() === strokeKey) {
        return parseTimeToSeconds(bt.time);
      }
    }

    // If no exact match, find closest distance for this stroke
    const strokeTimes = bestTimes
      .filter(bt => bt.stroke.toLowerCase() === strokeKey)
      .map(bt => ({ distance: bt.distance, time: parseTimeToSeconds(bt.time) }))
      .sort((a, b) => Math.abs(a.distance - distanceNum) - Math.abs(b.distance - distanceNum));

    if (strokeTimes.length > 0) {
      // Use closest distance to estimate race pace for target distance
      const closest = strokeTimes[0];
      const racePacePer100 = (closest.time / closest.distance) * 100;
      // Estimate time for target distance
      return (racePacePer100 / 100) * distanceNum;
    }

    return null;
  }

  // Handle object format (legacy)
  const distanceStr = distance.toString();
  const keys = [
    `${distanceStr} ${strokeKey}`,
    `${distanceStr} ${stroke}`,
    distanceStr,
  ];

  for (const key of keys) {
    if (bestTimes[key]) return bestTimes[key];
  }

  // Try partial matches
  for (const [key, value] of Object.entries(bestTimes)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(distanceStr) && keyLower.includes(strokeKey)) {
      return value;
    }
  }

  return null;
}

/**
 * Parse time string to seconds
 */
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

/**
 * Calculate send-off interval using work-to-rest ratios
 * @param {Object} params - { distance, stroke, focus, bestTimes, cssPace, racePacePer100 }
 */
function calculateInterval({ distance, stroke, focus, bestTimes, cssPace, racePacePer100 }) {
  const strokeKey = stroke.toLowerCase();
  const focusKey = focus.toLowerCase();
  const distanceNum = parseInt(distance);
  const distanceStr = distance.toString();

  // Parse focus to find primary training zone
  // Handle compound focuses like "speed, resistance-power" or "lactate threshold"
  const focusZone = parseFocusZone(focusKey);

  // 1. Determine target pace per 100
  let targetPacePer100;
  let paceSource = 'estimated';

  const bestTime = findBestTime(bestTimes, distance, stroke);

  if (bestTime) {
    // Use actual race pace from best time
    const racePace = getRacePacePer100(bestTime, distanceNum);
    const multiplier = PACE_MULTIPLIERS[focusZone] || { min: 1.1, max: 1.2 };
    targetPacePer100 = racePace * multiplier.min; // Use min for faster end of zone
    paceSource = 'race_pace';
  } else if (racePacePer100) {
    // Use provided race pace (e.g., from CSS for that stroke)
    const multiplier = PACE_MULTIPLIERS[focusZone] || { min: 1.1, max: 1.2 };
    targetPacePer100 = racePacePer100 * multiplier.min;
    paceSource = 'css_derived';
  } else if (cssPace) {
    // Fallback to CSS with stroke adjustment
    const strokeMult = STROKE_PACE_MULTIPLIERS[strokeKey] || 1.0;
    const multiplier = PACE_MULTIPLIERS[focusZone] || { min: 1.1, max: 1.2 };
    targetPacePer100 = cssPace * strokeMult * multiplier.min;
    paceSource = 'css_with_stroke_adj';
  } else {
    // Ultimate fallback
    targetPacePer100 = 90; // 1:30 per 100 default
    paceSource = 'default';
  }

  // Apply stroke pace multiplier
  const strokePaceMult = STROKE_PACE_MULTIPLIERS[strokeKey] || 1.0;
  targetPacePer100 *= strokePaceMult;

  // 2. Calculate swim time for this distance
  const swimTimeSeconds = (targetPacePer100 / 100) * distanceNum;

  // 3. Calculate rest using work-to-rest ratio
  const ratio = WORK_REST_RATIOS[focusZone] || { min: 1, max: 2 };
  const restRatio = ratio.min; // Use minimum rest ratio for the zone
  const strokeRestMult = STROKE_REST_MULTIPLIERS[strokeKey] || 1.0;

  let restSeconds = swimTimeSeconds * restRatio * strokeRestMult;

  // Apply minimums based on distance
  const minRest = DEFAULT_REST_SECONDS[distanceStr] || Math.max(10, distanceNum / 10);
  restSeconds = Math.max(restSeconds, minRest);

  // 4. Send-off = swim time + rest
  let sendOffSeconds = swimTimeSeconds + restSeconds;

  // Special handling: Speed work on short distances (50 and under) needs minimum 2:00 send-off for full recovery
  if ((focusZone === 'speed' || focusZone === 'power') && distanceNum <= 50) {
    const minSendOff = 120; // 2:00 minimum
    if (sendOffSeconds < minSendOff) {
      sendOffSeconds = minSendOff;
      restSeconds = sendOffSeconds - swimTimeSeconds;
    }
  }

  // 5. Apply safety cap: no faster than 95% of personal best
  if (bestTime) {
    const maxAllowedPacePer100 = (bestTime / distanceNum) * 100 * 0.95;
    if (targetPacePer100 < maxAllowedPacePer100) {
      targetPacePer100 = maxAllowedPacePer100;
      // Recalculate with capped pace
      const cappedSwimTime = (targetPacePer100 / 100) * distanceNum;
      const cappedRest = cappedSwimTime * restRatio * strokeRestMult;
      const cappedSendOff = cappedSwimTime + Math.max(cappedRest, minRest);
      return {
        sendOff: Math.round(cappedSendOff),
        targetPace: Math.round(cappedSwimTime * 10) / 10,  // Return swim time for the distance
        targetPacePer100: Math.round(targetPacePer100 * 10) / 10,  // Also provide per-100 pace
        rest: Math.round(Math.max(cappedRest, minRest)),
        type: focusZone,
        paceSource,
        safetyCapped: true,
        progression: 'maintain',
      };
    }
  }

  return {
    sendOff: Math.round(sendOffSeconds),
    targetPace: Math.round(swimTimeSeconds * 10) / 10,  // Return swim time for the distance
    targetPacePer100: Math.round(targetPacePer100 * 10) / 10,  // Also provide per-100 pace
    rest: Math.round(restSeconds),
    type: focusZone,
    paceSource,
    safetyCapped: false,
    progression: 'maintain',
  };
}

/**
 * Parse focus string to determine primary training zone
 * Handles compound focuses like "speed, resistance-power" or "lactate threshold development"
 */
function parseFocusZone(focus) {
  const focusLower = focus.toLowerCase();

  // Check for specific zone keywords in order of priority
  if (focusLower.includes('speed') || focusLower.includes('power') || focusLower.includes('resistance-power')) {
    return 'speed';
  }
  if (focusLower.includes('lactate')) {
    return 'lactate';
  }
  if (focusLower.includes('speed endurance')) {
    return 'speed endurance';
  }
  if (focusLower.includes('endurance') || focusLower.includes('threshold') || focusLower.includes('aerobic')) {
    return 'endurance';
  }
  if (focusLower.includes('recovery') || focusLower.includes('warmup') || focusLower.includes('cooldown') ||
      focusLower.includes('technique') || focusLower.includes('mobility') || focusLower.includes('drill')) {
    return 'recovery';
  }

  // Default
  return 'endurance';
}

/**
 * Validate and auto-correct intervals against calibrated values
 * Tolerance: ±10% on send-off, ±5% on target pace
 */
function validateAndCorrectIntervals(intervals, profile) {
  if (!intervals || !Array.isArray(intervals)) return intervals;

  const cssPace = getCSS(profile);
  const bestTimes = profile.bestTimes || {};

  return intervals.map(interval => {
    // Handle both old format (restInterval string) and new format (interval object)
    // AI returns: distancePerRep (or distance), reps (or repetitions), stroke, focus, interval (object or string)
    const distance = interval.distancePerRep || interval.distance;
    const stroke = interval.stroke || 'freestyle';
    const focus = interval.focus || interval.type || 'endurance';
    const reps = interval.reps || interval.repetitions || 1;

    if (!distance) return interval;

    const calibrated = calculateInterval({
      distance: parseInt(distance),
      stroke,
      focus,
      bestTimes,
      cssPace,
    });

    // If interval already has sendOff/targetPace (as numbers from previous validation), check if within tolerance
    if (typeof interval.sendOff === 'number' && typeof interval.targetPace === 'number') {
      const sendOffDiff = Math.abs(interval.sendOff - calibrated.sendOff) / calibrated.sendOff;
      const paceDiff = Math.abs(interval.targetPace - calibrated.targetPace) / calibrated.targetPace;

      if (sendOffDiff <= 0.10 && paceDiff <= 0.05) {
        // Within tolerance - keep values but ensure rest is present
        // Preserve the AI's progression type
        const progressionType = interval.interval?.type || interval.intervalType || interval.progressionType || 'fixed';
        return {
          ...interval,
          sendOff: interval.sendOff,
          targetPace: interval.targetPace,
          rest: interval.rest || calibrated.rest,
          type: progressionType,
          paceSource: interval.paceSource || calibrated.paceSource,
          safetyCapped: interval.safetyCapped || calibrated.safetyCapped,
          validated: true,
        };
      }
    }

    // Outside tolerance or missing calibrated fields - replace interval with calibrated object
    // This ensures downstream mapping uses calibrated values
    // Preserve the AI's progression type (fixed, descending, ascending, building)
    const progressionType = interval.interval?.type || interval.intervalType || interval.progressionType || 'fixed';
    return {
      ...interval,
      distance: parseInt(distance),
      stroke,
      reps,
      focus,
      // Replace interval object with calibrated values
      interval: {
        sendOff: calibrated.sendOff,
        targetPace: calibrated.targetPace,
        rest: calibrated.rest,
        type: progressionType,
        paceSource: calibrated.paceSource,
        safetyCapped: calibrated.safetyCapped,
        progression: calibrated.progression,
      },
      // Also add flat numeric fields for backward compatibility
      sendOff: calibrated.sendOff,
      targetPace: calibrated.targetPace,
      rest: calibrated.rest,
      type: progressionType,
      paceSource: calibrated.paceSource,
      safetyCapped: calibrated.safetyCapped,
      progression: calibrated.progression,
      validated: true,
      corrected: true,
    };
  });
}

/**
 * Calculate intervals for a main set
 */
function calculateMainSetIntervals(mainSet, profile) {
  if (!mainSet || !mainSet.sets) return mainSet;

  const cssPace = getCSS(profile);
  const bestTimes = profile.bestTimes || {};

  const setsWithIntervals = mainSet.sets.map(set => {
    const distance = set.distance || 100;
    const stroke = set.stroke || 'freestyle';
    const focus = set.focus || set.type || 'endurance';
    const reps = set.reps || set.repetitions || 1;

    const calibrated = calculateInterval({
      distance,
      stroke,
      focus,
      bestTimes,
      cssPace,
    });

    return {
      ...set,
      intervalDetail: {
        sendOff: calibrated.sendOff,
        targetPace: calibrated.targetPace,
        rest: calibrated.rest,
        type: calibrated.type,
        paceSource: calibrated.paceSource,
        safetyCapped: calibrated.safetyCapped,
        progression: calibrated.progression,
      },
    };
  });

  return { ...mainSet, sets: setsWithIntervals };
}

/**
 * Format seconds to time string (M:SS or M:SS.hh)
 */
function formatSecondsToTime(seconds) {
  if (seconds == null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds % 1) * 100);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }
  return `${secs}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to send-off string (M:SS)
 */
function formatSecondsToSendOff(seconds) {
  if (seconds == null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}

module.exports = {
  calculateInterval,
  validateAndCorrectIntervals,
  calculateMainSetIntervals,
  getCSS,
  getRacePacePer100,
  findBestTime,
  parseFocusZone,
  formatSecondsToTime,
  formatSecondsToSendOff,
  WORK_REST_RATIOS,
  STROKE_PACE_MULTIPLIERS,
  STROKE_REST_MULTIPLIERS,
  PACE_MULTIPLIERS,
};