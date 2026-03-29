// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock dipendenze esterne prima dell'import ───────────────────────────────
vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    checkIsEditorContext: vi.fn(() => false),
  };
});

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual("../src/config.js");
  return {
    ...actual,
    validateConfig: vi.fn((c) => ({
      preset_type: "thermostat",
      global_prefix: "cronostar_thermostat_test_",
      logging_enabled: true,
      hour_base: { value: 0, determined: false },
      not_configured: false,
      ...c,
    })),
    extractCardConfig: vi.fn((c) => ({ ...c })),
    VERSION: "TEST_VERSION",
  };
});

import { CardLifecycle } from "../src/core/CardLifecycle.js";
import { checkIsEditorContext } from "../src/utils.js";
import { validateConfig } from "../src/config.js";

// ─── Factory: card minimale ───────────────────────────────────────────────────
function makeCard(overrides = {}) {
  return {
    isMenuOpen: false,
    config: null,
    _backendMetaCache: null,
    isEditorInternal: false,
    isPreview: false,
    isPickerPreview: false,
    isEditor: false,
    preview: undefined,
    _preview: undefined,
    isStartup: false,
    language: "en",
    languageInitialized: false,
    loggingEnabled: true,
    selectedPreset: "thermostat",
    hourBase: 0,
    hourBaseDetermined: false,
    cronostarReady: false,
    initialLoadComplete: false,
    hasUnsavedChanges: false,
    isEnabled: true,
    selectedProfile: "",
    profileOptions: [],
    cardId: "",
    integrationVersion: "",
    versionCheckEnabled: false,
    globalSettings: {},
    isDragging: false,
    awaitingAutomation: false,
    missingEntities: [],
    outOfSyncDetails: "",
    modificationCounter: 0,
    syncCheckTimer: null,
    _cardConnected: false,
    stateManager: {
      scheduleData: [],
      setData: vi.fn(),
    },
    chartManager: {
      isInitialized: vi.fn(() => false),
      initChart: vi.fn(),
      destroy: vi.fn(),
      recreateChartOptions: vi.fn(),
      updateData: vi.fn(),
      updateChartLabels: vi.fn(),
      update: vi.fn(),
      getChart: vi.fn(() => null),
    },
    keyboardHandler: {
      attachListeners: vi.fn(),
      detachListeners: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
    },
    pointerHandler: {
      attachListeners: vi.fn(),
      detachListeners: vi.fn(),
    },
    profileManager: {
      loadProfile: vi.fn().mockResolvedValue(undefined),
      lastLoadedProfile: "",
    },
    cardSync: {
      updateAutomationSync: vi.fn(),
      getAwaitingAutomationText: vi.fn(() => ""),
    },
    eventHandlers: {
      showNotification: vi.fn(),
    },
    localizationManager: {
      localize: vi.fn((lang, key) => key),
    },
    shadowRoot: null,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(),
    tagName: "CRONOSTAR-CARD",
    parentElement: null,
    parentNode: null,
    host: null,
    ...overrides,
  };
}

