import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardContext } from '../../src/core/CardContext.js';

describe('CardContext', () => {
  let card;
  let context;

  beforeEach(() => {
    card = {
      hass: { states: {} },
      config: { type: 'test' },
      language: 'en',
      selectedPreset: 'thermostat',
      selectedProfile: 'Default',
      hasUnsavedChanges: false,
      requestUpdate: vi.fn()
    };
    context = new CardContext(card);
  });

  it('should expose card properties through getters', () => {
    expect(context.hass).toBe(card.hass);
    expect(context.config).toBe(card.config);
    expect(context.language).toBe(card.language);
    expect(context.selectedPreset).toBe(card.selectedPreset);
    expect(context.selectedProfile).toBe(card.selectedProfile);
    expect(context.hasUnsavedChanges).toBe(card.hasUnsavedChanges);
  });

  it('should update card properties and emit events through setters', () => {
    const changesSpy = vi.fn();
    const profileSpy = vi.fn();
    context.events.on('unsaved:changes', changesSpy);
    context.events.on('profile:changed', profileSpy);

    context.hasUnsavedChanges = true;
    expect(card.hasUnsavedChanges).toBe(true);
    expect(changesSpy).toHaveBeenCalledWith(true);

    context.selectedProfile = 'Away';
    expect(card.selectedProfile).toBe('Away');
    expect(profileSpy).toHaveBeenCalledWith('Away');
  });

  it('should register and retrieve managers', () => {
    const mockManager = { id: 1 };
    context.registerManager('test', mockManager);
    expect(context.getManager('test')).toBe(mockManager);
  });

  it('should delegate requestUpdate to card', () => {
    context.requestUpdate();
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it('should cleanup on destroy', () => {
    const mockManager = { id: 1 };
    context.registerManager('test', mockManager);
    context.destroy();
    expect(context.getManager('test')).toBeUndefined();
  });
});
