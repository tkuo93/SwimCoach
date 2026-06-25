/**
 * Unit tests for the agentic coach.
 *
 * Tests tool definitions, tool execution (with mocked models),
 * and the agent loop structure.
 */

const {
  getToolDefinitions,
  executeTool,
  generalTools,
  workoutTools,
} = require('../../src/services/coach/coach-tools');

// ─── Tool Definition Tests ──────────────────────────────────────────

describe('Coach Tools - Definitions', () => {
  test('general tools have valid definitions', () => {
    expect(generalTools.length).toBe(5);
    for (const tool of generalTools) {
      expect(tool.definition.type).toBe('function');
      expect(tool.definition.function.name).toBeTruthy();
      expect(tool.definition.function.description).toBeTruthy();
      expect(tool.definition.function.parameters.type).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });

  test('workout tools have valid definitions', () => {
    expect(workoutTools.length).toBe(3);
    for (const tool of workoutTools) {
      expect(tool.definition.type).toBe('function');
      expect(tool.definition.function.name).toBeTruthy();
      expect(tool.definition.function.description).toBeTruthy();
      expect(typeof tool.execute).toBe('function');
    }
  });

  test('getToolDefinitions returns general tools only in general mode', () => {
    const defs = getToolDefinitions('general');
    expect(defs.length).toBe(5);
    const names = defs.map(d => d.function.name);
    expect(names).toContain('queryKnowledgeBase');
    expect(names).toContain('getSwimmerHistory');
    expect(names).toContain('getProgressSummary');
    expect(names).toContain('getCoachingMemory');
    expect(names).toContain('addCoachingObservation');
    expect(names).not.toContain('explainWorkout');
    expect(names).not.toContain('modifyWorkout');
    expect(names).not.toContain('regenerateWorkout');
  });

  test('getToolDefinitions returns all tools in workout mode', () => {
    const defs = getToolDefinitions('workout');
    expect(defs.length).toBe(8);
    const names = defs.map(d => d.function.name);
    expect(names).toContain('queryKnowledgeBase');
    expect(names).toContain('explainWorkout');
    expect(names).toContain('modifyWorkout');
    expect(names).toContain('regenerateWorkout');
  });

  test('all tool parameters have required fields where expected', () => {
    const allTools = [...generalTools, ...workoutTools];
    for (const tool of allTools) {
      const params = tool.definition.function.parameters;
      expect(params).toHaveProperty('properties');
      // At least check it's a valid JSON schema structure
      expect(typeof params.properties).toBe('object');
    }
  });
});

// ─── Tool Execution Tests (with mocked context) ─────────────────────

describe('Coach Tools - Execution', () => {
  const mockProfile = {
    _id: 'profile123',
    firstName: 'Test',
    lastName: 'Swimmer',
    experienceLevel: 'intermediate',
    goals: { primaryEvents: [{ stroke: 'freestyle', distance: 100 }], trainingFocus: ['endurance'] },
    equipment: { poolLength: { value: 25, unit: 'meters' }, poolEquipment: {}, gymEquipment: {} },
    trainingSchedule: { weeklyPoolSessions: 3, weeklyGymSessions: 2, sessionDuration: 60 },
  };

  const mockWorkout = {
    _id: 'workout123',
    workoutName: 'Test Workout',
    workoutType: 'endurance',
    duration: 60,
    intensity: 'moderate',
    trainingNotes: ['Build aerobic base'],
    poolWorkout: { totalDistance: 2000, mainSet: [], trainingNotes: [] },
    gymWorkout: { mainSet: [], trainingNotes: [] },
    generationInfo: { generatedBy: 'system', generationParameters: { workoutPreferences: 'endurance' } },
  };

  describe('explainWorkout', () => {
    test('returns workout explanation', async () => {
      const result = await executeTool('explainWorkout', {}, { profile: mockProfile, workout: mockWorkout });
      expect(result).toContain('Test Workout');
      expect(result).toContain('endurance');
      expect(result).toContain('Build aerobic base');
    });

    test('returns message when no workout loaded', async () => {
      const result = await executeTool('explainWorkout', {}, { profile: mockProfile, workout: null });
      expect(result).toContain('No workout loaded');
    });
  });

  describe('modifyWorkout', () => {
    test('returns a proposal', async () => {
      const result = await executeTool('modifyWorkout', {
        description: 'Reduce reps on set 1',
        field: 'poolWorkout.mainSet.0.repetitions',
        currentValue: '8',
        newValue: '6',
      }, { profile: mockProfile, workout: mockWorkout });

      const parsed = JSON.parse(result);
      expect(parsed.proposal).toBe(true);
      expect(parsed.action).toBe('modifyWorkout');
      expect(parsed.field).toBe('poolWorkout.mainSet.0.repetitions');
      expect(parsed.newValue).toBe('6');
    });

    test('returns error when no workout loaded', async () => {
      const result = await executeTool('modifyWorkout', {
        description: 'Change stuff',
        field: 'x',
        currentValue: '1',
        newValue: '2',
      }, { profile: mockProfile, workout: null });
      expect(result).toContain('No workout loaded');
    });
  });

  describe('regenerateWorkout', () => {
    test('returns a proposal', async () => {
      const result = await executeTool('regenerateWorkout', {
        reason: 'Too easy',
        overrides: { intensity: 'high' },
      }, { profile: mockProfile, workout: mockWorkout });

      const parsed = JSON.parse(result);
      expect(parsed.proposal).toBe(true);
      expect(parsed.action).toBe('regenerateWorkout');
      expect(parsed.overrides.intensity).toBe('high');
    });
  });

  describe('addCoachingObservation', () => {
    test('stores an observation (mocked CoachingMemory)', async () => {
      // Mock CoachingMemory.create
      const CoachingMemory = require('../../src/models/CoachingMemory');
      const originalCreate = CoachingMemory.create;
      CoachingMemory.create = jest.fn().mockResolvedValue({ _id: 'mem123' });

      const result = await executeTool('addCoachingObservation', {
        type: 'preference',
        category: 'intensity',
        content: 'Prefers shorter warm-ups',
        confidence: 0.8,
      }, { profile: mockProfile, workout: mockWorkout });

      expect(result).toContain('Prefers shorter warm-ups');
      expect(CoachingMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          swimmerId: 'profile123',
          type: 'preference',
          category: 'intensity',
          content: 'Prefers shorter warm-ups',
          confidence: 0.8,
        })
      );

      CoachingMemory.create = originalCreate;
    });
  });

  describe('unknown tool', () => {
    test('returns error for unknown tool name', async () => {
      const result = await executeTool('nonexistentTool', {}, { profile: mockProfile });
      expect(result).toContain('Unknown tool');
    });
  });
});