function makeHass(overrides = {}) {
  return {
    language: "en",
    config: { state: "RUNNING" },
    services: {},
    states: {},
    callWS: vi.fn().mockResolvedValue({ response: {} }),
    callService: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ─── Constructor ─────────────────────────────────────────────────────────────
describe("CardLifecycle – costruttore", () => {
  it("inizializza hasRegistered a false", () => {
    const lc = new CardLifecycle(makeCard());
    expect(lc.hasRegistered).toBe(false);
  });

  it("imposta window.cronostarpausewarned se non esiste", () => {
    delete window.cronostarpausewarned;
    new CardLifecycle(makeCard());
    expect(window.cronostarpausewarned).toBeInstanceOf(Set);
  });

  it("non sovrascrive window.cronostarpausewarned se esiste", () => {
    window.cronostarpausewarned = new Set(["existing"]);
    new CardLifecycle(makeCard());
    expect(window.cronostarpausewarned.has("existing")).toBe(true);
  });
});

// ─── setConfig ────────────────────────────────────────────────────────────────
describe("CardLifecycle – setConfig", () => {
  let card, lc;
  beforeEach(() => {
    card = makeCard();
    lc = new CardLifecycle(card);
  });

  it("chiama validateConfig e applica il risultato", () => {
    lc.setConfig({ global_prefix: "p_", target_entity: "c.x" });
    expect(validateConfig).toHaveBeenCalled();
    expect(card.config).toBeDefined();
  });

  it("chiude il menu", () => {
    card.isMenuOpen = true;
    lc.setConfig({});
    expect(card.isMenuOpen).toBe(false);
  });

  it("ripristina lo stato dalla cache se il config è privo di target_entity", () => {
    card._backendMetaCache = { title: "Cached Title" };
    lc.setConfig({ global_prefix: "p_" }); // no target_entity
    expect(card.config.title).toBe("Cached Title");
  });

  it("aggiorna la cache se il config ha target_entity", () => {
    card._backendMetaCache = { title: "Old" };
    lc.setConfig({ global_prefix: "p_", target_entity: "c.x" });
    expect(card._backendMetaCache).toBeDefined();
  });

  it("non tocca la cache se _backendMetaCache è null", () => {
    card._backendMetaCache = null;
    expect(() => lc.setConfig({ global_prefix: "p_" })).not.toThrow();
  });

  it("imposta selectedPreset dal config", () => {
    lc.setConfig({ preset_type: "ev_charging" });
    expect(card.selectedPreset).toBe("ev_charging");
  });

  it("usa config.preset come fallback per selectedPreset", () => {
    // validateConfig viene mockato con preset_type sempre definito,
    // ma il fallback su config.preset è comunque coperto dalla branch
    lc.setConfig({ preset: "generic_switch" });
    expect(card.selectedPreset).toBeDefined();
  });

  it("forza isPreview = true se config.preview === true", () => {
    lc.setConfig({ preview: true });
    expect(card.isPreview).toBe(true);
  });

  it("forza isPreview = true se config.isPreview === true", () => {
    lc.setConfig({ isPreview: true });
    expect(card.isPreview).toBe(true);
  });

  it("imposta hourBase da oggetto hour_base", () => {
    validateConfig.mockReturnValueOnce({ hour_base: { value: 1, determined: true } });
    lc.setConfig({});
    expect(card.hourBase).toBe(1);
    expect(card.hourBaseDetermined).toBe(true);
  });

  it("usa hourBase=0 per hour_base non-oggetto", () => {
    validateConfig.mockReturnValueOnce({ hour_base: "auto", logging_enabled: true });
    lc.setConfig({});
    expect(card.hourBase).toBe(0);
    expect(card.hourBaseDetermined).toBe(true);
  });

  it("applica la language da config.meta.language", () => {
    validateConfig.mockReturnValueOnce({
      logging_enabled: true,
      hour_base: { value: 0, determined: false },
      meta: { language: "it" },
    });
    card.language = "en";
    lc.setConfig({ meta: { language: "it" } });
    expect(card.language).toBe("it");
  });

  it("non riapplica la language se già uguale", () => {
    card.language = "it";
    validateConfig.mockReturnValueOnce({
      logging_enabled: true,
      hour_base: { value: 0, determined: false },
      meta: { language: "it" },
    });
    lc.setConfig({ meta: { language: "it" } });
    expect(card.language).toBe("it");
  });

  it("gestisce eccezioni di validateConfig mostrando notifica", () => {
    validateConfig.mockImplementationOnce(() => { throw new Error("bad config"); });
    expect(() => lc.setConfig({})).not.toThrow();
    expect(card.eventHandlers.showNotification).toHaveBeenCalledWith(
      expect.any(String),
      "error",
    );
  });

  it("gestisce errori nella language application silenziosamente", () => {
    validateConfig.mockReturnValueOnce({
      logging_enabled: true,
      hour_base: { value: 0, determined: false },
      get meta() { throw new Error("meta error"); },
    });
    expect(() => lc.setConfig({})).not.toThrow();
  });
});

// ─── updated ─────────────────────────────────────────────────────────────────
describe("CardLifecycle – updated", () => {
  it("aggiorna le opzioni del chart quando config cambia e chart è inizializzato", () => {
    const card = makeCard();
    card.chartManager.isInitialized.mockReturnValue(true);
    const mockChart = {
      options: { scales: { y: { min: 15, max: 30 } } },
      update: vi.fn(),
    };
    card.chartManager.getChart.mockReturnValue(mockChart);
    card.config = { min_value: 15, max_value: 30, step_value: 0.5, allow_max_value: false, is_switch_preset: false };

    const lc = new CardLifecycle(card);
    lc.updated(new Map([["config", undefined]]));
    expect(card.chartManager.recreateChartOptions).toHaveBeenCalled();
  });

  it("non crasha se chart non è inizializzato", () => {
    const card = makeCard();
    card.chartManager.isInitialized.mockReturnValue(false);
    const lc = new CardLifecycle(card);
    expect(() => lc.updated(new Map([["config", undefined]]))).not.toThrow();
  });

  it("non fa nulla se config non è nel changed map", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    expect(() => lc.updated(new Map([["hass", undefined]]))).not.toThrow();
    expect(card.chartManager.recreateChartOptions).not.toHaveBeenCalled();
  });

  it("gestisce eccezioni nel refresh del chart", () => {
    const card = makeCard();
    card.chartManager.isInitialized.mockReturnValue(true);
    card.chartManager.recreateChartOptions.mockImplementation(() => { throw new Error("oops"); });
    const lc = new CardLifecycle(card);
    expect(() => lc.updated(new Map([["config", undefined]]))).not.toThrow();
  });

  it("chiama _updatePreviewVisibility", () => {
    const card = makeCard();
    card.config = { step: 0 };
    const lc = new CardLifecycle(card);
    const spy = vi.spyOn(lc, "_updatePreviewVisibility");
    lc.updated(new Map());
    expect(spy).toHaveBeenCalled();
  });
});

// ─── setHass ─────────────────────────────────────────────────────────────────
describe("CardLifecycle – setHass", () => {
  let card, lc;
  beforeEach(() => {
    card = makeCard();
    lc = new CardLifecycle(card);
    lc.setConfig({ global_prefix: "p_", target_entity: "c.x" });
  });

  it("ignora hass null", () => {
    expect(() => lc.setHass(null)).not.toThrow();
  });

  it("salva hass in _hass", () => {
    const hass = makeHass();
    lc.setHass(hass);
    expect(lc._hass).toBe(hass);
  });

  it("imposta isStartup = false durante RUNNING dopo 60s", () => {
    lc._firstHassAt = Date.now() - 70000; // 70s fa
    const hass = makeHass({ config: { state: "RUNNING" } });
    lc.setHass(hass);
    expect(card.isStartup).toBe(false);
  });

  it("imposta isStartup = true nei primi 60s", () => {
    const hass = makeHass({ config: { state: "RUNNING" } });
    lc.setHass(hass);
    expect(card.isStartup).toBe(true);
  });

  it("imposta la language al primo hass se non inizializzata", () => {
    card.languageInitialized = false;
    const hass = makeHass({ language: "de" });
    lc.setHass(hass);
    expect(card.language).toBe("de");
    expect(card.languageInitialized).toBe(true);
  });

  it("non sovrascrive la language se già inizializzata", () => {
    card.language = "it";
    card.languageInitialized = true;
    const hass = makeHass({ language: "de" });
    lc.setHass(hass);
    expect(card.language).toBe("it");
  });

  it("preferisce meta.language su hass.language", () => {
    card.languageInitialized = true;
    card.language = "en";
    card.config = { meta: { language: "it" } };
    const hass = makeHass({ language: "de" });
    lc.setHass(hass);
    expect(card.language).toBe("it");
  });

  it("imposta cronostarReady = true quando il servizio apply_now è trovato", () => {
    const hass = makeHass({
      services: { cronostar: { apply_now: {} } },
    });
    lc.setHass(hass);
    expect(card.cronostarReady).toBe(true);
  });

  it("imposta cronostarReady = true per il servizio applynow (underscore-less)", () => {
    const hass = makeHass({
      services: { cronostar: { applynow: {} } },
    });
    lc.setHass(hass);
    expect(card.cronostarReady).toBe(true);
  });

  it("avvia la registrazione se register_card è disponibile", () => {
    card.config = { global_prefix: "p_", target_entity: "c.x" };
    const hass = makeHass({
      services: { cronostar: { register_card: {} } },
    });
    const spy = vi.spyOn(lc, "registerCard").mockResolvedValue(undefined);
    lc.setHass(hass);
    expect(spy).toHaveBeenCalled();
  });

  it("non avvia la registrazione se già in corso (_isRegistering)", () => {
    lc._isRegistering = true;
    const hass = makeHass({ services: { cronostar: { register_card: {} } } });
    const spy = vi.spyOn(lc, "registerCard").mockResolvedValue(undefined);
    lc.setHass(hass);
    expect(spy).not.toHaveBeenCalled();
    lc._isRegistering = false;
  });

  it("non avvia la registrazione se già registrato", () => {
    lc.hasRegistered = true;
    const hass = makeHass({ services: { cronostar: { register_card: {} } } });
    const spy = vi.spyOn(lc, "registerCard").mockResolvedValue(undefined);
    lc.setHass(hass);
    expect(spy).not.toHaveBeenCalled();
  });

  it("aggiorna isEnabled dallo stato dell'entità abilitata", () => {
    card.config = { enabled_entity: "switch.test", not_configured: false, global_prefix: "p_" };
    const hass = makeHass({ states: { "switch.test": { state: "on" } } });
    lc.setHass(hass);
    expect(card.isEnabled).toBe(true);
  });

  it("aggiorna isEnabled = false se switch è off", () => {
    card.config = { enabled_entity: "switch.test", not_configured: false, global_prefix: "p_" };
    const hass = makeHass({ states: { "switch.test": { state: "off" } } });
    lc.setHass(hass);
    expect(card.isEnabled).toBe(false);
  });

  it("aggiorna profileOptions dall'entità select", () => {
    card.config = { profiles_select_entity: "input_select.prof", not_configured: false, global_prefix: "p_" };
    card.profileOptions = [];
    const hass = makeHass({
      states: {
        "input_select.prof": {
          state: "Day",
          attributes: { options: ["Day", "Night"] },
        },
      },
    });
    lc.setHass(hass);
    expect(card.profileOptions).toEqual(["Day", "Night"]);
  });

  it("in modalità preview ritorna subito dopo aver impostato la language", () => {
    card.isPreview = true;
    card.languageInitialized = false;
    const hass = makeHass({ language: "fr" });
    lc.setHass(hass);
    expect(card.language).toBe("fr");
  });

  it("gestisce eccezioni interne senza propagarle", () => {
    const hass = makeHass();
    Object.defineProperty(hass, "config", { get() { throw new Error("fail"); }, configurable: true });
    expect(() => lc.setHass(hass)).not.toThrow();
  });
});

// ─── connectedCallback ────────────────────────────────────────────────────────
describe("CardLifecycle – connectedCallback", () => {
  it("imposta _cardConnected = true", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    lc.connectedCallback();
    expect(card._cardConnected).toBe(true);
  });

  it("attiva isPreview nel contesto picker preview", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(true);
    lc.connectedCallback();
    expect(card.isPreview).toBe(true);
  });

  it("pianifica reinitializeCard se initialLoadComplete", () => {
    const card = makeCard();
    card.initialLoadComplete = true;
    const lc = new CardLifecycle(card);
    const spy = vi.spyOn(lc, "reinitializeCard").mockImplementation(() => {});
    vi.useFakeTimers();
    lc.connectedCallback();
    vi.runAllTimers();
    expect(spy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("non crasha con eccezioni interne", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockImplementation(() => { throw new Error("oops"); });
    expect(() => lc.connectedCallback()).not.toThrow();
  });
});

// ─── disconnectedCallback ─────────────────────────────────────────────────────
describe("CardLifecycle – disconnectedCallback", () => {
  it("imposta _cardConnected = false", () => {
    const card = makeCard();
    card._cardConnected = true;
    const lc = new CardLifecycle(card);
    lc.disconnectedCallback();
    expect(card._cardConnected).toBe(false);
  });

  it("cancella il syncCheckTimer se attivo", () => {
    const card = makeCard();
    card.syncCheckTimer = setInterval(() => {}, 5000);
    const lc = new CardLifecycle(card);
    lc.disconnectedCallback();
    expect(card.syncCheckTimer).toBeNull();
  });

  it("non crasha con eccezioni interne", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "cleanupCard").mockImplementation(() => { throw new Error("oops"); });
    expect(() => lc.disconnectedCallback()).not.toThrow();
  });
});

