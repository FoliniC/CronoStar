// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/core/EventBus.js", () => ({
  Events: {
    PROFILE_LOADED: "PROFILE_LOADED",
    PROFILE_SAVED: "PROFILE_SAVED",
  },
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn((config) => config?.global_prefix || "cronostar_thermostat_test_"),
}));

import { ProfileManager } from "../src/managers/profile_manager.js";

// ─── Factory: context minimale ───────────────────────────────────────────────
function makeContext(overrides = {}) {
  const stateManager = {
    getData: vi.fn().mockReturnValue([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]),
    setData: vi.fn(),
    getDataWithChangePoints: vi.fn().mockReturnValue([]),
  };
  const selectionManager = {
    snapshotSelection: vi.fn(),
    restoreSelection: vi.fn(),
  };
  const managers = { state: stateManager, selection: selectionManager };

  const card = {
    isMenuOpen: false,
    keyboardHandler: { enable: vi.fn() },
    language: "en",
    languageInitialized: false,
    config: { global_prefix: "cronostar_thermostat_test_" },
    showUnsavedChangesDialog: false,
    pendingProfileChange: null,
    requestUpdate: vi.fn(),
  };

  const ctx = {
    config: {
      global_prefix: "cronostar_thermostat_test_",
      preset_type: "thermostat",
      profiles_select_entity: null,
      ...overrides.config,
    },
    hass: {
      callWS: vi.fn().mockResolvedValue({ response: { schedule: [], meta: {} } }),
      callService: vi.fn().mockResolvedValue({}),
    },
    hasUnsavedChanges: false,
    selectedProfile: "Default",
    selectedPreset: "thermostat",
    isMenuOpen: false,
    requestUpdate: vi.fn(),
    events: { on: vi.fn(), emit: vi.fn() },
    getManager: vi.fn((key) => managers[key]),
    _card: card,
    ...overrides,
  };
  return { ctx, card, stateManager, selectionManager };
}

// ─── Costruttore ─────────────────────────────────────────────────────────────
describe("ProfileManager – costruttore", () => {
  it("inizializza lastLoadedProfile a stringa vuota", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(pm.lastLoadedProfile).toBe("");
  });

  it("inizializza _isLoading a false", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(pm._isLoading).toBe(false);
  });
});

// ─── loadProfile ─────────────────────────────────────────────────────────────
describe("ProfileManager – loadProfile", () => {
  let pm, ctx, stateManager;
  beforeEach(() => {
    ({ ctx, stateManager } = makeContext());
    pm = new ProfileManager(ctx);
  });

  it("carica un profilo valido e chiama stateManager.setData", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({
      response: { schedule: [{ time: "06:00", value: 20 }], meta: {} },
    });
    await pm.loadProfile("Day");
    expect(stateManager.setData).toHaveBeenCalled();
    expect(pm.lastLoadedProfile).toBe("Day");
  });

  it("ignora nomi di profilo non validi (unavailable, unknown, undefined, vuoto)", async () => {
    for (const name of ["unavailable", "unknown", "undefined", "", null, undefined]) {
      await pm.loadProfile(name);
      expect(ctx.hass.callWS).not.toHaveBeenCalled();
    }
  });

  it("ritorna se già in caricamento (_isLoading)", async () => {
    pm._isLoading = true;
    await pm.loadProfile("Day");
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
    pm._isLoading = false;
  });

  it("gestisce errore nella risposta (response.error)", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: { error: "Not found" } });
    await expect(pm.loadProfile("Missing")).resolves.toBeUndefined();
    expect(stateManager.setData).not.toHaveBeenCalled();
  });

  it("gestisce risposta nulla (responseData null)", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: null });
    await expect(pm.loadProfile("Null")).resolves.toBeUndefined();
  });

  it("rilancia l'errore di rete e reimposta _isLoading", async () => {
    ctx.hass.callWS.mockRejectedValueOnce(new Error("Network error"));
    await expect(pm.loadProfile("Day")).rejects.toThrow("Network error");
    expect(pm._isLoading).toBe(false);
  });

  it("applica i metadati tramite _updateConfigFromMeta", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({
      response: {
        schedule: [],
        meta: { title: "New Title", min_value: 10, language: "it" },
      },
    });
    await pm.loadProfile("Day");
    expect(ctx._card.language).toBe("it");
  });

  it("emette PROFILE_LOADED dopo il caricamento", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: { schedule: [], meta: {} } });
    await pm.loadProfile("Day");
    expect(ctx.events.emit).toHaveBeenCalledWith("PROFILE_LOADED", expect.any(Object));
  });
});

