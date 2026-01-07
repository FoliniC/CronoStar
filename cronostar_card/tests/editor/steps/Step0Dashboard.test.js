import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step0Dashboard } from '../../../src/editor/steps/Step0Dashboard.js';

describe('Step0Dashboard', () => {
  let mockEditor;
  let dashboard;

  beforeEach(() => {
    mockEditor = {
      _language: 'en',
      _step: 0,
      _dashboardView: 'choice',
      shadowRoot: {
        querySelector: vi.fn()
      },
      requestUpdate: vi.fn(),
      hass: {
        callWS: vi.fn()
      },
      showToast: vi.fn(),
      _config: { preset_type: 'thermostat', global_prefix: 'test_' }
    };
    dashboard = new Step0Dashboard(mockEditor);
  });

  it('should sync language from card if available', () => {
    mockEditor.shadowRoot.querySelector.mockReturnValue({ language: 'it' });
    dashboard._syncLanguageFromCard();
    expect(mockEditor._language).toBe('it');
  });

  it('should load all profiles', async () => {
    const mockResponse = {
      thermostat: { files: [{ filename: 'test.json', profiles: [{ name: 'Default' }] }] }
    };
    mockEditor.hass.callWS.mockResolvedValue({ response: mockResponse });

    await dashboard._loadAllProfiles();

    expect(mockEditor._dashboardProfilesData).toEqual(mockResponse);
    expect(mockEditor._dashboardLoading).toBe(false);
    expect(mockEditor.requestUpdate).toHaveBeenCalled();
  });

  it('should handle delete profile with confirmation', async () => {
    global.confirm = vi.fn(() => true);
    mockEditor.hass.callService = vi.fn().mockResolvedValue({});
    vi.spyOn(dashboard, '_loadAllProfiles').mockResolvedValue({});

    await dashboard._handleDeleteProfile('thermostat', 'Test', 'test_');

    expect(mockEditor.hass.callService).toHaveBeenCalledWith('cronostar', 'delete_profile', expect.anything());
    expect(mockEditor.showToast).toHaveBeenCalledWith(expect.stringContaining('deleted successfully'), 'success');
  });
});