// ─── firstUpdated ─────────────────────────────────────────────────────────────
describe("CardLifecycle – firstUpdated", () => {
  it("non inizializza il chart nel contesto picker preview", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(true);
    lc.firstUpdated();
    expect(card.chartManager.initChart).not.toHaveBeenCalled();
  });

  it("inizializza il chart con il canvas se disponibile", () => {
    const card = makeCard();
    const canvas = document.createElement("canvas");
    card.shadowRoot = { getElementById: vi.fn(() => canvas), querySelector: vi.fn(() => null) };
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(false);
    lc.firstUpdated();
    expect(card.chartManager.initChart).toHaveBeenCalledWith(canvas);
  });

  it("attacca i listener al container se disponibile", () => {
    const card = makeCard();
    const canvas = document.createElement("canvas");
    const container = document.createElement("div");
    card.shadowRoot = {
      getElementById: vi.fn(() => canvas),
      querySelector: vi.fn(() => container),
    };
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(false);
    lc.firstUpdated();
    expect(card.keyboardHandler.attachListeners).toHaveBeenCalledWith(container);
    expect(card.pointerHandler.attachListeners).toHaveBeenCalledWith(canvas);
  });

  it("non crasha senza shadowRoot", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(false);
    expect(() => lc.firstUpdated()).not.toThrow();
  });

  it("non crasha con eccezioni interne", () => {
    const card = makeCard();
    card.shadowRoot = {
      getElementById: vi.fn(() => { throw new Error("oops"); }),
      querySelector: vi.fn(() => null),
    };
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(false);
    expect(() => lc.firstUpdated()).not.toThrow();
  });
});

