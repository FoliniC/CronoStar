// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CardEventHandlers } from "../src/core/CardEventHandlers.js";

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
      hass: { callService: vi.fn().mockResolvedValue({}) },
      localizationManager: { localize: vi.fn((l, k) => k) },
      chartManager: { updateChartLabels: vi.fn() },
      profileManager: { lastLoadedProfile: "Default" },
      stateManager: { getData: vi.fn(() => []) },
      updateComplete: Promise.resolve(),
      dispatchEvent: vi.fn(),
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

  it("showNotification dovrebbe emettere un evento hass-notification", () => {
    // Mock esplicito del metodo dispatchEvent sulla card
    card.dispatchEvent = vi.fn();
    
    handlers.showNotification("test msg", "success");
    expect(card.dispatchEvent).toHaveBeenCalled();
    
    const event = card.dispatchEvent.mock.calls[0][0];
    expect(event.detail.message).toBe("test msg");
  });

  it("handleCardClick dovrebbe chiudere il menu se aperto", () => {
    card.isMenuOpen = true;
    const event = { 
      target: { closest: vi.fn(() => false) } 
    };
    handlers.handleCardClick(event);
    expect(card.isMenuOpen).toBe(false);
  });
});
