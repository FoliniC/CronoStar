import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step3Options } from '../../../src/editor/steps/Step3Options.js';

describe('Step3Options', () => {
  let mockEditor;
  let step;

  beforeEach(() => {
    mockEditor = {
      _config: { global_prefix: 'test_' },
      i18n: { _t: vi.fn(k => k) },
      _updateConfig: vi.fn(),
      requestUpdate: vi.fn(),
      renderTextInput: vi.fn(),
      _handleLocalUpdate: vi.fn(),
      _language: 'en',
      serviceHandlers: { saveGlobalSettings: vi.fn() },
      getRootNode: vi.fn(() => ({ host: { globalSettings: {} } }))
    };
    step = new Step3Options(mockEditor);
  });

  it('should update keyboard config', () => {
    step._updateKeyboardConfig('ctrl', 'h', '2');
    expect(mockEditor._updateConfig).toHaveBeenCalledWith('kb_ctrl_h', 2);
  });

  it('should save global settings', async () => {
    await step._saveGlobalSettings();
    expect(mockEditor.serviceHandlers.saveGlobalSettings).toHaveBeenCalled();
  });
});
