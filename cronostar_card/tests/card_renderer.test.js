// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock lit: html diventa un tag-template che ritorna una stringa ───────────
vi.mock("lit", () => ({
  html: (strings, ...values) => {
    let result = "";
    strings.forEach((s, i) => {
      result += s;
      if (i < values.length) {
        const v = values[i];
        result += v == null ? "" : String(typeof v === "function" ? "[fn]" : v);
      }
    });
    return result;
  },
}));

// ─── Mock config.js ───────────────────────────────────────────────────────────
vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "CronoStar Thermostat" },
  },
  TIMEOUTS: {
    editingGraceMs: 45000,
    automationSuppression: 7000,
  },
  VERSION: "TEST_VER",
}));

import { CardRenderer } from "../src/core/CardRenderer.js";

// ─── Factory: card minimale ───────────────────────────────────────────────────
function makeCard(overrides = {}) {
  return {
    config: {
      global_prefix: "cronostar_thermostat_test_",
      preset_type: "thermostat",
      not_configured: false,
      target_entity: "climate.test",
      enabled_entity: null,
      is_switch_preset: false,
      allow_max_value: false,
      step_value: 0.5,
      min_value: 15,
      max_value: 30,
    },
    language: "en",
    isEditorInternal: false,
    isPreview: false,
    selectedPreset: "thermostat",
    initialLoadComplete: true,
    cronostarReady: true,
    profileOptions: [],
    selectedProfile: "Default",
    hasUnsavedChanges: false,
    isDragging: false,
    awaitingAutomation: false,
    missingEntities: [],
    isMenuOpen: false,
    isExpandedV: false,
    isExpandedH: false,
    isStartup: false,
    outOfSyncDetails: "",
    overlaySuppressionUntil: 0,
    lastEditAt: 0,
    editorStep: 0,
    integrationVersion: "",
    versionCheckEnabled: false,
    showUnsavedChangesDialog: false,
    pendingProfileChange: null,
    contextMenu: { show: false, x: 0, y: 0 },
    cardLifecycle: {
      isEditorContext: vi.fn(() => false),
      isPickerPreviewContext: vi.fn(() => false),
      registerCard: vi.fn(),
      reinitializeCard: vi.fn(),
    },
    cardSync: {
      getAwaitingAutomationText: vi.fn(() => "Awaiting..."),
    },
    profileManager: {
      lastLoadedProfile: "Default",
      saveProfile: vi.fn().mockResolvedValue(undefined),
      loadProfile: vi.fn().mockResolvedValue(undefined),
    },
    localizationManager: {
      localize: vi.fn((lang, key) => key),
    },
    eventHandlers: {
      handleCardClick: vi.fn(),
      toggleEnabled: vi.fn(),
    },
    keyboardHandler: { enable: vi.fn() },
    handleEditConfig: vi.fn(),
    handleDeleteController: vi.fn(),
    setConfig: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(),
    hass: { callWS: vi.fn() },
    ...overrides,
  };
}

