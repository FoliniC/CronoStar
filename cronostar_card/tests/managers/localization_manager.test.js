import { describe, it, expect } from 'vitest';
import { LocalizationManager } from '../../src/managers/localization_manager.js';

describe('LocalizationManager', () => {
  const manager = new LocalizationManager();

  it('should localize keys in English', () => {
    expect(manager.localize('en', 'ui.title')).toBe('CronoStar');
  });

  it('should localize keys in Italian', () => {
    expect(manager.localize('it', 'ui.title')).toBe('CronoStar');
    expect(manager.localize('it', 'ui.loading')).toBe('Caricamento…');
  });

  it('should fallback to English if language not found', () => {
    expect(manager.localize('fr', 'ui.title')).toBe('CronoStar');
  });

  it('should return key if translation missing', () => {
    expect(manager.localize('en', 'non.existent.key')).toBe('non.existent.key');
  });

  it('should replace placeholders', () => {
    expect(manager.localize('en', 'ui.apply_now_success', { '{hour}': '12' }))
      .toBe('Applied successfully for hour 12');
  });

  it('should handle search/replace maps', () => {
    expect(manager.localize('en', 'prompt.delete_profile_confirm', { '{profile}': 'Test' }))
      .toBe("Delete profile 'Test'?");
  });
});