// ─── saveProfile ─────────────────────────────────────────────────────────────
describe("ProfileManager – saveProfile", () => {
  let pm, ctx;
  beforeEach(() => {
    ({ ctx } = makeContext());
    pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
  });

  it("salva con il profilo corrente se non specificato", async () => {
    await pm.saveProfile();
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Day" }),
    );
  });

  it("salva con il nome specificato", async () => {
    await pm.saveProfile("Night");
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Night" }),
    );
  });

  it("lancia errore se nessun profilo specificato e lastLoadedProfile è vuoto", async () => {
    pm.lastLoadedProfile = "";
    await expect(pm.saveProfile()).rejects.toThrow("No profile specified");
  });

  it("lancia errore se stateManager non disponibile", async () => {
    ctx.getManager.mockReturnValue(null);
    await expect(pm.saveProfile("Day")).rejects.toThrow("StateManager not available");
  });

  it("rilancia errori di rete", async () => {
    ctx.hass.callService.mockRejectedValueOnce(new Error("Service error"));
    await expect(pm.saveProfile("Day")).rejects.toThrow("Service error");
  });

  it("emette PROFILE_SAVED dopo il salvataggio", async () => {
    await pm.saveProfile("Day");
    expect(ctx.events.emit).toHaveBeenCalledWith("PROFILE_SAVED", expect.any(Object));
  });

  it("reimposta hasUnsavedChanges a false", async () => {
    ctx.hasUnsavedChanges = true;
    await pm.saveProfile("Day");
    expect(ctx.hasUnsavedChanges).toBe(false);
  });
});

// ─── handleProfileSelection ───────────────────────────────────────────────────
describe("ProfileManager – handleProfileSelection", () => {
  let pm, ctx;
  beforeEach(() => {
    ({ ctx } = makeContext());
    pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Default";
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
  });

  it("non fa nulla se value è vuoto", async () => {
    await pm.handleProfileSelection({ target: { value: "" } });
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("non fa nulla se il profilo è già selezionato", async () => {
    ctx.selectedProfile = "Default";
    await pm.handleProfileSelection({ target: { value: "Default" } });
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("mostra il dialog se ci sono modifiche non salvate", async () => {
    ctx.hasUnsavedChanges = true;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(ctx._card.showUnsavedChangesDialog).toBe(true);
    expect(ctx._card.pendingProfileChange).toBe("Night");
  });

  it("carica il nuovo profilo se non ci sono modifiche non salvate", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("usa event.detail.value se target.value è assente", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ detail: { value: "Night" } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("usa event.detail.item.value come fallback MDC", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ detail: { item: { value: "Night" } } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("chiude il menu se è aperto", async () => {
    ctx._card.isMenuOpen = true;
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(ctx._card.isMenuOpen).toBe(false);
  });

  it("gestisce errori nel loadProfile senza crashing", async () => {
    ctx.hass.callWS.mockRejectedValueOnce(new Error("Load error"));
    ctx.hasUnsavedChanges = false;
    await expect(pm.handleProfileSelection({ target: { value: "Night" } })).resolves.toBeUndefined();
  });
});

// ─── _showUnsavedDialog ───────────────────────────────────────────────────────
describe("ProfileManager – _showUnsavedDialog", () => {
  it("imposta showUnsavedChangesDialog e pendingProfileChange", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm._showUnsavedDialog("Night");
    expect(ctx._card.showUnsavedChangesDialog).toBe(true);
    expect(ctx._card.pendingProfileChange).toBe("Night");
    expect(ctx.isMenuOpen).toBe(false);
  });
});

// ─── _updateProfileSelector ───────────────────────────────────────────────────
describe("ProfileManager – _updateProfileSelector", () => {
  it("non fa niente se profiles_select_entity è null", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm._updateProfileSelector("Night");
    expect(ctx.hass.callService).not.toHaveBeenCalled();
  });

  it("chiama callService per aggiornare l'entity", async () => {
    const { ctx } = makeContext({
      config: { profiles_select_entity: "input_select.profile", global_prefix: "p_" },
    });
    const pm = new ProfileManager(ctx);
    pm._updateProfileSelector("Night");
    // la promise è fire-and-forget, aspettiamo un tick
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "input_select",
      "select_option",
      expect.objectContaining({ option: "Night" }),
    );
  });

  it("gestisce errori di callService senza crashing", async () => {
    const { ctx } = makeContext({
      config: { profiles_select_entity: "input_select.profile", global_prefix: "p_" },
    });
    ctx.hass.callService.mockRejectedValueOnce(new Error("Service error"));
    const pm = new ProfileManager(ctx);
    await expect(
      new Promise((res) => {
        pm._updateProfileSelector("Night");
        setTimeout(res, 10);
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── _buildSchedulePayload ────────────────────────────────────────────────────
describe("ProfileManager – _buildSchedulePayload", () => {
  it("normalizza e ordina i punti", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "12:00", value: 22 },
      { time: "06:00", value: 20 },
    ]);
    expect(result[0].time).toBe("06:00");
    expect(result[1].time).toBe("12:00");
  });

  it("filtra i punti con time non valido", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "bad", value: 20 },
      { time: "06:00", value: 20 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe("06:00");
  });

  it("filtra valori non finiti", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "06:00", value: NaN },
      { time: "12:00", value: 20 },
    ]);
    expect(result.some((p) => p.time === "06:00")).toBe(false);
  });

  it("converte i valori a Number", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([{ time: "06:00", value: "22.5" }]);
    expect(typeof result[0].value).toBe("number");
  });
});

// ─── _buildMetaPayload ────────────────────────────────────────────────────────
describe("ProfileManager – _buildMetaPayload", () => {
  it("ritorna un oggetto con global_prefix", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.global_prefix).toBeDefined();
  });

  it("rimuove le chiavi deprecate (entity_prefix, step)", () => {
    const { ctx } = makeContext({
      config: { global_prefix: "p_", entity_prefix: "old_", step: 0.5 },
    });
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.entity_prefix).toBeUndefined();
    expect(meta.step).toBeUndefined();
  });

  it("include la language dal card", () => {
    const { ctx, card } = makeContext();
    card.language = "it";
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.language).toBe("it");
  });

  it("include entities come array filtrato", () => {
    const { ctx } = makeContext({
      config: {
        global_prefix: "p_",
        target_entity: "climate.x",
        enabled_entity: "switch.x",
        profiles_select_entity: null,
      },
    });
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.entities).toContain("climate.x");
    expect(meta.entities).toContain("switch.x");
    expect(meta.entities).not.toContain(null);
  });

  it("gestisce eccezioni nel recupero della language silenziosamente", () => {
    const { ctx } = makeContext();
    // Forza un errore nel getter
    Object.defineProperty(ctx._card, "language", {
      get() { throw new Error("oops"); },
      configurable: true,
    });
    const pm = new ProfileManager(ctx);
    expect(() => pm._buildMetaPayload()).not.toThrow();
  });
});

