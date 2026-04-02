// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";

// Mock lit
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
            if (v && v.__litHtml) result += v.toString();
            else if (typeof v === 'function') result += "[FUNC]";
            else result += String(v ?? "");
          }
        });
        return result;
      } 
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
  }
}));

vi.mock("../../utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn(c => c.global_prefix || "p_"),
  isValidPrefix: vi.fn(p => !!p && p.length > 2),
  normalizePrefix: vi.fn(p => p),
}));

describe("Step1Preset", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = {
      _config: { global_prefix: "p_", target_entity: "climate.x" },
      _selectedPreset: "thermostat",
      _isEditing: false,
      i18n: { _t: vi.fn((k, args) => k) },
      hass: { states: { "climate.x": {} } },
      renderEntityPicker: vi.fn(() => "picker"),
      _updateConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(),
      _handleFinishClick: vi.fn(),
      handleShowHelp: vi.fn(),
      _step: 1
    };
    step = new Step1Preset(editor);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with basic config", () => {
    const res = step.render();
    expect(res.toString()).toContain("headers.step1");
    expect(res.toString()).toContain("minimal_config_complete");
  });

  it("handles preset selection (prefix starts with cronostar_)", () => {
    editor._config.global_prefix = "cronostar_old_";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith("preset_type", "ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith("global_prefix", "cronostar_ev_charging_");
  });

  it("handles preset selection (prefix empty)", () => {
    editor._config.global_prefix = "";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith("global_prefix", "cronostar_ev_charging_");
  });

  it("handles prefix change logic", () => {
    const event = { 
      target: { 
        value: "newprefix", 
        selectionStart: 9,
        shadowRoot: { querySelector: () => ({ setSelectionRange: vi.fn() }) }
      } 
    };
    step._handlePrefixChange("newprefix", event);
    expect(editor._config.global_prefix).toBe("newprefix_");
    expect(editor._config.title).toBe("Newprefix");
    
    vi.runAllTimers(); // For the setTimeout cursor restore
  });

  it("handles save and close", async () => {
    await step._handleSaveAndClose();
    expect(editor._handleFinishClick).toHaveBeenCalledWith({ force: true });
  });

  it("handles advanced config", async () => {
    await step._handleAdvancedConfig();
    expect(editor._step).toBe(2);
  });

  describe("getApplyIncludeDomains", () => {
    const cases = [
      { p: "thermostat", d: ["climate"] },
      { p: "ev_charging", d: ["number", "input_number"] },
      { p: "generic_switch", d: ["switch", "input_boolean"] },
      { p: "generic_kwh", d: ["number", "input_number"] },
      { p: "generic_temperature", d: ["number", "input_number", "sensor"] },
      { p: "other", d: ["climate", "number", "input_number", "switch", "input_boolean", "sensor"] },
    ];
    cases.forEach(({p, d}) => {
      it(`returns ${d} for ${p}`, () => {
        editor._selectedPreset = p;
        expect(step.getApplyIncludeDomains()).toEqual(d);
      });
    });
  });
});
