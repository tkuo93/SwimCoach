/**
 * Unit tests for src/services/memory.js
 *
 * Tests the MEMORY.md read/write/append/derive logic.
 * Uses a temporary MEMORY.md file to avoid polluting the real one.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temp directory and MEMORY.md before importing the service
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swimcoach-test-'));
const tmpMemoryPath = path.join(tmpDir, 'MEMORY.md');

const initialContent = `# SwimCoach Memory

This file stores learnings and insights from past workout feedback.

## Format

Each entry follows this structure.

---

## Entries

_No feedback entries yet. Workouts with feedback will appear here automatically._
`;

fs.writeFileSync(tmpMemoryPath, initialContent, 'utf8');

// Set env var so the service uses our temp file
process.env.MEMORY_PATH = tmpMemoryPath;

const memory = require('../../src/services/memory');

afterAll(() => {
  try { fs.unlinkSync(tmpMemoryPath); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}
  delete process.env.MEMORY_PATH;
});

describe('memory service', () => {
  beforeEach(() => {
    fs.writeFileSync(tmpMemoryPath, initialContent, 'utf8');
  });

  describe('readMemory', () => {
    test('returns file content as string', () => {
      const content = memory.readMemory();
      expect(content).toContain('SwimCoach Memory');
      expect(content).toContain('## Entries');
    });

    test('returns empty string when file does not exist', () => {
      fs.unlinkSync(tmpMemoryPath);
      const content = memory.readMemory();
      expect(content).toBe('');
      fs.writeFileSync(tmpMemoryPath, initialContent, 'utf8');
    });
  });

  describe('parseEntries', () => {
    test('returns empty array when no entries exist', () => {
      const content = memory.readMemory();
      const entries = memory.parseEntries(content);
      expect(entries).toEqual([]);
    });

    test('parses existing entries correctly', () => {
      const entryContent = initialContent.replace(
        '_No feedback entries yet. Workouts with feedback will appear here automatically._',
        '### [2026-06-06] — Jane Smith\n- **Workout Type**: endurance\n- **Rating**: 4\n',
      );
      fs.writeFileSync(tmpMemoryPath, entryContent, 'utf8');
      const content = memory.readMemory();
      const entries = memory.parseEntries(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toContain('Jane Smith');
      expect(entries[0]).toContain('endurance');
    });
  });

  describe('getFeedbackSummary', () => {
    test('returns empty string when no entries', () => {
      const summary = memory.getFeedbackSummary();
      expect(summary).toBe('');
    });

    test('returns formatted summary of recent entries', () => {
      memory.appendFeedback({
        profileName: 'Jane Smith',
        workoutType: 'endurance',
        rating: 4,
        difficultyPerception: 'just-right',
        enjoyment: 'enjoyed',
        comments: 'Felt good',
        learning: 'Keep endurance sessions at this level.',
      });

      const summary = memory.getFeedbackSummary();
      expect(summary).toContain('endurance');
      expect(summary).toContain('just-right');
      expect(summary).toContain('enjoyed');
      expect(summary).toContain('Keep endurance sessions');
    });

    test('respects maxEntries parameter', () => {
      for (let i = 0; i < 5; i++) {
        memory.appendFeedback({
          profileName: `Swimmer ${i}`,
          workoutType: 'speed',
          rating: 3,
          difficultyPerception: 'just-right',
          enjoyment: 'neutral',
          learning: `Learning ${i}`,
        });
      }

      // Entries are stored newest-first (prepended), so slice(0, 3) gets the 3 most recent
      const summary = memory.getFeedbackSummary(3);
      expect(summary).toContain('Learning 4'); // most recent (last appended)
      expect(summary).toContain('Learning 3'); // second most recent
      expect(summary).toContain('Learning 2'); // third most recent
      expect(summary).not.toContain('Learning 1');
      expect(summary).not.toContain('Learning 0');
    });
  });

  describe('appendFeedback', () => {
    test('appends entry to MEMORY.md', () => {
      memory.appendFeedback({
        profileName: 'Jane Smith',
        workoutType: 'speed',
        rating: 5,
        difficultyPerception: 'just-right',
        enjoyment: 'loved',
        comments: 'Great workout!',
        learning: 'User loved speed workouts at this intensity.',
      });

      const content = memory.readMemory();
      expect(content).toContain('Jane Smith');
      expect(content).toContain('speed');
      expect(content).toContain('Great workout!');
      expect(content).toContain('User loved speed workouts');
    });

    test('replaces placeholder text on first entry', () => {
      memory.appendFeedback({
        profileName: 'First User',
        workoutType: 'endurance',
        rating: 3,
        difficultyPerception: 'easy',
        enjoyment: 'neutral',
        learning: 'First entry test.',
      });

      const content = memory.readMemory();
      expect(content).not.toContain('No feedback entries yet');
      expect(content).toContain('First User');
    });

    test('appends multiple entries', () => {
      memory.appendFeedback({
        profileName: 'User A',
        workoutType: 'speed',
        rating: 4,
        difficultyPerception: 'just-right',
        enjoyment: 'enjoyed',
        learning: 'Test A',
      });

      memory.appendFeedback({
        profileName: 'User B',
        workoutType: 'endurance',
        rating: 2,
        difficultyPerception: 'too-hard',
        enjoyment: 'did-not-enjoy',
        learning: 'Test B',
      });

      const content = memory.readMemory();
      expect(content).toContain('User A');
      expect(content).toContain('User B');
      const entries = memory.parseEntries(content);
      expect(entries).toHaveLength(2);
    });
  });

  describe('deriveLearning', () => {
    test('suggests reducing intensity for too-hard workouts', () => {
      const learning = memory.deriveLearning({
        rating: 1,
        difficultyPerception: 'too-hard',
        enjoyment: 'did-not-enjoy',
        workoutType: 'speed',
      });
      expect(learning).toContain('Reduce intensity');
      expect(learning).toContain('speed');
    });

    test('suggests increasing intensity for too-easy workouts', () => {
      const learning = memory.deriveLearning({
        rating: 5,
        difficultyPerception: 'too-easy',
        enjoyment: 'enjoyed',
        workoutType: 'endurance',
      });
      expect(learning).toContain('more intensity');
    });

    test('notes when difficulty is just-right', () => {
      const learning = memory.deriveLearning({
        rating: 4,
        difficultyPerception: 'just-right',
        enjoyment: 'enjoyed',
        workoutType: 'technique',
      });
      expect(learning).toContain('well-calibrated');
    });

    test('uses loved enjoyment as template signal', () => {
      const learning = memory.deriveLearning({
        rating: 5,
        difficultyPerception: 'just-right',
        enjoyment: 'loved',
        workoutType: 'recovery',
      });
      expect(learning).toContain('template');
    });

    test('suggests variety for disliked workouts', () => {
      const learning = memory.deriveLearning({
        rating: 2,
        difficultyPerception: 'hard',
        enjoyment: 'did-not-enjoy',
        workoutType: 'lactate',
      });
      expect(learning).toContain('varying exercises');
    });

    test('falls back to rating when no specific signals', () => {
      const learning = memory.deriveLearning({
        rating: 3,
        workoutType: 'mobility',
      });
      expect(learning).toContain('3/5');
    });

    test('flags poor quality workouts', () => {
      const learning = memory.deriveLearning({
        rating: 3,
        difficultyPerception: 'just-right',
        enjoyment: 'enjoyed',
        quality: 'poor',
        accuracy: 'mostly-accurate',
        workoutType: 'speed',
      });
      expect(learning).toContain('poor');
      expect(learning).toContain('Review set structure');
    });

    test('flags excellent quality workouts', () => {
      const learning = memory.deriveLearning({
        rating: 5,
        difficultyPerception: 'just-right',
        enjoyment: 'loved',
        quality: 'excellent',
        accuracy: 'spot-on',
        workoutType: 'endurance',
      });
      expect(learning).toContain('excellent');
      expect(learning).toContain('working well');
    });

    test('recalibrates when accuracy is way-off', () => {
      const learning = memory.deriveLearning({
        rating: 3,
        difficultyPerception: 'just-right',
        enjoyment: 'neutral',
        quality: 'average',
        accuracy: 'way-off',
        workoutType: 'technique',
      });
      expect(learning).toContain('way-off');
      expect(learning).toContain('Recalibrate');
    });

    test('keeps similar paces when accuracy is spot-on', () => {
      const learning = memory.deriveLearning({
        rating: 4,
        difficultyPerception: 'just-right',
        enjoyment: 'enjoyed',
        quality: 'good',
        accuracy: 'spot-on',
        workoutType: 'lactate',
      });
      expect(learning).toContain('spot-on');
      expect(learning).toContain('Keep similar pace');
    });
  });
});
