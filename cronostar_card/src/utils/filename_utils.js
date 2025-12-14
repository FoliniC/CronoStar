/**
 * Utility functions for building filenames in CronoStar Editor
 */
import { normalizePrefix } from './prefix_utils.js';
import { slugify } from './editor_utils.js';

/**
 * Builds the profile filename using the correct prefix
 */
export function buildProfileFilename(profileName, prefix) {
  const normalizedPrefix = normalizePrefix(prefix);

  const profileSlug = slugify(profileName);
  return `${normalizedPrefix.replace(/_+$/, '')}_${profileSlug}.json`;
}

/**
 * Builds the helpers filename
 */
export function buildHelpersFilename(prefix) {
  const normalizedPrefix = normalizePrefix(prefix);
  return `${normalizedPrefix.replace(/_+$/, '')}_helpers.yaml`;
}

/**
 * Builds the automation filename
 */
export function buildAutomationFilename(prefix) {
  const normalizedPrefix = normalizePrefix(prefix);
  return `${normalizedPrefix.replace(/_+$/, '')}_automation.yaml`;
}

/**
 * Gets the expected automation ID
 */
export function getExpectedAutomationId(prefix) {
  const base = normalizePrefix(prefix).replace(/_+$/, '');
  return `${base}_apply`;
}
