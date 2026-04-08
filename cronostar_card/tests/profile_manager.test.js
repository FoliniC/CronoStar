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

// ─── Factory: minimal context ───────────────────────────────────────────────
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

// ─── Constructor ─────────────────────────────────────────────────────────────
describe("ProfileManager – constructor", () => {
  it("initializes lastLoadedProfile to an empty string", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(pm.lastLoadedProfile).toBe("");
  });

  it("initializes _isLoading to false", () => {
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a valid profile and calls stateManager.setData", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({
      response: { schedule: [{ time: "06:00", value: 20 }], meta: {} },
    });
    await pm.loadProfile("Day");
    expect(stateManager.setData).toHaveBeenCalled();
    expect(pm.lastLoadedProfile).toBe("Day");
  });

  it("uses thermostat as default preset_type if selectedPreset is missing", async () => {
    ctx.selectedPreset = null;
    ctx.hass.callWS.mockResolvedValueOnce({ response: { schedule: [], meta: {} } });
    await pm.loadProfile("Day");
    expect(ctx.hass.callWS).toHaveBeenCalledWith(expect.objectContaining({
      service_data: expect.objectContaining({ preset_type: "thermostat" })
    }));
  });

  it("handles responseData without meta or schedule", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: {} });
    await pm.loadProfile("Day");
    expect(stateManager.setData).toHaveBeenCalledWith([], true);
  });

  it("ignores invalid profile names (unavailable, unknown, undefined, empty)", async () => {
    for (const name of ["unavailable", "unknown", "undefined", "", null, undefined]) {
      await pm.loadProfile(name);
      expect(ctx.hass.callWS).not.toHaveBeenCalled();
    }
  });

  it("returns if already loading (_isLoading)", async () => {
    pm._isLoading = true;
    await pm.loadProfile("Day");
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
    pm._isLoading = false;
  });

  it("handles error in response (response.error)", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: { error: "Not found" } });
    await expect(pm.loadProfile("Missing")).resolves.toBeUndefined();
    expect(stateManager.setData).not.toHaveBeenCalled();
  });

  it("handles null response (responseData null)", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({ response: null });
    await expect(pm.loadProfile("Null")).resolves.toBeUndefined();
  });

  it("rethrows network error and resets _isLoading", async () => {
    ctx.hass.callWS.mockRejectedValueOnce(new Error("Network error"));
    await expect(pm.loadProfile("Day")).rejects.toThrow("Network error");
    expect(pm._isLoading).toBe(false);
  });

  it("applies metadata via _updateConfigFromMeta", async () => {
    ctx.hass.callWS.mockResolvedValueOnce({
      response: {
        schedule: [],
        meta: { title: "New Title", min_value: 10, language: "it" },
      },
    });
    await pm.loadProfile("Day");
    expect(ctx._card.language).toBe("it");
  });

  it("emits PROFILE_LOADED after loading", async () => {
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves with current profile if not specified", async () => {
    await pm.saveProfile();
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Day" }),
    );
  });

  it("uses thermostat as default preset_type if selectedPreset is missing on save", async () => {
    ctx.selectedPreset = null;
    await pm.saveProfile("Day");
    expect(ctx.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "save_profile",
        expect.objectContaining({ preset_type: "thermostat" })
    );
  });

  it("saves with specified name", async () => {
    await pm.saveProfile("Night");
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Night" }),
    );
  });

  it("throws error if no profile specified and lastLoadedProfile is empty", async () => {
    pm.lastLoadedProfile = "";
    await expect(pm.saveProfile()).rejects.toThrow("No profile specified");
  });

  it("throws error if stateManager not available", async () => {
    ctx.getManager.mockReturnValue(null);
    await expect(pm.saveProfile("Day")).rejects.toThrow("StateManager not available");
  });

  it("rethrows network errors", async () => {
    ctx.hass.callService.mockRejectedValueOnce(new Error("Service error"));
    await expect(pm.saveProfile("Day")).rejects.toThrow("Service error");
  });

  it("emits PROFILE_SAVED after saving", async () => {
    await pm.saveProfile("Day");
    expect(ctx.events.emit).toHaveBeenCalledWith("PROFILE_SAVED", expect.any(Object));
  });

  it("resets hasUnsavedChanges to false", async () => {
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing if value is empty", async () => {
    await pm.handleProfileSelection({ target: { value: "" } });
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("does nothing if profile is already selected", async () => {
    ctx.selectedProfile = "Default";
    await pm.handleProfileSelection({ target: { value: "Default" } });
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("shows dialog if there are unsaved changes", async () => {
    ctx.hasUnsavedChanges = true;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(ctx._card.showUnsavedChangesDialog).toBe(true);
    expect(ctx._card.pendingProfileChange).toBe("Night");
  });

  it("loads new profile if there are no unsaved changes", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("uses selectedProfile if lastLoadedProfile is empty for changes check", async () => {
    pm.lastLoadedProfile = "";
    ctx.selectedProfile = "Default";
    ctx.hasUnsavedChanges = true;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(ctx._card.showUnsavedChangesDialog).toBe(true);
  });

  it("handles absence of selectionManager in handleProfileSelection", async () => {
    const { ctx, stateManager } = makeContext();
    // Do not include selectionManager in returned managers
    ctx.getManager.mockImplementation((k) => k === "state" ? stateManager : null);
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Default";
    
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("uses event.detail.value if target.value is absent", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ detail: { value: "Night" } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("uses event.detail.item.value as MDC fallback", async () => {
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ detail: { item: { value: "Night" } } });
    expect(pm.lastLoadedProfile).toBe("Night");
  });

  it("closes menu if open", async () => {
    ctx._card.isMenuOpen = true;
    ctx.hasUnsavedChanges = false;
    await pm.handleProfileSelection({ target: { value: "Night" } });
    expect(ctx._card.isMenuOpen).toBe(false);
  });

  it("handles errors in loadProfile without crashing", async () => {
    ctx.hass.callWS.mockRejectedValueOnce(new Error("Load error"));
    ctx.hasUnsavedChanges = false;
    await expect(pm.handleProfileSelection({ target: { value: "Night" } })).resolves.toBeUndefined();
  });
});

// ─── _showUnsavedDialog ───────────────────────────────────────────────────────
describe("ProfileManager – _showUnsavedDialog", () => {
  it("sets showUnsavedChangesDialog and pendingProfileChange", () => {
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
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing if profiles_select_entity is null", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm._updateProfileSelector("Night");
    expect(ctx.hass.callService).not.toHaveBeenCalled();
  });

  it("calls callService to update the entity", async () => {
    const { ctx } = makeContext({
      config: { profiles_select_entity: "input_select.profile", global_prefix: "p_" },
    });
    const pm = new ProfileManager(ctx);
    pm._updateProfileSelector("Night");
    // promise is fire-and-forget, wait a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "input_select",
      "select_option",
      expect.objectContaining({ option: "Night" }),
    );
  });

  it("uses input_select as default domain if entity has no domain", async () => {
    const { ctx } = makeContext({
      config: { profiles_select_entity: ".nopointentity", global_prefix: "p_" },
    });
    const pm = new ProfileManager(ctx);
    pm._updateProfileSelector("Night");
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.hass.callService).toHaveBeenCalledWith(
      "input_select",
      "select_option",
      expect.any(Object)
    );
  });

  it("handles callService errors without crashing", async () => {
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
  it("normalizes and sorts points", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "12:00", value: 22 },
      { time: "06:00", value: 20 },
    ]);
    expect(result[0].time).toBe("06:00");
    expect(result[1].time).toBe("12:00");
  });

  it("filters points with invalid time", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "bad", value: 20 },
      { time: "06:00", value: 20 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe("06:00");
  });

  it("filters non-finite values", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([
      { time: "06:00", value: NaN },
      { time: "12:00", value: 20 },
    ]);
    expect(result.some((p) => p.time === "06:00")).toBe(false);
  });

  it("converts values to Number", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const result = pm._buildSchedulePayload([{ time: "06:00", value: "22.5" }]);
    expect(typeof result[0].value).toBe("number");
  });
});

