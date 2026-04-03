// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CardContext } from "../src/core/CardContext.js";
import { EventBus } from "../src/core/EventBus.js";

describe("CardContext", () => {
  let context, card;

  beforeEach(() => {
    card = {
      hass: { states: {} },
      config: { global_prefix: "p_" },
      language: "en",
      selectedPreset: "thermostat",
      selectedProfile: "Default",
      hasUnsavedChanges: false,
      isMenuOpen: false,
      requestUpdate: vi.fn(),
    };
    context = new CardContext(card);
  });

  it("dovrebbe restituire le proprietà della card tramite getter", () => {
    expect(context.hass).toBe(card.hass);
    expect(context.config).toBe(card.config);
    expect(context.language).toBe("en");
    expect(context.selectedPreset).toBe("thermostat");
    expect(context.selectedProfile).toBe("Default");
    expect(context.hasUnsavedChanges).toBe(false);
    expect(context.isMenuOpen).toBe(false);
  });

  it("dovrebbe aggiornare le proprietà della card tramite setter ed emettere eventi", () => {
    const emitSpy = vi.spyOn(context.events, "emit");
    
    context.hasUnsavedChanges = true;
    expect(card.hasUnsavedChanges).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith("unsaved:changes", true);

    context.selectedProfile = "Night";
    expect(card.selectedProfile).toBe("Night");
    expect(emitSpy).toHaveBeenCalledWith("profile:changed", "Night");

    context.isMenuOpen = true;
    expect(card.isMenuOpen).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith("menu:changed", true);
  });

  it("dovrebbe registrare e restituire i manager", () => {
    const mockManager = { id: 1 };
    context.registerManager("test", mockManager);
    expect(context.getManager("test")).toBe(mockManager);
  });

  it("dovrebbe chiamare requestUpdate sulla card", () => {
    context.requestUpdate();
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("dovrebbe restituire se è in editor context", () => {
    // Di default card non ha host/parent quindi è false
    expect(context.isEditorContext()).toBe(false);

    // Mock parentNode per simulare editor
    const mockParent = { tagName: "HUI-CARD-EDITOR" };
    card.parentElement = mockParent;
    expect(context.isEditorContext()).toBe(true);
  });

  it("dovrebbe pulire le risorse con destroy()", () => {
    context.registerManager("m", {});
    const clearSpy = vi.spyOn(context.events, "clear");
    context.destroy();
    expect(clearSpy).toHaveBeenCalled();
    expect(context.getManager("m")).toBeUndefined();
  });
});
