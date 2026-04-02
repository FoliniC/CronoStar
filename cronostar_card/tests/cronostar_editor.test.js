// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";

// Mock dependencies
vi.mock("lit", () => ({
  html: (strings, ...values) => {
    let result = "";
    strings.forEach((s, i) => {
      result += s;
      if (i < values.length) result += values[i];
    });
    return result;
  },
  LitElement: class extends HTMLElement {
    requestUpdate() {}
  }
}));

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

  it("_handleLocalUpdate dovrebbe sempre dispatchare immediato", () => {
    editor.setConfig({ type: "custom:cronostar-card" });
    const dispatchSpy = vi.spyOn(editor, "dispatchEvent");
    editor._handleLocalUpdate("title", "New Title");
    expect(editor._config.title).toBe("New Title");
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("_sanitizeConfig dovrebbe rimuovere stringhe vuote", () => {
    const cfg = { type: "custom:cronostar-card", empty: "", val: "x" };
    const sanitized = editor._sanitizeConfig(cfg);
    expect(sanitized.empty).toBeUndefined();
    expect(sanitized.val).toBe("x");
  });

  it("_updateConfig dovrebbe aggiornare la configurazione e resettare la validazione", () => {
  editor._config = { validation: { valid: false, errors: ["err"] } };
  editor._updateConfig("target_entity", "climate.new");
  expect(editor._config.target_entity).toBe("climate.new");
  expect(editor._config.validation.valid).toBe(true);
  });

  it("_handleNextClick dovrebbe avanzare nel wizard", () => {
  editor._step = 1;
  editor.wizard = { _nextStep: vi.fn() };
  editor._config = { global_prefix: "p_", target_entity: "climate.test" };

  editor._handleNextClick();
  expect(editor.wizard._nextStep).toHaveBeenCalled();
  });

  it("_handleNextClick dovrebbe mostrare errore se non si può avanzare", () => {
  editor._step = 1;
  editor.wizard = { _nextStep: vi.fn() };
  editor._config = { global_prefix: "", target_entity: "" };

  editor._handleNextClick();
  expect(editor.wizard._nextStep).not.toHaveBeenCalled();
  expect(editor._showStepError).toBe(true);
  });

  it("_handleFinishClick dovrebbe dispatchare evento e inizializzare i dati", async () => {
  editor._step = 5;
  editor.hass = { callWS: vi.fn() };
  editor.wizard = { _finish: vi.fn() };
  const dispatchSpy = vi.spyOn(editor, "dispatchEvent");

  const { handleInitializeData } = await import("../src/editor/services/service_handlers.js");
  handleInitializeData.mockResolvedValue({ message: "OK" });

  await editor._handleFinishClick();

  expect(dispatchSpy).toHaveBeenCalled();
  const event = dispatchSpy.mock.calls.find(call => call[0].type === "config-changed")[0];
  expect(event.detail.config._close_wizard).toBe(true);
  expect(handleInitializeData).toHaveBeenCalled();
  expect(editor.wizard._finish).toHaveBeenCalled();
  });

  it("_handleKeyDown dovrebbe prevenire Enter se step > 0", () => {
  editor._step = 1;
  const event = { key: "Enter", target: { tagName: "INPUT" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  editor._handleKeyDown(event);
  expect(event.preventDefault).toHaveBeenCalled();
  });

  it("_renderWizardActions dovrebbe renderizzare i bottoni corretti per Step 1", () => {
  editor._step = 1;
  editor._config = { global_prefix: "p_", target_entity: "climate.test" };
  editor.i18n = { _t: (k) => k };
  const html = editor._renderWizardActions();
  // In our mock, html returns a string.
  expect(html).toContain("actions.back");
  });

  it("render() dovrebbe contenere le sezioni principali", () => {
  editor._renderStepContent = () => "CONTENT";
  editor._renderWizardSteps = () => "STEPS";
  editor._renderWizardActions = () => "ACTIONS";
  const result = editor.render();
  expect(result).toContain("CONTENT");
  expect(result).toContain("STEPS");
  expect(result).toContain("ACTIONS");
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
