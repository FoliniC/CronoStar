/**
 * Utility functions for handling prefixes in CronoStar Editor
 */

/**
 * Normalizes a prefix to ensure it ends with underscore
 */
export function normalizePrefix(prefix) {
  if (!prefix) return "";
  const s = prefix.trim().toLowerCase();
  return s.endsWith("_") ? s : `${s}_`;
}

/**
 * Validates if a prefix is in correct format
 */
export function isValidPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return false;
  return /^[a-z0-9_]+_$/.test(prefix);
}

/**
 * Humanizes a prefix for display (removes cronostar_ and underscores)
 */
export function humanizePrefix(prefix, language = 'en') {
  try {
    let s = String(prefix || '').trim();
    if (!s) return language === 'it' ? 'programma' : 'schedule';
    s = s.replace(/_+$/, '');
    s = s.replace(/^cronostar_/, '');
    s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return s || (language === 'it' ? 'programma' : 'schedule');
  } catch {
    return language === 'it' ? 'programma' : 'schedule';
  }
}

/**
 * Gets the effective prefix (global_prefix or entity_prefix)
 */
export function getEffectivePrefix(config) {
  const globalPrefix = (config.global_prefix || '').trim();
  const entityPrefix = (config.entity_prefix || '').trim();
  return globalPrefix || entityPrefix || 'cronostar_';
}

/**
 * Gets the alias for automation with correct prefix
 */
export function getAliasWithPrefix(prefix, language = 'en') {
  const verb = language === 'it' ? 'applica' : 'apply';
  const human = humanizePrefix(prefix, language);
  return `CronoStar - ${verb} ${human}`;
}