// ─── _buildMetaPayload ────────────────────────────────────────────────────────
describe("ProfileManager – _buildMetaPayload", () => {
  it("returns an object with global_prefix", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.global_prefix).toBeDefined();
  });

  it("returns an object with global_prefix even if missing in config", () => {
    const { ctx } = makeContext({ config: { global_prefix: null } });
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.global_prefix).toBe("cronostar_thermostat_test_"); // value from mock getEffectivePrefix
  });

  it("removes deprecated keys (entity_prefix, step)", () => {
    const { ctx } = makeContext({
      config: { global_prefix: "p_", entity_prefix: "old_", step: 0.5 },
    });
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.entity_prefix).toBeUndefined();
    expect(meta.step).toBeUndefined();
  });

  it("includes language from card", () => {
    const { ctx, card } = makeContext();
    card.language = "it";
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.language).toBe("it");
  });

  it("includes language from config.meta.language if card lacks it", () => {
    const { ctx, card } = makeContext();
    card.language = null;
    ctx.config.meta = { language: "de" };
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.language).toBe("de");
  });

  it("includes language from config.language as fallback", () => {
    const { ctx, card } = makeContext();
    card.language = null;
    ctx.config.meta = null;
    ctx.config.language = "fr";
    const pm = new ProfileManager(ctx);
    const meta = pm._buildMetaPayload();
    expect(meta.language).toBe("fr");
  });

  it("includes entities as filtered array", () => {
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

  it("handles null config in _buildMetaPayload", () => {
    const { ctx } = makeContext();
    ctx.config = null;
    const pm = new ProfileManager(ctx);
    expect(() => pm._buildMetaPayload()).not.toThrow();
  });

  it("handles language retrieval exceptions silently", () => {
    const { ctx } = makeContext();
    // Force an error in the getter
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
  it("applies valid keys to card config", () => {
    const { ctx, card } = makeContext();
    card.config = { ...ctx.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ title: "My Card", min_value: 10, max_value: 25 });
    expect(card.config.title).toBe("My Card");
  });

  it("does nothing for null/undefined/non-object meta", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(() => pm._updateConfigFromMeta(null)).not.toThrow();
    expect(() => pm._updateConfigFromMeta(undefined)).not.toThrow();
    expect(() => pm._updateConfigFromMeta("string")).not.toThrow();
  });

  it("applies language from meta to card", () => {
    const { ctx, card } = makeContext();
    card.config = { ...ctx.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ language: "it" });
    expect(card.language).toBe("it");
    expect(card.languageInitialized).toBe(true);
  });

  it("handles errors when applying language", () => {
    const { ctx, card } = makeContext();
    // Simulate error in setter
    Object.defineProperty(card, "language", {
      set() { throw new Error("oops"); },
      get() { return "en"; },
      configurable: true,
    });
    const pm = new ProfileManager(ctx);
    expect(() => pm._updateConfigFromMeta({ language: "it" })).not.toThrow();
  });

  it("does not apply updates if no valid key is present", () => {
    const { ctx, card } = makeContext();
    const originalConfig = { ...card.config };
    const pm = new ProfileManager(ctx);
    pm._updateConfigFromMeta({ unknown_key: "x" });
    expect(card.config).toEqual(originalConfig);
  });
});

