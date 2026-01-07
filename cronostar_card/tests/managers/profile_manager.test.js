import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileManager } from '../../src/managers/profile_manager.js';
import { Events } from '../../src/core/EventBus.js';

describe('ProfileManager', () => {
  let context;
  let manager;
  let mockHass;
  let stateManager;

  beforeEach(() => {
    stateManager = {
      setData: vi.fn(),
      getData: vi.fn(() => []),
      timeToMinutes: vi.fn(t => {
        const p = t.split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1]);
      })
    };
    mockHass = {
      callWS: vi.fn(),
      callService: vi.fn()
    };
    context = {
      config: { global_prefix: 'test_' },
      hass: mockHass,
      selectedPreset: 'thermostat',
      events: {
        emit: vi.fn()
      },
      getManager: vi.fn(name => name === 'state' ? stateManager : null),
      requestUpdate: vi.fn(),
      _card: { config: {} }
    };
    manager = new ProfileManager(context);
  });

  describe('loadProfile', () => {
    it('should call load_profile and update state', async () => {
      const mockSchedule = [{ time: '00:00', value: 20 }];
      mockHass.callWS.mockResolvedValue({
        response: { schedule: mockSchedule, meta: { title: 'New Title' } }
      });

      await manager.loadProfile('Default');

      expect(mockHass.callWS).toHaveBeenCalledWith(expect.objectContaining({
        service: 'load_profile',
        service_data: {
          profile_name: 'Default',
          preset_type: 'thermostat',
          global_prefix: 'test_'
        }
      }));
      expect(stateManager.setData).toHaveBeenCalledWith(mockSchedule, true);
      expect(manager.lastLoadedProfile).toBe('Default');
      expect(context.events.emit).toHaveBeenCalledWith(Events.PROFILE_LOADED, expect.anything());
    });

    it('should handle errors gracefully', async () => {
      mockHass.callWS.mockRejectedValue(new Error('Fail'));
      await expect(manager.loadProfile('Default')).rejects.toThrow('Fail');
      expect(manager._isLoading).toBe(false);
    });
  });

  describe('saveProfile', () => {
    it('should call save_profile with correct payload', async () => {
      stateManager.getData.mockReturnValue([{ time: '12:00', value: 25 }]);
      
      await manager.saveProfile('Summer');

      expect(mockHass.callService).toHaveBeenCalledWith(
        'cronostar',
        'save_profile',
        expect.objectContaining({
          profile_name: 'Summer',
          schedule: [{ time: '12:00', value: 25 }]
        })
      );
      expect(context.events.emit).toHaveBeenCalledWith(Events.PROFILE_SAVED, expect.anything());
    });
  });

  describe('handleProfileSelection', () => {
    it('should switch profile if no unsaved changes', async () => {
      mockHass.callWS.mockResolvedValue({ response: { schedule: [] } });
      await manager.handleProfileSelection({ target: { value: 'Away' } });
      
      expect(context.selectedProfile).toBe('Away');
      expect(mockHass.callWS).toHaveBeenCalled();
    });

    it('should show dialog if unsaved changes exist', async () => {
      context.hasUnsavedChanges = true;
      manager.lastLoadedProfile = 'Default';
      
      await manager.handleProfileSelection({ target: { value: 'Away' } });
      
      expect(context._card.showUnsavedChangesDialog).toBe(true);
      expect(context._card.pendingProfileChange).toBe('Away');
      expect(mockHass.callWS).not.toHaveBeenCalled();
    });
  });
});
