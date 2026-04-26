// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: lit ────────────────────────────────────────────────────────────────
vi.mock("lit", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    html: (strings, ...values) => ({ strings, values, __litHtml: true }),
    css: (strings, ...values) => strings[0],
  };
});

// ─── Mock: ../src/config.js ───────────────────────────────────────────────────────
vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: { 
      thermostat: { title: "Boiler", icon: "🔥", desc: "Heat" }, 
      ev_charging: { title: "EV", icon: "⚡", desc: "Charge" },
      generic_switch: { title: "Switch", icon: "🔘", desc: "Toggle" },
      generic_kwh: { title: "Power", icon: "🔌", desc: "Kwh" },
      generic_temperature: { title: "Temp", icon: "🌡️", desc: "Temp" }
  },
  TIMEOUTS: { editingGraceMs: 5000 },
  VERSION: "6.8.6",
  getEffectivePrefix: (cfg) => "cronostar_thermostat_",
  isValidPrefix: (p) => true,
  normalizePrefix: (p) => p,
  extractCardConfig: (c) => c,
  validateConfig: (c) => c,
  DEFAULT_CONFIG: { preset_type: "thermostat" }
}));

import { CardRenderer } from "../src/core/CardRenderer.js";
import { CronoStarCard } from "../src/core/CronoStar.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";

if (!customElements.get("cronostar-card")) {
    customElements.define("cronostar-card", CronoStarCard);
}

describe("CronoStar - 100% Coverage Push", () => {
    describe("CardRenderer - Deep Branches", () => {
        it("covers various rendering states in _renderFullCard", () => {
            const card = new CronoStarCard();
            const renderer = new CardRenderer(card);
            
            card.initialLoadComplete = true;
            card.isStartup = true;
            renderer._renderFullCard("Title");
            
            card.isStartup = false;
            card.showUnsavedChangesDialog = true;
            renderer._renderFullCard("Title");
            
            card.showUnsavedChangesDialog = false;
            card.config = { target_entity: "c.x" };
            card.integrationVersion = "9.9.9";
            renderer._renderFullCard("Title");
        });
    });

    describe("Step1Preset - Deep Branches", () => {
        it("_handleSaveAndClose catch branch", async () => {
            const editor = {
                _config: {},
                _updateConfig: vi.fn(),
                updateComplete: Promise.resolve(),
                hass: {},
                _handleFinishClick: vi.fn().mockRejectedValue(new Error("fail"))
            };
            const step = new Step1Preset(editor);
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            await step._handleSaveAndClose();
            expect(spy).toHaveBeenCalled();
        });
    });

    describe("CronoStarCard - Deep Branches", () => {
        it("_deepQuerySelector coverage", () => {
            const card = new CronoStarCard();
            const root = document.createElement("div");
            const child = document.createElement("div");
            const shadowHost = document.createElement("div");
            shadowHost.attachShadow({mode: "open"});
            const shadowChild = document.createElement("div");
            shadowChild.id = "target";
            shadowHost.shadowRoot.appendChild(shadowChild);
            root.appendChild(child);
            root.appendChild(shadowHost);
            
            expect(card._deepQuerySelector("#target", root)).toBe(shadowChild);
            expect(card._deepQuerySelector("#none", root)).toBeNull();
        });

        it("setConfig branches: initially_collapsed and catch", () => {
            const card = new CronoStarCard();
            card.setConfig({ initially_collapsed: true });
            expect(card._showChart).toBe(false);
            
            vi.spyOn(card.cardLifecycle, 'setConfig').mockImplementation(() => { throw new Error("boom"); });
            card.setConfig({});
        });

        it("_handleWizardDoneGlobal", () => {
            const card = new CronoStarCard();
            card.isEditorInternal = true;
            card._handleWizardDoneGlobal();
            expect(card.isEditorInternal).toBe(false);
        });
        
        it("handleDeleteController catch branch", async () => {
             const card = new CronoStarCard();
             card.hass = { callWS: vi.fn().mockRejectedValue(new Error("fail")) };
             await card.handleDeleteController("p1");
        });
    });
});
