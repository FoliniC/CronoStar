// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Lit mock ────────────────────────────────────────────────────────────────
vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
  return { ...actual, css: (s) => s };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));
vi.mock("../src/config.js", () => ({
  VERSION: "1.0.0",
  extractCardConfig: vi.fn((c) => c),
}));

// ─── Managers / Handlers mocks ───────────────────────────────────────────────
vi.mock("../src/managers/state_manager.js", () => ({
  StateManager: class { setData = vi.fn(); },
}));
vi.mock("../src/managers/profile_manager.js", () => ({
  ProfileManager: class {},
}));
vi.mock("../src/managers/selection_manager.js", () => ({
  SelectionManager: class {},
}));
vi.mock("../src/managers/chart_manager.js", () => ({
  ChartManager: class {
    isInitialized = vi.fn(() => true);
    updateData = vi.fn();
    recreateChartOptions = vi.fn();
    resize = vi.fn();
    chart = { update: vi.fn() };
  },
}));
vi.mock("../src/handlers/keyboard_handler.js", () => ({
  KeyboardHandler: class {},
}));
vi.mock("../src/handlers/pointer_handler.js", () => ({
  PointerHandler: class {},
}));
vi.mock("../src/managers/localization_manager.js", () => ({
  LocalizationManager: class { localize = vi.fn((l, k) => k); },
}));
vi.mock("../src/core/CardLifecycle.js", () => ({
  CardLifecycle: class {
    constructor() { this._hass = null; }
    setConfig = vi.fn();
    updated = vi.fn();
    setHass = vi.fn(function (h) { this._hass = h; });
    connectedCallback = vi.fn();
    disconnectedCallback = vi.fn();
    firstUpdated = vi.fn();
    reinitializeCard = vi.fn();
    registerCard = vi.fn();
  },
}));
vi.mock("../src/core/CardRenderer.js", () => ({
  CardRenderer: class { render = vi.fn(() => "RENDERED"); },
}));
vi.mock("../src/core/CardEventHandlers.js", () => ({
  CardEventHandlers: class {
    showNotification = vi.fn();
    handleAddProfile = vi.fn();
    handleDeleteProfile = vi.fn();
  },
}));
vi.mock("../src/core/CardSync.js", () => ({ CardSync: class {} }));

// CardContext mocked as vi.fn() so individual tests can override it once
vi.mock("../src/core/CardContext.js", () => ({
  CardContext: vi.fn().mockImplementation(() => ({ registerManager: vi.fn() })),
}));

vi.mock("../src/utils.js", () => ({
  Logger: {
    log: vi.fn(), chart: vi.fn(), error: vi.fn(),
    warn: vi.fn(), setEnabled: vi.fn(), load: vi.fn(),
  },
  checkIsEditorContext: vi.fn(() => false),
}));

import { CronoStarCard } from "../src/core/CronoStar.js";
import { CardContext } from "../src/core/CardContext.js";

// ─── Helper ───────────────────────────────────────────────────────────────────
let _tagCounter = 0;