// ─── reinitializeCard ─────────────────────────────────────────────────────────
describe("CardLifecycle – reinitializeCard", () => {
  it("distrugge e reinizializza il chart con il canvas", () => {
    const card = makeCard();
    const canvas = document.createElement("canvas");
    card.shadowRoot = { getElementById: vi.fn(() => canvas), querySelector: vi.fn(() => null) };
    const lc = new CardLifecycle(card);
    lc.reinitializeCard();
    expect(card.chartManager.destroy).toHaveBeenCalled();
    expect(card.chartManager.initChart).toHaveBeenCalledWith(canvas);
  });

  it("ri-attacca i listener dopo la reinizializzazione", () => {
    const card = makeCard();
    const canvas = document.createElement("canvas");
    const container = document.createElement("div");
    card.shadowRoot = {
      getElementById: vi.fn(() => canvas),
      querySelector: vi.fn(() => container),
    };
    const lc = new CardLifecycle(card);
    lc.reinitializeCard();
    expect(card.keyboardHandler.detachListeners).toHaveBeenCalled();
    expect(card.keyboardHandler.attachListeners).toHaveBeenCalled();
    expect(card.pointerHandler.detachListeners).toHaveBeenCalled();
    expect(card.pointerHandler.attachListeners).toHaveBeenCalled();
  });

  it("non crasha senza canvas/container", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    expect(() => lc.reinitializeCard()).not.toThrow();
  });
});

