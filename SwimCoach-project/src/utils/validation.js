// Validation utility functions for SwimCoach models

/**
 * Validate time format (MM:ss.hh)
 * @param {string} time - Time string to validate
 * @returns {boolean} - True if valid format
 */
const validateTimeFormat = (time) => {
  const timeRegex = /^([0-5]?[0-9]):([0-5][0-9])(\.[0-9]{2})?$/;
  return timeRegex.test(time);
};

/**
 * Validate date is not in the future (for best times, etc.)
 * @param {Date} date - Date to validate
 * @returns {boolean} - True if date is valid
 */
const validatePastDate = (date) => {
  return date <= new Date();
};

/**
 * Validate email format
 * @param {string} email - Email string to validate
 * @returns {boolean} - True if valid email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone string to validate
 * @returns {boolean} - True if valid phone format
 */
const validatePhone = (phone) => {
  if (!phone) return true; // Optional field
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im;
  return phoneRegex.test(phone);
};

/**
 * Validate that a date is within a reasonable range for a swimmer's age
 * @param {Date} dateOfBirth - Date of birth to validate
 * @returns {boolean} - True if age is reasonable (between 5 and 100 years)
 */
const validateAgeRange = (dateOfBirth) => {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age >= 5 && age <= 100;
};

module.exports = {
  validateTimeFormat,
  validatePastDate,
  validateEmail,
  validatePhone,
  validateAgeRange
};