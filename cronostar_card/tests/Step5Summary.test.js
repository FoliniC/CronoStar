// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lit", () => ({
  html: (strings, ...values) => ({
    strings,
    values,
    __litHtml: true,
    toString() {
      let result = "";
      strings.forEach((s, i) => {
        result += s;
        if (i < values.length) {
          const v = values[i];
          if (Array.isArray(v)) result += v.map((x) => (x && x.toString ? x.toString() : String(x ?? ""))).join("");
          else if (v && v.__litHtml) result += v.toString();
          else if (typeof v === "function") result += "[FUNC]";
          else result += String(v ?? "");
        }
      });
      return result;
    },
  }),
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn((config) => config.global_prefix || "cronostar_test_"),
}));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  handleInitializeData: vi.fn(),
}));

import { Step5Summary } from "../src/editor/steps/Step5Summary.js";
import { handleInitializeData } from "../src/editor/services/service_handlers.js";

describe("Step5Summary", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.clearAllMocks();
    editor = {
      hass: {},
      _language: "en",
      _config: {
        preset_type: "thermostat",
        target_entity: "climate.test",
        global_prefix: "cronostar_test_",
        min_value: 15,
        max_value: 30,
        step_value: 0.5,
        title: "My Controller",
      },
      i18n: { _t: vi.fn((k) => k) },
      showToast: vi.fn(),
    };
    step = new Step5Summary(editor);
  });

  it("render shows valid summary when required fields are present", () => {
    const res = step.render();
    const text = res.toString();
    expect(text).toContain("VALID");
    expect(text).toContain("My Controller");
    expect(text).toContain("climate.test");
    expect(text).toContain("cronostar_test_");
  });

  it("render fills default enabled_entity and profiles_select_entity in yaml", () => {
    const res = step.render();
    const text = res.toString();
    expect(text).toContain("enabled_entity: 'switch.cronostar_test_enabled'");
    expect(text).toContain("profiles_select_entity: 'select.cronostar_test_current_profile'");
  });

  it("render shows incomplete summary and missing fields", () => {
    editor._config = {
      preset_type: "thermostat",
      global_prefix: "cronostar_test_",
    };
    const res = step.render();
    const text = res.toString();
    expect(text).toContain("INCOMPLETE");
    expect(text).toContain("Missing field:");
  });

  it("render uses italian strings when language is it", () => {
    editor._language = "it";
    editor._config = {
      preset_type: "thermostat",
      global_prefix: "cronostar_test_",
    };
    const res = step.render();
    const text = res.toString();
    expect(text).toContain("CONFIGURAZIONE INCOMPLETA");
  });

  it("render excludes null/undefined/empty values from yaml", () => {
    editor._config = {
      preset_type: "thermostat",
      target_entity: "climate.test",
      global_prefix: "cronostar_test_",
      min_value: 15,
      max_value: 30,
      step_value: 0.5,
      enabled_entity: "",
      profiles_select_entity: undefined,
      unit_of_measurement: null,
    };
    const res = step.render();
    const text = res.toString();
    expect(text).not.toContain("unit_of_measurement:");
  });

  it("render falls back to default title when missing", () => {
    editor._config.title = "";
    const res = step.render();
    expect(res.toString()).toContain("CronoStar Controller");
  });

  it("render handles errors and returns fallback error template", () => {
    Object.defineProperty(editor, "_config", {
      get() {
        throw new Error("boom");
      },
      configurable: true,
    });

    const res = step.render();
    expect(res.toString()).toContain("Error rendering Step 5: boom");
  });

  it("handleSaveAll shows success toast", async () => {
    handleInitializeData.mockResolvedValueOnce({ message: "Saved ok" });
    await step.handleSaveAll();
    expect(editor.showToast).toHaveBeenCalledWith("Saved ok");
  });

  it("handleSaveAll shows error toast on failure", async () => {
    handleInitializeData.mockRejectedValueOnce(new Error("Save failed"));
    await step.handleSaveAll();
    expect(editor.showToast).toHaveBeenCalledWith("Save failed");
  });
});