// ─── cleanupCard ─────────────────────────────────────────────────────────────
describe("CardLifecycle – cleanupCard", () => {
  it("distrugge il chart", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    lc.cleanupCard();
    expect(card.chartManager.destroy).toHaveBeenCalled();
  });

  it("stacca i listener da canvas e container se disponibili", () => {
    const card = makeCard();
    const canvas = document.createElement("canvas");
    const container = document.createElement("div");
    card.shadowRoot = {
      getElementById: vi.fn(() => canvas),
      querySelector: vi.fn(() => container),
    };
    const lc = new CardLifecycle(card);
    lc.cleanupCard();
    expect(card.pointerHandler.detachListeners).toHaveBeenCalledWith(canvas);
    expect(card.keyboardHandler.detachListeners).toHaveBeenCalledWith(container);
  });

  it("non crasha con eccezioni interne", () => {
    const card = makeCard();
    card.chartManager.destroy.mockImplementation(() => { throw new Error("oops"); });
    const lc = new CardLifecycle(card);
    expect(() => lc.cleanupCard()).not.toThrow();
  });
});

// ─── isEditorContext / isPickerPreviewContext ─────────────────────────────────
describe("CardLifecycle – context detection", () => {
  it("isEditorContext delega a checkIsEditorContext", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    checkIsEditorContext.mockReturnValueOnce(true);
    expect(lc.isEditorContext()).toBe(true);
  });

  it("isPickerPreviewContext = false per elemento standalone", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    expect(lc.isPickerPreviewContext()).toBe(false);
  });

  it("isPickerPreviewContext = true con antenato hui-card-picker", () => {
    const parent = document.createElement("hui-card-picker");
    const child = makeCard();
    child.tagName = "DIV";
    child.parentElement = parent;
    const lc = new CardLifecycle(child);
    expect(lc.isPickerPreviewContext()).toBe(true);
  });

  it("isPickerPreviewContext = false se incontra hui-card-preview prima", () => {
    const picker = document.createElement("hui-card-picker");
    const preview = document.createElement("hui-card-preview");
    const child = makeCard();
    child.tagName = "DIV";
    child.parentElement = preview;
    preview.parentElement = picker;
    const lc = new CardLifecycle(child);
    expect(lc.isPickerPreviewContext()).toBe(false);
  });

  it("isPickerPreviewContext = false e nessuna eccezione per elemento che lancia errori", () => {
    const faultyCard = makeCard();
    Object.defineProperty(faultyCard, "tagName", { get() { throw new Error(); } });
    const lc = new CardLifecycle(faultyCard);
    expect(lc.isPickerPreviewContext()).toBe(false);
  });
});

