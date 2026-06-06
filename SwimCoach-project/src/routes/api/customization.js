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
      workoutTypes: [
        { value: 'lactate', label: 'Lactate Threshold', description: 'Build sustained speed and endurance at high intensity' },
        { value: 'resistance-power', label: 'Resistance / Power', description: 'Build strength and explosive power in the water' },
        { value: 'speed', label: 'Speed', description: 'Develop maximum velocity and sprint capacity' },
        { value: 'technique', label: 'Technique', description: 'Focus on stroke mechanics and efficiency' },
        { value: 'endurance', label: 'Endurance', description: 'Build aerobic base and sustained effort capacity' },
        { value: 'recovery', label: 'Recovery', description: 'Easy session to promote adaptation and rest' },
      ],
      poolLengths: [
        { value: 25, label: '25m pool' },
        { value: 50, label: '50m pool' },
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
        { value: 'weights', label: 'Weights' },
        { value: 'resistanceMachine', label: 'Resistance Machines' },
        { value: 'pullUpBar', label: 'Pull-up Bar' },
        { value: 'plyometricBox', label: 'Plyometric Box' },
        { value: 'medicineBall', label: 'Medicine Ball' },
        { value: 'yogaMat', label: 'Yoga Mat' },
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
    },
  });
});

module.exports = router;
