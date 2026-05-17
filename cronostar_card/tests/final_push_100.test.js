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
    VERSION: "6.8.8",
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
        const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
        const mockFocus = vi.fn();
        const card = {
            config: { global_prefix: "p_", profiles_select_entity: "s.x", target_entity: "c.x", enabled_entity: "e.x" },
            shadowRoot: { querySelector: () => ({ focus: mockFocus }) },
            isEditorContext: vi.fn(() => false),
            hass: { 
                callService: vi.fn().mockRejectedValue(new Error("fail")), 
                callWS: vi.fn().mockResolvedValue({ success: true, response: { available_profiles: ["D"] } }),
                states: {} 
            },
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
            stateManager: { getData: () => [], getNumPoints: () => 24, removePoint: vi.fn(), setData: vi.fn() },
            chartManager: { isInitialized: () => true, updateChartLabels: vi.fn(), update: vi.fn(), updateData: vi.fn(), updatePointStyling: vi.fn(), chart: { resize: vi.fn() } },
            cardLifecycle: { 
                updateReadyFlag: vi.fn(), 
                reinitializeCard: vi.fn(), 
                isEditorContext: () => false, 
                isPickerPreviewContext: () => false 
            },
            cardSync: { updateAutomationSync: vi.fn(), scheduleAutomationOverlaySuppression: vi.fn() },
            isMenuOpen: true
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
        
        await handlers.handleAddProfile();
        for(let i=0; i<15; i++) vi.advanceTimersByTime(1100);

        await handlers.toggleEnabled({ target: { checked: true } });
        expect(warnSpy).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        vi.useRealTimers();
    });

    it("CardLifecycle - ALL gaps", async () => {
        const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
        const card = {
            config: { global_prefix: "p_", target_entity: "c.x", enabled_entity: "e.x", profiles_select_entity: "s.x", view_mode: "admin" },
            _showChart: true,
            requestUpdate: vi.fn(),
            chartManager: { isInitialized: () => true, chart: { resize: vi.fn() }, updateData: vi.fn() },
            missingEntities: [],
            cronostarReady: true,
            initialLoadComplete: true,
            isStartup: false,
            stateManager: { setData: vi.fn(), getData: () => [], getNumPoints: () => 24 }
        };
        const lifecycle = new CardLifecycle(card);
        lifecycle.setHass({ 
            states: {}, 
            config: { state: "RUNNING" } 
        });
        expect(card.missingEntities).toContain("c.x");
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
        
        const mockHass = { 
            callWS: vi.fn().mockResolvedValue({ 
                success: true, 
                response: { available_profiles: ["P1"] } 
            }) 
        };
        await lifecycle.registerCard(mockHass);
        expect(card.profileOptions).toEqual(["P1"]);
    });

    it("CardRenderer - ALL gaps", () => {
        const card = {
            config: { title: "T", target_entity: "c.x" },
            localizationManager: { localize: (l,k) => k },
            profileManager: { handleProfileSelection: vi.fn() },
            missingEntities: [],
            isEnabled: true,
            cronostarReady: true,
            initialLoadComplete: true,
            isEditorContext: vi.fn(() => false),
            cardLifecycle: { isEditorContext: () => false, isPickerPreviewContext: () => false, reinitializeCard: vi.fn() },
            eventHandlers: { handleCardClick: vi.fn() }
        };
        const renderer = new CardRenderer(card);
        renderer.render();
        renderer._renderFullCard("T");
        
        card.isEnabled = false;
        renderer.render();
    });
});
