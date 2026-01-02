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
 * Creates a slug from a string
 */
export function slugify(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert time string to minutes
 * @param {string} time - Time in HH:MM format
 * @returns {number} Minutes since midnight
 */
export function timeToMinutes(time) {
  const parts = String(time || '00:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return (h % 24) * 60 + (m % 60);
}

/**
 * Convert minutes to time string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time in HH:MM format
 */
export function minutesToTime(minutes) {
  let m = Math.round(minutes);
  while (m < 0) m += 1440;
  while (m >= 1440) m -= 1440;
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Global helper to detect if we are inside a card editor context
 * @param {HTMLElement} element - The element to check from
 */
export function checkIsEditorContext(element) {
  try {
    let el = element;
    while (el) {
      if (el.tagName) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'hui-card-preview' ||
          tag === 'hui-card-editor' ||
          tag === 'hui-dialog-edit-card' ||
          tag === 'ha-dialog' ||
          tag === 'hui-edit-view' ||
          tag === 'hui-edit-card' ||
          tag === 'hui-card-options') {
          return true;
        }
      }
      el = el.parentElement || el.parentNode || el.host;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Logging utility with tags
 */
let loggingEnabled = false;

export const Logger = {
  setEnabled: (enabled) => {
    loggingEnabled = !!enabled;
    console.log('[CRONOSTAR] [SYSTEM] Logger.setEnabled called, loggingEnabled is now', loggingEnabled);
  },
  log: (tag, ...args) => {
    if (loggingEnabled) {
      console.log(`[CRONOSTAR] [${tag}]`, ...args);
    }
  },
  warn: (tag, ...args) => {
    if (loggingEnabled) {
      console.warn(`[CRONOSTAR] [${tag}]`, ...args);
    }
  },
  error: (tag, ...args) => console.error(`[CRONOSTAR] [${tag}]`, ...args),
  
  state: (...args) => Logger.log('STATE', ...args),
  load: (...args) => Logger.log('LOAD', ...args),
  save: (...args) => Logger.log('SAVE', ...args),
  sel: (...args) => Logger.log('SEL', ...args),
  memo: (...args) => Logger.log('MEMO', ...args),
  diff: (...args) => Logger.log('DIFF', ...args),
  key: (...args) => Logger.log('KEY', ...args),
  base: (...args) => Logger.log('BASE', ...args),
  chart: (...args) => Logger.log('CHART', ...args),
};

window.Logger = Logger;
