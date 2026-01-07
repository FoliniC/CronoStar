import { describe, it, expect } from 'vitest';
import { normalizePrefix, isValidPrefix, humanizePrefix, getEffectivePrefix, getAliasWithPrefix } from '../../src/utils/prefix_utils.js';

describe('prefix_utils', () => {
  describe('normalizePrefix', () => {
    it('should add underscore if missing', () => {
      expect(normalizePrefix('test')).toBe('test_');
    });

    it('should not add underscore if already present', () => {
      expect(normalizePrefix('test_')).toBe('test_');
    });

    it('should lowercase and trim', () => {
      expect(normalizePrefix('  TEST  ')).toBe('test_');
    });

    it('should return empty string for null/empty', () => {
      expect(normalizePrefix('')).toBe('');
      expect(normalizePrefix(null)).toBe('');
    });
  });

  describe('isValidPrefix', () => {
    it('should return true for valid formats', () => {
      expect(isValidPrefix('test_')).toBe(true);
      expect(isValidPrefix('cronostar_test_')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidPrefix('test')).toBe(false);
      expect(isValidPrefix('Test_')).toBe(false);
      expect(isValidPrefix('test-1_')).toBe(false);
      expect(isValidPrefix('')).toBe(false);
    });
  });

  describe('humanizePrefix', () => {
    it('should clean up the prefix for display', () => {
      expect(humanizePrefix('cronostar_living_room_')).toBe('living room');
    });

    it('should return default if prefix is empty', () => {
      expect(humanizePrefix('', 'en')).toBe('schedule');
      expect(humanizePrefix('', 'it')).toBe('programma');
    });
  });

  describe('getEffectivePrefix', () => {
    it('should return global_prefix if provided', () => {
      expect(getEffectivePrefix({ global_prefix: 'my_prefix_' })).toBe('my_prefix_');
    });

    it('should return default if missing', () => {
      expect(getEffectivePrefix({})).toBe('cronostar_');
    });
  });

  describe('getAliasWithPrefix', () => {
    it('should build a localized alias', () => {
      expect(getAliasWithPrefix('living_room_', 'en')).toBe('CronoStar - apply living room');
      expect(getAliasWithPrefix('living_room_', 'it')).toBe('CronoStar - applica living room');
    });
  });
});
