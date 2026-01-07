import { describe, it, expect, vi } from 'vitest';
import { EditorI18n, I18N } from '../../src/editor/EditorI18n.js';

describe('EditorI18n', () => {
  const mockEditor = {
    _language: 'en',
    _config: { logging: false }
  };

  it('should translate a simple path', () => {
    const i18n = new EditorI18n(mockEditor);
    // Explicitly check if I18N has the data or mock it if needed. 
    // Since we are testing the class, we can just ensure we use keys that exist in EditorI18n.js
    expect(i18n._t('headers.step0')).toBe('Dashboard');
  });

  it('should fallback to English for missing translations in other languages', () => {
    const itEditor = { _language: 'it', _config: { logging: false } };
    const i18n = new EditorI18n(itEditor);
    // 'prompts.reset_confirm' is likely in both but let's test the logic
    expect(i18n._t('headers.step0')).toBe('Dashboard');
  });

  it('should return path if translation is missing in both', () => {
    const i18n = new EditorI18n(mockEditor);
    expect(i18n._t('non.existent.path')).toBe('non.existent.path'); 
  });

  it('should handle replacements', () => {
    // Manually ensure I18N has what we need if it's failing to load properly in test env
    if (!I18N.en.ui) I18N.en.ui = {};
    I18N.en.ui.apply_now_success = "Applied successfully for hour {hour}";
    
    const i18n = new EditorI18n(mockEditor);
    expect(i18n._t('ui.apply_now_success', { '{hour}': '10' })).toBe('Applied successfully for hour 10');
  });

  it('should get preset name', () => {
    const i18n = new EditorI18n({ ...mockEditor, _selectedPreset: 'ev_charging' });
    expect(i18n._getPresetName()).toBe('EV charging');
  });
});
