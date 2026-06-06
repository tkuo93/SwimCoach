/**
 * Unit tests for src/utils/validation.js
 *
 * Tests pure validation utility functions — no DB, no external dependencies.
 */

const {
  validateTimeFormat,
  validatePastDate,
  validateEmail,
  validatePhone,
  validateAgeRange,
} = require('../../src/utils/validation');

// ─── validateTimeFormat ──────────────────────────────────────────────

describe('validateTimeFormat', () => {
  test.each(['00:00.00', '01:30.25', '59:59.99', '5:30.50', '0:00.00'])(
    'accepts valid time format: %s',
    (time) => {
      expect(validateTimeFormat(time)).toBe(true);
    },
  );

  test.each(['00:00', '1:30', '10:45'])(
    'accepts time without hundredths: %s',
    (time) => {
      expect(validateTimeFormat(time)).toBe(true);
    },
  );

  test.each([
    '60:00.00',   // minutes > 59
    '00:60.00',   // seconds > 59
    '1:30:45',    // extra field
    'abc',        // letters
    '',           // empty
    '1.30',       // wrong separator
    '-1:30.00',   // negative
  ])('rejects invalid time format: %s', (time) => {
    expect(validateTimeFormat(time)).toBe(false);
  });
});

// ─── validatePastDate ────────────────────────────────────────────────

describe('validatePastDate', () => {
  test('accepts a date in the past', () => {
    expect(validatePastDate(new Date('2020-01-01'))).toBe(true);
  });

  test('accepts today', () => {
    expect(validatePastDate(new Date())).toBe(true);
  });

  test('rejects a date in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(validatePastDate(future)).toBe(false);
  });

  test('rejects tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(validatePastDate(tomorrow)).toBe(false);
  });
});

// ─── validateEmail ───────────────────────────────────────────────────

describe('validateEmail', () => {
  test.each([
    'user@example.com',
    'test.email@domain.org',
    'first+tag@sub.domain.co.uk',
  ])('accepts valid email: %s', (email) => {
    expect(validateEmail(email)).toBe(true);
  });

  test.each([
    'not-an-email',
    '@no-local.com',
    'no-domain@',
    '@@double-at.com',
    '',
    'spaces in@email.com',
    'missing-tld@domain',
  ])('rejects invalid email: %s', (email) => {
    expect(validateEmail(email)).toBe(false);
  });
});

// ─── validatePhone ───────────────────────────────────────────────────

describe('validatePhone', () => {
  test.each([
    '+11234567890',
    '123-456-7890',
    '(123) 456-7890',
    '123.456.7890',
    '1234567890',
    '+442079460958',
  ])('accepts valid phone: %s', (phone) => {
    expect(validatePhone(phone)).toBe(true);
  });

  test('accepts empty string (optional field)', () => {
    expect(validatePhone('')).toBe(true);
  });

  test('accepts undefined/null (optional field)', () => {
    expect(validatePhone(undefined)).toBe(true);
    expect(validatePhone(null)).toBe(true);
  });

  test.each(['abc', '12', '123-abc-7890', '!@#$%^&*()'])(
    'rejects invalid phone: %s',
    (phone) => {
      expect(validatePhone(phone)).toBe(false);
    },
  );
});

// ─── validateAgeRange ────────────────────────────────────────────────

describe('validateAgeRange', () => {
  test('accepts a 25-year-old', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 25);
    expect(validateAgeRange(d)).toBe(true);
  });

  test('accepts exactly 5 years old', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    // Set to Jan 1 to guarantee birthday has already passed this year
    d.setMonth(0);
    d.setDate(1);
    expect(validateAgeRange(d)).toBe(true);
  });

  test('accepts exactly 100 years old', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 100);
    expect(validateAgeRange(d)).toBe(true);
  });

  test('rejects a 4-year-old', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 4);
    expect(validateAgeRange(d)).toBe(false);
  });

  test('rejects a 101-year-old', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 101);
    expect(validateAgeRange(d)).toBe(false);
  });

  test('rejects a newborn (0 years)', () => {
    expect(validateAgeRange(new Date())).toBe(false);
  });

  test('accepts leap year birth date', () => {
    expect(validateAgeRange(new Date('2000-02-29'))).toBe(true);
  });

  test('accepts string date input', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    expect(validateAgeRange(d.toISOString())).toBe(true);
  });
});