// ─── _updateConfigFromMeta ────────────────────────────────────────────────────
describe("ProfileManager – _updateConfigFromMeta", () => {
  it("applica le chiavi valide alla config del card", () => {
    const { ctx, card } = makeContext();
    card.config = { ...ctx.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ title: "My Card", min_value: 10, max_value: 25 });
    expect(card.config.title).toBe("My Card");
  });

  it("non fa nulla per meta null/undefined/non-object", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(() => pm._updateConfigFromMeta(null)).not.toThrow();
    expect(() => pm._updateConfigFromMeta(undefined)).not.toThrow();
    expect(() => pm._updateConfigFromMeta("string")).not.toThrow();
  });

  it("applica la language dal meta al card", () => {
    const { ctx, card } = makeContext();
    card.config = { ...ctx.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ language: "it" });
    expect(card.language).toBe("it");
    expect(card.languageInitialized).toBe(true);
  });

  it("gestisce errori nell'applicazione della language", () => {
    const { ctx, card } = makeContext();
    // Simula un errore nel setter
    Object.defineProperty(card, "language", {
      set() { throw new Error("oops"); },
      get() { return "en"; },
      configurable: true,
    });
    const pm = new ProfileManager(ctx);
    expect(() => pm._updateConfigFromMeta({ language: "it" })).not.toThrow();
  });

  it("non applica aggiornamenti se nessuna chiave valida presente", () => {
    const { ctx, card } = makeContext();
    const originalConfig = { ...card.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ unknown_key: "x" });
    expect(card.config).toEqual(originalConfig);
  });
});

// ─── resetChanges ─────────────────────────────────────────────────────────────
describe("ProfileManager – resetChanges", () => {
  it("ricarica il profilo corrente", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await pm.resetChanges();
    expect(ctx.hass.callWS).toHaveBeenCalled();
  });

  it("non fa nulla se non c'è nessun profilo", async () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "";
    ctx.selectedProfile = "";
    await pm.resetChanges();
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("usa selectedProfile se lastLoadedProfile è vuoto", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    ctx.selectedProfile = "Night";
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "";
    await pm.resetChanges();
    expect(ctx.hass.callWS).toHaveBeenCalled();
  });

  it("gestisce errori nel loadProfile senza crashing", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockRejectedValueOnce(new Error("error"));
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await expect(pm.resetChanges()).resolves.toBeUndefined();
  });

  it("chiama snapshotSelection e restoreSelection se disponibili", async () => {
    const { ctx, selectionManager } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await pm.resetChanges();
    expect(selectionManager.snapshotSelection).toHaveBeenCalled();
    expect(selectionManager.restoreSelection).toHaveBeenCalled();
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────
describe("ProfileManager – destroy", () => {
  it("non lancia errori", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(() => pm.destroy()).not.toThrow();
  });

  it("cancella l'autoSaveTimer se presente", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm._autoSaveTimer = setTimeout(() => {}, 10000);
    const spy = vi.spyOn(global, "clearTimeout");
    pm.destroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
