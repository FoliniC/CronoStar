import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as mainModule from '../src/main.js'; // Import the module to be tested

// Mocking the imported modules
vi.mock('../src/core/CronoStar.js', () => {
  class MockCronoStarCard extends HTMLElement {}
  return { CronoStarCard: MockCronoStarCard };
});
vi.mock('../src/editor/CronoStarEditor.js', () => {
  class MockCronoStarEditor extends HTMLElement {}
  return { CronoStarEditor: MockCronoStarEditor };
});
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
  let originalCustomElements;
  let originalScopedRegistryHost;
  let originalCustomCards;
  let originalGlobalThisPresets;
  let originalWindowCronoStarCard;
  let originalWindowCronoStarEditor;

  it('should expose PRESETS, CronoStarCard, and CronoStarEditor globally', () => {
    // This test assumes main.js has been imported and executed by vitest when running tests
    // so we just check the global state after the import.
    expect(global.globalThis.PRESETS).toEqual({ preset1: 'data1' });
    expect(global.window.CronoStarCard).toBe(MockCronoStarCard);
    expect(global.window.CronoStarEditor).toBe(MockCronoStarEditor);
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: window.CronoStarCard assigned:', true);
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: window.CronoStarEditor assigned:', true);
  });

  describe('global custom element registration', () => {
    it('should register cronostar-card and editor elements globally', () => {
      // main.js is imported, so global.customElements.define should have been called
      expect(customElementsDefineSpy).toHaveBeenCalledWith('cronostar-card', MockCronoStarCard);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('custom:cronostar-card', MockCronoStarCard);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('cronostar-card-editor', MockCronoStarEditor);
      expect(customElementsDefineSpy).toHaveBeenCalledWith('custom:cronostar-card-editor', MockCronoStarEditor);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ "cronostar-card" registrato in global'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ "custom:cronostar-card" registrato in global-fallback'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ "cronostar-card-editor" registrato in global'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ "custom:cronostar-card-editor" registrato in global-editor-fallback'));
    });

    it('should warn if registry is null during registration', () => {
      customElementsDefineSpy.mockClear(); // Clear previous calls
      consoleWarnSpy.mockClear();

      const originalDefine = global.customElements.define;
      global.customElements.define = (name, ctor) => {
        // Simulate already defined error for specific elements to test that path
        if (name === 'cronostar-card') {
          throw new Error('cronostar-card has already been used');
        }
        originalDefine(name, ctor);
      };

      // Re-importing main.js to re-run the registration logic with the new mock
      vi.importActual('../src/main.js'); // This will re-execute the module
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cronostar-card risulta già definito in global'));
      expect(customElementsDefineSpy).toHaveBeenCalledWith('custom:cronostar-card', MockCronoStarCard); // Other registrations should still happen
    });

    it('should log if element is already defined', () => {
      customElementsGetSpy.mockReturnValueOnce(MockCronoStarCard); // Simulate 'cronostar-card' already exists
      customElementsDefineSpy.mockClear();

      // Re-importing main.js to re-run the registration logic with the new mock
      vi.importActual('../src/main.js');

      expect(customElementsGetSpy).toHaveBeenCalledWith('cronostar-card');
      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: "cronostar-card" già registrato in global');
      expect(customElementsDefineSpy).not.toHaveBeenCalledWith('cronostar-card', MockCronoStarCard); // Should not try to define again
    });

    it('should log an error if define fails for an unknown reason', () => {
      customElementsDefineSpy.mockClear();
      consoleErrorSpy.mockClear();
    
      customElementsDefineSpy.mockImplementation((name, ctor) => {
        if (name === 'cronostar-card') {
          throw new Error('Unknown error during define');
        }
      });
    
      vi.importActual('../src/main.js');
    
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRONOSTAR: ❌ Errore registrazione "cronostar-card" in global:'),
        expect.any(Error)
      );
    });
  });

  describe('ScopedRegistryHost patching', () => {
    it('should not patch if ScopedRegistryHost is not defined', () => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('CRONOSTAR: ScopedRegistryHost non rilevato – niente patch scoped');
    });

    it('should patch connectedCallback if ScopedRegistryHost is defined', async () => {
      // Define ScopedRegistryHost
      global.window.ScopedRegistryHost = function () {};
      global.window.ScopedRegistryHost.prototype.connectedCallback = vi.fn();
      const originalConnectedCallback = global.window.ScopedRegistryHost.prototype.connectedCallback;

      // Re-import main.js to re-run the patching logic
      vi.importActual('../src/main.js');

      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ScopedRegistryHost rilevato, patch connectedCallback');
      expect(global.window.ScopedRegistryHost.prototype.connectedCallback).not.toBe(originalConnectedCallback); // Should be patched

      // Simulate connectedCallback being called
      const mockHost = {
        renderRoot: {
          customElements: {
            define: vi.fn(),
            get: vi.fn(),
          },
        },
        tagName: 'MOCK-HOST',
      };

      // Mock ha-entity-picker for scoped registry tests
      const haEntityPickerCtor = function() {};
      customElementsGetSpy.mockImplementation((name) => {
        if (name === 'ha-entity-picker') return haEntityPickerCtor;
        return undefined;
      });

      global.window.ScopedRegistryHost.prototype.connectedCallback.call(mockHost);

      expect(mockHost.renderRoot.customElements.define).toHaveBeenCalledWith('cronostar-card', MockCronoStarCard);
      expect(mockHost.renderRoot.customElements.define).toHaveBeenCalledWith('ha-entity-picker', haEntityPickerCtor);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('CRONOSTAR: Scoped host connesso: scoped(<mock-host>)'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('registry scoped diverso dal globale, registrazione elementi...'));
    });

    it('should handle late definition of ha-entity-picker in scoped registry', async () => {
      global.window.ScopedRegistryHost = function () {};
      global.window.ScopedRegistryHost.prototype.connectedCallback = vi.fn();
      
      vi.importActual('../src/main.js');
    
      const mockHost = {
        renderRoot: {
          customElements: {
            define: vi.fn(),
            get: vi.fn(),
          },
        },
        tagName: 'MOCK-HOST-LATE',
      };
    
      customElementsWhenDefinedSpy.mockImplementation((name) => {
        if (name === 'ha-entity-picker') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });
      customElementsGetSpy.mockImplementation((name) => {
        if (name === 'ha-entity-picker') {
          // Simulate it's not defined initially, then defined later
          return undefined;
        }
        return undefined;
      });
    
      // Call connectedCallback, which will trigger the whenDefined promise
      global.window.ScopedRegistryHost.prototype.connectedCallback.call(mockHost);
    
      // Manually resolve the promise for ha-entity-picker
      const haEntityPickerCtor = function() {};
      customElementsGetSpy.mockImplementation((name) => {
        if (name === 'ha-entity-picker') return haEntityPickerCtor;
        return undefined;
      });
      await customElementsWhenDefinedSpy('ha-entity-picker'); // This should resolve the promise inside the connectedCallback
    
      expect(mockHost.renderRoot.customElements.define).toHaveBeenCalledWith('ha-entity-picker', haEntityPickerCtor);
      expect(consoleWarnSpy).toHaveBeenCalledWith('CRONOSTAR: ha-entity-picker non ancora definito nel registry globale, attendo whenDefined...');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('CRONOSTAR:   ha-entity-picker registrato in scoped(<mock-host-late>) / ha-entity-picker(late)'));
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

    it('should add cronostar-card to window.customCards if not existing', () => {
      expect(global.window.customCards).toHaveLength(1); // One entry due to initial import
      expect(global.window.customCards[0]).toEqual(cardMetadata);
      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ✅ Aggiunto a window.customCards');
    });

    it('should update cronostar-card in window.customCards if already existing', () => {
      // Simulate card already exists from a previous load
      global.window.customCards = [{ type: 'cronostar-card', name: 'Old Card' }];

      // Re-import main.js to re-run the registration logic
      vi.importActual('../src/main.js');

      expect(global.window.customCards).toHaveLength(1);
      expect(global.window.customCards[0]).toEqual(cardMetadata); // Should be updated
      expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: ✅ Aggiornata registrazione in window.customCards');
    });
  });

  it('should export CronoStarCard and CronoStarEditor', () => {
    expect(mainModule.CronoStarCard).toBe(MockCronoStarCard);
    expect(mainModule.CronoStarEditor).toBe(MockCronoStarEditor);
  });

  it('should log initialization complete message', () => {
    expect(consoleLogSpy).toHaveBeenCalledWith('CRONOSTAR: Inizializzazione main.js completata ✅');
  });
});
