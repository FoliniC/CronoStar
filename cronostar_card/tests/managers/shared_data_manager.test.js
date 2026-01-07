import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharedDataManager } from '../../src/managers/shared_data_manager.js';

describe('SharedDataManager', () => {
  let card;
  let manager;

  beforeEach(() => {
    card = {
      config: {
        global_prefix: 'cronostar_thermostat_',
        unit_of_measurement: '°C',
        min_value: 15,
        max_value: 30,
        step_value: 0.5
      },
      hourBase: 0,
      hass: {
        callService: vi.fn(),
        states: {}
      }
    };
    manager = new SharedDataManager(card);
    global.fetch = vi.fn();
  });

  describe('getProfileFilename', () => {
    it('should build correct filename', () => {
      expect(manager.getProfileFilename('Any')).toBe('cronostar_thermostat_cronostar_thermostat_data.json');
    });
  });

  describe('getPresetType', () => {
    it('should extract preset type from prefix', () => {
      expect(manager.getPresetType()).toBe('thermostat');
      card.config.global_prefix = 'cronostar_ev_charging_';
      expect(manager.getPresetType()).toBe('ev_charging');
    });
  });

  describe('validateProfileData', () => {
    it('should validate correct schedule structure', () => {
      const data = { schedule: new Array(24).fill(20) };
      expect(manager.validateProfileData(data)).toBe(true);
    });

    it('should validate simple array structure', () => {
      const data = new Array(24).fill(20);
      expect(manager.validateProfileData(data)).toBe(true);
    });

    it('should invalidate incorrect structures', () => {
      expect(manager.validateProfileData({ schedule: [1] })).toBe(false);
      expect(manager.validateProfileData([1, 2, 3])).toBe(false);
      expect(manager.validateProfileData(null)).toBe(false);
    });
  });

  describe('loadProfile', () => {
    it('should load and cache profile data', async () => {
      const mockData = { schedule: new Array(24).fill(22) };
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const data = await manager.loadProfile('Default');
      expect(data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalled();

      // Second call should use cache
      global.fetch.mockClear();
      const cachedData = await manager.loadProfile('Default');
      expect(cachedData).toEqual(mockData);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null if profile not found', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const data = await manager.loadProfile('Missing');
      expect(data).toBeNull();
    });
  });

  describe('saveProfile', () => {
    it('should call HA service with correct data', async () => {
      const schedule = new Array(24).fill(21);
      const result = await manager.saveProfile('Summer', schedule);

      expect(result).toBe(true);
      expect(card.hass.callService).toHaveBeenCalledWith(
        'script',
        'cronostar_save_profile',
        expect.objectContaining({
          profile_name: 'Summer',
          hour_base: 0
        })
      );
    });
  });
});
