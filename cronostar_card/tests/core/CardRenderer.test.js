import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardRenderer } from '../../src/core/CardRenderer.js';

describe('CardRenderer', () => {
  let card;
  let renderer;

  beforeEach(() => {
    card = {
      config: { 
        type: 'custom:cronostar-card',
        global_prefix: 'cronostar_thermostat_test_',
        target_entity: 'climate.test'
      },
      language: 'en',
      localizationManager: {
        localize: vi.fn((l, k) => k)
      },
      cardLifecycle: {
        isEditorContext: vi.fn(() => false),
        isPickerPreviewContext: vi.fn(() => false)
      },
      eventHandlers: {
        handleCardClick: vi.fn(),
        toggleMenu: vi.fn()
      },
      selectionManager: {},
      initialLoadComplete: true,
      cronostarReady: true,
      missingEntities: [],
      awaitingAutomation: false
    };
    renderer = new CardRenderer(card);
  });

  it('should return empty template if config missing', () => {
    card.config = null;
    const result = renderer.render();
    expect(result.values).toEqual([]);
  });

  it('should show incomplete configuration if global_prefix missing', () => {
    card.config.global_prefix = null;
    const result = renderer.render();
    // result is a TemplateResult from lit-html
    // We can check if it contains the "Configuration Incomplete" text
    // In Vitest with lit, we usually use snapshots or check strings if possible
    expect(card.localizationManager.localize).not.toHaveBeenCalledWith('en', 'ui.title');
  });

  it('should show chart container in normal state', () => {
    const result = renderer.render();
    expect(card.localizationManager.localize).toHaveBeenCalledWith('en', 'preset.thermostat', undefined, undefined);
  });

  it('should show loading data overlay when waiting for data', () => {
    card.initialLoadComplete = false;
    renderer.render();
    expect(card.localizationManager.localize).toHaveBeenCalledWith('en', 'ui.loading_data', undefined, undefined);
  });

  it('should show menu content when isMenuOpen is true', () => {
    card.isMenuOpen = true;
    renderer.render();
    expect(card.localizationManager.localize).toHaveBeenCalledWith('en', 'menu.apply_now', undefined, undefined);
  });
});
