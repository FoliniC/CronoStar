// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Step0Dashboard } from "../src/editor/steps/Step0Dashboard.js";

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

describe("Step0Dashboard", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = {
      _dashboardLoading: false,
      _dashboardProfilesData: null,
      _dashboardShowDetailModal: false,
      _dashboardSelectedPreset: "thermostat",
      _dashboardSelectedProfile: "Default",
      _dashboardDetailData: { a: 1 },
      _dashboardIsEditingName: true,
      _dashboardEditName: "Edit",
      _language: "en",
      _i18n: { _t: vi.fn((k) => k) },
      i18n: {
        _t: vi.fn((k) => {
          if (k === "presetNames.thermostat") return "Thermostat";
          return k;
        }),
      },
      _handleEditControllerConfig: vi.fn(),
      _handleDeleteController: vi.fn(),
      _handleResetConfig: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      requestUpdate: vi.fn(),
      showToast: vi.fn(),
      hass: {
        callWS: vi.fn(),
        callService: vi.fn(),
      },
      _config: { global_prefix: "p_", preset_type: "thermostat" },
    };
    step = new Step0Dashboard(editor);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("triggers reset config from new configuration button value function", () => {
    const res = step.render();
    const fn = res.values.find((v) => typeof v === "function");
    fn();
    expect(editor._handleResetConfig).toHaveBeenCalled();
  });

  it("getControllerTitle handles custom metadata", () => {
    expect(step._getControllerTitle({ meta: { title: "Custom" } })).toBe("Custom");
  });

  it("getControllerTitle handles fallback preset/prefix composition", () => {
    const title = step._getControllerTitle({
      global_prefix: "prefix_",
      meta: { preset_type: "thermostat" },
    });
    expect(title).toContain("CronoStar");
    expect(title).toContain("Thermostat");
    expect(title).toContain("prefix");
  });

  it("getControllerTitle falls back to meta.preset when preset_type is absent", () => {
    const title = step._getControllerTitle({
      global_prefix: "prefix_",
      meta: { preset: "thermostat" },
    });
    expect(title).toContain("Thermostat");
  });

  it("getControllerTitle falls back to thermostat when meta is missing", () => {
    const title = step._getControllerTitle({
      global_prefix: "prefix_",
    });
    expect(title).toContain("CronoStar");
  });

  describe("_loadAllProfiles", () => {
    it("handles success response.response", async () => {
      editor.hass.callWS.mockResolvedValue({ response: { data: 1 } });
      await step._loadAllProfiles();
      expect(editor._dashboardProfilesData).toEqual({ data: 1 });
      expect(editor._dashboardLoading).toBe(false);
    });

    it("handles success with undefined response fallback to {}", async () => {
      editor.hass.callWS.mockResolvedValue({});
      await step._loadAllProfiles();
      expect(editor._dashboardProfilesData).toEqual({});
    });

    it("handles callWS error", async () => {
      editor.hass.callWS.mockRejectedValue(new Error("fail"));
      await step._loadAllProfiles();
      expect(editor._dashboardProfilesData).toEqual({});
      expect(editor._dashboardLoading).toBe(false);
    });

    it("returns early when hass is missing", async () => {
      editor.hass = null;
      await step._loadAllProfiles();
      expect(editor.requestUpdate).not.toHaveBeenCalledWith();
    });
  });

  describe("_handleDeleteController", () => {
    it("deletes controller on confirmation", async () => {
      vi.stubGlobal("confirm", () => true);
      await step._handleDeleteController({
        global_prefix: "p_",
        meta: { preset_type: "thermostat" },
      });
      expect(editor.hass.callService).toHaveBeenCalledWith(
        "cronostar",
        "delete_controller",
        expect.any(Object),
      );
      expect(editor.showToast).toHaveBeenCalled();
    });

    it("uses meta.preset fallback when preset_type is absent", async () => {
      vi.stubGlobal("confirm", () => true);
      await step._handleDeleteController({
        global_prefix: "p_",
        meta: { preset: "thermostat" },
      });
      expect(editor.hass.callService).toHaveBeenCalled();
    });

    it("uses thermostat default when preset metadata is absent", async () => {
      vi.stubGlobal("confirm", () => true);
      await step._handleDeleteController({
        global_prefix: "p_",
        meta: {},
      });
      expect(editor.hass.callService).toHaveBeenCalled();
    });

    it("returns when confirm is false", async () => {
      vi.stubGlobal("confirm", () => false);
      await step._handleDeleteController({
        global_prefix: "p_",
        meta: {},
      });
      expect(editor.hass.callService).not.toHaveBeenCalled();
    });

    it("handles delete failure", async () => {
      vi.stubGlobal("confirm", () => true);
      editor.hass.callService.mockRejectedValue(new Error("fail"));
      await step._handleDeleteController({
        global_prefix: "p_",
        meta: {},
      });
      expect(editor.showToast).toHaveBeenCalledWith(
        expect.stringContaining("fail"),
        true,
      );
      expect(editor._dashboardLoading).toBe(false);
    });
  });

  describe("_primeLanguageFromCurrentProfile", () => {
    it("adopts language from profile meta", async () => {
      editor.hass.callWS.mockResolvedValue({
        response: { meta: { language: "fr" } },
      });
      await step._primeLanguageFromCurrentProfile();
      expect(editor._language).toBe("fr");
    });

    it("does nothing if hass is missing", async () => {
      editor.hass = null;
      await step._primeLanguageFromCurrentProfile();
      expect(editor._language).toBe("en");
    });

    it("does nothing if prefix is missing", async () => {
      editor._config = {};
      await step._primeLanguageFromCurrentProfile();
      expect(editor.hass.callWS).not.toHaveBeenCalled();
    });

    it("does nothing if meta.language is absent", async () => {
      editor.hass.callWS.mockResolvedValue({ response: { meta: {} } });
      await step._primeLanguageFromCurrentProfile();
      expect(editor._language).toBe("en");
    });

    it("does not recreate i18n if language is unchanged", async () => {
      editor._language = "en";
      editor.hass.callWS.mockResolvedValue({
        response: { meta: { language: "en" } },
      });
      await step._primeLanguageFromCurrentProfile();
      expect(editor._language).toBe("en");
    });

    it("swallows load profile errors", async () => {
      editor.hass.callWS.mockRejectedValue(new Error("boom"));
      await expect(step._primeLanguageFromCurrentProfile()).resolves.toBeUndefined();
    });
  });

  it("_handleEditControllerConfig should update editor state", () => {
    step._handleEditControllerConfig({
      global_prefix: "p_",
      meta: { title: "T", preset_type: "thermostat" },
    });
    expect(editor._isEditing).toBe(true);
    expect(editor._step).toBe(1);
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("_handleEditControllerConfig should use meta.preset fallback", () => {
    step._handleEditControllerConfig({
      global_prefix: "p_",
      meta: { title: "T", preset: "thermostat" },
    });
    expect(editor._config.preset_type).toBe("thermostat");
  });

  it("_handleEditControllerConfig should default preset_type to thermostat", () => {
    step._handleEditControllerConfig({
      global_prefix: "p_",
      meta: { title: "T" },
    });
    expect(editor._config.preset_type).toBe("thermostat");
  });

  it("_closeDetailModal resets dashboard detail state", () => {
    step._closeDetailModal();
    expect(editor._dashboardShowDetailModal).toBe(false);
    expect(editor._dashboardSelectedPreset).toBeNull();
    expect(editor._dashboardSelectedProfile).toBeNull();
    expect(editor._dashboardDetailData).toBeNull();
    expect(editor._dashboardIsEditingName).toBe(false);
    expect(editor._dashboardEditName).toBe("");
    expect(editor.requestUpdate).toHaveBeenCalled();
  });

  it("_renderProfilesList returns empty template when data is missing", () => {
    editor._dashboardProfilesData = null;
    const res = step._renderProfilesList();
    expect(res.toString()).toBe("");
  });

  it("_renderProfilesList renders valid status branch", () => {
    editor._dashboardProfilesData = {
      thermostat: {
        files: [{
          global_prefix: "p1_",
          meta: { title: "T1", target_entity: "climate.1" },
          profiles: ["Default"],
          validation: { valid: true, errors: [] },
        }],
      },
    };
    const res = step._renderProfilesList();
    expect(res.toString()).toContain("Configurazione Attiva");
  });
});
