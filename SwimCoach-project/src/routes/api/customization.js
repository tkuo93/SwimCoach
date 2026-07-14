const express = require('express');
const router = express.Router();

/**
 * Customization options endpoint.
 * Returns the available options a user can specify when generating a workout.
 * This is a config-style endpoint — no DB interaction needed.
 */

// GET /api/workouts/options
router.get('/options', (req, res) => {
  res.json({
    success: true,
    data: {
      sessionTypes: [
        { value: 'both', label: 'Pool + Gym', description: 'Combined pool and gym workout' },
        { value: 'pool', label: 'Pool Only', description: 'Swimming pool workout only' },
        { value: 'gym', label: 'Gym Only', description: 'Gym / dryland workout only' },
      ],
      workoutTypes: [
        { value: 'lactate', label: 'Lactate Threshold', description: 'Build sustained speed and endurance at high intensity' },
        { value: 'resistance-power', label: 'Resistance / Power', description: 'Build strength and explosive power in the water' },
        { value: 'speed', label: 'Speed', description: 'Develop maximum velocity and sprint capacity' },
        { value: 'technique', label: 'Technique', description: 'Focus on stroke mechanics and efficiency' },
        { value: 'endurance', label: 'Endurance', description: 'Build aerobic base and sustained effort capacity' },
        { value: 'mobility', label: 'Mobility', description: 'Improve flexibility, range of motion, and recovery' },
        { value: 'recovery', label: 'Recovery', description: 'Easy session to promote adaptation and rest' },
      ],
      // Training focus options for the profile (must match SwimmerProfile schema enum)
      trainingFocusTypes: [
        { value: 'sprint', label: 'Sprint', description: 'Short, high-intensity efforts' },
        { value: 'distance', label: 'Distance', description: 'Longer, sustained aerobic swimming' },
        { value: 'technique', label: 'Technique', description: 'Stroke mechanics and efficiency' },
        { value: 'endurance', label: 'Endurance', description: 'Building aerobic base' },
        { value: 'speed', label: 'Speed', description: 'Developing maximum velocity' },
        { value: 'maintenance', label: 'Maintenance', description: 'Maintaining current fitness' },
        { value: 'lactate', label: 'Lactate Threshold', description: 'Build sustained speed at high intensity' },
        { value: 'resistance-power', label: 'Resistance / Power', description: 'Build strength and explosive power' },
        { value: 'mobility', label: 'Mobility', description: 'Improve flexibility and range of motion' },
        { value: 'recovery', label: 'Recovery', description: 'Easy session to promote adaptation' },
      ],
      poolLengths: [
        { value: '25m', label: '25m pool' },
        { value: '50m', label: '50m pool' },
        { value: 'scy', label: 'Short Course Yards (25yd)' },
        { value: 'scm', label: 'Short Course Meters (25m)' },
        { value: 'lcm', label: 'Long Course Meters (50m)' },
      ],
      poolEquipment: [
        { value: 'fins', label: 'Fins' },
        { value: 'paddles', label: 'Paddles' },
        { value: 'pullBuoy', label: 'Pull Buoy' },
        { value: 'snorkel', label: 'Snorkel' },
        { value: 'parachute', label: 'Parachute / Resistance' },
        { value: 'resistanceBands', label: 'Resistance Bands' },
      ],
      gymEquipment: [
        { value: 'barbell', label: 'Barbell' },
        { value: 'dumbbell', label: 'Dumbbells' },
        { value: 'kettlebell', label: 'Kettlebells' },
        { value: 'resistanceMachine', label: 'Resistance Machines' },
        { value: 'pullUpBar', label: 'Pull-up Bar' },
        { value: 'plyometricBox', label: 'Plyometric Box' },
        { value: 'medicineBall', label: 'Medicine Ball' },
        { value: 'yogaMat', label: 'Yoga Mat' },
        { value: 'bands', label: 'Bands' },
        { value: 'sliders', label: 'Sliders' },
      ],
      // For best times and goal event selection
      distances: [
        { value: 50, label: '50' },
        { value: 100, label: '100' },
        { value: 200, label: '200' },
        { value: 400, label: '400' },
        { value: 500, label: '500' },
        { value: 800, label: '800' },
        { value: 1500, label: '1500' },
        { value: 1650, label: '1650' },
      ],
      strokes: [
        { value: 'freestyle', label: 'Freestyle' },
        { value: 'backstroke', label: 'Backstroke' },
        { value: 'breaststroke', label: 'Breaststroke' },
        { value: 'butterfly', label: 'Butterfly' },
        { value: 'individual-medley', label: 'Individual Medley' },
      ],
      goalOutcomes: [
        { value: 'drop-time', label: 'Drop Time' },
        { value: 'build-muscle', label: 'Build Muscle' },
        { value: 'lose-weight', label: 'Lose Weight' },
        { value: 'maintain', label: 'Maintain Speed & Physique' },
        { value: 'technique', label: 'Work on Technique' },
      ],
      daysOfWeek: [
        { value: 'monday', label: 'Monday' },
        { value: 'tuesday', label: 'Tuesday' },
        { value: 'wednesday', label: 'Wednesday' },
        { value: 'thursday', label: 'Thursday' },
        { value: 'friday', label: 'Friday' },
        { value: 'saturday', label: 'Saturday' },
        { value: 'sunday', label: 'Sunday' },
      ],
      intensities: [
        { value: 'low', label: 'Low — easy effort, conversational pace' },
        { value: 'moderate', label: 'Moderate — controlled effort, some discomfort' },
        { value: 'high', label: 'High — hard effort, challenging to sustain' },
        { value: 'maximal', label: 'Maximal — all-out sprint effort' },
      ],
      programPeriods: [
        { value: 'single', label: 'Single Session', description: 'Standalone workout' },
        { value: 'weekly', label: 'Weekly Block', description: 'Part of a week-long progression' },
        { value: 'monthly', label: 'Monthly Plan', description: 'Part of a month-long training cycle' },
      ],
      // 1-Rep Max exercise types for strength baselines
      oneRepMaxExercises: [
        { value: 'squat', label: 'Back Squat', description: 'Barbell back squat 1RM' },
        { value: 'clean', label: 'Power Clean', description: 'Power clean 1RM' },
        { value: 'strict-overhead-press', label: 'Strict Overhead Press', description: 'Strict press 1RM' },
        { value: 'bench-press', label: 'Bench Press', description: 'Bench press 1RM' },
        { value: 'deadlift', label: 'Deadlift', description: 'Deadlift 1RM' },
        { value: 'front-squat', label: 'Front Squat', description: 'Front squat 1RM' },
        { value: 'push-press', label: 'Push Press', description: 'Push press 1RM' },
        { value: 'pull-up', label: 'Weighted Pull-up', description: 'Weighted pull-up 1RM' },
      ],
    },
  });
});

module.exports = router;
