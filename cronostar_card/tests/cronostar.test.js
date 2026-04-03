// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock dependencies
vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
  return {
    ...actual,
    css: (s) => s,
  };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));
vi.mock("../src/config.js", () => ({
  VERSION: "1.0.0",
  extractCardConfig: vi.fn(c => c)
}));

// Mock all managers
vi.mock("../src/managers/state_manager.js", () => ({ StateManager: class { setData = vi.fn() } }));
vi.mock("../src/managers/profile_manager.js", () => ({ ProfileManager: class {} }));
vi.mock("../src/managers/selection_manager.js", () => ({ SelectionManager: class {} }));
vi.mock("../src/managers/chart_manager.js", () => ({ ChartManager: class { isInitialized = vi.fn(() => true); updateData = vi.fn(); recreateChartOptions = vi.fn() } }));
vi.mock("../src/handlers/keyboard_handler.js", () => ({ KeyboardHandler: class {} }));
vi.mock("../src/handlers/pointer_handler.js", () => ({ PointerHandler: class {} }));
vi.mock("../src/managers/localization_manager.js", () => ({ LocalizationManager: class { localize = vi.fn((l, k) => k) } }));
vi.mock("../src/core/CardLifecycle.js", () => ({ 
  CardLifecycle: class { 
    constructor() { this._hass = null; }
    setConfig = vi.fn(); 
    updated = vi.fn(); 
    setHass = vi.fn((h) => { this._hass = h; }); 
    connectedCallback = vi.fn(); 
    disconnectedCallback = vi.fn(); 
    firstUpdated = vi.fn(); 
  } 
}));
vi.mock("../src/core/CardRenderer.js", () => ({ CardRenderer: class { render = vi.fn(() => "RENDERED") } }));
vi.mock("../src/core/CardEventHandlers.js", () => ({ CardEventHandlers: class { showNotification = vi.fn(); handleAddProfile = vi.fn(); handleDeleteProfile = vi.fn() } }));
vi.mock("../src/core/CardSync.js", () => ({ CardSync: class {} }));
vi.mock("../src/core/CardContext.js", () => ({ CardContext: class { registerManager = vi.fn() } }));
vi.mock("../src/utils.js", () => ({
  Logger: { log: vi.fn(), chart: vi.fn(), error: vi.fn(), warn: vi.fn(), setEnabled: vi.fn() },
  checkIsEditorContext: vi.fn(() => false)
}));

import { CronoStarCard } from "../src/core/CronoStar.js";

