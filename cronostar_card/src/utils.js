/**
 * Utility functions for CronoStar Card
 * @module utils
 */

/**
 * Wait for a promise to resolve with timeout
 * @param {Promise} promise - Promise to wait for
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise}
 */
export async function waitWithTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Round number to specified decimal places
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number}
 */
export function roundTo(value, decimals = 1) {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format hour string with padding
 * @param {number} hour - Hour (0-23 or 1-24)
 * @param {number} base - Base (0 or 1)
 * @returns {string}
 */
export function formatHourString(hour, base = 0) {
  const num = hour + base;
  return num.toString().padStart(2, '0');
}

/**
 * Parse float safely
 * @param {*} value - Value to parse
 * @param {number} defaultValue - Default if parse fails
 * @returns {number}
 */
export function safeParseFloat(value, defaultValue = null) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Get unique array elements
 * @param {Array} arr - Input array
 * @returns {Array}
 */
export function unique(arr) {
  return [...new Set(arr)];
}

/**
 * Check if value is defined and not null
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isDefined(value) {
  return value !== undefined && value !== null;
}

/**
 * Logging utility with tags
 */
let loggingEnabled = false;

export const Logger = {
  setEnabled: (enabled) => {
    loggingEnabled = !!enabled;
    console.log('Logger.setEnabled called, loggingEnabled is now', loggingEnabled);
  },
  log: (tag, ...args) => {
    if (loggingEnabled) {
      console.log(`[${tag}]`, ...args);
    }
  },
  warn: (tag, ...args) => {
    if (loggingEnabled) {
      console.warn(`[${tag}]`, ...args);
    }
  },
  error: (tag, ...args) => console.error(`[${tag}]`, ...args),
  
  state: (...args) => Logger.log('STATE', ...args),
  load: (...args) => Logger.log('LOAD', ...args),
  save: (...args) => Logger.log('SAVE', ...args),
  sel: (...args) => Logger.log('SEL', ...args),
  memo: (...args) => Logger.log('MEMO', ...args),
  diff: (...args) => Logger.log('DIFF', ...args),
  key: (...args) => Logger.log('KEY', ...args),
  base: (...args) => Logger.log('BASE', ...args),
};

window.Logger = Logger;
