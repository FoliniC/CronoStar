// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CardSync } from "../src/core/CardSync.js";
import { TIMEOUTS } from "../src/config.js";

describe("CardSync", () => {
  let sync, card, hass;

  beforeEach(() => {
    card = {
      config: { target_entity: "climate.test", step_value: 0.5 },
      stateManager: {
        getCurrentIndex: vi.fn(() => 0),
        getData: vi.fn(() => [20, 21]),
        getPointLabel: vi.fn(() => "08:00"),
      },
      isEnabled: true,
      hasUnsavedChanges: false,
      isDragging: false,
      overlaySuppressionUntil: 0,
      lastEditAt: 0,
      awaitingAutomation: false,
      outOfSyncDetails: "",
      mismatchSince: 0,
      requestUpdate: vi.fn(),
      isEditorContext: vi.fn(() => false),
      language: "en",
    };

    hass = {
      states: {
        "climate.test": {
          state: "heat",
          attributes: { temperature: 20 },
        },
      },
    };

    sync = new CardSync(card);
  });

  it("dovrebbe calcolare il boundary della prossima ora", () => {
    const nextHour = sync.computeNextHourBoundaryPlus(1000);
    const date = new Date(nextHour - 1000);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it("dovrebbe schedulare la soppressione dell'overlay", () => {
    const now = Date.now();
    sync.scheduleAutomationOverlaySuppression(5000);
    expect(card.overlaySuppressionUntil).toBeGreaterThan(now);
    expect(card.awaitingAutomation).toBe(false);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("dovrebbe restituire il valore programmato", () => {
    expect(sync.getScheduledValue(hass)).toBe(20);
  });

  it("dovrebbe restituire il valore applicato per climate", () => {
    expect(sync.getTargetEntityAppliedValue(hass)).toBe(20);
    
    hass.states["climate.test"].attributes = { target_temperature: 22 };
    expect(sync.getTargetEntityAppliedValue(hass)).toBe(22);
  });

  it("dovrebbe restituire il valore applicato per switch", () => {
    card.config.target_entity = "switch.test";
    hass.states["switch.test"] = { state: "on" };
    expect(sync.getTargetEntityAppliedValue(hass)).toBe(1);
    
    hass.states["switch.test"].state = "off";
    expect(sync.getTargetEntityAppliedValue(hass)).toBe(0);
  });

  it("updateAutomationSync non dovrebbe fare nulla se in contesto editor", () => {
    card.isEditorContext.mockReturnValue(true);
    sync.updateAutomationSync(hass);
    expect(card.awaitingAutomation).toBe(false);
  });

  it("updateAutomationSync non dovrebbe fare nulla se non ci sono stati edit", () => {
    card.lastEditAt = 0;
    sync.updateAutomationSync(hass);
    expect(card.awaitingAutomation).toBe(false);
  });

  it("dovrebbe attivare awaitingAutomation se il valore differisce per tempo sufficiente", () => {
    vi.useFakeTimers();
    card.lastEditAt = Date.now() - TIMEOUTS.editingGraceMs - 1000;
    card.overlaySuppressionUntil = 0;
    
    // Valore programmato 20, applicato 25 (mismatch)
    card.stateManager.getData.mockReturnValue([20]);
    hass.states["climate.test"].attributes.temperature = 25;
    
    // Primo check: imposta mismatchSince
    sync.updateAutomationSync(hass);
    expect(card.mismatchSince).toBeGreaterThan(0);
    expect(card.awaitingAutomation).toBe(false);
    
    // Avanza il tempo oltre il persistence timeout
    vi.advanceTimersByTime(TIMEOUTS.mismatchPersistenceMs + 100);
    
    // Secondo check: attiva awaitingAutomation
    sync.updateAutomationSync(hass);
    expect(card.awaitingAutomation).toBe(true);
    expect(card.outOfSyncDetails).toContain("20");
    
    vi.useRealTimers();
  });

  it("dovrebbe resettare awaitingAutomation se i valori tornano in sync", () => {
    card.awaitingAutomation = true;
    card.stateManager.getData.mockReturnValue([20]);
    hass.states["climate.test"].attributes.temperature = 20;
    
    sync.updateAutomationSync(hass);
    expect(card.awaitingAutomation).toBe(false);
    expect(card.mismatchSince).toBe(0);
  });
});