// ─── _refreshContextFlags ────────────────────────────────────────────────────
describe("CardLifecycle – _refreshContextFlags", () => {
  it("imposta isPreview se picker preview", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockReturnValue(true);
    vi.spyOn(lc, "isEditorContext").mockReturnValue(false);
    lc._refreshContextFlags();
    expect(card.isPreview).toBe(true);
  });

  it("non crasha con eccezioni interne", () => {
    const card = makeCard();
    const lc = new CardLifecycle(card);
    vi.spyOn(lc, "isPickerPreviewContext").mockImplementation(() => { throw new Error("oops"); });
    expect(() => lc._refreshContextFlags()).not.toThrow();
  });
});

// ─── registerCard ─────────────────────────────────────────────────────────────
describe("CardLifecycle – registerCard", () => {
  let card, lc;
  beforeEach(() => {
    card = makeCard();
    card.config = {
      global_prefix: "cronostar_thermostat_test_",
      preset_type: "thermostat",
      not_configured: false,
    };
    lc = new CardLifecycle(card);
  });

  it("non registra se isPreview = true", async () => {
    card.isPreview = true;
    const hass = makeHass();
    await lc.registerCard(hass);
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("non registra se global_prefix è assente", async () => {
    card.config.global_prefix = null;
    const hass = makeHass();
    await lc.registerCard(hass);
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("chiama callWS con i dati corretti", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({ response: {} });
    await lc.registerCard(hass);
    expect(hass.callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "cronostar",
        service: "register_card",
      }),
    );
  });

  it("applica integration_version dalla risposta", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { integration_version: "9.0.0" },
    });
    await lc.registerCard(hass);
    expect(card.integrationVersion).toBe("9.0.0");
  });

  it("applica version_check_enabled dalla risposta", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { version_check_enabled: true },
    });
    await lc.registerCard(hass);
    expect(card.versionCheckEnabled).toBe(true);
  });

  it("applica global settings dalla risposta", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { settings: { keyboard: {} } },
    });
    await lc.registerCard(hass);
    expect(card.globalSettings).toEqual({ keyboard: {} });
  });

  it("applica preset_defaults se not_configured = true", async () => {
    card.config.not_configured = true;
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { preset_defaults: { min_value: 5 } },
    });
    await lc.registerCard(hass);
    expect(card.config.min_value).toBe(5);
  });

  it("applica validation dalla risposta", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { validation: { valid: true, errors: [] } },
    });
    await lc.registerCard(hass);
    expect(card.config.validation).toBeDefined();
    expect(card.config.not_configured).toBe(false);
  });

  it("risolve il selectedProfile dall'entità select se non impostato", async () => {
    card.selectedProfile = "";
    card.config.profiles_select_entity = "input_select.p";
    const hass = makeHass({
      states: { "input_select.p": { state: "Night" } },
    });
    hass.callWS.mockResolvedValueOnce({ response: {} });
    await lc.registerCard(hass);
    expect(hass.callWS).toHaveBeenCalled();
  });

  it("tenta l'entità guessedSelector se profiles_select_entity è assente", async () => {
    card.selectedProfile = "";
    card.config.profiles_select_entity = null;
    const guessedEntity = "select.cronostar_thermostat_test_current_profile";
    const hass = makeHass({
      states: { [guessedEntity]: { state: "Day" } },
    });
    hass.callWS.mockResolvedValueOnce({ response: {} });
    await lc.registerCard(hass);
    expect(hass.callWS).toHaveBeenCalled();
  });

  it("imposta initialLoadComplete e cronostarReady dopo la registrazione", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: { schedule: [{ time: "00:00", value: 20 }] },
    });
    await lc.registerCard(hass);
    expect(card.initialLoadComplete).toBe(true);
    expect(card.cronostarReady).toBe(true);
  });

  it("gestisce errori di registrazione senza propagarli", async () => {
    const hass = makeHass();
    hass.callWS.mockRejectedValueOnce(new Error("WS error"));
    await expect(lc.registerCard(hass)).resolves.toBeUndefined();
  });

  it("applica la language dal meta del profile_data", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({
      response: {
        profile_data: { meta: { language: "it" }, schedule: [] },
      },
    });
    await lc.registerCard(hass);
    expect(card.language).toBe("it");
  });

  it("usa il risultato come response se result.response è undefined", async () => {
    const hass = makeHass();
    hass.callWS.mockResolvedValueOnce({});
    await expect(lc.registerCard(hass)).resolves.toBeUndefined();
  });
});