function makeCard(hassOverride) {
  const tag = `cronostar-test-${_tagCounter++}`;
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends CronoStarCard {});
  }
  const card = document.createElement(tag);

  Object.defineProperty(card, "updateComplete", {
    get: () => Promise.resolve(true),
    configurable: true,
  });

  const hass = hassOverride || {
    callService: vi.fn(() => Promise.resolve()),
    callWS: vi.fn(() => Promise.resolve({ response: { success: true } })),
  };

  const lifecycle = {
    _hass: hass,
    setConfig: vi.fn(),
    updated: vi.fn(),
    connectedCallback: vi.fn(),
    disconnectedCallback: vi.fn(),
    firstUpdated: vi.fn(),
    reinitializeCard: vi.fn(),
    registerCard: vi.fn(),
  };
  card.cardLifecycle = lifecycle;

  card.stateManager = { setData: vi.fn() };
  card.chartManager = {
    isInitialized: vi.fn(() => true),
    updateData: vi.fn(),
    recreateChartOptions: vi.fn(),
    resize: vi.fn(),
    chart: { update: vi.fn() },
  };
  card.eventHandlers = {
    showNotification: vi.fn(),
    handleAddProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
  };
  card.cardRenderer = { render: vi.fn(() => "RENDERED") };
  card.localizationManager = { localize: vi.fn((l, k) => k) };

  return { card, hass, lifecycle };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC HELPERS
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – static helpers", () => {
  it("exposes all reactive properties", () => {
    const props = CronoStarCard.properties;
    expect(props).toHaveProperty("hass");
    expect(props).toHaveProperty("config");
    expect(props).toHaveProperty("initialLoadComplete");
    expect(props).toHaveProperty("_showChart");
  });

  it("getConfigElement returns the editor element", () => {
    expect(CronoStarCard.getConfigElement().tagName).toBe("CRONOSTAR-CARD-EDITOR");
  });

  it("getStubConfig returns a valid stub", () => {
    const stub = CronoStarCard.getStubConfig();
    expect(stub.type).toBe("custom:cronostar-card");
    expect(stub.not_configured).toBe(true);
  });

  it("getCardSize returns 6", () => {
    const { card } = makeCard();
    expect(card.getCardSize()).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTOR CATCH BLOCK
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – constructor catch block", () => {
  it("creates fallback cardLifecycle when CardContext throws", () => {
    CardContext.mockImplementationOnce(() => {
      throw new Error("CardContext init failure");
    });
    const tag = `cronostar-catch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    customElements.define(tag, class extends CronoStarCard {});
    const el = document.createElement(tag);
    expect(el.cardLifecycle).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldUpdate / _isInHistoryContext
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – shouldUpdate / _isInHistoryContext", () => {
  it("shouldUpdate returns truthy for standalone element NOT in history context", () => {
    const { card } = makeCard();
    const result = card.shouldUpdate(new Map());
    expect(result).toBeDefined();
  });

  it("shouldUpdate returns false inside ha-chart-base", () => {
    const { card } = makeCard();
    const parent = document.createElement("ha-chart-base");
    parent.appendChild(card);
    expect(card.shouldUpdate(new Map())).toBe(false);
  });

  it("shouldUpdate returns false inside state-history-chart-timeline", () => {
    const { card } = makeCard();
    const parent = document.createElement("state-history-chart-timeline");
    parent.appendChild(card);
    expect(card.shouldUpdate(new Map())).toBe(false);
  });

  it("shouldUpdate returns false inside hui-history-graph-card", () => {
    const { card } = makeCard();
    const parent = document.createElement("hui-history-graph-card");
    parent.appendChild(card);
    expect(card.shouldUpdate(new Map())).toBe(false);
  });

  it("_isInHistoryContext returns false when traversal throws", () => {
    const { card } = makeCard();
    const badEl = {
      tagName: "DIV",
      get parentElement() { throw new Error("traversal error"); },
    };
    expect(card._isInHistoryContext.call(badEl)).toBe(false);
  });

  it("_isInHistoryContext returns false for standalone element", () => {
    const { card } = makeCard();
    expect(card._isInHistoryContext()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hass getter / setter
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – hass getter/setter", () => {
  it("getter returns _hass from cardLifecycle", () => {
    const { card, hass } = makeCard();
    expect(card.hass).toBe(hass);
  });

  it("getter returns undefined when cardLifecycle is null", () => {
    const { card } = makeCard();
    card.cardLifecycle = null;
    expect(card.hass).toBeUndefined();
  });

  it("setter calls cardLifecycle.setHass", () => {
    const tag = `cronostar-hass-set-${Date.now()}`;
    customElements.define(tag, class extends CronoStarCard {});
    const el = document.createElement(tag);
    const spy = vi.spyOn(el.cardLifecycle, "setHass");
    el.hass = { states: {} };
    expect(spy).toHaveBeenCalled();
  });

  it("setter is a no-op when cardLifecycle is null", () => {
    const { card } = makeCard();
    card.cardLifecycle = null;
    expect(() => { card.hass = {}; }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updated() logic
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – updated()", () => {
  it("triggers chart resize when _showChart becomes true", async () => {
    const { card } = makeCard();
    card._showChart = true;
    card.updated(new Map([["_showChart", false]]));
    await Promise.resolve();
    expect(card.chartManager.resize).toHaveBeenCalled();
    expect(card.chartManager.chart.update).toHaveBeenCalledWith("none");
  });

  it("skips resize when _showChart is false", async () => {
    const { card } = makeCard();
    card._showChart = false;
    card.updated(new Map([["_showChart", true]]));
    await Promise.resolve();
    expect(card.chartManager.resize).not.toHaveBeenCalled();
  });

  it("skips resize when chartManager is not initialized", async () => {
    const { card } = makeCard();
    card._showChart = true;
    card.chartManager.isInitialized.mockReturnValue(false);
    card.updated(new Map([["_showChart", false]]));
    await Promise.resolve();
    expect(card.chartManager.resize).not.toHaveBeenCalled();
  });

  it("delegates to cardLifecycle.updated", () => {
    const { card } = makeCard();
    const changed = new Map();
    card.updated(changed);
    expect(card.cardLifecycle.updated).toHaveBeenCalledWith(changed);
  });

  it("handles previewData in updated()", () => {
    const { card } = makeCard();
    card.previewData = { 
      schedule: [{ x: 1, y: 10 }], 
      meta: { language: "it" },
      container_meta: { some: "internal_data" }
    };
    card.updated(new Map([["previewData", null]]));
    expect(card.stateManager.setData).toHaveBeenCalledWith([{ x: 1, y: 10 }]);
    expect(card.language).toBe("it");
    expect(card.previewData.container_meta).toBeUndefined();
  });

  it("handles isPreview=true in updated()", () => {
    const { card } = makeCard();
    card.isPreview = true;
    card.updated(new Map());
    expect(card.initialLoadComplete).toBe(true);
    expect(card.cronostarReady).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// render() overlay logging
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – render() overlay logging", () => {
  it("logs 'Waiting' on first call when data not loaded", () => {
    const { card } = makeCard();
    card.isPreview = false;
    card.initialLoadComplete = false;
    delete card._loggedWait;

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    card.render();

    expect(card._loggedWait).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Waiting for data"),
      expect.anything()
    );
    spy.mockRestore();
  });

  it("logs 'Data loaded' and clears _loggedWait when data arrives", () => {
    const { card } = makeCard();
    card.isPreview = false;
    card.initialLoadComplete = true;
    card._loggedWait = true;

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    card.render();

    expect(card._loggedWait).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Data loaded"),
      expect.anything()
    );
    spy.mockRestore();
  });

  it("returns null when cardRenderer is null", () => {
    const { card } = makeCard();
    card.cardRenderer = null;
    card.initialLoadComplete = true;
    expect(card.render()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setConfig
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – setConfig", () => {
  it("early-returns when config is semantically identical", () => {
    const { card } = makeCard();
    const cfg = { type: "custom:cronostar", target_entity: "s.t" };
    card.config = cfg;
    card.setConfig(cfg);
    expect(card.cardLifecycle.setConfig).not.toHaveBeenCalled();
  });

  it("logs error and returns when cardLifecycle is null", () => {
    const { card } = makeCard();
    card.config = null;
    card.cardLifecycle = null;
    expect(() => card.setConfig({ type: "x" })).not.toThrow();
    expect(card.eventHandlers.showNotification).not.toHaveBeenCalled();
  });

  it("catch: shows notification when setConfig throws", () => {
    const { card } = makeCard();
    card.config = null;
    card.cardLifecycle.setConfig.mockImplementationOnce(() => {
      throw new Error("Boom");
    });
    card.setConfig({ type: "x" });
    expect(card.eventHandlers.showNotification).toHaveBeenCalledWith(
      "error.config_error",
      "error"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle delegation
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – lifecycle delegation", () => {
  it("connectedCallback delegates to cardLifecycle", () => {
    const { card } = makeCard();
    card.connectedCallback();
    expect(card.cardLifecycle.connectedCallback).toHaveBeenCalled();
  });

  it("disconnectedCallback delegates to cardLifecycle", () => {
    const { card } = makeCard();
    card.disconnectedCallback();
    expect(card.cardLifecycle.disconnectedCallback).toHaveBeenCalled();
  });

  it("firstUpdated delegates and handles async reinit", async () => {
    const { card } = makeCard();
    card._showChart = true;
    card.chartManager.isInitialized.mockReturnValue(false);

    card.firstUpdated();
    await Promise.resolve();

    expect(card.cardLifecycle.firstUpdated).toHaveBeenCalled();
    expect(card.cardLifecycle.reinitializeCard).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// _deepQuerySelector
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – _deepQuerySelector", () => {
  it("returns null when selector matches nothing", () => {
    const { card } = makeCard();
    card.attachShadow({ mode: "open" });
    expect(card._deepQuerySelector(".nonexistent")).toBeNull();
  });

  it("finds element in nested shadow root", () => {
    const { card } = makeCard();
    const shadow = card.attachShadow({ mode: "open" });
    const mid = document.createElement("div");
    const midShadow = mid.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    inner.id = "deep-target";
    midShadow.appendChild(inner);
    shadow.appendChild(mid);
    expect(card._deepQuerySelector("#deep-target")).toBe(inner);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleChart
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – toggleChart", () => {
  it("toggles _showChart and updates display", async () => {
    const { card } = makeCard();
    const shadow = card.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.className = "chart-container";
    container.style.display = "none";
    shadow.appendChild(container);

    await card.toggleChart();
    expect(card._showChart).toBe(true);
    expect(container.style.display).toBe("block");
  });

  it("calls HA service if input_boolean exists", async () => {
    const { card } = makeCard();
    card.config = { global_prefix: "p_" };
    const mockHass = {
      states: { "input_boolean.p_show_chart": { state: "off" } },
      callService: vi.fn(),
    };
    // Set _hass directly to avoid setter delegation issues in mock environment
    if (card.cardLifecycle) {
      card.cardLifecycle._hass = mockHass;
    }
    
    // Toggle ON
    await card.toggleChart();
    expect(card._showChart).toBe(true);
    expect(mockHass.callService).toHaveBeenCalledWith(
      "input_boolean",
      "turn_on",
      { entity_id: "input_boolean.p_show_chart" }
    );

    // Toggle OFF
    await card.toggleChart();
    expect(card._showChart).toBe(false);
    expect(mockHass.callService).toHaveBeenCalledWith(
      "input_boolean",
      "turn_off",
      { entity_id: "input_boolean.p_show_chart" }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleEditConfig / handleDeleteController
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – Controller management", () => {
  it("handleEditConfig sets isEditorInternal=true", () => {
    const { card } = makeCard();
    card.config = { type: "x" };
    card.handleEditConfig(2);
    expect(card.isEditorInternal).toBe(true);
    expect(card.editorStep).toBe(2);
    expect(card._lastGoodConfig).toEqual({ type: "x" });
  });

  it("handleDeleteController early returns on cancel", async () => {
    const { card, hass } = makeCard();
    vi.stubGlobal("confirm", () => false);
    await card.handleDeleteController();
    expect(hass.callService).not.toHaveBeenCalled();
  });

  it("handleDeleteController calls service on confirm", async () => {
    const { card, hass } = makeCard();
    card.config = { global_prefix: "p_", preset_type: "thermostat" };
    vi.stubGlobal("confirm", () => true);
    vi.useFakeTimers();
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, configurable: true });

    await card.handleDeleteController();
    expect(hass.callService).toHaveBeenCalled();
    
    vi.advanceTimersByTime(1500);
    expect(reloadSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("handleDeleteController shows notification on service error", async () => {
    const { card, hass } = makeCard();
    card.config = { global_prefix: "p_" };
    vi.stubGlobal("confirm", () => true);
    hass.callService.mockRejectedValueOnce(new Error("Service Failure"));
    
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await card.handleDeleteController();

    expect(card.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.stringContaining("Service Failure"),
      "error"
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper methods
// ─────────────────────────────────────────────────────────────────────────────
describe("CronoStarCard – Wrapper methods", () => {
  it("handleAddProfile delegates and swallows error", () => {
    const { card } = makeCard();
    card.eventHandlers.handleAddProfile.mockImplementation(() => { throw new Error("err"); });
    expect(() => card.handleAddProfile()).not.toThrow();
    expect(card.eventHandlers.handleAddProfile).toHaveBeenCalled();
  });

  it("handleDeleteProfile delegates and swallows error", () => {
    const { card } = makeCard();
    card.eventHandlers.handleDeleteProfile.mockImplementation(() => { throw new Error("err"); });
    expect(() => card.handleDeleteProfile()).not.toThrow();
    expect(card.eventHandlers.handleDeleteProfile).toHaveBeenCalled();
  });
});
