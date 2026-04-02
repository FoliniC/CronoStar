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
  Logger: { log: vi.fn(), chart: vi.fn(), error: vi.fn(), setEnabled: vi.fn() },
  checkIsEditorContext: vi.fn(() => false)
}));

import { CronoStarCard } from "../src/core/CronoStar.js";

describe("CronoStarCard Coverage Boost", () => {
  let card;

  beforeAll(() => {
    if (!customElements.get("cronostar-card-test")) {
      customElements.define("cronostar-card-test", CronoStarCard);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    card = document.createElement("cronostar-card-test");
    // Ensure hass is actually stored in the mock
    const mockHass = { callService: vi.fn(() => Promise.resolve()) };
    card.hass = mockHass;
  });

  it("properties should return expected keys", () => {
    const props = CronoStarCard.properties;
    expect(props).toHaveProperty("hass");
    expect(props).toHaveProperty("config");
    expect(props).toHaveProperty("integrationVersion");
  });

  it("setConfig early return when same config", () => {
    card.config = { a: 1 };
    card.setConfig({ a: 1 });
    expect(card.cardLifecycle.setConfig).not.toHaveBeenCalled();
  });

  it("updated handles full object previewData with meta", () => {
    const changed = new Map([["previewData", null]]);
    card.previewData = {
      schedule: [{ time: "10:00", value: 20 }],
      meta: { language: "it", title: "Test" },
      container_meta: {} // Should be deleted
    };
    card.stateManager = { setData: vi.fn() };
    
    card.updated(changed);
    
    expect(card.previewData.container_meta).toBeUndefined();
    expect(card.stateManager.setData).toHaveBeenCalled();
    expect(card.language).toBe("it");
  });

  it("render logs wait state", () => {
    const consoleSpy = vi.spyOn(console, "info");
    card.initialLoadComplete = false;
    card.render();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Waiting for data"), expect.any(Object));
    
    // Reset spy count
    consoleSpy.mockClear();
    card.initialLoadComplete = true;
    card.render();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Data loaded"), expect.any(Object));
  });

  it("handleDeleteController reloads on success", async () => {
    vi.stubGlobal("confirm", () => true);
    vi.useFakeTimers();
    
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      configurable: true,
      writable: true
    });
    
    card.config = { global_prefix: "p_", preset_type: "t" };
    // Double check hass is there
    expect(card.hass).toBeDefined();
    
    await card.handleDeleteController();
    
    vi.advanceTimersByTime(1500);
    expect(reloadSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("shouldUpdate handles history context correctly", () => {
    const historySpy = vi.spyOn(card, "_isInHistoryContext");
    
    historySpy.mockReturnValue(true);
    expect(card.shouldUpdate()).toBe(false);
    
    historySpy.mockReturnValue(false);
    expect(card.shouldUpdate()).toBe(true);
  });

  it("exercises menu handler wrappers and errors", () => {
    card.eventHandlers = {
      handleAddProfile: vi.fn().mockImplementation(() => { throw new Error("fail") }),
      handleDeleteProfile: vi.fn()
    };
    expect(() => card.handleAddProfile()).not.toThrow();
    card.handleDeleteProfile();
    expect(card.eventHandlers.handleDeleteProfile).toHaveBeenCalled();
  });
});
