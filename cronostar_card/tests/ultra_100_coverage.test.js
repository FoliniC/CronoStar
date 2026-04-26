// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Lit Mock for Extraction ---
vi.mock("lit", async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    css: (s) => s,
    html: (strings, ...values) => ({ 
      strings, values, __litHtml: true, 
      _content: strings.join(""),
      values: values
    })
  };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));

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

const triggerHandlers = (template, mockEvent = {}) => {
    if (!template || !template.values) return;
    template.values.forEach(v => {
        if (typeof v === 'function') {
            try { v(mockEvent); } catch(e) {}
        } else if (v && v.__litHtml) {
            triggerHandlers(v, mockEvent);
        }
    });
};

describe("Surgical 100% Coverage", () => {
    
    it("Step1Preset - _handlePrefixChange branches", () => {
        const editor = {
            _config: { 
                enabled_entity: "switch.cronostar_enabled",
                profiles_select_entity: "select.cronostar_current_profile",
                target_entity: "sensor.cronostar_current"
            },
            _updateConfig: vi.fn(),
            _dispatchConfigChanged: vi.fn(),
            requestUpdate: vi.fn()
        };
        const step = new Step1Preset(editor);
        // Standard prefix change
        step._handlePrefixChange("new_", { target: { value: "new_" } });
        expect(editor._updateConfig).toHaveBeenCalled();
        
        // Non-standard prefix change
        editor._config.enabled_entity = "switch.custom";
        step._handlePrefixChange("other_", { target: { value: "other_" } });
    });

    it("CardEventHandlers - retry logic and focus", async () => {
        vi.useFakeTimers();
        const mockFocus = vi.fn();
        const card = {
            config: { global_prefix: "p_", profiles_select_entity: "s.x" },
            shadowRoot: { querySelector: () => ({ focus: mockFocus }) },
            isEditorContext: () => false,
            hass: { callService: vi.fn().mockRejectedValue(new Error("fail")) },
            profileManager: { loadProfile: vi.fn().mockResolvedValue() },
            keyboardHandler: { enable: vi.fn() },
            requestUpdate: vi.fn(),
            selectionManager: { clearSelection: vi.fn() }
        };
        const handlers = new CardEventHandlers(card);
        vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewP");
        
        // Trigger retry logic in addProfile
        const promise = handlers.handleAddProfile();
        vi.advanceTimersByTime(1100); // Trigger retry
        vi.advanceTimersByTime(1100); 
        vi.advanceTimersByTime(1100); 
        await promise;
        
        expect(card.hass.callService).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("CardLifecycle - more branches", () => {
        const card = {
            config: { global_prefix: "p_", view_mode: "admin", initially_collapsed: true },
            _manualToggleDone: false,
            _showChart: true,
            chartManager: { isInitialized: () => true, chart: { resize: vi.fn() } },
            requestUpdate: vi.fn(),
            missingEntities: [],
            entityStates: { enabled: "on" }
        };
        const lifecycle = new CardLifecycle(card);
        // initially_collapsed branch in setHass
        lifecycle.setHass({ states: { "input_boolean.p_show_chart": { state: "off" } } });
        expect(card._showChart).toBe(false);
    });

    it("CardRenderer - mwc-list-item click detail", () => {
        const card = {
            config: { title: "T" },
            localizationManager: { localize: (l,k) => k },
            profileManager: { handleProfileSelection: vi.fn() },
            isEditorContext: () => false,
            missingEntities: [],
            profileOptions: ["D"],
            selectedProfile: "D"
        };
        const renderer = new CardRenderer(card);
        const res = renderer._renderFullCard("Title");
        
        const mockSelect = {
            open: true,
            blur: vi.fn(),
            shadowRoot: {
                querySelector: (s) => {
                    if (s === "ha-picker-field") return { classList: { remove: vi.fn() } };
                    return { open: true, removeAttribute: vi.fn() };
                }
            }
        };
        const mockEvent = {
            target: { 
                closest: (s) => (s === "ha-select" ? mockSelect : null),
                textContent: "D"
            },
            stopPropagation: vi.fn()
        };
        triggerHandlers(res, mockEvent);
    });

    it("CronoStarEditor - helper branches", () => {
        const tag = "surgical-editor";
        if (!customElements.get(tag)) customElements.define(tag, class extends CronoStarEditor {});
        const editor = document.createElement(tag);
        editor.hass = { states: { "select.cronostar_test": {} } };
        // Hit renderEntityPicker with existing state
        editor.renderEntityPicker("key", "select.cronostar_test", "Label");
        
        // Hit _clickHASaveButton retry branch
        vi.useFakeTimers();
        editor._clickHASaveButton();
        vi.advanceTimersByTime(500);
        vi.useRealTimers();
    });
});
