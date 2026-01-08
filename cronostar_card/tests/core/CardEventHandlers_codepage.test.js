// tests/core/CardEventHandlers.enhanced.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardEventHandlers } from '../../src/core/CardEventHandlers.js';
import { copyToClipboard } from '../../src/editor/services/service_handlers.js';

vi.mock('../../src/editor/services/service_handlers.js', () => ({
  copyToClipboard: vi.fn()
}));

describe('CardEventHandlers - Enhanced Coverage', () => {
  let card;
  let handlers;

  beforeEach(() => {
    card = {
      isMenuOpen: false,
      keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
      requestUpdate: vi.fn(),
      config: { 
        target_entity: 'climate.test', 
        global_prefix: 'test_',
        preset_type: 'thermostat',
        enabled_entity: 'switch.test_enabled'
      },
      language: 'en',
      localizationManager: { localize: vi.fn((l, k, s, r) => {
        const replacements = r || s || {};
        if (k === 'notify.json_copied') return 'JSON copied!';
        if (k === 'notify.add_profile_success') return 'Profile added!';
        if (k === 'notify.add_profile_error') return `Error adding profile: ${replacements['{error}'] || ''}`;
        if (k === 'notify.delete_profile_success') return 'Profile deleted!';
        if (k === 'notify.delete_profile_error') return `Error deleting profile: ${replacements['{error}'] || ''}`;
        if (k === 'prompt.add_profile_title') return 'Add Profile';
        if (k === 'prompt.add_profile_name') return 'Profile name';
        if (k === 'prompt.delete_profile_confirm') return 'Delete?';
        if (k === 'help.title') return 'Help';
        if (k === 'help.text') return 'Help text';
        return k;
      })},
      stateManager: { 
        getData: vi.fn(() => [{ time: '00:00', value: 20 }, { time: '12:00', value: 25 }]), 
        getNumPoints: vi.fn(() => 2),
        timeToMinutes: vi.fn(t => 0),
        alignSelectedPoints: vi.fn()
      },
      profileManager: { lastLoadedProfile: 'Default', loadProfile: vi.fn(), handleProfileSelection: vi.fn() },
      selectionManager: { 
        selectAll: vi.fn(), 
        clearSelection: vi.fn(), 
        getSelectedPoints: vi.fn(() => [])
      },
      chartManager: { 
        isInitialized: vi.fn(() => true), 
        update: vi.fn(),
        updateChartLabels: vi.fn(),
        updatePointStyling: vi.fn(),
        getChart: vi.fn(() => ({ update: vi.fn() }))
      },
      cardSync: { 
        updateAutomationSync: vi.fn(),
        scheduleAutomationOverlaySuppression: vi.fn()
      },
      cardLifecycle: { updateReadyFlag: vi.fn() },
      hass: { 
        callService: vi.fn().mockResolvedValue({}),
        callWS: vi.fn().mockResolvedValue({ response: {} })
      },
      cronostarReady: true,
      shadowRoot: { 
        querySelector: vi.fn(() => ({ focus: vi.fn() })),
        getElementById: vi.fn(() => ({ style: {} }))
      },
      selectedProfile: 'Default',
      selectedPreset: 'thermostat',
      profileOptions: ['Default', 'Away'],
      isEnabled: true,
      cardId: 'test-card',
      globalSettings: { keyboard: {} },
      entityStates: {},
      isEditorContext: vi.fn(() => false)
    };
    handlers = new CardEventHandlers(card);
    // Explicitly set it again just in case reference semantics are weird
    handlers.card.isEditorContext = vi.fn(() => false);
  });

  describe('handleCopyJson', () => {
    it('should copy JSON fragment successfully', async () => {
      copyToClipboard.mockResolvedValue({ success: true, message: 'Copied!' });
      await handlers.handleCopyJson();
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('"schedule": ['),
        'JSON copied!',
        'Error copying JSON'
      );
    });

    it('should handle copy failure', async () => {
      copyToClipboard.mockResolvedValue({ success: false, message: 'Failed' });
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      await handlers.handleCopyJson();
      expect(showNotificationSpy).toHaveBeenCalledWith('Failed', 'error');
    });

    it('should handle errors during JSON generation', async () => {
      card.stateManager.getData.mockImplementation(() => { throw new Error('Boom'); });
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      await handlers.handleCopyJson();
      expect(showNotificationSpy).toHaveBeenCalledWith('Failed to copy JSON', 'error');
    });
  });

  describe('handleAddProfile', () => {
    beforeEach(() => {
      global.document.body.innerHTML = '';
    });

    it('should show error if hass not available', async () => {
      card.hass = null;
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      await handlers.handleAddProfile();
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('Error adding profile'), 'error');
    });

    it('should open add profile dialog', async () => {
      const dialogPromise = handlers._openAddProfileDialog();
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const overlay = document.querySelector('[style*="position: fixed"]');
      expect(overlay).toBeTruthy();
      
      // Cancel dialog
      const cancelBtn = overlay.querySelector('button');
      cancelBtn?.click();
      
      const result = await dialogPromise;
      expect(result).toBeNull();
    });

    it('should create profile when user confirms', async () => {
      card.hass.callWS.mockResolvedValue({ response: { files: [] } });
      
      const dialogPromise = handlers._openAddProfileDialog();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const input = document.querySelector('input');
      if (input) {
        input.value = 'NewProfile';
        const okBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create'));
        okBtn?.click();
      }
      
      const result = await dialogPromise;
      expect(result).toBe('NewProfile');
    });

    it('should handle profile already exists error', async () => {
      card.profileOptions = ['Existing'];
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      
      // Mock dialog to return existing name
      vi.spyOn(handlers, '_openAddProfileDialog').mockResolvedValue('Existing');
      
      await handlers.handleAddProfile();
      // Should find "already exists" in the error message, now constructed by updated localize mock
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'), 'error');
    });

    it('should handle service call failure', async () => {
      card.hass.callService.mockRejectedValue(new Error('Service failed'));
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      
      vi.spyOn(handlers, '_openAddProfileDialog').mockResolvedValue('NewProfile');
      
      await handlers.handleAddProfile();
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('Error adding profile'), 'error');
    });
  });

  describe('handleDeleteProfile', () => {
    it('should show error if hass not available', async () => {
      card.hass = null;
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      await handlers.handleDeleteProfile();
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('Error deleting profile'), 'error');
    });

    it('should show error if no profile selected', async () => {
      card.selectedProfile = '';
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      await handlers.handleDeleteProfile();
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('No profile selected'), 'error');
    });

    it('should not delete if user cancels confirmation', async () => {
      global.confirm = vi.fn(() => false);
      await handlers.handleDeleteProfile();
      expect(card.hass.callService).not.toHaveBeenCalled();
    });

    it('should delete profile successfully', async () => {
      global.confirm = vi.fn(() => true);
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      
      await handlers.handleDeleteProfile();
      
      expect(card.hass.callService).toHaveBeenCalledWith('cronostar', 'delete_profile', expect.anything());
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('Profile deleted!'), 'success');
    });

    it('should handle service call failure', async () => {
      global.confirm = vi.fn(() => true);
      card.hass.callService.mockRejectedValue(new Error('Delete failed'));
      const showNotificationSpy = vi.spyOn(handlers, 'showNotification');
      
      await handlers.handleDeleteProfile();
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining('Error deleting profile'), 'error');
    });
  });

  describe('handleHelp', () => {
    beforeEach(() => {
      global.document.body.innerHTML = '';
    });

    it('should display help dialog with all sections', () => {
      handlers.handleHelp();
      
      const dialog = document.querySelector('[style*="position: fixed"]');
      expect(dialog).toBeTruthy();
      expect(dialog.textContent).toContain('Help');
    });

    it('should show technical details section', () => {
      handlers.handleHelp();
      
      const textarea = document.querySelector('textarea');
      expect(textarea).toBeTruthy();
      expect(textarea.value).toContain('Card ID');
      expect(textarea.value).toContain('Version');
    });

    it('should handle copy technical details', async () => {
      copyToClipboard.mockResolvedValue({ success: true, message: 'Copied!' });
      
      handlers.handleHelp();
      
      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Copy'));
      copyBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(copyToClipboard).toHaveBeenCalled();
    });

    it('should close dialog on close button click', () => {
      handlers.handleHelp();
      
      const closeBtn = document.querySelector('[style*="font-size: 24px"]');
      closeBtn?.click();
      
      expect(document.querySelector('[style*="position: fixed"]')).toBeFalsy();
    });
  });

  describe('toggleEnabled', () => {
    it('should handle toggle successfully', async () => {
      const event = { target: { checked: false } };
      await handlers.toggleEnabled(event);
      
      expect(card.hass.callService).toHaveBeenCalledWith('switch', 'turn_off', expect.anything());
      expect(card.isEnabled).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      card.hass.callService.mockRejectedValue(new Error('Toggle failed'));
      const event = { target: { checked: true } };
      
      // Should not throw
      await expect(handlers.toggleEnabled(event)).resolves.not.toThrow();
    });

    it('should handle missing entity_id', async () => {
      card.config.enabled_entity = null;
      const event = { target: { checked: true } };
      
      await handlers.toggleEnabled(event);
      expect(card.hass.callService).not.toHaveBeenCalled();
    });
  });

  describe('showNotification', () => {
    it('should show notification via hass', () => {
      handlers.showNotification('Test message', 'success');
      
      expect(card.hass.callService).toHaveBeenCalledWith(
        'persistent_notification',
        'create',
        expect.objectContaining({
          message: 'Test message',
          title: expect.stringContaining('Success')
        })
      );
    });

    it('should auto-dismiss success notifications', () => {
      vi.useFakeTimers();
      handlers.showNotification('Success', 'success');
      
      vi.advanceTimersByTime(5000);
      
      expect(card.hass.callService).toHaveBeenCalledWith(
        'persistent_notification',
        'dismiss',
        expect.anything()
      );
      
      vi.useRealTimers();
    });

    it('should handle hass not available', () => {
      card.hass = null;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      handlers.showNotification('Test', 'error');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('handleCardClick', () => {
    it('should close menu when clicking outside', () => {
      card.isMenuOpen = true;
      const event = { target: { closest: vi.fn(() => null) } };
      
      handlers.handleCardClick(event);
      
      expect(card.isMenuOpen).toBe(false);
      expect(card.keyboardHandler.enable).toHaveBeenCalled();
    });

    it('should not close menu when clicking inside', () => {
      card.isMenuOpen = true;
      const event = { target: { closest: vi.fn(() => ({})) } };
      
      handlers.handleCardClick(event);
      
      expect(card.isMenuOpen).toBe(true);
    });
  });

  describe('_fetchProfileNameSuggestions', () => {
    it('should fetch suggestions from other cards', async () => {
      card.hass.callWS.mockResolvedValue({
        response: {
          thermostat: {
            files: [
              {
                filename: 'other_prefix_data.json',
                profiles: ['Summer', 'Winter']
              }
            ]
          }
        }
      });
      
      const suggestions = await handlers._fetchProfileNameSuggestions('thermostat');
      
      expect(suggestions).toContain('Summer');
      expect(suggestions).toContain('Winter');
    });

    it('should exclude current card profiles', async () => {
      card.config.global_prefix = 'test_';
      card.profileOptions = ['Default'];
      
      card.hass.callWS.mockResolvedValue({
        response: {
          thermostat: {
            files: [
              {
                filename: 'test_data.json',
                profiles: ['Default', 'Away']
              }
            ]
          }
        }
      });
      
      const suggestions = await handlers._fetchProfileNameSuggestions('thermostat');
      
      expect(suggestions).not.toContain('Default');
    });

    it('should handle errors gracefully', async () => {
      card.hass.callWS.mockRejectedValue(new Error('WS failed'));
      
      const suggestions = await handlers._fetchProfileNameSuggestions('thermostat');
      
      expect(suggestions).toEqual([]);
    });
  });
});