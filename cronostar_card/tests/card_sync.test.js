// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CardSync } from "../src/core/CardSync.js";

vi.mock("../src/config.js", () => ({
  TIMEOUTS: {
    automationSuppression: 7000,
    editingGraceMs: 5000,
    mismatchPersistenceMs: 10000
  }
}));

vi.mock("../src/utils.js", () => ({
  Logger: { log: vi.fn(), error: vi.fn() }
}));

describe("CardSync Coverage Boost", () => {
  let card;
  let sync;

  beforeEach(() => {
    vi.useFakeTimers();
    card = {
      language: "en",
      config: { target_entity: "climate.test" },
      stateManager: {
        getCurrentIndex: vi.fn(() => 0),
        getData: vi.fn(() => [20, 21]),
        getPointLabel: vi.fn(() => "10:00")
      },
      isEditorContext: vi.fn(() => false),
      isEnabled: true,
      hasUnsavedChanges: false,
      isDragging: false,
      overlaySuppressionUntil: 0,
      lastEditAt: 0,
      awaitingAutomation: false,
      outOfSyncDetails: "",
      mismatchSince: 0,
      requestUpdate: vi.fn()
    };
    sync = new CardSync(card);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getAwaitingAutomationText handles IT", () => {
    card.language = "it";
    expect(sync.getAwaitingAutomationText()).toContain("In attesa");
  });

  it("getScheduledValue handles errors", () => {
    card.stateManager.getData.mockImplementation(() => { throw new Error("fail") });
    expect(sync.getScheduledValue({})).toBeNull();
  });

  describe("getTargetEntityAppliedValue", () => {
    it("handles climate target_temperature", () => {
      const hass = { states: { "climate.test": { attributes: { target_temperature: 22 } } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(22);
    });

    it("handles climate target_temp_low", () => {
      const hass = { states: { "climate.test": { attributes: { target_temp_low: 18 } } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(18);
    });

    it("handles number domain", () => {
      card.config.target_entity = "number.test";
      const hass = { states: { "number.test": { state: "15.5" } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(15.5);
    });

    it("handles errors and missing entities", () => {
      expect(sync.getTargetEntityAppliedValue(null)).toBeNull();
      card.config.target_entity = null;
      expect(sync.getTargetEntityAppliedValue({})).toBeNull();
    });
  });

  describe("updateAutomationSync", () => {
    it("returns early if not enabled or dragging", () => {
      card.isEnabled = false;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);

      card.isEnabled = true;
      card.isDragging = true;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if suppressed", () => {
      card.overlaySuppressionUntil = Date.now() + 10000;
      card.lastEditAt = Date.now();
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("handles mismatch persistence and IT details", () => {
      card.lastEditAt = Date.now() - 20000;
      card.language = "it";
      const hass = { states: { "climate.test": { attributes: { temperature: 25 } } } }; // Scheduled is 20
      
      // First call starts mismatch
      sync.updateAutomationSync(hass);
      expect(card.mismatchSince).toBeGreaterThan(0);
      expect(card.awaitingAutomation).toBe(false);

      // Advance time beyond mismatchPersistenceMs (10s)
      vi.advanceTimersByTime(11000);
      sync.updateAutomationSync(hass);
      expect(card.awaitingAutomation).toBe(true);
      expect(card.outOfSyncDetails).toContain("Programma");
    });
  });
});
