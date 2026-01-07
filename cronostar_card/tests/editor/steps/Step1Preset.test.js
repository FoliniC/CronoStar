import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step1Preset } from '../../../src/editor/steps/Step1Preset.js';

describe('Step1Preset', () => {
  let mockEditor;
  let step;

  beforeEach(() => {
    mockEditor = {
      _config: { global_prefix: 'test_', target_entity: 'climate.test' },
      _selectedPreset: 'thermostat',
      i18n: { _t: vi.fn(k => k) },
      _updateConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      hass: { states: {} }
    };
    step = new Step1Preset(mockEditor);
  });

  it('should select preset and update config', () => {
    step.selectPresetWithPrefix('ev_charging');
    expect(mockEditor._selectedPreset).toBe('ev_charging');
    expect(mockEditor._updateConfig).toHaveBeenCalledWith('preset_type', 'ev_charging');
    expect(mockEditor._updateConfig).toHaveBeenCalledWith('global_prefix', 'cronostar_ev_charging_');
  });

  it('should handle prefix change', () => {
    const event = { target: { value: 'new_prefix', selectionStart: 0, selectionEnd: 0 } };
    step._handlePrefixChange('new_prefix', event);
    expect(mockEditor._config.global_prefix).toBe('new_prefix_');
    expect(mockEditor.requestUpdate).toHaveBeenCalled();
  });

  it('should return correct include domains', () => {
    mockEditor._selectedPreset = 'thermostat';
    expect(step.getApplyIncludeDomains()).toContain('climate');
    
    mockEditor._selectedPreset = 'ev_charging';
    expect(step.getApplyIncludeDomains()).toContain('number');
  });
});