// ─── resetChanges ─────────────────────────────────────────────────────────────
describe("ProfileManager – resetChanges", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads current profile", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await pm.resetChanges();
    expect(ctx.hass.callWS).toHaveBeenCalled();
  });

  it("does nothing if no profile is active", async () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "";
    ctx.selectedProfile = "";
    await pm.resetChanges();
    expect(ctx.hass.callWS).not.toHaveBeenCalled();
  });

  it("uses selectedProfile if lastLoadedProfile is empty", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    ctx.selectedProfile = "Night";
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "";
    await pm.resetChanges();
    expect(ctx.hass.callWS).toHaveBeenCalled();
  });

  it("handles loadProfile errors without crashing", async () => {
    const { ctx } = makeContext();
    ctx.hass.callWS.mockRejectedValueOnce(new Error("error"));
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await expect(pm.resetChanges()).resolves.toBeUndefined();
  });

  it("calls snapshotSelection and restoreSelection if available", async () => {
    const { ctx, selectionManager } = makeContext();
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await pm.resetChanges();
    expect(selectionManager.snapshotSelection).toHaveBeenCalled();
    expect(selectionManager.restoreSelection).toHaveBeenCalled();
  });

  it("handles absence of selectionManager in resetChanges", async () => {
    const { ctx, stateManager } = makeContext();
    ctx.getManager.mockImplementation((k) => k === "state" ? stateManager : null);
    ctx.hass.callWS.mockResolvedValue({ response: { schedule: [], meta: {} } });
    const pm = new ProfileManager(ctx);
    pm.lastLoadedProfile = "Day";
    await pm.resetChanges();
    expect(pm.lastLoadedProfile).toBe("Day");
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────
describe("ProfileManager – destroy", () => {
  it("does not throw errors", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    expect(() => pm.destroy()).not.toThrow();
  });

  it("clears autoSaveTimer if present", () => {
    const { ctx } = makeContext();
    const pm = new ProfileManager(ctx);
    pm._autoSaveTimer = setTimeout(() => {}, 10000);
    const spy = vi.spyOn(global, "clearTimeout");
    pm.destroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
