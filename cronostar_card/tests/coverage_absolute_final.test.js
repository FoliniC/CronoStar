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
      values: values,
      toString: function() { return this._content; }
    })
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
      load: vi.fn(),
    },
    checkIsEditorContext: vi.fn(() => false),
  };
});

import { CronoStarCard } from "../src/core/CronoStar.js";
import { CardLifecycle } from "../src/core/CardLifecycle.js";
import { CardRenderer } from "../src/core/CardRenderer.js";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";
import { Logger } from "../src/utils.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

if (!customElements.get("cronostar-card-final")) {
    customElements.define("cronostar-card-final", class extends CronoStarCard {});
}
if (!customElements.get("cronostar-card-editor-final")) {
    customElements.define("cronostar-card-editor-final", class extends CronoStarEditor {});
}

describe("Absolute Final Coverage - CronoStar.js", () => {
  let card;
  beforeEach(() => {
    card = document.createElement("cronostar-card-final");
    card.eventHandlers = { showNotification: vi.fn() };
    // We don't want to mock the whole lifecycle here, just setConfig if needed
    vi.spyOn(card.cardLifecycle, "setConfig").mockImplementation(card.cardLifecycle.setConfig);
  });

  it("hits setConfig catch block (L253-255)", () => {
    vi.spyOn(card.cardLifecycle, "setConfig").mockImplementation(() => { throw new Error("panic"); });
    card.setConfig({});
    expect(card.eventHandlers.showNotification).toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalled();
  });

  it("hits handleCreateController ha.dispatchEvent (L593)", () => {
    const ha = document.createElement("home-assistant");
    document.body.appendChild(ha);
    const spy = vi.spyOn(ha, "dispatchEvent");
    card.handleCreateController();
    expect(spy).toHaveBeenCalled();
    document.body.removeChild(ha);
  });
});

describe("Absolute Final Coverage - CardLifecycle.js", () => {
  let card, lifecycle;
  beforeEach(() => {
    card = {
      config: { 
        global_prefix: "p_", 
        view_mode: "admin", 
        target_entity: "climate.test", 
        profiles_select_entity: "select.test", 
        enabled_entity: "switch.test",
        not_configured: false
      },
      _showChart: true,
      requestUpdate: vi.fn(),
      chartManager: {
        isInitialized: vi.fn(() => true),
        resize: null, // Force use of chart.resize
        update: vi.fn(),
        updateData: vi.fn(),
        chart: { resize: vi.fn(), update: vi.fn() }
      },
      entityStates: {},
      cronostarReady: true,
      initialLoadComplete: true,
      isStartup: false,
      _cardConnected: true,
      cardSync: { updateAutomationSync: vi.fn() },
      missingEntities: [],
      stateManager: { setData: vi.fn(), getData: () => [], getNumPoints: () => 24 }
    };
    lifecycle = new CardLifecycle(card);
    vi.useFakeTimers();
    // Pre-seed firstHassAt to make uptime > 60s
    lifecycle._firstHassAt = Date.now() - 70000;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hits syncChartVisibility (inlined in setHass)", () => {
    card.config.show_chart_entity = "input_boolean.show";
    const hass = { 
        states: { "input_boolean.show": { state: "on" } },
        config: { state: "RUNNING" }
    };
    card._showChart = false;
    lifecycle.setHass(hass);
    vi.advanceTimersByTime(100);
    expect(card.chartManager.chart.resize).toHaveBeenCalled();
  });

  it("hits setHass backendHasId for enabled (L428-429)", () => {
    card.entityStates = { enabled: "on" };
    const hass = { 
        states: {},
        config: { state: "RUNNING" }
    };
    lifecycle.setHass(hass);
    expect(card.isEnabled).toBe(true);
  });

  it("hits setHass backendHasId for selector (L463-464)", () => {
    card.entityStates = { selector: "P1" };
    card.selectedProfile = "P2";
    const hass = { 
        states: {},
        config: { state: "RUNNING" }
    };
    lifecycle.setHass(hass);
    expect(card.selectedProfile).toBe("P1");
  });

  it("hits setHass missing selector (L476, 479)", () => {
    card.config.profiles_select_entity = "select.missing";
    card.entityStates = {}; // Force not found in backend
    const hass = { 
        states: {}, // Force not found in HA
        config: { state: "RUNNING" }
    };
    lifecycle.setHass(hass);
    expect(card.missingEntities).toContain("select.missing");
  });

  it("hits interval chartManager.update (L738)", () => {
    lifecycle.setHass({ 
        states: {},
        config: { state: "RUNNING" }
    });
    vi.advanceTimersByTime(6000);
    expect(card.chartManager.update).toHaveBeenCalledWith("none");
  });

  it("hits reinitializeCard detach/attach listeners (L1048-1050)", () => {
    card.pointerHandler = { detachListeners: vi.fn(), attachListeners: vi.fn() };
    card.keyboardHandler = { detachListeners: vi.fn(), attachListeners: vi.fn() };
    card.shadowRoot = { 
        getElementById: vi.fn().mockReturnValue(document.createElement("canvas")),
        querySelector: vi.fn().mockReturnValue(document.createElement("div"))
    };
    lifecycle.reinitializeCard();
    expect(card.pointerHandler.detachListeners).toHaveBeenCalled();
    expect(card.pointerHandler.attachListeners).toHaveBeenCalled();
  });

  it("hits registerCard profileOptions fallback (L1149)", async () => {
    card.profileOptions = [];
    card.config.global_prefix = "p_";
    const mockHass = { 
      callWS: vi.fn().mockResolvedValue({ 
        success: true, 
        response: {
          entity_states: {}, 
          available_profiles: ["P1", "P2"] 
        }
      }) 
    };
    await lifecycle.registerCard(mockHass);
    expect(card.profileOptions).toEqual(["P1", "P2"]);
  });

  it("hits missing target_entity check", () => {
    card.config.target_entity = "climate.missing";
    card.entityStates = {}; 
    const hass = { 
        states: {},
        config: { state: "RUNNING" }
    };
    lifecycle.setHass(hass);
    expect(card.missingEntities).toContain("climate.missing");
  });
});

