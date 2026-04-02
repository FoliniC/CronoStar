// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step2Entities } from "../src/editor/steps/Step2Entities.js";

// Mock lit with improved toString
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

vi.mock("../../utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn(c => c.global_prefix || "p_"),
}));

describe("Step2Entities", () => {
  let editor;
  let step;

  beforeEach(() => {
    editor = {
      _config: {
        global_prefix: "p_",
        enabled_entity: "",
        profiles_select_entity: "",
      },
      i18n: {
        _t: vi.fn(k => k),
      },
      renderEntityPicker: vi.fn((k, v, l) => `picker-${l}`),
      _updateConfig: vi.fn(),
      _selectedPreset: "thermostat",
    };
    step = new Step2Entities(editor);
  });

  describe("render", () => {
    it("renders with default state (both disabled)", () => {
      const res = step.render();
      expect(res.toString()).toContain("headers.step2");
      expect(res.toString()).not.toContain("picker-Enabled Entity");
      expect(res.toString()).not.toContain("picker-Current Profile");
    });

    it("renders with features enabled", () => {
      editor._config.enabled_entity = "switch.enabled";
      editor._config.profiles_select_entity = "select.profiles";
      const res = step.render();
      expect(res.toString()).toContain("picker-Enabled Entity");
      expect(res.toString()).toContain("picker-Current Profile");
    });

    it("triggers _toggleFeature on switch change", () => {
      const res = step.render();
      // Use a more robust way to find toggle handlers
      // In our mock, they are just functions in values array
      const toggleHandlers = res.values.filter(v => typeof v === "function");
      
      // enabled_entity toggle
      const event1 = { target: { checked: true } };
      toggleHandlers[0](event1);
      expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "switch.p_enabled", true);
      
      // profiles_select_entity toggle
      const event2 = { target: { checked: true } };
      toggleHandlers[1](event2);
      expect(editor._updateConfig).toHaveBeenCalledWith("profiles_select_entity", "select.p_current_profile", true);
    });
  });

  describe("_toggleFeature", () => {
    it("enables feature with default value when config is empty", () => {
      step._toggleFeature("enabled_entity", true, "switch.default");
      expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "switch.default", true);
    });

    it("enables feature with existing config value", () => {
      editor._config.enabled_entity = "switch.existing";
      step._toggleFeature("enabled_entity", true, "switch.default");
      expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "switch.existing", true);
    });

    it("disables feature by setting to empty string", () => {
      step._toggleFeature("enabled_entity", false, "switch.default");
      expect(editor._updateConfig).toHaveBeenCalledWith("enabled_entity", "", true);
    });
  });

  describe("getApplyIncludeDomains", () => {
    const cases = [
      { preset: "thermostat", expected: ["climate"] },
      { preset: "ev_charging", expected: ["number"] },
      { preset: "generic_switch", expected: ["switch"] },
      { preset: "generic_kwh", expected: ["number"] },
      { preset: "generic_temperature", expected: ["number"] },
      { preset: "unknown", expected: [] },
    ];

    cases.forEach(({ preset, expected }) => {
      it(`returns ${expected} for ${preset}`, () => {
        editor._selectedPreset = preset;
        expect(step.getApplyIncludeDomains()).toEqual(expected);
      });
    });
  });
});
