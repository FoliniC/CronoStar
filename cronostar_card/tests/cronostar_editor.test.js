// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";

// Mock dependencies
vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "Thermostat" },
    generic_switch: { title: "Switch" }
  },
  DEFAULT_CONFIG: {
    type: "custom:cronostar-card",
    preset_type: "thermostat"
  },
  validateConfig: vi.fn(c => c),
  extractCardConfig: vi.fn(c => c)
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  normalizePrefix: vi.fn(p => p),
  isValidPrefix: vi.fn(() => true),
  getEffectivePrefix: vi.fn(c => c.global_prefix || "p_"),
  normalizePrefixWithDefault: vi.fn(p => p)
}));

vi.mock("../src/utils/logger_utils.js", () => ({
  log: vi.fn()
}));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  copyToClipboard: vi.fn(),
  downloadFile: vi.fn(),
  handleInitializeData: vi.fn()
}));

vi.mock("../src/editor/yaml/yaml_generators.js", () => ({
  buildAutomationTemplate: vi.fn(() => "automation: yaml")
}));

describe("CronoStarEditor", () => {
  let editor;

  beforeAll(() => {
    if (!customElements.get("cronostar-card-editor-test")) {
      customElements.define("cronostar-card-editor-test", CronoStarEditor);
    }
  });

  beforeEach(() => {
    editor = document.createElement("cronostar-card-editor-test");
    editor.hass = { language: "en", states: {} };
    // Initialize required internal objects usually created in constructor
    editor._initialized = true; 
  });

  it("dovrebbe inizializzarsi con valori di default", () => {
    expect(editor._step).toBe(0);
    expect(editor._isEditing).toBe(false);
  });

  it("setConfig dovrebbe aggiornare _config", () => {
    const config = { type: "custom:cronostar-card", global_prefix: "test_" };
    editor.setConfig(config);
    expect(editor._config.global_prefix).toBe("test_");
    expect(editor._selectedPreset).toBe("thermostat");
  });

  it("_sanitizeConfig dovrebbe aggiungere il tipo se mancante", () => {
    const cfg = { global_prefix: "p_" };
    const sanitized = editor._sanitizeConfig(cfg);
    expect(sanitized.type).toBe("custom:cronostar-card");
  });

  it("_sanitizeConfig dovrebbe gestire not_configured correttamente", () => {
    const cfg = { target_entity: "climate.test", global_prefix: "p_" };
    const sanitized = editor._sanitizeConfig(cfg);
    expect(sanitized.not_configured).toBe(false);

    const incomplete = { target_entity: "climate.test" };
    expect(editor._sanitizeConfig(incomplete).not_configured).toBe(true);
  });

  it("_updateConfig dovrebbe aggiornare la configurazione e resettare la validazione", () => {
    editor._config = { validation: { valid: false, errors: ["err"] } };
    editor._updateConfig("target_entity", "climate.new");
    expect(editor._config.target_entity).toBe("climate.new");
    expect(editor._config.validation.valid).toBe(true);
  });

  it("_updateConfig con preset_type dovrebbe caricare le impostazioni del preset", () => {
    editor.setConfig({ preset_type: "thermostat" });
    editor._updateConfig("preset_type", "generic_switch");
    expect(editor._selectedPreset).toBe("generic_switch");
  });

  it("showToast dovrebbe dispatchare hass-notification", () => {
    const dispatchSpy = vi.spyOn(editor, "dispatchEvent");
    editor.showToast("Test message");
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "hass-notification",
      detail: expect.objectContaining({ message: "Test message" })
    }));
  });

  it("_handleResetConfig dovrebbe resettare la configurazione", () => {
    vi.stubGlobal("confirm", () => true);
    editor.setConfig({ target_entity: "some.entity" });
    editor._isEditing = true;
    editor._handleResetConfig();
    expect(editor._config.target_entity).toBeUndefined();
    expect(editor._isEditing).toBe(false);
    expect(editor._step).toBe(1);
  });
});