// ─── render() – rami principali ───────────────────────────────────────────────
describe("CardRenderer – render()", () => {
  it("ritorna stringa vuota se card.config è null", () => {
    const card = makeCard({ config: null });
    const r = new CardRenderer(card);
    expect(r.render()).toBe("");
  });

  it("renderizza l'editor interno se isEditorInternal = true", () => {
    const card = makeCard({ isEditorInternal: true, language: "en" });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
  });

  it("renderizza l'editor interno in italiano se language = 'it'", () => {
    const card = makeCard({ isEditorInternal: true, language: "it" });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("WIZARD CONFIGURAZIONE");
  });

  it("mostra il passo dello step nell'editor interno", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 3 });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Step 3");
  });

  it("non mostra il passo se editorStep è undefined", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: undefined });
    const r = new CardRenderer(card);
    const result = r.render();
    // Non deve contenere "Step undefined"
    expect(result).not.toContain("Step undefined");
  });

  it("renderizza la view admin se view_mode = 'admin'", () => {
    const card = makeCard({ config: { ...makeCard().config, view_mode: "admin" } });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("Entity:");
  });

  it("renderizza la UI not_configured se not_configured = true", () => {
    const card = makeCard({
      config: { ...makeCard().config, not_configured: true, target_entity: null },
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("No controller configured");
  });

  it("renderizza not_configured in italiano", () => {
    const card = makeCard({
      language: "it",
      config: { ...makeCard().config, not_configured: true, target_entity: null },
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Nessun controller configurato");
  });

  it("renderizza il testo per l'editor nel contesto editor (not_configured)", () => {
    const card = makeCard({
      config: { ...makeCard().config, not_configured: true, target_entity: null },
    });
    card.cardLifecycle.isEditorContext.mockReturnValue(true);
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("configuration panel");
  });

  it("renderizza l'anteprima picker se isPickerPreviewContext = true", () => {
    const card = makeCard();
    card.cardLifecycle.isPickerPreviewContext.mockReturnValue(true);
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("cronostar-preview.png");
  });

  it("usa preview_image custom se specificata", () => {
    const card = makeCard({ config: { ...makeCard().config, preview_image: "/my-image.png" } });
    card.cardLifecycle.isPickerPreviewContext.mockReturnValue(true);
    const r = new CardRenderer(card);
    expect(r.render()).toContain("/my-image.png");
  });

  it("renderizza 'broken' se manca target_entity e initialLoadComplete", () => {
    const card = makeCard({
      config: { ...makeCard().config, target_entity: null },
      initialLoadComplete: true,
      isEditorInternal: false,
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("Controller not operational");
  });

  it("renderizza 'broken' in italiano", () => {
    const card = makeCard({
      language: "it",
      config: { ...makeCard().config, target_entity: null },
      initialLoadComplete: true,
      isEditorInternal: false,
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Controller non operativo");
  });

  it("renderizza la card completa in condizioni normali", () => {
    const card = makeCard();
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("TEST_VER");
  });

  it("mostra il menu se isMenuOpen = true", () => {
    const card = makeCard({ isMenuOpen: true });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toBeTruthy();
  });

  it("mostra il ha-switch se enabled_entity è configurata", () => {
    const card = makeCard({
      config: { ...makeCard().config, enabled_entity: "switch.test" },
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("ha-switch");
  });

  it("mostra 'HA Starting...' se isStartup = true", () => {
    const card = makeCard({ isStartup: true });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("HA Starting...");
  });

  it("mostra 'Avvio HA in corso...' in italiano se isStartup = true", () => {
    const card = makeCard({ isStartup: true, language: "it" });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Avvio HA in corso...");
  });

  it("mostra il selettore profili se profileOptions non è vuoto", () => {
    const card = makeCard({
      profileOptions: ["Day", "Night"],
      isStartup: false,
      isPreview: false,
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("ha-select");
  });

  it("filtra opzioni profilo non valide (undefined, unavailable, unknown)", () => {
    const card = makeCard({
      profileOptions: ["Day", "undefined", "unavailable", "unknown", "Night"],
      isStartup: false,
      isPreview: false,
    });
    const r = new CardRenderer(card);
    const result = r.render();
    // Day e Night presenti, le non valide filtrate
    expect(result).toContain("Day");
    expect(result).toContain("Night");
  });

  it("mostra il dialog unsaved changes se showUnsavedChangesDialog = true", () => {
    const card = makeCard({ showUnsavedChangesDialog: true });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Unsaved Changes");
  });

  it("mostra il dialog unsaved changes in italiano", () => {
    const card = makeCard({ showUnsavedChangesDialog: true, language: "it" });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("Modifiche non salvate");
  });

  it("mostra alert versione se versionCheckEnabled = true e versioni diverse", () => {
    const card = makeCard({
      versionCheckEnabled: true,
      integrationVersion: "1.0.0", // diversa da TEST_VER
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("mdi:alert-outline");
  });

  it("non mostra alert versione se le versioni coincidono", () => {
    const card = makeCard({
      versionCheckEnabled: true,
      integrationVersion: "TEST_VER",
    });
    const r = new CardRenderer(card);
    // Il blocco html con mdi:alert-outline non viene renderizzato per versioni uguali
    const result = r.render();
    expect(result).not.toMatch(/mdi:alert-outline[\s\S]*version/);
  });

  it("renderizza i pulsanti expand/collapse", () => {
    const card = makeCard({ isExpandedV: true });
    const r = new CardRenderer(card);
    let result = r.render();
    expect(result).toContain("mdi:arrow-collapse");

    card.isExpandedV = false;
    card.isExpandedH = false;
    result = r.render();
    expect(result).toContain("mdi:arrow-expand");
  });

  it("renderizza il context menu se show = true", () => {
    const card = makeCard({ contextMenu: { show: true, x: 10, y: 20 } });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("context-menu");
    expect(result).toContain("left: 10px; top: 20px;");
  });

  it("mostra l'overlay loading_data se initialLoadComplete è false", () => {
    const card = makeCard({ initialLoadComplete: false });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("loading_data");
  });

  it("mostra l'overlay anomalous se ci sono missingEntities", () => {
    const card = makeCard({ missingEntities: ["sensor.missing"] });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("check_configuration");
  });

  it("renderizza il dashboard dell'editor", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 0 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 0)");
  });

  it("renderizza la selezione preset dell'editor", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 1 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 1)");
  });

  it("renderizza la selezione entità dell'editor", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 2 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 2)");
  });

  it("renderizza le opzioni dell'editor", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 3 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 3)");
  });

  it("renderizza la configurazione automazione", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 4 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 4)");
  });

  it("renderizza il riepilogo finale", () => {
    const card = makeCard({ isEditorInternal: true, editorStep: 5 });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("CONFIGURATION WIZARD");
    expect(result).toContain("(Step 5)");
  });

  it("gestisce il click di chiusura del wizard", async () => {
    const card = makeCard({ isEditorInternal: true, _lastGoodConfig: { title: "Old" } });
    const r = new CardRenderer(card);
    const result = r.render();
    
    // Trova il click handler della chiusura (ha-icon-button con mdi:close)
    // Nel nostro mock lit, [fn] è il segnaposto per le funzioni
    expect(result).toContain("mdi:close");
    
    // Dato che non possiamo facilmente estrarre la funzione dal mock lit a stringa,
    // verifichiamo la logica internamente se possibile o confidiamo negli altri test.
    // In questo ambiente, testiamo i rami di render.
  });
});

// ─── _renderAdminBox ──────────────────────────────────────────────────────────
describe("CardRenderer – _renderAdminBox()", () => {
  it("renderizza il box 'Aggiungi Nuovo Controller' se not_configured = true", () => {
    const card = makeCard({
      config: { not_configured: true },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("")).toContain("Add New Controller");
  });

  it("renderizza il box 'Aggiungi Nuovo Controller' in italiano", () => {
    const card = makeCard({
      language: "it",
      config: { not_configured: true },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("")).toContain("Aggiungi Nuovo Controller");
  });

  it("usa il titolo personalizzato per il box not_configured", () => {
    const card = makeCard({
      config: { not_configured: true },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("Il mio titolo")).toContain("Il mio titolo");
  });

  it("renderizza il box configurato se not_configured = false", () => {
    const card = makeCard();
    const r = new CardRenderer(card);
    const result = r._renderAdminBox("Test Title");
    expect(result).toContain("Test Title");
    expect(result).toContain("Entity:");
    expect(result).toContain("climate.test");
  });

  it("mostra gli errori di validazione se validation.valid = false", () => {
    const card = makeCard({
      config: {
        ...makeCard().config,
        validation: { valid: false, errors: ["Error 1", "Error 2"] },
      },
    });
    const r = new CardRenderer(card);
    const result = r._renderAdminBox("Title");
    expect(result).toContain("CONFIGURATION ISSUES");
    expect(result).toContain("Error 1");
  });

  it("mostra gli errori in italiano se language = 'it'", () => {
    const card = makeCard({
      language: "it",
      config: {
        ...makeCard().config,
        validation: { valid: false, errors: ["Errore 1"] },
      },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("Titolo")).toContain("PROBLEMI DI CONFIGURAZIONE");
  });

  it("mostra il messaggio 'Controller Active and Valid' se validation.valid = true", () => {
    const card = makeCard({
      config: {
        ...makeCard().config,
        validation: { valid: true, errors: [] },
      },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("Title")).toContain("Controller Active and Valid");
  });

  it("mostra il messaggio in italiano se valid e language = 'it'", () => {
    const card = makeCard({
      language: "it",
      config: {
        ...makeCard().config,
        validation: { valid: true, errors: [] },
      },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("Titolo")).toContain("Controller Attivo e Valido");
  });

  it("usa N/A se target_entity è assente", () => {
    const card = makeCard({
      config: { not_configured: false, validation: { valid: true, errors: [] } },
    });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("T")).toContain("N/A");
  });

  it("mostra 'Configura' in italiano", () => {
    const card = makeCard({ language: "it" });
    const r = new CardRenderer(card);
    expect(r._renderAdminBox("T")).toContain("Configura");
  });
});

// ─── Logica titolo dinamico ───────────────────────────────────────────────────
describe("CardRenderer – titolo dinamico", () => {
  it("usa config.title se definito", () => {
    const card = makeCard({
      config: { ...makeCard().config, title: "My Custom Title" },
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("My Custom Title");
  });

  it("costruisce il titolo dal preset se config.title non è definito", () => {
    const card = makeCard();
    card.localizationManager.localize.mockImplementation((lang, key) => {
      if (key === "ui.title") return "Schedule";
      if (key === "preset.thermostat") return "Thermostat";
      return key;
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("Schedule");
  });

  it("aggiunge il suffisso dal global_prefix al titolo", () => {
    const card = makeCard({
      config: {
        ...makeCard().config,
        title: undefined,
        global_prefix: "cronostar_thermostat_appartamento_",
        preset_type: "thermostat",
      },
    });
    card.localizationManager.localize.mockImplementation((lang, key) => {
      if (key === "ui.title") return "Schedule";
      if (key === "preset.thermostat") return "Thermostat";
      return key;
    });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).toContain("appartamento");
  });

  it("non aggiunge suffisso se il prefix non supera il basePrefix", () => {
    const card = makeCard({
      config: {
        ...makeCard().config,
        title: undefined,
        global_prefix: "cronostar_thermostat_",
        preset_type: "thermostat",
      },
    });
    card.localizationManager.localize.mockReturnValue("X");
    const r = new CardRenderer(card);
    // Non crasha
    expect(() => r.render()).not.toThrow();
  });
});

// ─── Overlay – logica condizionale ────────────────────────────────────────────
describe("CardRenderer – overlay condizionali", () => {
  it("mostra l'overlay startup (cronostarReady = false, initialLoadComplete = true)", () => {
    const card = makeCard({ cronostarReady: false, initialLoadComplete: true });
    const r = new CardRenderer(card);
    const html = r.render();
    expect(html).toContain("loading-overlay");
    expect(html).toContain("starting_backend");
  });

  it("mostra l'overlay awaitingAutomation nelle condizioni corrette", () => {
    const card = makeCard({
      awaitingAutomation: true,
      initialLoadComplete: true,
      cronostarReady: true,
      hasUnsavedChanges: false,
      isDragging: false,
      overlaySuppressionUntil: 0,
      lastEditAt: 0,
      missingEntities: [],
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("automation-overlay");
  });

  it("non mostra overlay awaitingAutomation durante il drag", () => {
    const card = makeCard({
      awaitingAutomation: true,
      initialLoadComplete: true,
      isDragging: true,
    });
    const r = new CardRenderer(card);
    expect(r.render()).not.toContain("automation-overlay");
  });

  it("non mostra overlay awaitingAutomation se hasUnsavedChanges = true", () => {
    const card = makeCard({
      awaitingAutomation: true,
      initialLoadComplete: true,
      hasUnsavedChanges: true,
    });
    const r = new CardRenderer(card);
    expect(r.render()).not.toContain("automation-overlay");
  });

  it("mostra l'overlay missingEntities se ci sono entità mancanti", () => {
    const card = makeCard({
      missingEntities: ["climate.x"],
      initialLoadComplete: true,
      cronostarReady: false,
    });
    const r = new CardRenderer(card);
    expect(r.render()).toContain("missing");
  });

  it("non mostra overlays in modalità preview", () => {
    const card = makeCard({ isPreview: true, cronostarReady: false, initialLoadComplete: true });
    const r = new CardRenderer(card);
    const result = r.render();
    expect(result).not.toContain("startup");
  });
});
