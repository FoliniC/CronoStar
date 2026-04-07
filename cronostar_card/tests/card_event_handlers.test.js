// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CardEventHandlers } from "../src/core/CardEventHandlers.js";
import { validateConfig } from "../src/config.js";

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual("../src/config.js");
  return {
    ...actual,
    validateConfig: vi.fn((c) => c),
    VERSION: "TEST_VERSION",
  };
});

vi.mock("../src/utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn((config) => config.global_prefix || "p_"),
  getAliasWithPrefix: vi.fn((prefix) => `CronoStar - ${prefix}`),
}));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  copyToClipboard: vi
    .fn()
    .mockResolvedValue({ success: true, message: "Copied!" }),
}));

describe("CardEventHandlers", () => {
  let handlers, card;

  beforeEach(() => {
    document.body.innerHTML = "";
    card = {
      isMenuOpen: false,
      keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
      requestUpdate: vi.fn(),
      isEditorContext: vi.fn(() => false),
      shadowRoot: { querySelector: vi.fn() },
      language: "en",
      config: { meta: {}, global_prefix: "p_", preset_type: "thermostat" },
      selectedProfile: "Default",
      selectedPreset: "thermostat",
      isEnabled: true,
      hass: {
        callService: vi.fn().mockResolvedValue({}),
        callWS: vi.fn().mockResolvedValue({ response: {} }),
        states: {},
      },
      localizationManager: { localize: vi.fn((l, k) => k) },
      chartManager: {
        updateChartLabels: vi.fn(),
        isInitialized: vi.fn(() => false),
        recreateChartOptions: vi.fn(),
        updatePointStyling: vi.fn(),
        update: vi.fn(),
        getChart: vi.fn(() => null),
        updateData: vi.fn(),
      },
      profileManager: {
        lastLoadedProfile: "Default",
        loadProfile: vi.fn().mockResolvedValue(undefined),
        saveProfile: vi.fn().mockResolvedValue(undefined),
      },
      stateManager: {
        getData: vi.fn(() => []),
        setData: vi.fn(),
        alignSelectedPoints: vi.fn(),
        _initializeScheduleData: vi.fn(),
        getNumPoints: vi.fn(() => 0),
        removePoint: vi.fn(),
      },
      selectionManager: {
        selectAll: vi.fn(),
        clearSelection: vi.fn(),
        getSelectedPoints: vi.fn(() => []),
        selectedPoint: null,
        selectedPoints: [],
      },
      cardSync: {
        updateAutomationSync: vi.fn(),
        scheduleAutomationOverlaySuppression: vi.fn(),
      },
      cardLifecycle: {
        updateReadyFlag: vi.fn(),
      },
      updateComplete: Promise.resolve(),
      dispatchEvent: vi.fn(),
      cronostarReady: true,
      hasUnsavedChanges: false,
      contextMenu: { show: false },
      entityStates: {},
    };
    handlers = new CardEventHandlers(card);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("toggleMenu dovrebbe invertire lo stato del menu", () => {
    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(true);
    expect(card.keyboardHandler.disable).toHaveBeenCalled();

    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(false);
    expect(card.keyboardHandler.enable).toHaveBeenCalled();
  });

  it("toggleMenu stops propagation/preventDefault when event is passed", () => {
    const e = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    handlers.toggleMenu(e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("toggleMenu closes on next document click outside", async () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    handlers.toggleMenu();
    vi.advanceTimersByTime(20);

    const closeMenu = addSpy.mock.calls.find((c) => c[0] === "click")[1];
    closeMenu({ composedPath: () => [] });

    expect(card.isMenuOpen).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith("click", closeMenu);
    vi.useRealTimers();
  });

  it("toggleMenu does not close if composedPath includes the card", async () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(document, "addEventListener");
    handlers.toggleMenu();
    vi.advanceTimersByTime(20);

    const closeMenu = addSpy.mock.calls.find((c) => c[0] === "click")[1];
    closeMenu({ composedPath: () => [card] });

    expect(card.isMenuOpen).toBe(true);
    vi.useRealTimers();
  });

  it("toggleMenu focuses chart container when closing outside editor", () => {
    const focus = vi.fn();
    card.shadowRoot.querySelector.mockReturnValue({ focus });
    card.isMenuOpen = true;
    handlers.toggleMenu();
    expect(focus).toHaveBeenCalled();
  });

  it("toggleMenu does not focus when editor context is true", () => {
    const focus = vi.fn();
    card.shadowRoot.querySelector.mockReturnValue({ focus });
    card.isEditorContext.mockReturnValue(true);
    card.isMenuOpen = true;
    handlers.toggleMenu();
    expect(focus).not.toHaveBeenCalled();
  });

  it("handleLanguageSelect dovrebbe aggiornare la lingua e chiamare il servizio save_profile", async () => {
    await handlers.handleLanguageSelect("it");
    expect(card.language).toBe("it");
    expect(card.config.meta.language).toBe("it");
    expect(card.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Default" }),
    );
  });

  it("handleLanguageSelect uses fallback profile/preset/globalPrefix if missing", async () => {
    card.selectedProfile = "";
    card.profileManager.lastLoadedProfile = "";
    card.selectedPreset = null;
    card.config.global_prefix = "";
    card.stateManager.getData.mockReturnValue([{ time: "00:00", value: 10 }]);
    await handlers.handleLanguageSelect("it");
    expect(card.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({
        profile_name: "Default",
        preset_type: "thermostat",
        global_prefix: "",
      }),
    );
  });

  it("handleLanguageSelect warns if info is missing for save", async () => {
    card.hass = null;
    await handlers.handleLanguageSelect("it");
    expect(card.isMenuOpen).toBe(false);
  });

  it("handleLanguageSelect handles save errors with notification", async () => {
    card.hass.callService.mockRejectedValueOnce(new Error("save failed"));
    const spy = vi.spyOn(handlers, "showNotification");
    await handlers.handleLanguageSelect("it");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("notify.language_save_error"),
      "error",
    );
  });

  it("handleLoggingToggle dovrebbe aggiornare lo stato dei log", async () => {
    const event = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      target: { checked: true },
    };
    await handlers.handleLoggingToggle(event);
    expect(card.loggingEnabled).toBe(true);
    expect(card.isMenuOpen).toBe(false);
  });

  it("showNotification dovrebbe chiamare il servizio persistent_notification", () => {
    handlers.showNotification("test msg", "success");
    expect(card.hass.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "create",
      expect.objectContaining({ message: "test msg" }),
    );
  });

  it("showNotification returns when hass is missing", () => {
    card.hass = null;
    expect(() => handlers.showNotification("x")).not.toThrow();
  });

  it("showNotification catches errors from callService", () => {
    card.hass.callService.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => handlers.showNotification("x")).not.toThrow();
  });

  it("handleCardClick dovrebbe chiudere il menu se aperto", () => {
    card.isMenuOpen = true;
    const event = {
      target: { closest: vi.fn(() => false) },
    };
    handlers.handleCardClick(event);
    expect(card.isMenuOpen).toBe(false);
  });

  describe("handlePresetChange", () => {
    it("dovrebbe cambiare preset e ricaricare opzioni chart", async () => {
      const event = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "ev_charging" },
      };
      card.selectedPreset = "thermostat";
      card.config = { preset: "thermostat", global_prefix: "p_" };
      card.chartManager.isInitialized.mockReturnValue(true);
      card.chartManager.getChart.mockReturnValue({
        options: { scales: { y: {} } },
        update: vi.fn(),
      });

      await handlers.handlePresetChange(event);

      expect(card.selectedPreset).toBe("ev_charging");
      expect(card.config.preset).toBe("ev_charging");
      expect(card.chartManager.recreateChartOptions).toHaveBeenCalled();
      expect(card.isMenuOpen).toBe(false);
    });

    it("reads preset from target.value fallback", async () => {
      const event = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        target: { value: "generic_switch" },
      };
      card.selectedPreset = "thermostat";
      await handlers.handlePresetChange(event);
      expect(card.selectedPreset).toBe("generic_switch");
    });

    it("non dovrebbe fare nulla se il preset è uguale", async () => {
      const event = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "thermostat" },
      };
      card.selectedPreset = "thermostat";
      await handlers.handlePresetChange(event);
      expect(card.chartManager.recreateChartOptions).not.toHaveBeenCalled();
    });

    it("returns if newPreset is falsy", async () => {
      await handlers.handlePresetChange({
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "" },
      });
      expect(validateConfig).not.toHaveBeenCalled();
    });

    it("updates chart when chartManager is initialized", async () => {
      const update = vi.fn();
      card.chartManager.isInitialized.mockReturnValue(true);
      card.chartManager.getChart.mockReturnValue({
        options: { scales: { y: {} } },
        update,
      });
      await handlers.handlePresetChange({
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "ev_charging" },
      });
      expect(update).toHaveBeenCalled();
    });

    it("does not focus chart in editor context after preset change", async () => {
      card.isEditorContext.mockReturnValue(true);
      const focus = vi.fn();
      card.shadowRoot.querySelector.mockReturnValue({ focus });
      await handlers.handlePresetChange({
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "ev_charging" },
      });
      expect(focus).not.toHaveBeenCalled();
    });
  });

  it("handleSelectAll dovrebbe selezionare tutto e aggiornare stile", () => {
    handlers.handleSelectAll();
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalled();
    expect(card.chartManager.update).toHaveBeenCalled();
    expect(card.isMenuOpen).toBe(false);
  });

  it("handleSelectAll closes context menu", () => {
    card.contextMenu = { show: true };
    handlers.handleSelectAll();
    expect(card.contextMenu.show).toBe(false);
  });

  it("handleSelectAll focuses chart container when possible", () => {
    const focus = vi.fn();
    card.shadowRoot.querySelector.mockReturnValue({ focus });
    handlers.handleSelectAll();
    expect(focus).toHaveBeenCalled();
  });

  it("handleAlignLeft dovrebbe chiamare stateManager.alignSelectedPoints", () => {
    handlers.handleAlignLeft();
    expect(card.stateManager.alignSelectedPoints).toHaveBeenCalledWith("left");
    expect(card.isMenuOpen).toBe(false);
  });

  it("handleAlignRight dovrebbe chiamare stateManager.alignSelectedPoints", () => {
    handlers.handleAlignRight();
    expect(card.stateManager.alignSelectedPoints).toHaveBeenCalledWith("right");
    expect(card.isMenuOpen).toBe(false);
  });

  describe("toggleEnabled", () => {
    it("dovrebbe chiamare il servizio turn_on quando checked è true", async () => {
      const event = { target: { checked: true } };
      card.config = { enabled_entity: "switch.test" };

      await handlers.toggleEnabled(event);

      expect(card.hass.callService).toHaveBeenCalledWith("switch", "turn_on", {
        entity_id: "switch.test",
      });
      expect(card.isEnabled).toBe(true);
    });

    it("dovrebbe chiamare il servizio turn_off quando checked è false", async () => {
      const event = { target: { checked: false } };
      card.config = { enabled_entity: "switch.test" };

      await handlers.toggleEnabled(event);

      expect(card.hass.callService).toHaveBeenCalledWith("switch", "turn_off", {
        entity_id: "switch.test",
      });
      expect(card.isEnabled).toBe(false);
    });

    it("toggleEnabled returns if entityId is missing", async () => {
      card.config = {};
      await handlers.toggleEnabled({ target: { checked: true } });
      expect(card.hass.callService).not.toHaveBeenCalled();
    });

    it("toggleEnabled returns if hass is missing", async () => {
      card.hass = null;
      await handlers.toggleEnabled({ target: { checked: true } });
    });

    it("toggleEnabled catches service errors", async () => {
      card.config = { enabled_entity: "switch.test" };
      card.hass.callService.mockRejectedValueOnce(new Error("boom"));
      await expect(
        handlers.toggleEnabled({ target: { checked: true } }),
      ).resolves.toBeUndefined();
    });
  });

  describe("handleApplyNow", () => {
    it("dovrebbe chiamare save_profile e apply_now", async () => {
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      card.stateManager.getData.mockReturnValue([{ time: "00:00", value: 20 }]);

      await handlers.handleApplyNow();

      expect(card.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "save_profile",
        expect.any(Object),
      );
      expect(card.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "apply_now",
        expect.any(Object),
      );
      expect(card.hasUnsavedChanges).toBe(false);
    });

    it("dovrebbe mostrare errore se hass manca", async () => {
      card.hass = null;
      const showNotificationSpy = vi.spyOn(handlers, "showNotification");
      await handlers.handleApplyNow();
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining("ui.apply_now_error"),
        "error",
      );
    });

    it("dovrebbe mostrare errore se backend non è pronto", async () => {
      card.cronostarReady = false;
      const showNotificationSpy = vi.spyOn(handlers, "showNotification");

      await handlers.handleApplyNow();

      expect(showNotificationSpy).toHaveBeenCalledWith(
        "ui.waiting_profile_restore",
        "error",
      );
    });

    it("dovrebbe mostrare errore se target_entity non è configurata", async () => {
      card.config = { target_entity: null };
      const showNotificationSpy = vi.spyOn(handlers, "showNotification");

      await handlers.handleApplyNow();

      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining("target_entity not set"),
        "error",
      );
    });

    it("uses selectedPreset fallback and safe meta", async () => {
      card.selectedPreset = null;
      card.config = {
        target_entity: "climate.test",
        global_prefix: "p_",
        allow_max_value: false,
      };
      card.stateManager.getData.mockReturnValue([{ time: "00:00", value: 20 }]);
      await handlers.handleApplyNow();
      expect(card.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "apply_now",
        expect.objectContaining({
          preset_type: null,
        }),
      );
    });

    it("keeps menu closed and re-focuses chart after apply", async () => {
      const focus = vi.fn();
      card.shadowRoot.querySelector.mockReturnValue({ focus });
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      await handlers.handleApplyNow();
      expect(focus).toHaveBeenCalled();
      expect(card.requestUpdate).toHaveBeenCalled();
    });

    it("does not focus chart in editor context after apply", async () => {
      card.isEditorContext.mockReturnValue(true);
      const focus = vi.fn();
      card.shadowRoot.querySelector.mockReturnValue({ focus });
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      await handlers.handleApplyNow();
      expect(focus).not.toHaveBeenCalled();
    });

    it("closes menu and enables keyboard before apply", async () => {
      card.isMenuOpen = true;
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      await handlers.handleApplyNow();
      expect(card.isMenuOpen).toBe(false);
      expect(card.keyboardHandler.enable).toHaveBeenCalled();
    });

    it("handles apply_now errors", async () => {
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      card.hass.callService.mockRejectedValueOnce(new Error("apply failed"));
      const showNotificationSpy = vi.spyOn(handlers, "showNotification");
      await handlers.handleApplyNow();
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining("apply failed"),
        "error",
      );
    });
  });

  describe("handleAddProfile", () => {
    it("dovrebbe chiamare add_profile e aggiornare UI", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewProfile");
      card.config = {
        global_prefix: "p_",
        profiles_select_entity: "input_select.test",
      };
      card.profileOptions = ["Default"];

      await handlers.handleAddProfile();

      expect(card.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "add_profile",
        expect.objectContaining({ profile_name: "NewProfile" }),
      );
      expect(card.selectedProfile).toBe("NewProfile");
      expect(card.profileOptions).toContain("NewProfile");
    });

    it("returns with error if hass is missing", async () => {
      card.hass = null;
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleAddProfile();
      expect(spy).toHaveBeenCalled();
    });

    it("returns when dialog is cancelled", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue(null);
      await handlers.handleAddProfile();
      expect(card.hass.callService).not.toHaveBeenCalled();
    });

    it("shows duplicate error if profile already exists", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("Default");
      card.profileOptions = ["Default"];
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleAddProfile();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("notify.add_profile_error"),
        "error",
      );
    });

    it("retries selector sync when new option is not yet present", async () => {
      vi.useFakeTimers();
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewProfile");
      card.config = {
        global_prefix: "p_",
        profiles_select_entity: "input_select.test",
      };
      card.profileOptions = [];
      card.hass.states["input_select.test"] = { attributes: { options: [] } };

      await handlers.handleAddProfile();
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      expect(card.hass.callService).toHaveBeenCalled();
    });

    it("selector sync retries on callService error", async () => {
      vi.useFakeTimers();
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewProfile");
      card.config = {
        global_prefix: "p_",
        profiles_select_entity: "input_select.test",
      };
      card.profileOptions = [];
      card.hass.states["input_select.test"] = {
        attributes: { options: ["NewProfile"] },
      };
      card.hass.callService
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("select fail"));
      await handlers.handleAddProfile();
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      expect(card.hass.callService).toHaveBeenCalled();
    });

    it("handles UI post-create errors gracefully", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewProfile");
      card.profileManager.loadProfile.mockRejectedValueOnce(new Error("load fail"));
      await expect(handlers.handleAddProfile()).resolves.toBeUndefined();
    });

    it("shows add_profile error on thrown exception", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockRejectedValue(
        new Error("dialog fail"),
      );
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleAddProfile();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("notify.add_profile_error"),
        "error",
      );
    });

    it("finally closes menu, enables keyboard and requests update", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue(null);
      await handlers.handleAddProfile();
      expect(card.isMenuOpen).toBe(false);
      expect(card.keyboardHandler.enable).toHaveBeenCalled();
      expect(card.requestUpdate).toHaveBeenCalled();
    });
  });

  describe("handleDeleteProfile", () => {
    it("dovrebbe chiamare delete_profile e aggiornare UI", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      card.selectedProfile = "ToDelete";
      card.profileOptions = ["ToDelete", "Default"];
      card.config = {
        global_prefix: "p_",
        profiles_select_entity: "input_select.test",
      };

      await handlers.handleDeleteProfile();

      expect(card.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "delete_profile",
        expect.objectContaining({ profile_name: "ToDelete" }),
      );
      expect(card.selectedProfile).toBe("Default");
      expect(card.profileOptions).not.toContain("ToDelete");
    });

    it("returns error if hass is missing", async () => {
      card.hass = null;
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleDeleteProfile();
      expect(spy).toHaveBeenCalled();
    });

    it("returns error if no profile selected", async () => {
      card.selectedProfile = "";
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleDeleteProfile();
      expect(spy).toHaveBeenCalled();
    });

    it("returns when confirm is false", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      card.selectedProfile = "ToDelete";
      await handlers.handleDeleteProfile();
      expect(card.hass.callService).not.toHaveBeenCalled();
    });

    it("works when window is undefined-like branch uses true", async () => {
      vi.stubGlobal("window", undefined);
      card.selectedProfile = "ToDelete";
      card.profileOptions = ["ToDelete"];
      await handlers.handleDeleteProfile();
      expect(card.hass.callService).toHaveBeenCalled();
    });

    it("resets schedule when no profiles remain", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      card.selectedProfile = "OnlyOne";
      card.profileOptions = ["OnlyOne"];
      card.chartManager.isInitialized.mockReturnValue(true);
      await handlers.handleDeleteProfile();
      expect(card.stateManager._initializeScheduleData).toHaveBeenCalled();
      expect(card.chartManager.updateData).toHaveBeenCalled();
    });

    it("handles UI post-delete errors gracefully", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      card.selectedProfile = "OnlyOne";
      card.profileOptions = ["OnlyOne", "Other"];
      card.profileManager.loadProfile.mockRejectedValueOnce(new Error("load fail"));
      await expect(handlers.handleDeleteProfile()).resolves.toBeUndefined();
    });

    it("handles delete_profile exception with notification", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      card.selectedProfile = "ToDelete";
      card.hass.callService.mockRejectedValueOnce(new Error("delete fail"));
      const spy = vi.spyOn(handlers, "showNotification");
      await handlers.handleDeleteProfile();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("notify.delete_profile_error"),
        "error",
      );
    });

    it("finally closes menu, enables keyboard and requests update", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      card.selectedProfile = "ToDelete";
      await handlers.handleDeleteProfile();
      expect(card.isMenuOpen).toBe(false);
      expect(card.keyboardHandler.enable).toHaveBeenCalled();
      expect(card.requestUpdate).toHaveBeenCalled();
    });
  });

  it("handleHelp dovrebbe creare un overlay nel DOM", () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    handlers.handleHelp();
    expect(appendChildSpy).toHaveBeenCalled();
  });

  it("handleHelp close button removes overlay", () => {
    handlers.handleHelp();
    const buttons = [...document.querySelectorAll("button")];
    const closeBtn = buttons.find((b) => b.textContent === "✕");
    closeBtn.click();
    expect(document.body.innerHTML).toBe("");
  });

  it("handleHelp overlay click closes only when clicking overlay itself", () => {
    handlers.handleHelp();
    const overlay = [...document.body.children][0];
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  it("handleHelp copy button uses copyToClipboard success path", async () => {
    handlers.handleHelp();
    const buttons = [...document.querySelectorAll("button")];
    const copyBtn = buttons.find((b) => b.textContent.includes("Copy"));
    await copyBtn.onclick();
    expect(copyBtn.textContent).toContain("Copied");
  });

  it("handleHelp supports Italian text branches", () => {
    card.language = "it";
    handlers.handleHelp();
    expect(document.body.textContent).toContain("Aiuto CronoStar");
  });

  it("handleDeleteSelected dovrebbe cancellare i punti selezionati", () => {
    card.selectionManager.getSelectedPoints = vi.fn(() => [1, 2]);
    card.stateManager.getNumPoints = vi.fn(() => 10);
    card.chartManager.isInitialized.mockReturnValue(true);

    handlers.handleDeleteSelected();
    expect(card.stateManager.removePoint).toHaveBeenCalledTimes(2);
    expect(card.chartManager.updateData).toHaveBeenCalled();
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });

  it("handleDeleteSelected non dovrebbe cancellare i punti di confine", () => {
    card.selectionManager.getSelectedPoints = vi.fn(() => [0, 9]);
    card.stateManager.getNumPoints = vi.fn(() => 10);

    handlers.handleDeleteSelected();

    expect(card.stateManager.removePoint).not.toHaveBeenCalled();
  });

  it("handleDeleteSelected returns early if no selection", () => {
    card.selectionManager.getSelectedPoints = vi.fn(() => []);
    handlers.handleDeleteSelected();
    expect(card.contextMenu.show).toBe(false);
  });

  it("handleCopyJson dovrebbe copiare il JSON negli appunti", async () => {
    card.stateManager.getData.mockReturnValue([{ time: "00:00", value: 20 }]);

    await handlers.handleCopyJson();

    const { copyToClipboard } = await import(
      "../src/editor/services/service_handlers.js"
    );
    expect(copyToClipboard).toHaveBeenCalled();
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("handleCopyJson handles unsuccessful clipboard result", async () => {
    const mod = await import("../src/editor/services/service_handlers.js");
    mod.copyToClipboard.mockResolvedValueOnce({
      success: false,
      message: "Nope",
    });
    const spy = vi.spyOn(handlers, "showNotification");
    await handlers.handleCopyJson();
    expect(spy).toHaveBeenCalledWith("Nope", "error");
  });

  it("handleCopyJson handles thrown error", async () => {
    const mod = await import("../src/editor/services/service_handlers.js");
    mod.copyToClipboard.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(handlers, "showNotification");
    await handlers.handleCopyJson();
    expect(spy).toHaveBeenCalledWith("Failed to copy JSON", "error");
  });

  it("handleDeleteProfile dovrebbe gestire la cancellazione confermata", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    card.selectedProfile = "Test";
    card.profileOptions = ["Test", "Other"];

    await handlers.handleDeleteProfile();

    expect(card.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "delete_profile",
      expect.objectContaining({ profile_name: "Test" }),
    );
    expect(card.selectedProfile).toBe("Other");
  });

  it("handleDeleteProfile non dovrebbe fare nulla se non confermato", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    card.selectedProfile = "Test";

    await handlers.handleDeleteProfile();

    expect(card.hass.callService).not.toHaveBeenCalledWith(
      "cronostar",
      "delete_profile",
      expect.any(Object),
    );
  });

  it("showNotification dovrebbe gestire il timeout di chiusura", async () => {
    vi.useFakeTimers();
    handlers.showNotification("test", "success");

    expect(card.hass.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "create",
      expect.any(Object),
    );

    vi.advanceTimersByTime(5000);

    expect(card.hass.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "dismiss",
      expect.any(Object),
    );
    vi.useRealTimers();
  });

  it("showNotification uses longer dismiss delay for error", async () => {
    vi.useFakeTimers();
    handlers.showNotification("test", "error");
    vi.advanceTimersByTime(10000);
    expect(card.hass.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "dismiss",
      expect.any(Object),
    );
    vi.useRealTimers();
  });

  it("handleEditCard dovrebbe scatenare l'evento hass-edit-card", () => {
    const dispatchSpy = vi.spyOn(card, "dispatchEvent");
    handlers.handleEditCard();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hass-edit-card" }),
    );
  });

  it("handleCardClick dovrebbe chiudere il menu se si clicca fuori", () => {
    card.isMenuOpen = true;
    const event = {
      target: {
        closest: vi.fn(() => null),
      },
    };

    handlers.handleCardClick(event);

    expect(card.isMenuOpen).toBe(false);
    expect(card.keyboardHandler.enable).toHaveBeenCalled();
  });

  it("handleCardClick ignores clicks inside menu or button", () => {
    card.isMenuOpen = true;
    handlers.handleCardClick({
      target: { closest: vi.fn((sel) => (sel === ".menu-content" ? true : null)) },
    });
    expect(card.isMenuOpen).toBe(true);
  });

  describe("_fetchProfileNameSuggestions", () => {
    it("dovrebbe ritornare suggerimenti filtrando il profilo attuale", async () => {
      card.config.global_prefix = "p_";
      card.profileOptions = ["Default"];
      card.hass.callWS.mockResolvedValueOnce({
        response: {
          thermostat: {
            files: [
              { filename: "other_card", profiles: ["Night", "Default"] },
              { filename: "p_this_card", profiles: ["Secret"] },
            ],
          },
        },
      });

      const suggestions = await handlers._fetchProfileNameSuggestions(
        "thermostat",
      );
      expect(suggestions).toEqual(["Night"]);
    });

    it("supports profile_names fallback", async () => {
      card.hass.callWS.mockResolvedValueOnce({
        response: {
          thermostat: {
            files: [{ filename: "other", profile_names: ["Eco"] }],
          },
        },
      });
      const suggestions = await handlers._fetchProfileNameSuggestions(
        "thermostat",
      );
      expect(suggestions).toEqual(["Eco"]);
    });

    it("returns [] if section/files are missing", async () => {
      card.hass.callWS.mockResolvedValueOnce({ response: {} });
      const suggestions = await handlers._fetchProfileNameSuggestions(
        "thermostat",
      );
      expect(suggestions).toEqual([]);
    });

    it("dovrebbe gestire errori del servizio", async () => {
      card.hass.callWS.mockRejectedValueOnce(new Error("WS fail"));
      const suggestions = await handlers._fetchProfileNameSuggestions(
        "thermostat",
      );
      expect(suggestions).toEqual([]);
    });
  });

  describe("_openAddProfileDialog", () => {
    it("dovrebbe aprire il dialog e risolvere con il nome inserito", async () => {
      vi.spyOn(handlers, "_fetchProfileNameSuggestions").mockResolvedValue([
        "Night",
      ]);

      const promise = handlers._openAddProfileDialog();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const overlays = Array.from(document.body.querySelectorAll("div")).filter(
        (d) => d.style.position === "fixed",
      );
      const overlay = overlays[0];

      expect(overlay).toBeTruthy();

      const input = overlay.querySelector("input");
      expect(input).toBeTruthy();
      input.value = "NewProfile";

      const okBtn = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Create",
      );
      okBtn.click();

      const result = await promise;
      expect(result).toBe("NewProfile");
      expect(
        document.body.querySelector("div[style*='position: fixed']"),
      ).toBeNull();
    });

    it("fills input when clicking a suggestion chip", async () => {
      vi.spyOn(handlers, "_fetchProfileNameSuggestions").mockResolvedValue([
        "Night",
      ]);
      const promise = handlers._openAddProfileDialog();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const overlay = Array.from(document.body.querySelectorAll("div")).find(
        (d) => d.style.position === "fixed",
      );
      const chip = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Night",
      );
      const input = overlay.querySelector("input");
      chip.click();
      expect(input.value).toBe("Night");
      const cancelBtn = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Cancel",
      );
      cancelBtn.click();
      await promise;
    });

    it("resolves null on overlay background click", async () => {
      vi.spyOn(handlers, "_fetchProfileNameSuggestions").mockResolvedValue([]);
      const promise = handlers._openAddProfileDialog();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const overlay = Array.from(document.body.querySelectorAll("div")).find(
        (d) => d.style.position === "fixed",
      );
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const result = await promise;
      expect(result).toBeNull();
    });

    it("does not resolve with empty value on Create", async () => {
      vi.spyOn(handlers, "_fetchProfileNameSuggestions").mockResolvedValue([]);
      const promise = handlers._openAddProfileDialog();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const overlay = Array.from(document.body.querySelectorAll("div")).find(
        (d) => d.style.position === "fixed",
      );
      const okBtn = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Create",
      );
      okBtn.click();
      const cancelBtn = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Cancel",
      );
      cancelBtn.click();
      const result = await promise;
      expect(result).toBeNull();
    });

    it("dovrebbe risolvere con null se annullato", async () => {
      vi.spyOn(handlers, "_fetchProfileNameSuggestions").mockResolvedValue([]);
      const promise = handlers._openAddProfileDialog();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const overlay = Array.from(document.body.querySelectorAll("div")).find(
        (d) => d.style.position === "fixed",
      );
      expect(overlay).toBeTruthy();
      const cancelBtn = Array.from(overlay.querySelectorAll("button")).find(
        (b) => b.textContent === "Cancel",
      );
      expect(cancelBtn).toBeTruthy();
      cancelBtn.click();

      const result = await promise;
      expect(result).toBeNull();
    });
  });
});
