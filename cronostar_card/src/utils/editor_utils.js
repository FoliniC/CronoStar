/**
 * Utility functions for CronoStar Editor
 */

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
 * Formats hour string with padding
 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Gets hours list based on hour_base and interval
 * @param {number|string} hourBase - 0 or 1
 * @param {number} intervalMinutes - Default 60
 */
export function getHoursList(hourBase, intervalMinutes = 60) {
  const points = Math.floor(1440 / intervalMinutes);
  const base = hourBase === '1' || hourBase === 1 ? 1 : 0;
  
  if (base === 1 && intervalMinutes === 60) {
    // 1-based indexing for hourly (legacy support 01..24)
    return Array.from({ length: points }, (_, i) => pad2(i + 1));
  }
  
  // 0-based indexing for all others (00..23, 00..47, etc.)
  return Array.from({ length: points }, (_, i) => pad2(i));
}

/**
 * Escapes HTML special characters
 */
export function escapeHtml(s) {
  try {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } catch {
    return s;
  }
}
