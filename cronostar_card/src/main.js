// main.js – versione pulita con log scoped

import { CronoStarCard } from './core/CronoStar.js';
import { CronoStarEditor } from './editor/CronoStarEditor.js';
import { VERSION, CARD_CONFIG_PRESETS } from './config.js';

// Espone preset globali (se servono ad altri script)
globalThis.PRESETS = CARD_CONFIG_PRESETS;

// Espone classi su window (utile per debug / integrazioni esterne)
window.CronoStarCard = CronoStarCard;
window.CronoStarEditor = CronoStarEditor;
///////////
// Register custom element  
customElements.define('cronostar-card', CronoStarCard);  
  
// Add card to custom card picker  
//window.customCards = window.customCards || [];  
//window.customCards.push({  
//  type: 'cronostar-card',  
//  name: 'CronoStar',  
//  description: 'Visual hourly schedule editor with drag-and-drop control',  
//  preview: true,  
//  documentationURL: 'https://github.com/FoliniC/cronostar-card',  
//});  
///////////
console.log(`CRONOSTAR: main.js started (v${VERSION})`);
console.log('CRONOSTAR: window.CronoStarCard assigned:', !!window.CronoStarCard);
console.log('CRONOSTAR: window.CronoStarEditor assigned:', !!window.CronoStarEditor);

// Helper sicuro per registrare in un registry (globale o scoped)
function registerInRegistry(registry, name, constructor, context = 'global') {
  if (!registry) {
    console.warn(`CRONOSTAR: registry nullo per "${name}" in ${context}`);
    return false;
  }

  try {
    if (registry.get && registry.get(name)) {
      console.log(`CRONOSTAR: "${name}" già registrato in ${context}`);
      return false;
    }
  } catch {
    // se get non esiste/fail, proviamo comunque la define
  }

  try {
    registry.define(name, constructor);
    console.log(`CRONOSTAR: ✅ "${name}" registrato in ${context}`);
    return true;
  } catch (e) {
    const msg = String(e);
    if (!msg.includes('already been used') && !msg.includes('already defined')) {
      console.error(`CRONOSTAR: ❌ Errore registrazione "${name}" in ${context}:`, e);
    } else {
      console.log(`CRONOSTAR: "${name}" risulta già definito in ${context}`);
    }
    return false;
  }
}

// 1) Registrazione nel registry globale
console.log('CRONOSTAR: Inizio registrazione globale...');
registerInRegistry(customElements, 'cronostar-card', CronoStarCard, 'global');
registerInRegistry(customElements, 'cronostar-card-editor', CronoStarEditor, 'global');

// 2) Supporto per Scoped CustomElementRegistry (usato dal card picker)
if (window.ScopedRegistryHost && window.ScopedRegistryHost.prototype) {
  console.log('CRONOSTAR: ScopedRegistryHost rilevato, patch connectedCallback');

  const origConnected = window.ScopedRegistryHost.prototype.connectedCallback;

  window.ScopedRegistryHost.prototype.connectedCallback = function () {
    try {
      const root = this.renderRoot || this.shadowRoot;
      const registry =
        root?.customElements ||
        this.ownerDocument?.customElements ||
        customElements;

      const ctx =
        this.tagName
          ? `scoped(<${this.tagName.toLowerCase()}>)`
          : 'scoped(unknown-host)';

      console.log(`CRONOSTAR: Scoped host connesso: ${ctx}`);
      if (root && root !== document && root !== document.body) {
        console.log('CRONOSTAR:   renderRoot/shadowRoot presente:', root);
      }

      if (registry && registry !== customElements) {
        console.log('CRONOSTAR:   registry scoped diverso dal globale, registrazione elementi...');
        registerInRegistry(registry, 'cronostar-card', CronoStarCard, `${ctx} / card`);
        registerInRegistry(registry, 'cronostar-card-editor', CronoStarEditor, `${ctx} / editor`);
      } else if (registry === customElements) {
        console.log('CRONOSTAR:   registry coincidente con customElements globale, nessuna azione');
      } else {
        console.warn('CRONOSTAR:   nessun registry valido trovato per host scoped');
      }
    } catch (e) {
      console.error('CRONOSTAR: errore registrazione in scoped registry:', e);
    }

    if (origConnected) {
      return origConnected.apply(this, arguments);
    }
  };
} else {
  console.warn('CRONOSTAR: ScopedRegistryHost non rilevato – niente patch scoped');
}

// 3) Registrazione in window.customCards per apparire nel card picker
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'custom:cronostar-card')) {
  window.customCards.push({
    type: 'cronostar-card',
    name: 'CronoStar Card',
    description: 'Visual hourly schedule editor with drag-and-drop control',
    preview: true,
    documentationURL: 'https://github.com/FoliniC/cronostar_card',
  });
  console.log('CRONOSTAR: ✅ Aggiunto a window.customCards');
} else {
  console.log('CRONOSTAR: Già presente in window.customCards');
}

// Banner finale
console.log(
  `%c CRONOSTAR %c v${VERSION} LOADED `,
  'color: white; background: #03a9f4; font-weight: 700;',
  'color: #03a9f4; background: white; font-weight: 700;'
);
console.log('CRONOSTAR: Inizializzazione main.js completata ✅');

export { CronoStarCard, CronoStarEditor };
