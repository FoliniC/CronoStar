// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  copyToClipboard: vi.fn().mockResolvedValue({ success: true, message: "Copied!" }),
}));

describe("CardEventHandlers", () => {
  let handlers, card;

  beforeEach(() => {
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
        states: {}
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
        loadProfile: vi.fn().mockResolvedValue(undefined)
      },
      stateManager: { 
        getData: vi.fn(() => []),
        setData: vi.fn(),
        alignSelectedPoints: vi.fn(),
        _initializeScheduleData: vi.fn(),
        getNumPoints: vi.fn(() => 0),
      },
      selectionManager: {
        selectAll: vi.fn(),
        selectedPoint: null,
        selectedPoints: []
      },
      cardSync: {
        updateAutomationSync: vi.fn(),
        scheduleAutomationOverlaySuppression: vi.fn(),
      },
      cardLifecycle: {
        updateReadyFlag: vi.fn()
      },
      updateComplete: Promise.resolve(),
      dispatchEvent: vi.fn(),
      cronostarReady: true,
    };
    handlers = new CardEventHandlers(card);
  });

  it("toggleMenu dovrebbe invertire lo stato del menu", () => {
    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(true);
    expect(card.keyboardHandler.disable).toHaveBeenCalled();
    
    handlers.toggleMenu();
    expect(card.isMenuOpen).toBe(false);
    expect(card.keyboardHandler.enable).toHaveBeenCalled();
  });

  it("handleLanguageSelect dovrebbe aggiornare la lingua e chiamare il servizio save_profile", async () => {
    await handlers.handleLanguageSelect("it");
    expect(card.language).toBe("it");
    expect(card.config.meta.language).toBe("it");
    expect(card.hass.callService).toHaveBeenCalledWith(
      "cronostar",
      "save_profile",
      expect.objectContaining({ profile_name: "Default" })
    );
  });

  it("handleLoggingToggle dovrebbe aggiornare lo stato dei log", async () => {
    const event = { 
      stopPropagation: vi.fn(), 
      preventDefault: vi.fn(), 
      target: { checked: true } 
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
      expect.objectContaining({ message: "test msg" })
    );
  });

  it("handleCardClick dovrebbe chiudere il menu se aperto", () => {
    card.isMenuOpen = true;
    const event = { 
      target: { closest: vi.fn(() => false) } 
    };
    handlers.handleCardClick(event);
    expect(card.isMenuOpen).toBe(false);
  });

  describe("handlePresetChange", () => {
    it("dovrebbe cambiare preset e ricaricare opzioni chart", async () => {
      const event = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "ev_charging" }
      };
      card.selectedPreset = "thermostat";
      card.config = { preset: "thermostat", global_prefix: "p_" };
      card.chartManager.isInitialized.mockReturnValue(true);

      await handlers.handlePresetChange(event);

      expect(card.selectedPreset).toBe("ev_charging");
      expect(card.config.preset).toBe("ev_charging");
      expect(card.chartManager.recreateChartOptions).toHaveBeenCalled();
      expect(card.isMenuOpen).toBe(false);
    });

    it("non dovrebbe fare nulla se il preset è uguale", async () => {
      const event = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        detail: { value: "thermostat" }
      };
      card.selectedPreset = "thermostat";
      await handlers.handlePresetChange(event);
      expect(card.chartManager.recreateChartOptions).not.toHaveBeenCalled();
    });
  });

  it("handleSelectAll dovrebbe selezionare tutto e aggiornare stile", () => {
    handlers.handleSelectAll();
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalled();
    expect(card.chartManager.update).toHaveBeenCalled();
    expect(card.isMenuOpen).toBe(false);
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
        entity_id: "switch.test"
      });
      expect(card.isEnabled).toBe(true);
    });

    it("dovrebbe chiamare il servizio turn_off quando checked è false", async () => {
      const event = { target: { checked: false } };
      card.config = { enabled_entity: "switch.test" };

      await handlers.toggleEnabled(event);

      expect(card.hass.callService).toHaveBeenCalledWith("switch", "turn_off", {
        entity_id: "switch.test"
      });
      expect(card.isEnabled).toBe(false);
    });
  });

  describe("handleApplyNow", () => {
    it("dovrebbe chiamare save_profile e apply_now", async () => {
      card.config = { target_entity: "climate.test", global_prefix: "p_" };
      card.stateManager.getData.mockReturnValue([{ time: "00:00", value: 20 }]);
      
      await handlers.handleApplyNow();
      
      expect(card.hass.callService).toHaveBeenCalledWith("cronostar", "save_profile", expect.any(Object));
      expect(card.hass.callService).toHaveBeenCalledWith("cronostar", "apply_now", expect.any(Object));
      expect(card.hasUnsavedChanges).toBe(false);
    });

    it("dovrebbe mostrare errore se target_entity non è configurata", async () => {
      card.config = { target_entity: null };
      const showNotificationSpy = vi.spyOn(handlers, "showNotification");
      
      await handlers.handleApplyNow();
      
      expect(showNotificationSpy).toHaveBeenCalledWith(expect.stringContaining("target_entity not set"), "error");
    });
  });

  describe("handleAddProfile", () => {
    it("dovrebbe chiamare add_profile e aggiornare UI", async () => {
      vi.spyOn(handlers, "_openAddProfileDialog").mockResolvedValue("NewProfile");
      card.config = { global_prefix: "p_", profiles_select_entity: "input_select.test" };
      card.profileOptions = ["Default"];
      
      await handlers.handleAddProfile();
      
      expect(card.hass.callService).toHaveBeenCalledWith("cronostar", "add_profile", expect.objectContaining({ profile_name: "NewProfile" }));
      expect(card.selectedProfile).toBe("NewProfile");
      expect(card.profileOptions).toContain("NewProfile");
    });
  });

  describe("handleDeleteProfile", () => {
    it("dovrebbe chiamare delete_profile e aggiornare UI", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      card.selectedProfile = "ToDelete";
      card.profileOptions = ["ToDelete", "Default"];
      card.config = { global_prefix: "p_", profiles_select_entity: "input_select.test" };
      
      await handlers.handleDeleteProfile();
      
      expect(card.hass.callService).toHaveBeenCalledWith("cronostar", "delete_profile", expect.objectContaining({ profile_name: "ToDelete" }));
      expect(card.selectedProfile).toBe("Default");
      expect(card.profileOptions).not.toContain("ToDelete");
    });
  });

  it("handleHelp dovrebbe creare un overlay nel DOM", () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    handlers.handleHelp();
    expect(appendChildSpy).toHaveBeenCalled();
  });

  it("handleEditCard dovrebbe dispatchare hass-edit-card", () => {
    handlers.handleEditCard();
    expect(card.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "hass-edit-card" }));
  });
});

