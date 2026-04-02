// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step0Dashboard } from "../src/editor/steps/Step0Dashboard.js";

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

describe("Step0Dashboard", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = {
      _dashboardLoading: false,
      _dashboardProfilesData: null,
      _i18n: { _t: vi.fn(k => k) },
      i18n: { _t: vi.fn(k => k) },
      _handleEditControllerConfig: vi.fn(),
      _handleDeleteController: vi.fn(),
      _handleResetConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      showToast: vi.fn(),
      _step: 0,
      hass: { 
        callWS: vi.fn(),
        callService: vi.fn()
      },
      _config: { global_prefix: "p_", preset_type: "thermostat" }
    };
    step = new Step0Dashboard(editor);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders loading state", () => {
    editor._dashboardLoading = true;
    const res = step.render();
    expect(res.toString()).toContain("Loading controllers");
  });

  it("renders empty state", () => {
    editor._dashboardProfilesData = {};
    const res = step.render();
    expect(res.toString()).toContain("No controllers found");
  });

  it("renders profiles list with validation issues", () => {
    editor._dashboardProfilesData = {
      thermostat: {
        files: [{
          global_prefix: "p1_",
          meta: { title: "T1", target_entity: "climate.1" },
          profiles: ["Default"],
          validation: { valid: false, errors: ["Err1"] }
        }]
      }
    };
    const res = step.render();
    expect(res.toString()).toContain("Err1");
  });

  it("handles new configuration click", () => {
    const res = step.render();
    // Reset config button is usually the last func in the template
    const lastFunc = res.values[res.values.length - 1];
    if (typeof lastFunc === "function") lastFunc();
    expect(editor._handleResetConfig).toHaveBeenCalled();
  });

  it("getControllerTitle handles various metadata", () => {
    expect(step._getControllerTitle({ meta: { title: "Custom" } })).toBe("Custom");
    // Fallback logic
    const title = step._getControllerTitle({ global_prefix: "prefix_", meta: { preset_type: "thermostat" } });
    expect(title).toContain("CronoStar");
    expect(title).toContain("thermostat");
    expect(title).toContain("prefix");
  });

  describe("Async actions", () => {
    it("_loadAllProfiles handles success", async () => {
      editor.hass.callWS.mockResolvedValue({ response: { data: 1 } });
      await step._loadAllProfiles();
      expect(editor._dashboardProfilesData).toEqual({ data: 1 });
    });

    it("_loadAllProfiles handles error", async () => {
      editor.hass.callWS.mockRejectedValue(new Error("fail"));
      await step._loadAllProfiles();
      expect(editor._dashboardProfilesData).toEqual({});
    });

    it("_handleDeleteController confirms and calls service", async () => {
      vi.stubGlobal("confirm", () => true);
      await step._handleDeleteController({ global_prefix: "p_", meta: {} });
      expect(editor.hass.callService).toHaveBeenCalledWith("cronostar", "delete_controller", expect.any(Object));
      expect(editor.showToast).toHaveBeenCalled();
    });

    it("_handleDeleteController handles rejection", async () => {
      vi.stubGlobal("confirm", () => true);
      editor.hass.callService.mockRejectedValue(new Error("fail"));
      await step._handleDeleteController({ global_prefix: "p_", meta: {} });
      expect(editor.showToast).toHaveBeenCalledWith(expect.stringContaining("fail"), true);
    });

    it("_primeLanguageFromCurrentProfile handles success", async () => {
      editor.hass.callWS.mockResolvedValue({ response: { meta: { language: "fr" } } });
      await step._primeLanguageFromCurrentProfile();
      expect(editor._language).toBe("fr");
    });
  });

  it("_closeDetailModal resets state", () => {
    step._closeDetailModal();
    expect(editor._dashboardShowDetailModal).toBe(false);
    expect(editor.requestUpdate).toHaveBeenCalled();
  });
});
