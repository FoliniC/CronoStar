/**
 * Utility functions for building filenames in CronoStar Editor
 */
import { normalizePrefix } from './prefix_utils.js';

/**
 * Builds the profile filename using the correct prefix and preset
 * Standard: cronostar_<preset>_<prefix>data.json
 */
export function buildProfileFilename(preset, prefix) {
  const normalizedPrefix = normalizePrefix(prefix);
  const cleanPrefix = normalizedPrefix.replace(/_+$/, '');
  return `cronostar_${preset}_${cleanPrefix}_data.json`;
}

/**
 * Builds the helpers filename
 */
export function buildHelpersFilename(prefix) {
  const normalizedPrefix = normalizePrefix(prefix);
  // Required naming: <Identification Prefix>_package.yaml
  // normalizedPrefix already ends with "_", so appending yields "..._package.yaml"
  return `${normalizedPrefix}package.yaml`;
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
