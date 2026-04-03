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

describe("CardSync - 100% Coverage", () => {
  let card;
  let sync;

  beforeEach(() => {
    vi.useFakeTimers();
    card = {
      language: "en",
      config: { target_entity: "climate.test", step_value: 0.5 },
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

  it("computeNextHourBoundaryPlus calculates correctly", () => {
    const now = new Date(2026, 3, 2, 10, 30, 0); // 10:30
    vi.setSystemTime(now);
    const result = sync.computeNextHourBoundaryPlus(5000);
    const expected = new Date(2026, 3, 2, 11, 0, 5).getTime();
    expect(result).toBe(expected);
  });

  it("computeNextHourBoundaryPlus handles null msAfter (branch coverage)", () => {
    const now = new Date(2026, 3, 2, 10, 30, 0);
    vi.setSystemTime(now);
    const result = sync.computeNextHourBoundaryPlus(null);
    const expected = new Date(2026, 3, 2, 11, 0, 0).getTime();
    expect(result).toBe(expected);
  });

  it("scheduleAutomationOverlaySuppression sets suppression and resets state", () => {
    const now = Date.now();
    sync.scheduleAutomationOverlaySuppression(5000);
    expect(card.overlaySuppressionUntil).toBeGreaterThan(now);
    expect(card.lastEditAt).toBe(now);
    expect(card.awaitingAutomation).toBe(false);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("scheduleAutomationOverlaySuppression handles null ms (branch coverage)", () => {
    const now = Date.now();
    sync.scheduleAutomationOverlaySuppression(null);
    // ms fallback to 7000
    expect(card.overlaySuppressionUntil).toBeGreaterThanOrEqual(now + 7000);
  });

  it("getAwaitingAutomationText handles EN and IT", () => {
    expect(sync.getAwaitingAutomationText()).toContain("Waiting");
    card.language = "it";
    expect(sync.getAwaitingAutomationText()).toContain("In attesa");
  });

  describe("getScheduledValue", () => {
    it("returns correctly from data", () => {
      expect(sync.getScheduledValue({})).toBe(20);
    });
    it("returns null if data[hourIdx] is null or undefined (branch coverage)", () => {
      card.stateManager.getData.mockReturnValue([null, undefined]);
      expect(sync.getScheduledValue({})).toBeNull();
    });
    it("returns null if no data", () => {
      card.stateManager.getData.mockReturnValue([]);
      expect(sync.getScheduledValue({})).toBeNull();
    });
    it("handles catch block", () => {
      card.stateManager.getData.mockImplementation(() => { throw new Error("fail") });
      expect(sync.getScheduledValue({})).toBeNull();
    });
  });

  describe("getTargetEntityAppliedValue", () => {
    it("handles climate temperature attribute", () => {
      const hass = { states: { "climate.test": { attributes: { temperature: 22 } } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(22);
    });

    it("handles climate target_temperature attribute", () => {
      const hass = { states: { "climate.test": { attributes: { target_temperature: 23 } } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(23);
    });

    it("handles climate target_temp_low attribute", () => {
      const hass = { states: { "climate.test": { attributes: { target_temp_low: 18 } } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(18);
    });

    it("returns null for climate without temperature attributes", () => {
      const hass = { states: { "climate.test": { attributes: {} } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("returns null for climate with null attributes (branch coverage)", () => {
      const hass = { states: { "climate.test": { attributes: null } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("handles non-finite temperature in climate", () => {
        const hass = { states: { "climate.test": { attributes: { temperature: NaN } } } };
        expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("handles non-finite target_temperature in climate", () => {
        const hass = { states: { "climate.test": { attributes: { target_temperature: Infinity } } } };
        expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("handles non-finite target_temp_low in climate", () => {
        const hass = { states: { "climate.test": { attributes: { target_temp_low: "invalid" } } } };
        expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("handles non-finite value in number domain", () => {
        card.config.target_entity = "number.test";
        const hass = { states: { "number.test": { state: "NaN" } } };
        expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });

    it("handles number domain", () => {
      card.config.target_entity = "number.test";
      const hass = { states: { "number.test": { state: "15.5" } } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBe(15.5);
    });

    it("handles switch domain", () => {
      card.config.target_entity = "switch.test";
      expect(sync.getTargetEntityAppliedValue({ states: { "switch.test": { state: "on" } } })).toBe(1);
      expect(sync.getTargetEntityAppliedValue({ states: { "switch.test": { state: "off" } } })).toBe(0);
    });

    it("handles unsupported domain", () => {
      card.config.target_entity = "light.test";
      expect(sync.getTargetEntityAppliedValue({ states: { "light.test": { state: "on" } } })).toBeNull();
    });

    it("handles missing entity or state", () => {
      expect(sync.getTargetEntityAppliedValue({ states: {} })).toBeNull();
      card.config.target_entity = null;
      expect(sync.getTargetEntityAppliedValue({})).toBeNull();
    });

    it("handles catch block in getTargetEntityAppliedValue", () => {
      const hass = { get states() { throw new Error("crash") } };
      expect(sync.getTargetEntityAppliedValue(hass)).toBeNull();
    });
  });

  describe("updateAutomationSync", () => {
    it("returns early for editor context", () => {
      card.isEditorContext.mockReturnValue(true);
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early for missing hass or config", () => {
      sync.updateAutomationSync(null);
      expect(card.awaitingAutomation).toBe(false);
      card.config.target_entity = null;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if card is disabled", () => {
      card.isEnabled = false;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if changes unsaved or dragging", () => {
      card.hasUnsavedChanges = true;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
      card.hasUnsavedChanges = false;
      card.isDragging = true;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if overlay suppressed", () => {
      card.overlaySuppressionUntil = Date.now() + 1000;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early during editing grace period", () => {
      card.lastEditAt = Date.now() - 1000;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if never edited in this session", () => {
      card.lastEditAt = 0;
      sync.updateAutomationSync({});
      expect(card.awaitingAutomation).toBe(false);
    });

    it("returns early if values are null", () => {
      card.lastEditAt = 1;
      card.stateManager.getData.mockReturnValue([]);
      sync.updateAutomationSync({ states: {} });
      expect(card.awaitingAutomation).toBe(false);
    });

    it("resets state if mismatch is resolved", () => {
      card.lastEditAt = 1;
      card.mismatchSince = 123;
      const hass = { states: { "climate.test": { attributes: { temperature: 20 } } } }; // Matches [20, 21]
      sync.updateAutomationSync(hass);
      expect(card.mismatchSince).toBe(0);
      expect(card.awaitingAutomation).toBe(false);
    });

    it("handles missing step_value in tolerance (branch coverage)", () => {
      card.lastEditAt = 1;
      card.config.step_value = null;
      const hass = { states: { "climate.test": { attributes: { temperature: 20.2 } } } }; // Scheduled 20. Default tolerance 0.5/2 = 0.25
      sync.updateAutomationSync(hass);
      expect(card.mismatchSince).toBe(0);
    });

    it("handles switch preset tolerance", () => {
      card.lastEditAt = 1;
      card.config.is_switch_preset = true;
      const hass = { states: { "switch.test": { state: "on" } } };
      card.config.target_entity = "switch.test";
      card.stateManager.getData.mockReturnValue([1, 1]); // scheduled on
      
      sync.updateAutomationSync(hass);
      expect(card.mismatchSince).toBe(0);
    });

    it("starts mismatch timer on first mismatch", () => {
      card.lastEditAt = 1;
      const hass = { states: { "climate.test": { attributes: { temperature: 30 } } } }; // Scheduled 20
      sync.updateAutomationSync(hass);
      expect(card.mismatchSince).toBeGreaterThan(0);
      expect(card.awaitingAutomation).toBe(false);
    });

    it("clears details if mismatch is recent (less than persistence timeout)", () => {
      card.lastEditAt = 1;
      card.mismatchSince = Date.now() - 1000; // only 1s mismatch
      card.outOfSyncDetails = "Old Details";
      const hass = { states: { "climate.test": { attributes: { temperature: 30 } } } };
      sync.updateAutomationSync(hass);
      expect(card.awaitingAutomation).toBe(false);
      expect(card.outOfSyncDetails).toBe("");
    });

    it("persists awaiting state and details", () => {
      card.lastEditAt = 1;
      card.mismatchSince = Date.now() - 20000; // 20s ago
      const hass = { states: { "climate.test": { attributes: { temperature: 30 } } } };
      
      // Test EN
      sync.updateAutomationSync(hass);
      expect(card.awaitingAutomation).toBe(true);
      expect(card.outOfSyncDetails).toContain("Schedule");

      // Test IT and label fallback
      card.language = "it";
      card.stateManager.getPointLabel.mockReturnValue(null);
      sync.updateAutomationSync(hass);
      expect(card.outOfSyncDetails).toContain("Programma");
      expect(card.outOfSyncDetails).toContain("Now");
    });
  });
});
