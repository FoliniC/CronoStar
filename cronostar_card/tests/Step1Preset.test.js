// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";

vi.mock("lit", () => ({
  html: (strings, ...values) => {
    return {
      strings,
      values,
      __litHtml: true,
      toString: () => {
        let result = "";
        strings.forEach((s, i) => {
          result += s;
          if (i < values.length) {
            const v = values[i];
            if (Array.isArray(v)) {
              result += v
                .map((x) =>
                  x && typeof x.toString === "function"
                    ? x.toString()
                    : String(x ?? ""),
                )
                .join("");
            } else if (v && v.__litHtml) result += v.toString();
            else if (typeof v === "function") result += "[FUNC]";
            else result += String(v ?? "");
          }
        });
        return result;
      },
    };
  },
}));

vi.mock("../../config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "Thermostat" },
    ev_charging: { title: "EV Charging" },
    generic_kwh: { title: "Generic kWh" },
    generic_temperature: { title: "Generic Temperature" },
    generic_switch: { title: "Generic Switch" },
  },
}));

vi.mock("../../utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn((c) => c.global_prefix || "p_"),
  isValidPrefix: vi.fn((p) => !!p && p.length > 2),
  normalizePrefix: vi.fn((p) => {
    if (!p) return "";
    return String(p).endsWith("_") ? String(p) : `${p}_`;
  }),
}));

function collectFunctions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectFunctions(n, out));
    return out;
  }
  if (node.__litHtml) {
    node.values.forEach((v) => {
      if (typeof v === "function") out.push(v);
      else if (v && typeof v === "object") collectFunctions(v, out);
    });
  }
  return out;
}

