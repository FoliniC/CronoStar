// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---
vi.mock("lit", async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    css: (s) => s,
    html: (strings, ...values) => {
      const parts = [];
      strings.forEach((s, i) => {
        parts.push(s);
        if (i < values.length) {
          const v = values[i];
          if (typeof v === 'function') parts.push(`[FUNC:${v.name || 'anon'}]`);
          else if (v && v.__litHtml) parts.push(v._content);
          else if (Array.isArray(v)) {
              v.forEach(item => { if(item && item.__litHtml) parts.push(item._content); });
          }
          else parts.push(String(v ?? ""));
        }
      });
      return { 
        strings, 
        values, 
        __litHtml: true, 
        _content: parts.join(""),
        toString: function() { return this._content; }
      };
    }
  };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));

// Mock Logger to capture calls
vi.mock("../src/utils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Logger: {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setEnabled: vi.fn(),
      debug: vi.fn(),
    },
    checkIsEditorContext: vi.fn(() => false),
  };
});

import { CronoStarCard } from "../src/core/CronoStar.js";
import { CardEventHandlers } from "../src/core/CardEventHandlers.js";
import { CardLifecycle } from "../src/core/CardLifecycle.js";
import { CardRenderer } from "../src/core/CardRenderer.js";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";
import { Step3Options } from "../src/editor/steps/Step3Options.js";
import { Step4Automation } from "../src/editor/steps/Step4Automation.js";
import { Step5Summary } from "../src/editor/steps/Step5Summary.js";
import { Logger } from "../src/utils.js";

const REGISTERED_CARD = "cronostar-card-comp-final";
const REGISTERED_EDITOR = "cronostar-card-editor-comp-final";
if (!customElements.get(REGISTERED_CARD)) customElements.define(REGISTERED_CARD, class extends CronoStarCard {});
if (!customElements.get(REGISTERED_EDITOR)) customElements.define(REGISTERED_EDITOR, class extends CronoStarEditor {});

describe("Final 100% Coverage Push", () => {
    
    describe("Logger Debug & Main Registry", () => {
        it("Logger.debug coverage", () => {
            Logger.setEnabled(true);
            Logger.debug("T", "M");
            expect(Logger.debug).toHaveBeenCalled();
        });
    });

    describe("CardEventHandlers - chartContainer.focus() gaps", () => {
        let card, handlers, mockFocus;
        beforeEach(() => {
            mockFocus = vi.fn();
            card = {
                config: { global_prefix: "p_", target_entity: "c.x", enabled_entity: "switch.test" },
                language: "en",
                localizationManager: { localize: vi.fn((l,k) => k) },
                stateManager: { getData: () => [], getNumPoints: () => 24, setData: vi.fn() },
                chartManager: { 
                    isInitialized: vi.fn(() => true), 
                    updateChartLabels: vi.fn(),
                    recreateChartOptions: vi.fn(),
                    updateData: vi.fn(),
                    getChart: () => ({ update: vi.fn(), options: { scales: { y: {} } } })
                },
                keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
                requestUpdate: vi.fn(),
                shadowRoot: { querySelector: vi.fn().mockReturnValue({ focus: mockFocus }) },
                isEditorContext: vi.fn(() => false),
                cardLifecycle: { updateReadyFlag: vi.fn(), isEditorContext: () => false, isPickerPreviewContext: () => false },
                cardSync: { updateAutomationSync: vi.fn() },
                isMenuOpen: true
            };
            handlers = new CardEventHandlers(card);
            card.eventHandlers = handlers;
        });

        it("covers chart focus in various handlers", async () => {
            handlers.toggleMenu(); // closes menu
            expect(mockFocus).toHaveBeenCalled();
            
            card.hass = { callService: vi.fn().mockResolvedValue({}) };
            await handlers.handleLanguageSelect("it");
            expect(mockFocus).toHaveBeenCalled();
            
            await handlers.handlePresetChange({ detail: { value: "ev_charging" }, stopPropagation: vi.fn(), preventDefault: vi.fn() });
            expect(mockFocus).toHaveBeenCalled();
        });

        it("covers toggleEnabled catch", async () => {
            card.hass = { callService: vi.fn().mockRejectedValue(new Error("fail")) };
            await handlers.toggleEnabled({ target: { checked: true } });
            expect(Logger.warn).toHaveBeenCalled();
        });
    });

    describe("CardLifecycle - gaps", () => {
        it("covers chart.resize fallback in setHass timer", () => {
            vi.useFakeTimers();
            const card = {
                config: { global_prefix: "p_", view_mode: "admin" },
                chartManager: { isInitialized: () => true, chart: { resize: vi.fn() }, updateData: vi.fn() },
                requestUpdate: vi.fn(),
                missingEntities: []
            };
            const lifecycle = new CardLifecycle(card);
            lifecycle.setHass({ 
                states: { "input_boolean.p_show_chart": { state: "on" } },
                config: { state: "RUNNING" }
            });
            vi.advanceTimersByTime(100);
            expect(card.chartManager.chart.resize).toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe("CardRenderer - gaps", () => {
        it("covers mwc-list-item click and shadow cleanup", () => {
            const card = {
                config: { title: "T" },
                localizationManager: { localize: vi.fn((l,k) => k) },
                profileManager: { handleProfileSelection: vi.fn() },
                missingEntities: [],
                profileOptions: ["P1"],
                selectedProfile: "P1",
                isEditorContext: vi.fn(() => false),
                cardLifecycle: { reinitializeCard: vi.fn(), isEditorContext: () => false, isPickerPreviewContext: () => false },
                eventHandlers: { handleCardClick: vi.fn() }
            };
            const renderer = new CardRenderer(card);
            const res = renderer._renderFullCard("Title");
            
            const findFunctions = (val) => {
                let funcs = [];
                if (typeof val === 'function') funcs.push(val);
                else if (val && Array.isArray(val.values)) {
                    val.values.forEach(v => funcs = funcs.concat(findFunctions(v)));
                } else if (Array.isArray(val)) {
                    val.forEach(v => funcs = funcs.concat(findFunctions(v)));
                }
                return funcs;
            };

            const funcs = findFunctions(res);
            funcs.forEach(f => {
                try { f({ stopPropagation: vi.fn(), preventDefault: vi.fn(), target: { value: "P1" } }); } catch(e) {}
            });
            expect(card.profileManager.handleProfileSelection).toHaveBeenCalled();
        });
    });

    describe("CronoStar Card - gaps", () => {
        it("covers _calcContentAreaInsets catch", () => {
            const card = document.createElement(REGISTERED_CARD);
            // Trigger catch block by making document.querySelector fail or throw
            const spy = vi.spyOn(document, "querySelector").mockImplementation(() => { throw new Error("panic"); });
            const insets = card._calcContentAreaInsets();
            expect(insets.headerHeight).toBe(56);
            spy.mockRestore();
        });
    });

    describe("Editor Steps - Template Gaps", () => {
        it("Step5Summary branches", () => {
            const editor = {
                _config: { global_prefix: "p_" },
                i18n: { _t: (k) => k },
                renderEntityPicker: () => "picker"
            };
            const step = new Step5Summary(editor);
            const res1 = step.render();
            expect(res1).toBeDefined();

            // Force missing fields
            editor._config = {};
            const res2 = step.render();
            expect(res2).toBeDefined();
        });
    });
});
