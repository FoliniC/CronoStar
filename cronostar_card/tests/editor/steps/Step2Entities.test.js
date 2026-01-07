import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step2Entities } from '../../../src/editor/steps/Step2Entities.js';

describe('Step2Entities', () => {
  let mockEditor;
  let step;

  beforeEach(() => {
    mockEditor = {
      _config: { global_prefix: 'test_' },
      i18n: { _t: vi.fn(k => k) },
      _updateConfig: vi.fn(),
      requestUpdate: vi.fn(),
      _pickerLoaded: true,
      hass: { states: {} }
    };
    step = new Step2Entities(mockEditor);
  });

  it('should toggle feature on', () => {
    step._toggleFeature('enabled_entity', true, 'switch.test_enabled');
    expect(mockEditor._updateConfig).toHaveBeenCalledWith('enabled_entity', 'switch.test_enabled', true);
  });

  it('should toggle feature off', () => {
    step._toggleFeature('enabled_entity', false, 'switch.test_enabled');
    expect(mockEditor._updateConfig).toHaveBeenCalledWith('enabled_entity', '', true);
  });

  it('should return correct include domains', () => {
    mockEditor._selectedPreset = 'thermostat';
    expect(step.getApplyIncludeDomains()).toContain('climate');
  });
});
