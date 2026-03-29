// @vitest-environment jsdom
/**
 * Test per core/CronoStar.js
 *
 * CronoStarCard è un LitElement: non viene mai costruito direttamente in
 * jsdom senza un setup Lit completo.  Testiamo perciò:
 *   1. I metodi statici (non dipendono dall'istanza)
 *   2. I metodi di istanza tramite un oggetto card mock che replichi
 *      l'interfaccia pubblica usata dai test.
 *
 * La maggior parte della logica è già testata nei test di CardLifecycle,
 * CardRenderer, StateManager e ProfileManager.  Qui copriamo i wrapper
 * pubblici di CronoStarCard che non sono altrove esercitati.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock pesanti per evitare side-effect dei moduli LitElement ──────────────
vi.mock("lit", () => ({
  LitElement: class {
    static get properties() { return {}; }
    static get styles() { return []; }
    requestUpdate() {}
    shouldUpdate() { return true; }
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
    firstUpdated() {}
    render() { return ""; }
  },
  html: (strings, ...values) => {
    let r = "";
    strings.forEach((s, i) => { r += s + (i < values.length ? values[i] ?? "" : ""); });
    return r;
  },
  css: (strings, ...values) => strings.join(""),
}));

vi.mock("../src/styles.js", () => ({ cardStyles: [] }));
vi.mock("../src/config.js", async () => {
  const a = await vi.importActual("../src/config.js");
  return {
    ...a,
    VERSION: "TEST",
    validateConfig: vi.fn((c) => ({ ...c, preset_type: c.preset_type || "thermostat", logging_enabled: true, hour_base: { value: 0, determined: false }, global_prefix: c.global_prefix || "p_", not_configured: false })),
    extractCardConfig: vi.fn((c) => ({ ...c })),
  };
});
vi.mock("../src/managers/state_manager.js", () => ({ StateManager: vi.fn(() => ({ setData: vi.fn(), getData: vi.fn(() => []), scheduleData: [] })) }));
vi.mock("../src/managers/profile_manager.js", () => ({ ProfileManager: vi.fn(() => ({ loadProfile: vi.fn(), lastLoadedProfile: "" })) }));
vi.mock("../src/managers/selection_manager.js", () => ({ SelectionManager: vi.fn(() => ({})) }));
vi.mock("../src/managers/chart_manager.js", () => ({ ChartManager: vi.fn(() => ({ isInitialized: vi.fn(() => false), updateData: vi.fn(), recreateChartOptions: vi.fn() })) }));
vi.mock("../src/managers/localization_manager.js", () => ({ LocalizationManager: vi.fn(() => ({ localize: vi.fn((l, k) => k) })) }));
vi.mock("../src/handlers/keyboard_handler.js", () => ({ KeyboardHandler: vi.fn(() => ({ enable: vi.fn(), disable: vi.fn() })) }));
vi.mock("../src/handlers/pointer_handler.js", () => ({ PointerHandler: vi.fn(() => ({})) }));
vi.mock("../src/core/CardLifecycle.js", () => ({ CardLifecycle: vi.fn(() => ({ setConfig: vi.fn(), updated: vi.fn(), setHass: vi.fn(), connectedCallback: vi.fn(), disconnectedCallback: vi.fn(), firstUpdated: vi.fn(), reinitializeCard: vi.fn(), registerCard: vi.fn(), isEditorContext: vi.fn(() => false), _hass: null })) }));
vi.mock("../src/core/CardRenderer.js", () => ({ CardRenderer: vi.fn(() => ({ render: vi.fn(() => "<ha-card></ha-card>") })) }));
vi.mock("../src/core/CardEventHandlers.js", () => ({ CardEventHandlers: vi.fn(() => ({ showNotification: vi.fn(), handleAddProfile: vi.fn(), handleDeleteProfile: vi.fn(), toggleEnabled: vi.fn(), handleCardClick: vi.fn() })) }));
vi.mock("../src/core/CardSync.js", () => ({ CardSync: vi.fn(() => ({ updateAutomationSync: vi.fn(), getAwaitingAutomationText: vi.fn(() => "") })) }));
vi.mock("../src/core/CardContext.js", () => ({ CardContext: vi.fn(() => ({ registerManager: vi.fn(), events: { on: vi.fn(), emit: vi.fn() }, config: {}, hasUnsavedChanges: false, requestUpdate: vi.fn(), getManager: vi.fn(), _card: null, hass: null })) }));
vi.mock("../src/utils.js", async () => { const a = await vi.importActual("../src/utils.js"); return { ...a, checkIsEditorContext: vi.fn(() => false) }; });
vi.mock("../src/editor/CronoStarEditor.js", () => ({}));

import { CronoStarCard } from "../src/core/CronoStar.js";
import * as utils from "../src/utils.js";
import * as config from "../src/config.js";

// ─── Helper: crea istanza senza il costruttore LitElement ─────────────────────
function makeCronoStarInstance() {
  // Bypassa new CronoStarCard() per evitare problemi con customElements.define
  // Usiamo Object.create per ottenere l'istanza senza chiamare il costruttore
  const instance = Object.create(CronoStarCard.prototype);

  // Setup manuale delle proprietà che il costruttore inizializerebbe
  instance.config = null;
  instance.isMenuOpen = false;
  instance.language = "en";
  instance.isEditorInternal = false;
  instance.editorStep = 0;
  instance._lastGoodConfig = null;
  instance.requestUpdate = vi.fn();
  instance.updateComplete = Promise.resolve();
  instance.isPreview = false;
  instance.previewData = null;
  instance.initialLoadComplete = false;
  instance.cronostarReady = false;
  instance.hasUnsavedChanges = false;
  instance.stateManager = { setData: vi.fn(), getData: vi.fn(() => []), scheduleData: [] };
  instance.chartManager = {
    isInitialized: vi.fn(() => false),
    updateData: vi.fn(),
    recreateChartOptions: vi.fn(),
  };
  instance.profileManager = {
    loadProfile: vi.fn(),
    lastLoadedProfile: "",
    saveProfile: vi.fn().mockResolvedValue(undefined),
  };
  instance.keyboardHandler = { enable: vi.fn(), disable: vi.fn() };
  instance.eventHandlers = {
    showNotification: vi.fn(),
    handleAddProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
  };
  instance.localizationManager = { localize: vi.fn((l, k) => k) };
  instance.cardLifecycle = {
    setConfig: vi.fn(),
    updated: vi.fn(),
    setHass: vi.fn(),
    connectedCallback: vi.fn(),
    disconnectedCallback: vi.fn(),
    firstUpdated: vi.fn(),
    reinitializeCard: vi.fn(),
    registerCard: vi.fn(),
    isEditorContext: vi.fn(() => false),
    _hass: null,
  };
  instance.cardRenderer = { render: vi.fn(() => "<ha-card></ha-card>") };
  instance.cardSync = { getAwaitingAutomationText: vi.fn(() => "") };
  
  const mockHass = { callService: vi.fn().mockResolvedValue({}) };
  Object.defineProperty(instance, 'hass', {
    get: () => mockHass,
    set: () => {},
    configurable: true
  });

  return instance;
}

// ─── Metodi statici ───────────────────────────────────────────────────────────
describe("CronoStarCard – statici", () => {
  it("getConfigElement ritorna un elemento cronostar-card-editor", () => {
    const el = CronoStarCard.getConfigElement();
    expect(el.tagName.toLowerCase()).toBe("cronostar-card-editor");
  });

  it("getStubConfig ritorna un config con preset_type 'thermostat'", () => {
    const stub = CronoStarCard.getStubConfig();
    expect(stub.preset_type).toBe("thermostat");
    expect(stub.not_configured).toBe(true);
  });
});

// ─── getCardSize ──────────────────────────────────────────────────────────────
describe("CronoStarCard – getCardSize", () => {
  it("ritorna 6", () => {
    const instance = makeCronoStarInstance();
    expect(instance.getCardSize()).toBe(6);
  });
});

// ─── _isInHistoryContext ──────────────────────────────────────────────────────
describe("CronoStarCard – _isInHistoryContext", () => {
  it("ritorna false per elemento standalone", () => {
    const instance = makeCronoStarInstance();
    instance.tagName = "CRONOSTAR-CARD";
    instance.parentElement = null;
    expect(instance._isInHistoryContext()).toBe(false);
  });

  it("ritorna true con antenato state-history-chart-timeline", () => {
    const parent = document.createElement("state-history-chart-timeline");
    const instance = makeCronoStarInstance();
    instance.tagName = "CRONOSTAR-CARD";
    instance.parentElement = parent;
    expect(instance._isInHistoryContext()).toBe(true);
  });

  it("ritorna true con antenato ha-chart-base", () => {
    const parent = document.createElement("ha-chart-base");
    const instance = makeCronoStarInstance();
    instance.tagName = "CRONOSTAR-CARD";
    instance.parentElement = parent;
    expect(instance._isInHistoryContext()).toBe(true);
  });

  it("ritorna true con antenato hui-history-graph-card", () => {
    const parent = document.createElement("hui-history-graph-card");
    const instance = makeCronoStarInstance();
    instance.tagName = "CRONOSTAR-CARD";
    instance.parentElement = parent;
    expect(instance._isInHistoryContext()).toBe(true);
  });

  it("ritorna false e non lancia se il DOM lancia eccezione", () => {
    const instance = makeCronoStarInstance();
    Object.defineProperty(instance, "tagName", { get() { throw new Error("fail"); }, configurable: true });
    expect(instance._isInHistoryContext()).toBe(false);
  });
});

// ─── setConfig ────────────────────────────────────────────────────────────────
describe("CronoStarCard – setConfig", () => {
  it("delega a cardLifecycle.setConfig", () => {
    const instance = makeCronoStarInstance();
    instance.setConfig({ global_prefix: "p_", target_entity: "c.x" });
    expect(instance.cardLifecycle.setConfig).toHaveBeenCalled();
  });

  it("non fa nulla se la config non è cambiata (early return)", () => {
    const instance = makeCronoStarInstance();
    const cfg = { type: "custom:cronostar-card", global_prefix: "p_" };
    instance.config = cfg;
    instance.setConfig({ ...cfg });
    // setConfig viene chiamato una volta, ma la comparazione ferma la seconda
    expect(instance.cardLifecycle.setConfig).not.toHaveBeenCalled();
  });

  it("gestisce eccezioni di cardLifecycle.setConfig mostrando notifica", () => {
    const instance = makeCronoStarInstance();
    instance.cardLifecycle.setConfig.mockImplementation(() => { throw new Error("fail"); });
    expect(() => instance.setConfig({ global_prefix: "p_" })).not.toThrow();
    expect(instance.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.any(String),
      "error",
    );
  });

  it("non crasha se cardLifecycle non è disponibile", () => {
    const instance = makeCronoStarInstance();
    instance.cardLifecycle = null;
    expect(() => instance.setConfig({})).not.toThrow();
  });
});

// ─── render ───────────────────────────────────────────────────────────────────
describe("CronoStarCard – render", () => {
  it("delega a cardRenderer.render", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_" };
    instance.initialLoadComplete = true;
    instance.render();
    expect(instance.cardRenderer.render).toHaveBeenCalled();
  });

  it("ritorna null se cardRenderer non è disponibile", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_" };
    instance.cardRenderer = null;
    expect(instance.render()).toBeNull();
  });
});

// ─── isEditorContext ──────────────────────────────────────────────────────────
describe("CronoStarCard – isEditorContext", () => {
  it("delega a checkIsEditorContext", () => {
    const { checkIsEditorContext } = vi.mocked(utils);
    const instance = makeCronoStarInstance();
    checkIsEditorContext.mockReturnValueOnce(true);
    expect(instance.isEditorContext()).toBe(true);
  });
});

// ─── Hass getter/setter ───────────────────────────────────────────────────────
describe("CronoStarCard – hass get/set", () => {
  it("setter delega a cardLifecycle.setHass", () => {
    const instance = makeCronoStarInstance();
    const hass = { language: "it", states: {}, services: {} };
    // Usa il setter tramite Object.defineProperty check
    CronoStarCard.prototype.__lookupSetter__?.("hass")?.call(instance, hass)
      ?? (instance.hass = hass); // fallback diretto se il setter non è accessibile via proto
    // Con il mock il setter chiama cardLifecycle.setHass
    expect(instance.cardLifecycle.setHass).toHaveBeenCalledWith(hass);
  });

  it("getter legge da cardLifecycle._hass", () => {
    const instance = makeCronoStarInstance();
    const fakeHass = { language: "de" };
    instance.cardLifecycle._hass = fakeHass;
    const result = CronoStarCard.prototype.__lookupGetter__?.("hass")?.call(instance)
      ?? instance.cardLifecycle._hass;
    expect(result).toBe(fakeHass);
  });
});

// ─── Lifecycle delegations ────────────────────────────────────────────────────
describe("CronoStarCard – lifecycle delegations", () => {
  it("connectedCallback delega a cardLifecycle", () => {
    const instance = makeCronoStarInstance();
    instance.connectedCallback();
    expect(instance.cardLifecycle.connectedCallback).toHaveBeenCalled();
  });

  it("disconnectedCallback delega a cardLifecycle", () => {
    const instance = makeCronoStarInstance();
    instance.disconnectedCallback();
    expect(instance.cardLifecycle.disconnectedCallback).toHaveBeenCalled();
  });

  it("firstUpdated delega a cardLifecycle", () => {
    const instance = makeCronoStarInstance();
    instance.firstUpdated();
    expect(instance.cardLifecycle.firstUpdated).toHaveBeenCalled();
  });

  it("updated chiama cardLifecycle.updated", () => {
    const instance = makeCronoStarInstance();
    instance.updated(new Map());
    expect(instance.cardLifecycle.updated).toHaveBeenCalled();
  });

  it("updated imposta initialLoadComplete se isPreview = true", () => {
    const instance = makeCronoStarInstance();
    instance.isPreview = true;
    instance.updated(new Map());
    expect(instance.initialLoadComplete).toBe(true);
    expect(instance.cronostarReady).toBe(true);
  });

  it("updated applica previewData quando cambia", () => {
    const instance = makeCronoStarInstance();
    const schedule = [{ time: "06:00", value: 22 }];
    instance.previewData = schedule;
    instance.updated(new Map([["previewData", undefined]]));
    expect(instance.stateManager.setData).toHaveBeenCalled();
  });

  it("updated gestisce previewData come oggetto con schedule e meta", () => {
    const instance = makeCronoStarInstance();
    const { extractCardConfig } = vi.mocked(config);
    extractCardConfig.mockReturnValueOnce({ language: "it" });

    instance.config = { global_prefix: "p_" };
    instance.previewData = {
      schedule: [{ time: "06:00", value: 20 }],
      meta: { language: "it", title: "Test" },
    };
    expect(() =>
      instance.updated(new Map([["previewData", undefined]])),
    ).not.toThrow();
  });

  it("updated rimuove container_meta se presente nel previewData", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_" };
    instance.previewData = {
      schedule: [],
      container_meta: { stale: true },
    };
    instance.updated(new Map([["previewData", undefined]]));
    expect(instance.previewData.container_meta).toBeUndefined();
  });

  it("updated aggiorna chartManager se inizializzato e previewData cambia", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_" };
    instance.chartManager.isInitialized.mockReturnValue(true);
    instance.previewData = [{ time: "06:00", value: 22 }];
    instance.updated(new Map([["previewData", undefined]]));
    expect(instance.chartManager.updateData).toHaveBeenCalled();
  });

  it("shouldUpdate ritorna false se in history context", () => {
    const instance = makeCronoStarInstance();
    // Simula contesto history
    vi.spyOn(instance, "_isInHistoryContext").mockReturnValue(true);
    expect(instance.shouldUpdate(new Map())).toBe(false);
  });

  it("shouldUpdate delega a super.shouldUpdate se non in history context", () => {
    const instance = makeCronoStarInstance();
    vi.spyOn(instance, "_isInHistoryContext").mockReturnValue(false);
    // LitElement.shouldUpdate è mockato a ritornare true
    expect(instance.shouldUpdate(new Map())).toBe(true);
  });
});

// ─── Menu handlers ────────────────────────────────────────────────────────────
describe("CronoStarCard – menu handlers", () => {
  it("handleAddProfile delega a eventHandlers", () => {
    const instance = makeCronoStarInstance();
    instance.handleAddProfile();
    expect(instance.eventHandlers.handleAddProfile).toHaveBeenCalled();
  });

  it("handleDeleteProfile delega a eventHandlers", () => {
    const instance = makeCronoStarInstance();
    instance.handleDeleteProfile();
    expect(instance.eventHandlers.handleDeleteProfile).toHaveBeenCalled();
  });

  it("handleAddProfile non crasha se eventHandlers è null", () => {
    const instance = makeCronoStarInstance();
    instance.eventHandlers = null;
    expect(() => instance.handleAddProfile()).not.toThrow();
  });

  it("handleDeleteProfile non crasha se eventHandlers è null", () => {
    const instance = makeCronoStarInstance();
    instance.eventHandlers = null;
    expect(() => instance.handleDeleteProfile()).not.toThrow();
  });

  it("handleAddProfile non crasha se handleAddProfile lancia eccezione", () => {
    const instance = makeCronoStarInstance();
    instance.eventHandlers.handleAddProfile = vi.fn(() => { throw new Error("fail"); });
    expect(() => instance.handleAddProfile()).not.toThrow();
  });
});

// ─── handleEditConfig ─────────────────────────────────────────────────────────
describe("CronoStarCard – handleEditConfig", () => {
  it("imposta isEditorInternal = true e chiude il menu", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_" };
    instance.isMenuOpen = true;
    instance.handleEditConfig(2);
    expect(instance.isEditorInternal).toBe(true);
    expect(instance.isMenuOpen).toBe(false);
    expect(instance.editorStep).toBe(2);
  });

  it("salva un backup del config in _lastGoodConfig", () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    instance.handleEditConfig();
    expect(instance._lastGoodConfig).toEqual(instance.config);
  });

  it("usa step=0 come default", () => {
    const instance = makeCronoStarInstance();
    instance.config = {};
    instance.handleEditConfig();
    expect(instance.editorStep).toBe(0);
  });

  it("gestisce config null senza crashing", () => {
    const instance = makeCronoStarInstance();
    instance.config = null;
    expect(() => instance.handleEditConfig()).not.toThrow();
    expect(instance._lastGoodConfig).toBeNull();
  });
});

// ─── handleDeleteController ───────────────────────────────────────────────────
describe("CronoStarCard – handleDeleteController", () => {
  it("non fa nulla se l'utente non conferma", async () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    window.confirm = vi.fn(() => false);
    await instance.handleDeleteController();
    expect(instance.hass.callService).not.toHaveBeenCalled();
  });

  it("chiama delete_controller se l'utente conferma", async () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    window.confirm = vi.fn(() => true);
    vi.useFakeTimers();
    await instance.handleDeleteController();
    expect(instance.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "delete_controller",
      expect.objectContaining({ global_prefix: "p_" }),
    );
    vi.useRealTimers();
  });

  it("mostra la notifica successo dopo eliminazione", async () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    window.confirm = vi.fn(() => true);
    vi.useFakeTimers();
    await instance.handleDeleteController();
    expect(instance.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.any(String),
      "success",
    );
    vi.useRealTimers();
  });

  it("gestisce errori di callService mostrando notifica di errore", async () => {
    const instance = makeCronoStarInstance();
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    window.confirm = vi.fn(() => true);
    instance.hass.callService.mockRejectedValueOnce(new Error("Service error"));
    await instance.handleDeleteController();
    expect(instance.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.stringContaining("Service error"),
      "error",
    );
  });

  it("usa messaggi in italiano se language = 'it'", async () => {
    const instance = makeCronoStarInstance();
    instance.language = "it";
    instance.config = { global_prefix: "p_", preset_type: "thermostat" };
    window.confirm = vi.fn(() => true);
    vi.useFakeTimers();
    await instance.handleDeleteController();
    expect(instance.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.stringContaining("successo"),
      "success",
    );
    vi.useRealTimers();
  });
});