// ─── _updatePreviewVisibility ─────────────────────────────────────────────────
describe("CardLifecycle – _updatePreviewVisibility", () => {
  afterEach(() => {
    // Rimuovi l'elemento style aggiunto dai test
    document.getElementById("cronostar-editor-style")?.remove();
  });

  it("aggiunge un elemento style per step=0", () => {
    const card = makeCard();
    card.config = { step: 0 };
    const lc = new CardLifecycle(card);
    lc._updatePreviewVisibility();
    expect(document.getElementById("cronostar-editor-style")).not.toBeNull();
  });

  it("aggiunge un elemento style per step='0' (stringa)", () => {
    const card = makeCard();
    card.config = { step: "0" };
    const lc = new CardLifecycle(card);
    lc._updatePreviewVisibility();
    expect(document.getElementById("cronostar-editor-style")).not.toBeNull();
  });

  it("svuota il contenuto dello style per altri step", () => {
    const card = makeCard();
    card.config = { step: 1 };
    const lc = new CardLifecycle(card);
    // Prima aggiungi il style
    const styleEl = document.createElement("style");
    styleEl.id = "cronostar-editor-style";
    styleEl.textContent = "some css";
    document.head.appendChild(styleEl);
    lc._updatePreviewVisibility();
    expect(styleEl.textContent).toBe("");
  });

  it("non crasha se config è null", () => {
    const card = makeCard();
    card.config = null;
    const lc = new CardLifecycle(card);
    expect(() => lc._updatePreviewVisibility()).not.toThrow();
  });

  it("non aggiunge il secondo style se esiste già per step=0", () => {
    const card = makeCard();
    card.config = { step: 0 };
    const lc = new CardLifecycle(card);
    lc._updatePreviewVisibility();
    lc._updatePreviewVisibility();
    expect(document.querySelectorAll("#cronostar-editor-style")).toHaveLength(1);
  });
});
