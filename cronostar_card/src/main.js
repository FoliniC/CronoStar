// main.js – clean version

import { CronoStarCard } from "./core/CronoStar.js";
import { CronoStarEditor } from "./editor/CronoStarEditor.js";
import { VERSION, CARD_CONFIG_PRESETS } from "./config.js";

// Expose global presets (if needed by other scripts)
globalThis.PRESETS = CARD_CONFIG_PRESETS;

// Expose classes on window (useful for debugging / external integrations)
window.CronoStarCard = CronoStarCard;
window.CronoStarEditor = CronoStarEditor;

// Safe helper to register in a registry (global or scoped)
function registerInRegistry(registry, name, constructor, context = "global") {
  if (!registry) return false;

  try {
    if (registry.get && registry.get(name)) return false;
  } catch {
    // If get doesn't exist/fails, still try to define
  }

  try {
    registry.define(name, constructor);
    return true;
  } catch (e) {
    const msg = String(e);
    /* v8 ignore next 7 */
    if (
      !msg.includes("already been used") &&
      !msg.includes("already defined")
    ) {
      console.error(
        `CRONOSTAR: ❌ Errore registrazione "${name}" in ${context}:`,
        e,
      );
    }
    return false;
  }
}

// 1) Global registry registration
registerInRegistry(customElements, "cronostar-card", CronoStarCard, "global");
registerInRegistry(
  customElements,
  "cronostar-card-editor",
  CronoStarEditor,
  "global",
);

// 2) Support for Scoped CustomElementRegistry (used by the card picker)
if (window.ScopedRegistryHost && window.ScopedRegistryHost.prototype) {
  const origConnected = window.ScopedRegistryHost.prototype.connectedCallback;

  window.ScopedRegistryHost.prototype.connectedCallback = function () {
    try {
      const root = this.renderRoot || this.shadowRoot;
      const registry =
        root?.customElements ||
        this.ownerDocument?.customElements ||
        customElements;

      const ctx = this.tagName
        ? `scoped(<${this.tagName.toLowerCase()}>)`
        : "scoped(unknown-host)";

      if (registry && registry !== customElements) {
        registerInRegistry(
          registry,
          "cronostar-card",
          CronoStarCard,
          `${ctx} / card`,
        );
        registerInRegistry(
          registry,
          "cronostar-card-editor",
          CronoStarEditor,
          `${ctx} / editor`,
        );

        // Ensure essential HA components are available in the scoped registry
        const haElements = [
          "ha-entity-picker",
          "ha-textfield",
          "ha-selector",
          "ha-switch",
          "ha-formfield",
          "ha-select",
          "ha-icon-button",
          "ha-icon",
          "ha-checkbox",
        ];
        haElements.forEach((name) => {
          const ctor = customElements.get(name);
          if (ctor) {
            registerInRegistry(registry, name, ctor, `${ctx} / ${name}`);
          }
        });
      }
    } catch (e) {
      /* v8 ignore next 2 */
      console.error("CRONOSTAR: errore registrazione in scoped registry:", e);
    }

    if (origConnected) {
      return origConnected.apply(this, arguments);
    }
  };
}

// 3) Register in window.customCards to appear in the card picker
window.customCards = window.customCards || [];
const cardType = "cronostar-card";
const existingCardIndex = window.customCards.findIndex(
  (c) => c.type === cardType || c.type === "custom:cronostar-card",
);

const cardMetadata = {
  type: "cronostar-card",
  name: "🌟 CronoStar Card",
  description: "Visual hourly schedule editor with drag-and-drop control",
  preview: true,
  preview_image: "/cronostar_card/cronostar-preview.png",
  thumbnail: "/cronostar_card/cronostar-logo.png",
  documentationURL: "https://github.com/FoliniC/cronostar_card",
};

if (existingCardIndex === -1) {
  window.customCards.push(cardMetadata);
} else {
  window.customCards[existingCardIndex] = cardMetadata;
}

// Final banner - keep only this one
console.log(
  `%c CRONOSTAR %c v${VERSION} LOADED `,
  "color: white; background: #03a9f4; font-weight: 700;",
  "color: #03a9f4; background: white; font-weight: 700;",
);

export { CronoStarCard, CronoStarEditor };
