import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardLifecycle } from '../../src/core/CardLifecycle.js';

describe('CardLifecycle', () => {
  let card;
  let lifecycle;
  let mockHass;

  beforeEach(() => {
    mockHass = {
      language: 'en',
      states: {},
      callWS: vi.fn(),
      services: {
        cronostar: { apply_now: {} }
      }
    };
    card = {
      config: { global_prefix: 'test_' },
      hass: mockHass,
      requestUpdate: vi.fn(),
      shadowRoot: {
        getElementById: vi.fn(),
        querySelector: vi.fn()
      },
      chartManager: { 
        destroy: vi.fn(), 
        initChart: vi.fn(),
        isInitialized: vi.fn(() => false),
        getChart: vi.fn(() => null)
      },
      keyboardHandler: { attachListeners: vi.fn(), detachListeners: vi.fn() },
      pointerHandler: { attachListeners: vi.fn(), detachListeners: vi.fn() },
      cardSync: { updateAutomationSync: vi.fn() },
      stateManager: { setData: vi.fn() },
      profileManager: { lastLoadedProfile: '' }
    };
    lifecycle = new CardLifecycle(card);
  });

  it('should set configuration', () => {
    const config = { type: 'test', target_entity: 'climate.test' };
    lifecycle.setConfig(config);
    expect(card.config.target_entity).toBe('climate.test');
  });

  it('should update hass and check for readiness', () => {
    lifecycle.setHass(mockHass);
    expect(lifecycle._hass).toBe(mockHass);
    expect(card.cronostarReady).toBe(true);
  });

  it('should handle firstUpdated', () => {
    const mockCanvas = {};
    card.shadowRoot.getElementById.mockReturnValue(mockCanvas);
    lifecycle.firstUpdated();
    expect(card.chartManager.initChart).toHaveBeenCalledWith(mockCanvas);
  });

  it('should register card if prefix is available', async () => {
    mockHass.callWS.mockResolvedValue({ response: { profile_name: 'Default' } });
    await lifecycle.registerCard(mockHass);
    expect(mockHass.callWS).toHaveBeenCalledWith(expect.objectContaining({
      service: 'register_card'
    }));
    expect(card.cardId).toBe('cronostar-test');
  });

  it('should cleanup on destroy/cleanup', () => {
    lifecycle.cleanupCard();
    expect(card.chartManager.destroy).toHaveBeenCalled();
  });
});
