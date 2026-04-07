// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
      i18n: { _t: vi.fn((k, args) => k) },
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
    expect(res.toString()).toContain("minimal_config_complete");
  });

  it("uses edit header when _isEditing is true", () => {
    editor._isEditing = true;
    const res = step.render();
    expect(res.toString()).toContain("headers.step1_edit");
  });

  it("shows minimal_config_needed when prefix/entity are incomplete", () => {
    editor._config.global_prefix = "";
    editor._config.target_entity = "";
    const res = step.render();
    expect(res.toString()).toContain("ui.minimal_config_needed");
  });

  it("shows no-matching-entities warning when hass has no matching domains", () => {
    editor._selectedPreset = "thermostat";
    editor.hass = { states: { "switch.x": {} } };
    const res = step.render();
    expect(res.toString()).toContain("ui.no_matching_entities");
  });

  it("does not show no-matching-entities warning when hass is missing", () => {
    editor.hass = null;
    const res = step.render();
    expect(res.toString()).not.toContain("ui.no_matching_entities");
  });

  it("calls handleShowHelp from header button", () => {
    const res = step.render();
    const handlers = collectFunctions(res);
    handlers[0]();
    expect(editor.handleShowHelp).toHaveBeenCalled();
  });

  it("handles preset card click handler", () => {
    const res = step.render();
    const handlers = collectFunctions(res);
    const presetClick = handlers.find((fn) => fn !== handlers[0]);
    presetClick();
    expect(editor._updateConfig).toHaveBeenCalled();
  });

  it("handles preset selection (prefix starts with cronostar_)", () => {
    editor._config.global_prefix = "cronostar_old_";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "preset_type",
      "ev_charging",
    );
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "global_prefix",
      "cronostar_ev_charging_",
    );
  });

  it("handles preset selection (prefix empty)", () => {
    editor._config.global_prefix = "";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "global_prefix",
      "cronostar_ev_charging_",
    );
  });

  it("does not replace custom non-standard prefix", () => {
    editor._config.global_prefix = "my_custom_";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).not.toHaveBeenCalledWith(
      "global_prefix",
      "cronostar_ev_charging_",
    );
  });

  it("fills default helper entities when empty", () => {
    editor._config.enabled_entity = "";
    editor._config.profiles_select_entity = "";
    step.selectPresetWithPrefix("generic_switch");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "enabled_entity",
      "switch.cronostar_generic_switch_enabled",
    );
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "profiles_select_entity",
      "select.cronostar_generic_switch_current_profile",
    );
  });

  it("overwrites standard helper entities but preserves custom ones", () => {
    editor._config.enabled_entity = "switch.cronostar_old_enabled";
    editor._config.profiles_select_entity = "select.custom_profile";
    step.selectPresetWithPrefix("thermostat");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "enabled_entity",
      "switch.cronostar_thermostat_enabled",
    );
    expect(editor._updateConfig).not.toHaveBeenCalledWith(
      "profiles_select_entity",
      "select.cronostar_thermostat_current_profile",
    );
  });

  it("handles prefix change logic", () => {
    const inputEl = { setSelectionRange: vi.fn(), focus: vi.fn() };
    const event = {
      target: {
        value: "newprefix",
        selectionStart: 9,
        shadowRoot: { querySelector: () => inputEl },
      },
    };
    step._handlePrefixChange("newprefix", event);
    expect(editor._config.global_prefix).toBe("newprefix_");
    expect(editor._config.title).toBe("Newprefix");

    vi.runAllTimers();
    expect(inputEl.setSelectionRange).toHaveBeenCalled();
    expect(inputEl.focus).toHaveBeenCalled();
  });

  it("handles deleting prefix without auto-adding underscore", () => {
    editor._config.global_prefix = "prefix_";
    const inputEl = { setSelectionRange: vi.fn(), focus: vi.fn() };
    const event = {
      target: {
        value: "prefi",
        selectionStart: 5,
        shadowRoot: { querySelector: () => inputEl },
      },
    };
    step._handlePrefixChange("prefi", event);
    expect(editor._config.global_prefix).toBe("prefi");
    vi.runAllTimers();
    expect(inputEl.focus).not.toHaveBeenCalled();
  });

  it("handles prefix cleaning of invalid characters", () => {
    const inputEl = { setSelectionRange: vi.fn(), focus: vi.fn() };
    const event = {
      target: {
        value: "NEW-PREFIX!",
        selectionStart: 11,
        shadowRoot: { querySelector: () => inputEl },
      },
    };
    step._handlePrefixChange("NEW-PREFIX!", event);
    expect(editor._config.global_prefix).toBe("newprefix_");
  });

  it("handles prefix change without shadow input fallback", () => {
    const event = {
      target: {
        value: "abc",
        selectionStart: 3,
        setSelectionRange: vi.fn(),
        focus: vi.fn(),
      },
    };
    step._handlePrefixChange("abc", event);
    vi.runAllTimers();
    expect(event.target.setSelectionRange).toHaveBeenCalled();
  });

  it("swallows selection range errors in deferred cursor restore", () => {
    const inputEl = {
      setSelectionRange: vi.fn(() => {
        throw new Error("range");
      }),
      focus: vi.fn(),
    };
    const event = {
      target: {
        value: "abc",
        selectionStart: 3,
        shadowRoot: { querySelector: () => inputEl },
      },
    };
    expect(() => step._handlePrefixChange("abc", event)).not.toThrow();
    vi.runAllTimers();
  });

  it("updates enabled_entity only when isStandard returns true", () => {
    editor._config.enabled_entity = "switch.cronostar_old_enable";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "enabled_entity",
      "switch.cronostar_ev_charging_enabled",
    );
  });

  it("updates profiles_select_entity when current value ends with profiles", () => {
    editor._config.profiles_select_entity = "select.cronostar_old_profiles";
    step.selectPresetWithPrefix("ev_charging");
    expect(editor._updateConfig).toHaveBeenCalledWith(
      "profiles_select_entity",
      "select.cronostar_ev_charging_current_profile",
    );
  });

  it("handles save and close", async () => {
    await step._handleSaveAndClose();
    expect(editor._handleFinishClick).toHaveBeenCalledWith({ force: true });
  });

  it("save and close does nothing when hass is missing", async () => {
    editor.hass = null;
    await step._handleSaveAndClose();
    expect(editor._handleFinishClick).not.toHaveBeenCalled();
  });

  it("handles save and close errors without throwing", async () => {
    editor._handleFinishClick.mockRejectedValueOnce(new Error("fail"));
    await expect(step._handleSaveAndClose()).resolves.toBeUndefined();
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
      {
        p: "other",
        d: [
          "climate",
          "number",
          "input_number",
          "switch",
          "input_boolean",
          "sensor",
        ],
      },
    ];
    cases.forEach(({ p, d }) => {
      it(`returns ${d} for ${p}`, () => {
        editor._selectedPreset = p;
        expect(step.getApplyIncludeDomains()).toEqual(d);
      });
    });
  });
});
