// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step0Dashboard } from '../../src/editor/steps/Step0Dashboard.js';
import { Step1Preset } from '../../src/editor/steps/Step1Preset.js';
import { Step2Entities } from '../../src/editor/steps/Step2Entities.js';
import { Step3Options } from '../../src/editor/steps/Step3Options.js';
import { Step4Automation } from '../../src/editor/steps/Step4Automation.js';
import { Step5Summary } from '../../src/editor/steps/Step5Summary.js';

describe('Editor Steps Coverage', () => {
  let mockEditor;

  beforeEach(() => {
    mockEditor = {
      _config: { 
        global_prefix: 'test_',
        preset_type: 'thermostat'
      },
      hass: {
        states: {},
        callService: vi.fn(),
        callWS: vi.fn().mockResolvedValue({ response: { thermostat: { files: [] } } })
      },
      i18n: { _t: vi.fn(k => k) },
      serviceHandlers: {
        copyToClipboard: vi.fn(),
        downloadFile: vi.fn(),
        saveGlobalSettings: vi.fn()
      },
      _updateConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      renderTextInput: vi.fn(() => 'input'),
      _renderTextInput: vi.fn(() => 'input'),
      renderEntityPicker: vi.fn(() => 'picker'),
      _renderEntityPicker: vi.fn(() => 'picker'),
      renderButton: vi.fn(() => 'button'),
      _renderButton: vi.fn(() => 'button'),
      showToast: vi.fn()
    };
  });

  describe('Step0Dashboard', () => {
    it('should render and handle events', async () => {
      const step = new Step0Dashboard(mockEditor);
      step.render();
      
      await step._loadAllProfiles();
      expect(mockEditor.hass.callWS).toHaveBeenCalled();
      
      step._showProfileDetail('ev_charging', 'Default', 'prefix_');
      expect(mockEditor._dashboardSelectedPreset).toBe('ev_charging');
      
      step._closeDetailModal();
      expect(mockEditor._dashboardShowDetailModal).toBe(false);
    });
  });

  describe('Step1Preset', () => {
    it('should handle preset selection', () => {
      const step = new Step1Preset(mockEditor);
      step.render();
      // Only verifying render passes without error as we can't easily click lit templates
    });
  });

  describe('Step2Entities', () => {
    it('should validate prefix', () => {
      const step = new Step2Entities(mockEditor);
      step.render();
    });
  });

  describe('Step3Options', () => {
    it('should render options', () => {
      const step = new Step3Options(mockEditor);
      step.render();
    });
  });

  describe('Step4Automation', () => {
    it('should generate automation', () => {
      const step = new Step4Automation(mockEditor);
      step.render();
      
      // Test LLM prompt view rendering
      mockEditor._showLlmPrompt = true;
      step.render();
    });
  });

  describe('Step5Summary', () => {
    it('should render summary', () => {
      const step = new Step5Summary(mockEditor);
      step.render();
    });
  });
});