import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardEventHandlers } from '../../src/core/CardEventHandlers.js';

describe('CardEventHandlers', () => {
  let card;
  let handlers;

  beforeEach(() => {
    card = {
      isMenuOpen: false,
      keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
      requestUpdate: vi.fn(),
      config: { target_entity: 'climate.test', global_prefix: 'test_' },
      language: 'en',
      localizationManager: { localize: vi.fn((l, k) => k) },
      stateManager: { 
        getData: vi.fn(() => []), 
        getNumPoints: vi.fn(() => 2),
        timeToMinutes: vi.fn(t => 0) 
      },
      profileManager: { lastLoadedProfile: 'Default', loadProfile: vi.fn() },
      selectionManager: { selectAll: vi.fn(), clearSelection: vi.fn(), getSelectedPoints: vi.fn(() => []) },
      chartManager: { 
        isInitialized: vi.fn(() => false), 
        update: vi.fn(),
        updateChartLabels: vi.fn(),
        updatePointStyling: vi.fn()
      },
      cardSync: { 
        updateAutomationSync: vi.fn(),
        scheduleAutomationOverlaySuppression: vi.fn()
      },
      cardLifecycle: { updateReadyFlag: vi.fn() },
      hass: { callService: vi.fn().mockResolvedValue({}) },
      cronostarReady: true,
      shadowRoot: { querySelector: vi.fn() }
    };
    handlers = new CardEventHandlers(card);
  });

  it('should toggle menu', () => {
    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(true);
    expect(card.keyboardHandler.disable).toHaveBeenCalled();
    
    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(false);
    expect(card.keyboardHandler.enable).toHaveBeenCalled();
  });

  it('should handle language selection', async () => {
    await handlers.handleLanguageSelect('it');
    expect(card.language).toBe('it');
    expect(card.hass.callService).toHaveBeenCalledWith('cronostar', 'save_profile', expect.anything());
  });

  it('should handle select all', () => {
    handlers.handleSelectAll();
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
    expect(card.isMenuOpen).toBe(false);
  });

  it('should handle delete selected (skipping boundaries)', () => {
    card.selectionManager.getSelectedPoints.mockReturnValue([0, 1]); // 0 and 1 are boundaries for length 2
    card.stateManager.removePoint = vi.fn();
    
    handlers.handleDeleteSelected();
    expect(card.stateManager.removePoint).not.toHaveBeenCalled();
  });

  it('should handle apply now', async () => {
    await handlers.handleApplyNow();
    expect(card.hass.callService).toHaveBeenCalledWith('cronostar', 'apply_now', expect.anything());
  });
});
