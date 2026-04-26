// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---
vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
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
vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual("../src/config.js");
  return {
    ...actual,
    VERSION: "6.8.6",
    extractCardConfig: vi.fn((c) => c),
    validateConfig: vi.fn((c) => ({
        ...actual.DEFAULT_CONFIG,
        ...c,
        preset_type: c.preset_type || "thermostat",
        global_prefix: c.global_prefix || "p_",
        logging_enabled: true,
        hour_base: { value: 0, determined: false },
        not_configured: false
    })),
  };
});

// Mock Logger
vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    Logger: {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setEnabled: vi.fn(),
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
      config: { global_prefix: "p_", view_mode: "admin", target_entity: "climate.test", profiles_select_entity: "select.test", enabled_entity: "switch.test" },
      _showChart: true,
      requestUpdate: vi.fn(),
      chartManager: { 
        isInitialized: vi.fn(() => true), 
        resize: null, // Force use of chart.resize
        update: vi.fn(),
        chart: { resize: vi.fn(), update: vi.fn() }
      },
      entityStates: {},
      cronostarReady: true,
      initialLoadComplete: true,
      _cardConnected: true,
      cardSync: { updateAutomationSync: vi.fn() }
    };
    lifecycle = new CardLifecycle(card);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hits syncChartVisibility (inlined in setHass)", () => {
    card.config.show_chart_entity = "input_boolean.show";
    const hass = { states: { "input_boolean.show": { state: "on" } } };
    card._showChart = false;
    lifecycle.setHass(hass);
    vi.advanceTimersByTime(100);
    expect(card.chartManager.chart.resize).toHaveBeenCalled();
  });

  it("hits setHass backendHasId for enabled (L428-429)", () => {
    card.entityStates = { enabled: "on" };
    const hass = { states: {} };
    lifecycle.setHass(hass);
    expect(card.isEnabled).toBe(true);
  });

  it("hits setHass backendHasId for selector (L463-464)", () => {
    card.entityStates = { selector: "P1" };
    card.selectedProfile = "P2";
    const hass = { states: {} };
    lifecycle.setHass(hass);
    expect(card.selectedProfile).toBe("P1");
  });

  it("hits setHass missing selector (L476, 479)", () => {
    card.config.profiles_select_entity = "select.missing";
    card.entityStates = { selector: "unknown" }; 
    const hass = { states: {} };
    lifecycle.setHass(hass);
    expect(card.missingEntities).toContain("select.missing");
  });

  it("hits interval chartManager.update (L738)", () => {
    lifecycle.setHass({ states: {} });
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
    card._hass = { callWS: vi.fn().mockResolvedValue({ 
      success: true, 
      response: {
        entity_states: {}, 
        available_profiles: ["P1", "P2"] 
      }
    }) };
    await lifecycle.registerCard(card._hass);
    expect(card.profileOptions).toEqual(["P1", "P2"]);
  });

  it("hits missing target_entity check", () => {
    card.config.target_entity = "climate.missing";
    card.entityStates = { target: "unknown" }; 
    const hass = { states: {} };
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
      localizationManager: { localize: vi.fn((l, k) => k) }
    };
    renderer = new CardRenderer(card);
  });

  it("covers _renderFullCard branches", () => {
    card.config = { target_entity: "climate.test", not_configured: false };
    card.cardLifecycle = { isPickerPreviewContext: () => false, isEditorContext: () => false };
    card.initialLoadComplete = true;
    card.cronostarReady = true;
    card.isEnabled = true;
    
    renderer.render();
  });

  it("covers broken card state", () => {
    card.config = { target_entity: null, not_configured: false };
    card.cardLifecycle = { isPickerPreviewContext: () => false, isEditorContext: () => false };
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
    const parent = document.createElement("div");
    const btn = document.createElement("mwc-button");
    btn.setAttribute("slot", "primaryAction");
    const spy = vi.spyOn(btn, "click");
    parent.appendChild(btn);
    parent.appendChild(editor);
    
    editor._clickHASaveButton();
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("hits _clickHASaveButton global search fallback", () => {
    vi.useFakeTimers();
    const btn = document.createElement("mwc-button");
    btn.setAttribute("slot", "primaryAction");
    const spy = vi.spyOn(btn, "click");
    document.body.appendChild(btn);
    
    vi.spyOn(editor, "_deepQuerySelector").mockReturnValue(btn);
    
    editor._clickHASaveButton();
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalled();
    document.body.removeChild(btn);
    vi.useRealTimers();
  });

  it("hits _updatePreviewVisibility", () => {
    editor._step = 0;
    editor._updatePreviewVisibility(); 
    
    editor._step = 1;
    editor._updatePreviewVisibility();
  });
});

describe("Absolute Final Coverage - Step1Preset.js", () => {
  let editor, step;
  beforeEach(() => {
    editor = {
      _selectedPreset: "thermostat",
      _config: { global_prefix: "old_", target_entity: "climate.test" },
      i18n: { _t: (k) => k },
      _updateConfig: vi.fn(),
      _handleSaveAndClose: vi.fn(),
      _handleAdvancedConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      renderEntityPicker: vi.fn(() => ({})),
      handleShowHelp: vi.fn()
    };
    step = new Step1Preset(editor);
  });

  it("hits preset card click", () => {
    step.selectPresetWithPrefix("thermostat");
    expect(editor._updateConfig).toHaveBeenCalled();
  });

  it("hits global_prefix normalization logic", () => {
    step.selectPresetWithPrefix("thermostat");
    expect(editor._updateConfig).toHaveBeenCalled();
  });
});
