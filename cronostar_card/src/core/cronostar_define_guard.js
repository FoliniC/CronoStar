// Aggressive guard for HA 2025.12 to ensure custom elements are correctly registered and managed.
(function() {
  'use strict';

  const CARD_NAME = 'cronostar-card';
  const EDITOR_NAME = 'cronostar-card-editor';

  // Intercept CustomElementRegistry constructor
  try {
    const OriginalRegistry = window.CustomElementRegistry;
    
    if (OriginalRegistry) {
      window.CustomElementRegistry = function(...args) {
        console.log('CRONOSTAR: Nuovo CustomElementRegistry creato!');
        const instance = new OriginalRegistry(...args);
        
        // Immediately patch this instance
        patchRegistryInstance(instance, 'new-instance');
        
        // Auto-register our elements after a short delay
        setTimeout(() => {
          if (window.CronoStarCard && window.CronoStarEditor) {
            try {
              if (!instance.get(CARD_NAME)) {
                instance.define(CARD_NAME, window.CronoStarCard);
                console.log('CRONOSTAR: Auto-registrato card in nuovo registry');
              }
              if (!instance.get(EDITOR_NAME)) {
                instance.define(EDITOR_NAME, window.CronoStarEditor);
                console.log('CRONOSTAR: Auto-registrato editor in nuovo registry');
              }
            } catch (e) {
              console.warn('CRONOSTAR: Errore auto-registrazione:', e);
            }
          }
        }, 0);
        
        return instance;
      };
      
      // Maintain original properties
      Object.setPrototypeOf(window.CustomElementRegistry, OriginalRegistry);
      Object.setPrototypeOf(window.CustomElementRegistry.prototype, OriginalRegistry.prototype);
      
      console.log('CRONOSTAR: CustomElementRegistry constructor intercepted');
    }
  } catch (e) {
    console.warn('CRONOSTAR: Impossibile intercettare CustomElementRegistry:', e);
  }

  function patchRegistryInstance(registry, name) {
    if (!registry || registry.__cronostar_patched__) return;

    const originalGet = registry.get;
    const originalDefine = registry.define;

    // Get with multiple fallbacks
    registry.get = function(elementName) {
      try {
        const result = originalGet.call(this, elementName);
        if (result) return result;
      } catch (e) {
        // Not found
      }

      // Fallback to our elements
      if (elementName === CARD_NAME && window.CronoStarCard) {
        return window.CronoStarCard;
      }
      if (elementName === EDITOR_NAME && window.CronoStarEditor) {
        return window.CronoStarEditor;
      }

      // Fallback to global registry
      if (window.customElements && window.customElements !== this) {
        try {
          return window.customElements.get(elementName);
        } catch (e) {
          // Ignore
        }
      }

      return undefined;
    };

    // Define with auto-registration
    registry.define = function(elementName, constructor, options) {
      try {
        const existing = this.get(elementName);
        if (existing === constructor) {
          return; // Already registered with the same constructor
        }
        if (existing) {
          console.warn(`CRONOSTAR: ${elementName} already defined in ${name}`);
          return;
        }

        return originalDefine.call(this, elementName, constructor, options);
      } catch (e) {
        const err = String(e);
        if (err.includes('already been used') || err.includes('already defined')) {
          return; // Ignore duplicate definition errors
        }
        throw e;
      }
    };

    Object.defineProperty(registry, '__cronostar_patched__', {
      value: true,
      configurable: false
    });

    console.log(`CRONOSTAR: Registry patchato: ${name}`);
  }

  // Patch global registry
  if (window.customElements) {
    patchRegistryInstance(window.customElements, 'global');
  }

  // Patch prototype
  if (window.CustomElementRegistry?.prototype) {
    patchRegistryInstance(window.CustomElementRegistry.prototype, 'prototype');
  }

  // Continuous scan for new registries
  let scanCount = 0;
  const scanInterval = setInterval(() => {
    // Scan global properties
    for (const prop of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[prop];
        if (obj && typeof obj === 'object' && 
            typeof obj.define === 'function' && 
            typeof obj.get === 'function' &&
            !obj.__cronostar_patched__) {
          patchRegistryInstance(obj, `global.${prop}`);
        }
      } catch (e) {
        // Skip
      }
    }

    // Scan shadow roots
    document.querySelectorAll('*').forEach((el) => {
      try {
        if (el.shadowRoot?.customElements && !el.shadowRoot.customElements.__cronostar_patched__) {
          patchRegistryInstance(el.shadowRoot.customElements, `shadow-${el.tagName}`);
        }
      } catch (e) {
        // Skip
      }
    });

    scanCount++;
    if (scanCount >= 30) {
      clearInterval(scanInterval);
      console.log('CRONOSTAR: Scansione registry completata');
    }
  }, 500);

  console.log('CRONOSTAR: Guard ultra-aggressivo inizializzato');
})();