describe("CronoStarCard - Comprehensive Coverage", () => {
  let card;

  beforeAll(() => {
    if (!customElements.get("cronostar-card-final-merged")) {
      customElements.define("cronostar-card-final-merged", CronoStarCard);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    card = document.createElement("cronostar-card-final-merged");
    const mockHass = { callService: vi.fn(() => Promise.resolve()) };
    card.hass = mockHass;
  });

  it("exercises properties and static methods", () => {
    expect(CronoStarCard.properties).toHaveProperty("hass");
    expect(CronoStarCard.getConfigElement().tagName).toBe("CRONOSTAR-CARD-EDITOR");
    expect(CronoStarCard.getStubConfig()).toHaveProperty("type");
  });

  it("exercises getCardSize and history context", () => {
    expect(card.getCardSize()).toBe(6);
    const parent = document.createElement("hui-history-graph-card");
    parent.appendChild(card);
    expect(card.shouldUpdate()).toBe(false);

    // Test el.parentNode branch
    const mockEl1 = { parentNode: { tagName: "HUI-HISTORY-GRAPH-CARD" } };
    expect(card._isInHistoryContext.call(mockEl1)).toBe(true);

    // Test el.host branch
    const mockEl2 = { host: { tagName: "HUI-HISTORY-GRAPH-CARD" } };
    expect(card._isInHistoryContext.call(mockEl2)).toBe(true);

    // Test catch block in _isInHistoryContext
    const mockElError = { get parentNode() { throw new Error("fail") } };
    expect(card._isInHistoryContext.call(mockElError)).toBe(false);
  });

  it("exercises updated branches", () => {
    const changed = new Map();
    card.isPreview = true;
    card.updated(changed);

    changed.set("previewData", null);
    card.previewData = {
      schedule: [{ time: "10:00", value: 20 }],
      meta: { language: "it" },
      container_meta: { a: 1 } // To be deleted
    };
    card.stateManager = { setData: vi.fn() };
    card.updated(changed);
    expect(card.language).toBe("it");
    expect(card.previewData.container_meta).toBeUndefined();

    card.previewData = [{time: "11:00", value: 22}]; // array case
    card.updated(changed);

    // Test when previewData has NO container_meta (branch coverage)
    card.previewData = { schedule: [] };
    card.updated(changed);

    // Test when previewData is not an object (isFullObject = false)
    card.previewData = "invalid";
    card.updated(changed);
  });

  it("exercises render branches", () => {
    card.initialLoadComplete = false;
    card.previewData = null;
    card.isMenuOpen = false;
    card.isPreview = false;

    // First call: isWaitingForData=true, _loggedWait=false
    card.render();
    expect(card._loggedWait).toBe(true);

    // Second call: isWaitingForData=true, _loggedWait=true (no extra log)
    card.render();
    expect(card._loggedWait).toBe(true);

    // Third call: isWaitingForData=false, _loggedWait=true
    card.initialLoadComplete = true;
    card.render();
    expect(card._loggedWait).toBe(false);

    // Test when cardRenderer is null
    card.cardRenderer = null;
    expect(card.render()).toBeNull();
  });

  it("exercises hass setter/getter branches", () => {
      card.cardLifecycle = null;
      card.hass = { a: 1 }; // should not throw
      expect(card.hass).toBeUndefined();
  });

  it("exercises setConfig branches", () => {
    card.config = { a: 1 };
    card.setConfig({ a: 1 }); // early return
    expect(card.cardLifecycle.setConfig).not.toHaveBeenCalled();

    card.cardLifecycle.setConfig.mockImplementation(() => { throw new Error("Fail"); });
    card.setConfig({ a: 2 });
    expect(card.eventHandlers.showNotification).toHaveBeenCalled();

    card.cardLifecycle = null;
    card.setConfig({ a: 3 });
  });

  it("exercises lifecycle methods", () => {
    card.connectedCallback();
    card.disconnectedCallback();
    card.firstUpdated();
    expect(card.cardLifecycle.firstUpdated).toHaveBeenCalled();
  });

  it("exercises menu wrappers and error paths", () => {
    card.handleEditConfig(3);
    expect(card.editorStep).toBe(3);
    
    // handleAddProfile error path
    card.eventHandlers = { handleAddProfile: () => { throw new Error("fail") } };
    card.handleAddProfile(); // should catch

    // handleDeleteProfile error path
    card.eventHandlers = { handleDeleteProfile: () => { throw new Error("fail") } };
    card.handleDeleteProfile(); // should catch
  });

  it("exercises handleDeleteController error path", async () => {
    vi.stubGlobal("confirm", () => true);
    card.hass.callService.mockRejectedValue(new Error("Fail"));
    await card.handleDeleteController();
    expect(card.eventHandlers.showNotification).toHaveBeenCalled();
  });


  it("exercises handleDeleteController branches", async () => {
    vi.stubGlobal("confirm", () => true);
    vi.useFakeTimers();
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, configurable: true });
    
    card.config = { global_prefix: "p_" };
    await card.handleDeleteController();
    
    vi.advanceTimersByTime(1500);
    expect(reloadSpy).toHaveBeenCalled();
    vi.useRealTimers();

    vi.stubGlobal("confirm", () => false);
    await card.handleDeleteController();
  });
});
