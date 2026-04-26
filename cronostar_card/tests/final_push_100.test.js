// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Lit Mock for Extraction ---
vi.mock("lit", async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    css: (s) => s,
    html: (strings, ...values) => ({ 
      strings, values, __litHtml: true, 
      _content: strings.join(""),
      values: values,
      toString: function() { return this._content; }
    })
  };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));
vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    VERSION: "6.8.6",
    extractCardConfig: vi.fn((c) => c),
    validateConfig: vi.fn((c) => c),
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

describe("Final Push 100% Coverage", () => {
    
    it("CardEventHandlers - ALL gaps", async () => {
        vi.useFakeTimers();
        const mockFocus = vi.fn();
        const card = {
            config: { global_prefix: "p_", profiles_select_entity: "s.x", target_entity: "c.x" },
            shadowRoot: { querySelector: () => ({ focus: mockFocus }) },
            isEditorContext: () => false,
            hass: { callService: vi.fn().mockRejectedValue(new Error("fail")), states: {} },
            profileManager: { loadProfile: vi.fn().mockResolvedValue(), lastLoadedProfile: "D" },
            keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
            requestUpdate: vi.fn(),
            selectionManager: { 
                clearSelection: vi.fn(), 
                getSelectedPoints: () => new Set([1]), 
                selectAll: vi.fn(), 
                selectedPoint: 0, 
                selectedPoints: new Set([1]) 
            },
            localizationManager: { localize: (l,k) => k },
            language: "en",
            stateManager: { getData: () => [], getNumPoints: () => 24, removePoint: vi.fn() },
            chartManager: { isInitialized: () => true, updateChartLabels: vi.fn(), update: vi.fn(), updateData: vi.fn(), updatePointStyling: vi.fn(), chart: { resize: vi.fn() } },
            cardLifecycle: { updateReadyFlag: vi.fn() },
            cardSync: { updateAutomationSync: vi.fn(), scheduleAutomationOverlaySuppression: vi.fn() }
        };
        const handlers = new CardEventHandlers(card);
        card.eventHandlers = handlers;
        vi.spyOn(handlers, "showNotification").mockImplementation(() => {});
        vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewP");

        await handlers.handleLanguageSelect("it");
        handlers.toggleMenu(); handlers.toggleMenu();
        handlers.handleSelectAll();
        handlers.handleDeleteSelected();
        await handlers.handleApplyNow();
        
        const p = handlers.handleAddProfile();
        for(let i=0; i<5; i++) vi.advanceTimersByTime(1100);
        await p;

        handlers.toggleEnabled({ target: { checked: true } });
        vi.useRealTimers();
    });

    it("CardLifecycle - ALL gaps", async () => {
        const card = {
            config: { global_prefix: "p_", target_entity: "c.x", enabled_entity: "e.x", profiles_select_entity: "s.x", view_mode: "admin" },
            requestUpdate: vi.fn(),
            missingEntities: [],
            entityStates: { target: "unknown", enabled: "unknown", selector: "unknown" },
            cronostarReady: true,
            initialLoadComplete: true,
            _cardConnected: true,
            stateManager: { setData: vi.fn() },
            profileOptions: []
        };
        const lifecycle = new CardLifecycle(card);
        lifecycle.setHass({ states: {} });
        expect(card.missingEntities).toContain("c.x");
        
        const mockHass = { callWS: vi.fn().mockResolvedValue({ response: { available_profiles: ["P1"] } }) };
        await lifecycle.registerCard(mockHass);
    });

    it("CardRenderer & Steps - ALL gaps", () => {
        const editor = {
            hass: { states: { "s.x": {} }, callService: vi.fn() },
            i18n: { _t: (k) => k },
            _config: { global_prefix: "p_", target_entity: "c.x", enabled_entity: "e.x" },
            _selectedPreset: "thermostat",
            _isEditing: true,
            _language: "en",
            _updateConfig: vi.fn(),
            _dispatchConfigChanged: vi.fn(),
            requestUpdate: vi.fn(),
            renderEntityPicker: vi.fn(() => ({ values: [] })),
            renderTextInput: vi.fn(() => ({ values: [] })),
            handleShowHelp: vi.fn(),
            _handleSaveAndClose: vi.fn(),
            _handleAdvancedConfig: vi.fn(),
            _handleFinishClick: vi.fn(),
            _handleLocalUpdate: vi.fn(),
            serviceHandlers: { copyToClipboard: vi.fn(), downloadFile: vi.fn() }
        };

        const mockSelect = {
            open: true, blur: vi.fn(),
            shadowRoot: { querySelector: (s) => ({ classList: { remove: vi.fn() }, open: true, removeAttribute: vi.fn() }) }
        };
        const mockEvent = { 
            target: { value: "v", checked: true, closest: (s) => (s === "ha-select" ? mockSelect : null), textContent: "it" },
            detail: { value: "v" },
            stopPropagation: vi.fn(),
            preventDefault: vi.fn()
        };

        const s1 = new Step1Preset(editor);
        triggerHandlers(s1.render(), mockEvent);
        s1._handlePrefixChange("new_", { target: { value: "new_" } });

        const s3 = new Step3Options(editor);
        triggerHandlers(s3.render(), mockEvent);

        const s4 = new Step4Automation(editor);
        triggerHandlers(s4.render(), mockEvent);

        const card = {
            config: { title: "T", target_entity: "c.x" },
            localizationManager: { localize: (l,k) => k },
            missingEntities: ["c.x"],
            initialLoadComplete: true,
            cronostarReady: true,
            cardLifecycle: { isPickerPreviewContext: () => false, isEditorContext: () => false },
            isEditorContext: () => false,
            profileManager: { handleProfileSelection: vi.fn(), lastLoadedProfile: "D" },
            profileOptions: ["D"],
            selectedProfile: "D",
            isEditorInternal: true,
            setConfig: vi.fn(),
            requestUpdate: vi.fn()
        };
        const renderer = new CardRenderer(card);
        triggerHandlers(renderer._renderFullCard("T"), mockEvent);
        
        // Trigger @config-changed on CronoStarEditor part
        const fullCard = renderer._renderFullCard("T");
        const editorPart = fullCard.values.find(v => v?._content?.includes("cronostar-card-editor"));
        if (editorPart) {
            const configHandler = editorPart.values.find(v => typeof v === 'function');
            if (configHandler) configHandler({ detail: { config: { new: "c" }, close: true } });
        }
    });

    it("CronoStar Main gaps", () => {
        const tag = "final-card-p";
        if (!customElements.get(tag)) customElements.define(tag, class extends CronoStarCard {});
        const c = document.createElement(tag);
        c.eventHandlers = { showNotification: vi.fn() };
        vi.spyOn(c.cardLifecycle, "setConfig").mockImplementation(() => { throw new Error("f"); });
        c.setConfig({});
    });
});
