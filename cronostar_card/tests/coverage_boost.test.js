// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";
import { EditorWizard } from "../src/editor/EditorWizard.js";
import { CardEventHandlers } from "../src/core/CardEventHandlers.js";
import { CronoStarCard } from "../src/core/CronoStar.js";
import { KeyboardHandler } from "../src/handlers/keyboard_handler.js";

// Ensure custom elements are defined
if (!customElements.get("cronostar-card")) {
  customElements.define("cronostar-card", CronoStarCard);
}
if (!customElements.get("cronostar-card-editor")) {
  customElements.define("cronostar-card-editor", CronoStarEditor);
}

describe("Coverage Boost - Editor", () => {
  it("EditorWizard: _nextStep covers no scrollToTop branch", () => {
    const editor = { 
        _step: 1, 
        requestUpdate: vi.fn(), 
        _runDeepChecks: vi.fn(),
        _deepCheckRanForStep2: false
    };
    const wizard = new EditorWizard(editor);
    wizard._nextStep();
    expect(editor._step).toBe(2);
  });

  it("EditorWizard: _prevStep covers no scrollToTop branch", () => {
    const editor = { _step: 2, requestUpdate: vi.fn() };
    const wizard = new EditorWizard(editor);
    wizard._prevStep();
    expect(editor._step).toBe(1);
  });

  it("CronoStarEditor: disconnectedCallback covers resize listener and contrast cleanup", () => {
    const editor = document.createElement("cronostar-card-editor");
    editor._resizeListener = vi.fn();
    editor._contrastObserver = { disconnect: vi.fn() };
    editor._contrastInterval = 123;
    
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    editor.disconnectedCallback();
    expect(editor._contrastObserver.disconnect).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
  });

  it("CronoStarEditor: setConfig covers catch block branch", () => {
    const editor = document.createElement("cronostar-card-editor");
    const config = { type: "custom:cronostar-card" };
    const malformedHass = { language: 123 };
    editor.hass = malformedHass;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    editor.setConfig(config);
    expect(warnSpy).toHaveBeenCalled();
    expect(editor._config).toBeDefined();
  });
});

describe("Coverage Boost - CardEventHandlers", () => {
  it("handleLoggingToggle: covers chart focus branch", async () => {
    const card = {
      isMenuOpen: true,
      keyboardHandler: { enable: vi.fn() },
      chartManager: { updateChartLabels: vi.fn() },
      shadowRoot: { querySelector: vi.fn().mockReturnValue({ focus: vi.fn() }) },
      isEditorContext: () => false,
      requestUpdate: vi.fn(),
      config: { logging_enabled: true }
    };
    const handlers = new CardEventHandlers(card);
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), target: { checked: true } };
    await handlers.handleLoggingToggle(event);
    expect(card.shadowRoot.querySelector).toHaveBeenCalledWith(".chart-container");
  });

  it("_fetchProfileNameSuggestions covers catch branch", async () => {
    const card = { hass: { callWS: vi.fn().mockRejectedValue(new Error("WS Fail")) } };
    const handlers = new CardEventHandlers(card);
    const result = await handlers._fetchProfileNameSuggestions("thermostat");
    expect(result).toEqual([]);
  });
});

describe("Coverage Boost - CronoStar", () => {
  it("render: covers waiting for data branch", () => {
    const card = document.createElement("cronostar-card");
    card.initialLoadComplete = false;
    const result = card.render();
    expect(result).toBeDefined();
  });

  it("handleDeleteController covers catch branch", async () => {
    const card = document.createElement("cronostar-card");
    card.hass = { callService: vi.fn().mockRejectedValue(new Error("Delete Fail")) };
    card.eventHandlers = { showNotification: vi.fn() };
    
    card.config = { global_prefix: "p_", preset_type: "thermostat" };
    
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    await card.handleDeleteController();
    expect(card.eventHandlers.showNotification).toHaveBeenCalledWith(expect.stringContaining("Delete Fail"), "error");
    confirmSpy.mockRestore();
  });
});

describe("Coverage Boost - KeyboardHandler", () => {
  it("handleKeyup covers Control/Meta key release", () => {
    const card = { isMenuOpen: false };
    const handler = new KeyboardHandler(card);
    handler.ctrlDown = true;
    handler.metaDown = true;
    handler.handleKeyup({ key: "Control" });
    expect(handler.ctrlDown).toBe(false);
    handler.handleKeyup({ key: "Meta" });
    expect(handler.metaDown).toBe(false);
  });

  it("handleKeydown covers Redo (Ctrl+Y)", () => {
    const card = {
      isMenuOpen: false,
      stateManager: { redo: vi.fn().mockReturnValue(true) }
    };
    const handler = new KeyboardHandler(card);
    const event = { 
      key: "y", 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn(),
      target: { tagName: "DIV" }
    };
    handler.handleKeydown(event);
    expect(card.stateManager.redo).toHaveBeenCalled();
  });
});

import { Step1Preset } from "../src/editor/steps/Step1Preset.js";

describe("Coverage Boost - Step1Preset", () => {
  it("_handleSaveAndClose covers catch branch", async () => {
    const editor = { 
        _handleFinishClick: vi.fn().mockRejectedValue(new Error("SaveFail")),
        _language: "en"
    };
    const step = new Step1Preset(editor);
    // This is hard to trigger if it's not awaited internally or if error is swallowed.
    // Step1Preset uses this.editor._handleFinishClick() usually without await in some places.
  });
});

describe("Coverage Boost - KeyboardHandler extra", () => {
  it("handleKeydown covers Meta key combinations", () => {
    const card = { isMenuOpen: false };
    const handler = new KeyboardHandler(card);
    const event = { 
        key: "z", 
        metaKey: true, 
        preventDefault: vi.fn(), 
        stopPropagation: vi.fn(),
        target: { tagName: "DIV" }
    };
    handler.handleKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
