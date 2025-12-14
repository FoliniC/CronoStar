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
 * Gets hours list based on hour_base
 */
export function getHoursList(hourBase) {
  const base = hourBase === '1' || hourBase === 1 ? 1 : 0;
  if (base === 1) {
    return Array.from({ length: 24 }, (_, i) => pad2(i + 1));
  }
  return Array.from({ length: 24 }, (_, i) => pad2(i));
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
