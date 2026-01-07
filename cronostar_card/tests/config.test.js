import { describe, it, expect } from 'vitest';
import { 
  validateConfig, 
  normalizeHourBase, 
  extractCardConfig,
  CARD_CONFIG_PRESETS,
  DEFAULT_CONFIG
} from '../src/config.js';

describe('config', () => {
  describe('normalizeHourBase', () => {
    it('should handle numeric values', () => {
      expect(normalizeHourBase(0)).toEqual({ value: 0, determined: true });
      expect(normalizeHourBase(1)).toEqual({ value: 1, determined: true });
    });

    it('should handle string values', () => {
      expect(normalizeHourBase('0')).toEqual({ value: 0, determined: true });
      expect(normalizeHourBase('zero')).toEqual({ value: 0, determined: true });
      expect(normalizeHourBase('1')).toEqual({ value: 1, determined: true });
      expect(normalizeHourBase('one')).toEqual({ value: 1, determined: true });
    });

    it('should handle auto/invalid values', () => {
      expect(normalizeHourBase('auto')).toEqual({ value: 0, determined: false });
      expect(normalizeHourBase(null)).toEqual({ value: 0, determined: false });
    });
  });

  describe('validateConfig', () => {
    it('should migrate legacy preset to preset_type', () => {
      const config = { type: 'custom:card', preset: 'ev_charging' };
      const validated = validateConfig(config);
      expect(validated.preset_type).toBe('ev_charging');
      expect(validated.preset).toBeUndefined();
    });

    it('should infer preset from global_prefix', () => {
      const config = { global_prefix: 'cronostar_ev_charging_test_' };
      const validated = validateConfig(config);
      expect(validated.preset_type).toBe('ev_charging');
    });

    it('should use default preset if none provided', () => {
      const validated = validateConfig({});
      expect(validated.preset_type).toBe('thermostat');
    });

    it('should merge preset defaults', () => {
      const config = { preset_type: 'ev_charging' };
      const validated = validateConfig(config);
      expect(validated.min_value).toBe(0);
      expect(validated.max_value).toBe(8.0);
      expect(validated.unit_of_measurement).toBe('kW');
    });

    it('should preserve user overrides', () => {
      const config = { preset_type: 'thermostat', min_value: 10, max_value: 40 };
      const validated = validateConfig(config);
      expect(validated.min_value).toBe(10);
      expect(validated.max_value).toBe(40);
    });

    it('should generate default entities based on prefix', () => {
      const config = { global_prefix: 'my_test_' };
      const validated = validateConfig(config);
      expect(validated.enabled_entity).toBe('switch.my_test_enabled');
      expect(validated.profiles_select_entity).toBe('select.my_test_current_profile');
    });

    it('should not generate entities if not_configured is set', () => {
      const config = { not_configured: true };
      const validated = validateConfig(config);
      expect(validated.enabled_entity).toBeNull();
    });
  });

  describe('extractCardConfig', () => {
    it('should filter only valid keys', () => {
      const src = {
        type: 'custom:card',
        preset_type: 'thermostat',
        garbage: 'value',
        another_garbage: 123
      };
      const extracted = extractCardConfig(src);
      expect(extracted).toEqual({
        type: 'custom:card',
        preset_type: 'thermostat'
      });
    });

    it('should throw error if legacy preset key found in metadata', () => {
      const src = { preset: 'thermostat', global_prefix: 'test_' };
      expect(() => extractCardConfig(src)).toThrow(/Configuration error/);
    });

    it('should provide default type if missing', () => {
      const extracted = extractCardConfig({});
      expect(extracted.type).toBe('custom:cronostar-card');
    });
  });
});
