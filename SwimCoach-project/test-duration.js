/**
 * Test for workout duration calculation
 */

const {
  calculateWorkoutDuration,
  calculatePoolDuration,
  calculateGymDuration,
  adjustWorkoutToDuration,
  validateWorkoutDuration,
  parseIntervalToSeconds,
} = require('./src/utils/workout-duration');

// Test parseIntervalToSeconds
console.log('=== Testing parseIntervalToSeconds ===');
console.log('2:00 ->', parseIntervalToSeconds('2:00'), 'seconds (expected 120)');
console.log('1:30 ->', parseIntervalToSeconds('1:30'), 'seconds (expected 90)');
console.log('90s ->', parseIntervalToSeconds('90s'), 'seconds (expected 90)');
console.log('1:30.5 ->', parseIntervalToSeconds('1:30.5'), 'seconds (expected 90.5)');
console.log('2:00.50 ->', parseIntervalToSeconds('2:00.50'), 'seconds (expected 120.5)');

// Test pool duration calculation
console.log('\n=== Testing calculatePoolDuration ===');
const poolWorkout1 = {
  warmUp: { distance: 400, duration: 10 },
  mainSet: [
    { distancePerRep: 100, repetitions: 10, interval: '1:45' },
    { distancePerRep: 50, repetitions: 8, interval: '1:00' },
  ],
  coolDown: { distance: 200, duration: 5 },
};
console.log('Pool workout 1:', calculatePoolDuration(poolWorkout1), 'minutes');

const poolWorkout2 = {
  warmUp: { distance: 300 },
  mainSet: [
    { distancePerRep: 100, repetitions: 5, interval: '2:00' },
  ],
  coolDown: { distance: 100 },
};
console.log('Pool workout 2:', calculatePoolDuration(poolWorkout2), 'minutes');

// Test gym duration calculation
console.log('\n=== Testing calculateGymDuration ===');
const gymWorkout1 = {
  warmUp: { duration: 5 },
  mainSet: [
    { exercise: 'Squats', sets: 3, repetitions: 8, restTime: 90 },
    { exercise: 'Push-ups', sets: 3, repetitions: 15, restTime: 60 },
    { exercise: 'Rows', sets: 3, repetitions: 10, restTime: 75 },
  ],
  coolDown: { duration: 5 },
};
console.log('Gym workout 1:', calculateGymDuration(gymWorkout1), 'minutes');

const gymWorkout2 = {
  warmUp: {},
  mainSet: [
    { exercise: 'Planks', sets: 3, repetitions: 30, restTime: 60 },
  ],
  coolDown: {},
};
console.log('Gym workout 2:', calculateGymDuration(gymWorkout2), 'minutes');

// Test total workout duration
console.log('\n=== Testing calculateWorkoutDuration ===');
const workout1 = {
  duration: 60,
  poolWorkout: poolWorkout1,
  gymWorkout: gymWorkout1,
};
const result1 = calculateWorkoutDuration(workout1);
console.log('Workout 1 (60 min target):', result1);

const workout2 = {
  duration: 40,
  poolWorkout: poolWorkout1,
  gymWorkout: gymWorkout1,
};
const result2 = calculateWorkoutDuration(workout2);
console.log('Workout 2 (40 min target):', result2);

// Test validation
console.log('\n=== Testing validateWorkoutDuration ===');
console.log('Validation 1:', validateWorkoutDuration(workout1));
console.log('Validation 2:', validateWorkoutDuration(workout2));

// Test adjustment
console.log('\n=== Testing adjustWorkoutToDuration ===');
const adjusted = adjustWorkoutToDuration(workout2, 40);
console.log('Adjusted workout pool main set reps:', adjusted.poolWorkout?.mainSet?.map(s => s.repetitions));
console.log('Adjusted workout gym main set:', adjusted.gymWorkout?.mainSet?.map(e => ({ sets: e.sets, reps: e.repetitions })));
console.log('_durationAdjusted:', adjusted._durationAdjusted);

console.log('\n=== All tests completed ===');