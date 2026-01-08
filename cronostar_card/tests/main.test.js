// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockCronoStarCard extends HTMLElement {}
  class MockCronoStarEditor extends HTMLElement {}
  return {
    CronoStarCard: MockCronoStarCard,
    CronoStarEditor: MockCronoStarEditor,
  };
});

vi.mock('../src/core/CronoStar.js', () => ({
  CronoStarCard: mocks.CronoStarCard,
}));

vi.mock('../src/editor/CronoStarEditor.js', () => ({
  CronoStarEditor: mocks.CronoStarEditor,
}));

vi.mock('../src/config.js', () => ({
  VERSION: 'test_version',
  CARD_CONFIG_PRESETS: { preset1: 'data1' },
}));

describe('main.js', () => {
  let customElementsDefineSpy;
  let customElementsGetSpy;
  let customElementsWhenDefinedSpy;
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.resetModules();
    
    // Reset window and globals
    global.window = window;
    global.customElements = window.customElements;
    global.document = window.document;
    global.globalThis = window;

    // Spies - STRICT MOCKING to avoid side effects
    // Always return undefined for get to simulate clean registry
    customElementsGetSpy = vi.spyOn(customElements, 'get').mockReturnValue(undefined);
    // Mock define to do nothing so it doesn't throw
    customElementsDefineSpy = vi.spyOn(customElements, 'define').mockImplementation(() => {});
    
    customElementsWhenDefinedSpy = vi.spyOn(customElements, 'whenDefined').mockImplementation(() => Promise.resolve());
    
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear customCards
    window.customCards = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.ScopedRegistryHost;
  });

  it('should expose PRESETS, CronoStarCard, and CronoStarEditor globally', async () => {
    await import('../src/main.js');
    
    expect(window.PRESETS).toEqual({ preset1: 'data1' });
    expect(window.CronoStarCard).toBe(mocks.CronoStarCard);
    expect(window.CronoStarEditor).toBe(mocks.CronoStarEditor);
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: window.CronoStarCard assigned:', true);
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: window.CronoStarEditor assigned:', true);
  });

  describe('global custom element registration', () => {
    it('should register cronostar-card and editor elements globally', async () => {
      await import('../src/main.js');

      // Check for both standard and custom: prefixed names
      expect(customElementsDefineSpy).toHaveBeenCalledWith('cronostar-card', mocks.CronoStarCard);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('custom:cronostar-card', mocks.CronoStarCard);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('cronostar-card-editor', mocks.CronoStarEditor);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('custom:cronostar-card-editor', mocks.CronoStarEditor);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ "cronostar-card" registrato in global'));
    });

    it('should warn if registry is null during registration', async () => {
      // Simulate define throwing error that indicates it's already used
      customElementsDefineSpy.mockImplementation((name) => {
        if (name === 'cronostar-card') {
          throw new Error('cronostar-card has already been used');
        }
      });

      await import('../src/main.js');
      
      // main.js logs this specific message when it catches the error
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cronostar-card" risulta già definito in global'));
    });

    it('should log if element is already defined', async () => {
      // Mock get to return something for cronostar-card
      customElementsGetSpy.mockImplementation((name) => {
        if (name === 'cronostar-card') return mocks.CronoStarCard;
        return undefined;
      });

      await import('../src/main.js');

      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: "cronostar-card" già registrato in global');
      // Should NOT call define for cronostar-card
      expect(customElementsDefineSpy).not.toHaveBeenCalledWith('cronostar-card', mocks.CronoStarCard);
    });

    it('should log an error if define fails for an unknown reason', async () => {
      customElementsDefineSpy.mockImplementation((name) => {
        if (name === 'cronostar-card') {
          throw new Error('Unknown error during define');
        }
      });
    
      await import('../src/main.js');
    
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRONOSTAR: ❌ Errore registrazione "cronostar-card" in global:'),
        expect.any(Error)
      );
    });
  });

  describe('ScopedRegistryHost patching', () => {
    it('should not patch if ScopedRegistryHost is not defined', async () => {
      delete window.ScopedRegistryHost;
      await import('../src/main.js');
      expect(consoleWarnSpy).toHaveBeenCalledWith('CRONOSTAR: ScopedRegistryHost non rilevato – niente patch scoped');
    });

    it('should patch connectedCallback if ScopedRegistryHost is defined', async () => {
      // Define ScopedRegistryHost
      const originalConnectedCallback = vi.fn();
      window.ScopedRegistryHost = function () {};
      window.ScopedRegistryHost.prototype.connectedCallback = originalConnectedCallback;

      await import('../src/main.js');

      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ScopedRegistryHost rilevato, patch connectedCallback');
      expect(window.ScopedRegistryHost.prototype.connectedCallback).not.toBe(originalConnectedCallback);

      // Simulate connectedCallback being called
      const mockRegistry = {
        define: vi.fn(),
        get: vi.fn(),
      };
      const mockHost = {
        renderRoot: {
          customElements: mockRegistry,
        },
        tagName: 'MOCK-HOST',
      };

      // Mock ha-entity-picker for scoped registry tests
      const haEntityPickerCtor = class {};
      customElementsGetSpy.mockImplementation((name) => {
        if (name === 'ha-entity-picker') return haEntityPickerCtor;
        return undefined;
      });

      window.ScopedRegistryHost.prototype.connectedCallback.call(mockHost);

      expect(mockRegistry.define).toHaveBeenCalledWith('cronostar-card', mocks.CronoStarCard);
      expect(mockRegistry.define).toHaveBeenCalledWith('ha-entity-picker', haEntityPickerCtor);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('CRONOSTAR: Scoped host connesso: scoped(<mock-host>)'));
    });
  });

  describe('window.customCards registration', () => {
    const cardMetadata = {
      type: 'cronostar-card',
      name: '🌟 CronoStar Card',
      description: 'Visual hourly schedule editor with drag-and-drop control',
      preview: true,
      preview_image: '/cronostar_card/cronostar-preview.png',
      thumbnail: '/cronostar_card/cronostar-logo.png',
      documentationURL: 'https://github.com/FoliniC/cronostar_card',
    };

    it('should add cronostar-card to window.customCards if not existing', async () => {
      window.customCards = [];
      await import('../src/main.js');
      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0]).toEqual(cardMetadata);
      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ✅ Aggiunto a window.customCards');
    });

    it('should update cronostar-card in window.customCards if already existing', async () => {
      window.customCards = [{ type: 'cronostar-card', name: 'Old Card' }];
      await import('../src/main.js');

      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0]).toEqual(cardMetadata);
      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ✅ Aggiornata registrazione in window.customCards');
    });
  });

  it('should export CronoStarCard and CronoStarEditor', async () => {
    const mainModule = await import('../src/main.js');
    expect(mainModule.CronoStarCard).toBe(mocks.CronoStarCard);
    expect(mainModule.CronoStarEditor).toBe(mocks.CronoStarEditor);
  });

  it('should log initialization complete message', async () => {
    await import('../src/main.js');
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: Inizializzazione main.js completata ✅');
  });
});