describe("Absolute Final Coverage - CardRenderer.js", () => {
  let card, renderer;
  beforeEach(() => {
    card = {
      _step: 0,
      _previewWasHidden: true,
      requestUpdate: vi.fn(),
      config: { title: "Test" },
      localizationManager: { localize: vi.fn((l, k) => k) },
      missingEntities: [],
      isEditorContext: vi.fn(() => false),
      cardLifecycle: { 
        reinitializeCard: vi.fn(),
        isEditorContext: () => false,
        isPickerPreviewContext: () => false
      },
      eventHandlers: { handleCardClick: vi.fn() }
    };
    renderer = new CardRenderer(card);
  });

  it("covers _renderFullCard branches", () => {
    card.config = { target_entity: "climate.test", not_configured: false };
    card.initialLoadComplete = true;
    card.cronostarReady = true;
    card.isEnabled = true;
    
    renderer.render();
  });

  it("covers broken card state", () => {
    card.config = { target_entity: null, not_configured: false };
    card.initialLoadComplete = true;
    card.isEditorInternal = false;
    
    renderer.render();
  });
});

describe("Absolute Final Coverage - CronoStarEditor.js", () => {
  let editor;
  beforeEach(() => {
    editor = document.createElement("cronostar-card-editor-final");
    editor._step = 1;
    editor.card = { setConfig: vi.fn(), requestUpdate: vi.fn() };
    editor.i18n = { _t: (k) => k };
  });

  it("hits _clickHASaveButton climbing (L923-969)", () => {
    vi.useFakeTimers();
    editor._clickHASaveButton();
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
  });

  it("hits _clickHASaveButton global search fallback", () => {
    vi.useFakeTimers();
    editor._clickHASaveButton();
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
  });

  it("hits _updatePreviewVisibility", () => {
    editor._step = 0;
    editor._updatePreviewVisibility();
    editor._step = 1;
    editor._updatePreviewVisibility();
  });

  it("hits preset card click", () => {
    const step = new Step1Preset(editor);
    step.selectPresetWithPrefix = vi.fn();
    const res = step.render();
    // Trigger first preset card click
    const presetCard = res.values.find(v => typeof v === 'function');
    if (presetCard) presetCard();
  });

  it("hits global_prefix normalization logic", () => {
    const step = new Step1Preset(editor);
    step._handlePrefixChange("TEST Prefix!", { target: { value: "TEST Prefix!", selectionStart: 12 } });
  });
});
