// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lit
vi.mock("lit", () => ({
  html: (strings, ...values) => {
    let result = "";
    strings.forEach((s, i) => {
      result += s + (i < values.length ? values[i] ?? "" : "");
    });
    return result;
  },
}));

vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "Thermostat" },
    ev_charging: { title: "EV Charging" },
    generic_kwh: { title: "Generic kWh" },
    generic_temperature: { title: "Generic Temperature" },
    generic_switch: { title: "Generic Switch" },
  },
  TIMEOUTS: { editingGraceMs: 0 },
  VERSION: "TEST",
}));

import { Step0Dashboard } from "../src/editor/steps/Step0Dashboard.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";
import { Step2Entities } from "../src/editor/steps/Step2Entities.js";
import { Step3Options } from "../src/editor/steps/Step3Options.js";
import { Step4Automation } from "../src/editor/steps/Step4Automation.js";
import { Step5Summary } from "../src/editor/steps/Step5Summary.js";

describe("Editor Steps Rendering", () => {
  let editor;

  beforeEach(() => {
    editor = {
      _config: {
        preset_type: "thermostat",
        global_prefix: "p_",
        target_entity: "climate.test",
      },
      hass: {
        states: {
          "climate.test": { attributes: { friendly_name: "Test" } },
        },
        localize: (k) => k,
        callWS: vi.fn().mockResolvedValue({ success: true, response: {} }),
      },
      _i18n: {
        localize: (l, k) => k,
        _t: (k) => k,
      },
      i18n: {
        _t: (k) => k,
      },
      _errors: {},
      _warnings: {},
      _deepCheckResults: { valid: true, errors: [], warnings: [] },
      _deepCheckLoading: false,
      _handleConfigChange: vi.fn(),
      _runDeepChecks: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      _updateConfig: vi.fn(),
      _handleResetConfig: vi.fn(),
      showToast: vi.fn(),
      handleShowHelp: vi.fn(),
      requestUpdate: vi.fn(),
      renderEntityPicker: vi.fn((k, v, l) => `entity-picker-${l}`),
      renderTextInput: vi.fn((k, v, l) => `text-input-${l}`),
    };
  });

  it("Step0Dashboard should render the summary", () => {
    const step = new Step0Dashboard(editor);
    const html = step.render();
    expect(html).toContain("step0");
  });

  it("Step0Dashboard should show loading state", () => {
    editor._dashboardLoading = true;
    const step = new Step0Dashboard(editor);
    const html = step.render();
    expect(html.toString()).toContain("ui.dashboard_loading");
  });

  it("Step0Dashboard should render profiles list when data is available", () => {
    editor._dashboardProfilesData = {
      thermostat: {
        files: [{
          global_prefix: "p_",
          meta: { title: "My Controller", target_entity: "climate.test" },
          profiles: ["Default"],
          validation: { valid: true, errors: [] }
        }]
      }
    };
    const step = new Step0Dashboard(editor);
    const html = step._renderProfilesList();
    expect(html).toContain("My Controller");
    expect(html).toContain("p_");
  });

  it("Step0Dashboard should handle edit controller", () => {
    const step = new Step0Dashboard(editor);
    const fileInfo = { global_prefix: "p_", meta: { title: "T" } };
    step._handleEditControllerConfig(fileInfo);
    expect(editor._isEditing).toBe(true);
    expect(editor._step).toBe(1);
    expect(editor._dispatchConfigChanged).toHaveBeenCalled();
  });

  it("Step0Dashboard _getControllerTitle should return custom title", () => {
    const step = new Step0Dashboard(editor);
    const title = step._getControllerTitle({ meta: { title: "Custom" } });
    expect(title).toBe("Custom");
  });

  it("Step1Preset should show available presets", () => {
    const step = new Step1Preset(editor);
    const html = step.render();
    expect(html).toContain("Thermostat");
    expect(html).toContain("EV Charging");
  });

  it("Step1Preset should handle preset selection", () => {
    const step = new Step1Preset(editor);
    step.selectPresetWithPrefix("generic_switch");
    expect(editor._updateConfig).toHaveBeenCalledWith("preset_type", "generic_switch");
  });

  it("Step2Entities should show entity fields", () => {
    const step = new Step2Entities(editor);
    const html = step.render();
    expect(html).toContain("step2");
  });

  it("Step1Preset should handle prefix change", () => {
    const step = new Step1Preset(editor);
    const event = { target: { value: "NEW_PREFIX" } };
    step._handlePrefixChange("new_prefix", event);
    expect(editor._config.global_prefix).toBe("new_prefix_");
  });

  it("Step1Preset should handle advanced config button", async () => {
    const step = new Step1Preset(editor);
    await step._handleAdvancedConfig();
    expect(editor._step).toBe(2);
  });

  it("Step2Entities should show all fields when enabled", () => {
    editor._config.enabled_entity = "switch.test";
    editor._config.profiles_select_entity = "select.test";
    const step = new Step2Entities(editor);
    const html = step.render();
    expect(html).toContain("Enabled Entity");
    expect(html).toContain("Current Profile");
  });

  it("Step2Entities _toggleFeature should disable feature", () => {
    const step = new Step2Entities(editor);
    step._toggleFeature("enabled_entity", false, "default");
    expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "", true);
  });

  it("Step3Options should render all fields", () => {
    editor._language = "en";
    editor._config.logging_enabled = true;
    const step = new Step3Options(editor);
    const html = step.render();
    expect(html).toContain("fields.title_label");
    expect(html).toContain("English");
    expect(html).toContain("Italiano");
  });

  it("Step4Automation should show the button to create automations", () => {
    const step = new Step4Automation(editor);
    const html = step.render();
    expect(html).toContain("step4");
  });

  it("Step4Automation should render LLM prompt view", () => {
    const step = new Step4Automation(editor);
    const html = step._renderLlmPromptView(true, () => {});
    expect(html).toContain("AI Assistant");
    expect(html).toContain("Home Assistant");
  });

  it("Step5Summary should show the final summary", () => {
    const step = new Step5Summary(editor);
    const html = step.render();
    expect(html).toContain("step5");
    expect(html).toContain("p_");
  });
});