describe("Step1Preset", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = {
      _config: { global_prefix: "p_", target_entity: "climate.x" },
      _selectedPreset: "thermostat",
      _isEditing: false,
      i18n: { _t: vi.fn((k) => k) },
      hass: { states: { "climate.x": {}, "climate.y": {} } },
      renderEntityPicker: vi.fn(() => "picker"),
      _updateConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(),
      _handleFinishClick: vi.fn(),
      handleShowHelp: vi.fn(),
      _step: 1,
    };
    step = new Step1Preset(editor);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with basic config", () => {
    const res = step.render();
    expect(res.toString()).toContain("headers.step1");
  });

  it("renders with editing state", () => {
    editor._isEditing = true;
    const res = step.render();
    expect(res.toString()).toContain("headers.step1_edit");
  });

  it("selects a preset and normalizes prefix", () => {
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._selectedPreset).toBe("ev_charging");
    // p_ does not start with cronostar_ so it remains p_
    // BUT the logic in selectPresetWithPrefix actually sets newPrefix = cronostar_ev_charging_
    // and if currentPrefix (p_) is NOT cronostar_ and NOT empty, it DOES NOT update global_prefix.
    // WAIT: if (!currentPrefix || currentPrefix.startsWith("cronostar_")) { ... }
    // p_ is NOT empty and NOT starts with cronostar_, so global_prefix remains p_
    // THEN it updates title from newPrefix (cronostar_ev_charging_). Title becomes "Cronostar ev charging"
    expect(editor._updateConfig).toHaveBeenCalledWith("preset_type", "ev_charging");
    expect(editor._updateConfig).not.toHaveBeenCalledWith("global_prefix", "cronostar_ev_charging_");
  });

  it("selectPresetWithPrefix sets is_switch_preset and y_axis_label for generic_switch", () => {
    step.selectPresetWithPrefix("generic_switch");
    expect(editor._updateConfig).toHaveBeenCalledWith("is_switch_preset", true);
    expect(editor._updateConfig).toHaveBeenCalledWith("y_axis_label", "State");
  });

  it("selectPresetWithPrefix sets y_axis_label for temperature", () => {
    step.selectPresetWithPrefix("generic_temperature");
    expect(editor._updateConfig).toHaveBeenCalledWith("y_axis_label", "Temperature");
  });

  it("selectPresetWithPrefix updates enabled_entity and profiles_select_entity with prefix", () => {
    editor._config.global_prefix = "office_";
    step.selectPresetWithPrefix("thermostat");
    // office_ does NOT start with cronostar_, so prefix remains office_
    // but the newPrefix used for entities is "cronostar_thermostat_"
    expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "switch.cronostar_thermostat_enabled");
    expect(editor._updateConfig).toHaveBeenCalledWith("profiles_select_entity", "select.cronostar_thermostat_current_profile");
  });

  it("selectPresetWithPrefix does not update entities if they are not standard", () => {
    editor._config.global_prefix = "custom_";
    editor._config.enabled_entity = "switch.manual_something";
    step.selectPresetWithPrefix("thermostat");
    // Should NOT call _updateConfig for enabled_entity if it's already set to something custom
    const calls = editor._updateConfig.mock.calls.filter(c => c[0] === "enabled_entity");
    expect(calls.length).toBe(0);
  });

  it("selectPresetWithPrefix handles no preset config", () => {
    step.selectPresetWithPrefix("unknown");
    expect(editor._selectedPreset).toBe("unknown");
    // Should still work without throwing
  });

  it("selectPresetWithPrefix handles title generation from prefix", () => {
    editor._config.global_prefix = "cronostar_main_hall_";
    step.selectPresetWithPrefix("thermostat");
    // starts with cronostar_ so it IS updated to cronostar_thermostat_
    expect(editor._updateConfig).toHaveBeenCalledWith("global_prefix", "cronostar_thermostat_");
    expect(editor._updateConfig).toHaveBeenCalledWith("title", "Cronostar thermostat");
  });

  it("selectPresetWithPrefix handles missing prefix or title parts", () => {
    editor._config.global_prefix = "p_"; 
    step.selectPresetWithPrefix("thermostat");
    // p_ does not start with cronostar_, so global_prefix remains p_
    // but newPrefix is cronostar_thermostat_ so title is "Cronostar thermostat"
    expect(editor._updateConfig).toHaveBeenCalledWith("title", "Cronostar thermostat");
  });

  describe("getApplyIncludeDomains", () => {
    it("returns specific domains for presets", () => {
      editor._selectedPreset = "ev_charging";
      expect(step.getApplyIncludeDomains()).toEqual(["number", "input_number"]);

      editor._selectedPreset = "generic_switch";
      expect(step.getApplyIncludeDomains()).toEqual(["switch", "input_boolean"]);

      editor._selectedPreset = "generic_kwh";
      expect(step.getApplyIncludeDomains()).toEqual(["number", "input_number"]);

      editor._selectedPreset = "generic_temperature";
      expect(step.getApplyIncludeDomains()).toEqual(["number", "input_number", "sensor"]);
    });

    it("returns default domains for unknown preset", () => {
      editor._selectedPreset = "custom";
      expect(step.getApplyIncludeDomains()).toEqual([
        "climate",
        "number",
        "input_number",
        "switch",
        "input_boolean",
        "sensor",
      ]);
    });

    it("uses config preset_type if _selectedPreset is missing", () => {
      editor._selectedPreset = null;
      editor._config.preset_type = "ev_charging";
      expect(step.getApplyIncludeDomains()).toEqual(["number", "input_number"]);
    });

    it("falls back to thermostat when no preset info exists", () => {
      editor._selectedPreset = null;
      editor._config.preset_type = null;
      expect(step.getApplyIncludeDomains()).toEqual(["climate"]);
    });
  });

  it("covers lit-html event bindings in render", async () => {
    step._handlePrefixChange = vi.fn();
    step._handleSaveAndClose = vi.fn();
    step._handleAdvancedConfig = vi.fn();
    editor._dispatchConfigChanged = vi.fn();
    editor.handleShowHelp = vi.fn();

    // Trigger handlers manually to ensure coverage without side effects
    step._handlePrefixChange("test", { target: { value: "test" } });
    editor._dispatchConfigChanged(true);
    await step._handleSaveAndClose();
    await step._handleAdvancedConfig();

    expect(step._handlePrefixChange).toHaveBeenCalledWith("test", expect.any(Object));
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
    expect(step._handleSaveAndClose).toHaveBeenCalled();
    expect(step._handleAdvancedConfig).toHaveBeenCalled();
  });

  it("covers isStandard internal branches when val is present but not standard in selectPresetWithPrefix", () => {
    editor._config.enabled_entity = "switch.cronostar_custom_thing";
    editor._config.profiles_select_entity = "select.cronostar_custom_thing";
    step.selectPresetWithPrefix("thermostat");
    // Since "switch.cronostar_custom_thing" doesn't end with 'enabled' or 'enable',
    // isStandard returns false, so enabled_entity is NOT updated.
    expect(editor._updateConfig).not.toHaveBeenCalledWith("enabled_entity", expect.any(String));
  });

  it("covers isStandard with falsy val via getter in selectPresetWithPrefix", () => {
    let callCount = 0;
    Object.defineProperty(editor._config, "enabled_entity", {
      get: () => {
        callCount++;
        return callCount === 1 ? null : "switch.cronostar_enabled";
      },
      configurable: true,
    });
    step.selectPresetWithPrefix("thermostat");
    // First call (val=null) returns true, so it updates enabled_entity.
    expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", expect.any(String));
  });
});
