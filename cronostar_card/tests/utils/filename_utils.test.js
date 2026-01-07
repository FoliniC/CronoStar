import { describe, it, expect } from 'vitest';
import { buildProfileFilename, buildHelpersFilename, buildAutomationFilename, getExpectedAutomationId } from '../../src/utils/filename_utils.js';

describe('filename_utils', () => {
  const prefix = 'living_room_';
  const preset = 'thermostat';

  describe('buildProfileFilename', () => {
    it('should build the correct profile filename', () => {
      expect(buildProfileFilename(preset, prefix)).toBe('cronostar_thermostat_living_room_data.json');
    });

    it('should handle prefix without underscore', () => {
      expect(buildProfileFilename(preset, 'living')).toBe('cronostar_thermostat_living_data.json');
    });
  });

  describe('buildHelpersFilename', () => {
    it('should build the correct package filename', () => {
      expect(buildHelpersFilename(prefix)).toBe('living_room_package.yaml');
    });
  });

  describe('buildAutomationFilename', () => {
    it('should build the correct automation filename', () => {
      expect(buildAutomationFilename(prefix)).toBe('living_room_automation.yaml');
    });
  });

  describe('getExpectedAutomationId', () => {
    it('should return the correct automation ID', () => {
      expect(getExpectedAutomationId(prefix)).toBe('living_room_apply');
    });
  });
});
