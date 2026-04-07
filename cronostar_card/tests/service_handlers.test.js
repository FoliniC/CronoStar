// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  copyToClipboard,
  downloadFile,
  handleInitializeData,
  localize,
} from "../src/editor/services/service_handlers.js";

describe("service_handlers.js", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });

    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();

    document.execCommand = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("localize", () => {
    it("should localize correctly with search/replace", () => {
      const result = localize("en", "notify.language_save_error", {
        "{error}": "FAIL",
      });
      expect(result).toBe("Error saving language preference: FAIL");

      const result2 = localize(
        "en",
        "notify.language_save_error",
        null,
        { "{error}": "FAIL2" },
      );
      expect(result2).toBe("Error saving language preference: FAIL2");
    });

    it("should return the key if translation is missing", () => {
      expect(localize("en", "missing.key")).toBe("missing.key");
    });

    it("should handle key as object path missing string leaf", () => {
      expect(localize("en", "steps")).toBe("steps");
    });

    it("should fallback to english when lang is unknown", () => {
      expect(localize("xx", "notify.language_save_error", {
        "{error}": "ERR",
      })).toContain("ERR");
    });

    it("should apply replace branch after search branch", () => {
      const result = localize(
        "en",
        "notify.language_save_error",
        { "{error}": "A" },
        { "A": "B" },
      );
      expect(result).toBe("Error saving language preference: B");
    });
  });

  describe("copyToClipboard", () => {
    it("should use navigator.clipboard if available", async () => {
      const result = await copyToClipboard("test-text", "Success", "Error");
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test-text");
      expect(result.success).toBe(true);
      expect(result.message).toBe("Success");
    });

    it("should use fallback if navigator.clipboard is missing", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });

      const result = await copyToClipboard("test-text", "Success", "Error");
      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(result.success).toBe(true);
    });

    it("should return error if both methods fail", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });
      document.execCommand = vi.fn().mockReturnValue(false);

      const result = await copyToClipboard("test-text", "Success", "Error");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Error");
    });

    it("should handle exceptions", async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error("Clip error"));
      const result = await copyToClipboard("test-text", "Success", "Error");
      expect(result.success).toBe(false);
    });
  });

  describe("downloadFile", () => {
    it("should create a link and click it", () => {
      const click = vi.fn();
      const spy = vi.spyOn(document, "createElement").mockReturnValue({
        click,
      });
      const result = downloadFile("test.yaml", "content", "Success", "Error");

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith("a");
      expect(click).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle exceptions", () => {
      global.URL.createObjectURL.mockImplementation(() => {
        throw new Error("URL error");
      });
      const result = downloadFile("test.yaml", "content", "Success", "Error");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Error");
    });
  });

  describe("handleInitializeData", () => {
    let mockHass;
    const config = {
      preset_type: "thermostat",
      global_prefix: "test_prefix_",
      min_value: 5,
    };

    beforeEach(() => {
      mockHass = {
        callWS: vi.fn(),
      };
    });

    it("should throw error if hass is missing", async () => {
      await expect(
        handleInitializeData(null, config, "en"),
      ).rejects.toThrow("Home Assistant not connected");
    });

    it("should initialize fresh data if profile not found", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      const result = await handleInitializeData(mockHass, config, "en");

      expect(mockHass.callWS).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.message).toContain("Default profile initialized");
    });

    it("should use existing schedule if found", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: {
          schedule: [{ time: "10:00", value: 20 }],
        },
      });

      const result = await handleInitializeData(mockHass, config, "en");

      expect(mockHass.callWS).toHaveBeenCalledTimes(2);
      const saveCall = mockHass.callWS.mock.calls[1][0];
      expect(saveCall.service_data.schedule).toContainEqual({
        time: "00:00",
        value: 20,
      });
      expect(saveCall.service_data.schedule).toContainEqual({
        time: "23:59",
        value: 20,
      });
      expect(result.message).toContain("analyzed and corrected");
    });

    it("should handle case where resp is the result itself", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        schedule: [
          { time: "00:00", value: 10 },
          { time: "23:59", value: 10 },
        ],
      });
      const result = await handleInitializeData(mockHass, config, "en");
      expect(result.success).toBe(true);
    });

    it("should handle missing global_prefix in meta and add it", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      const configWithNoPrefix = {
        preset_type: "thermostat",
        min_value: 5,
      };

      await handleInitializeData(mockHass, configWithNoPrefix, "en");

      const saveCall = mockHass.callWS.mock.calls[1][0];
      expect(saveCall.service_data.global_prefix).toBe("cronostar_");
      expect(saveCall.service_data.meta.global_prefix).toBe("cronostar_");
    });

    it("should initialize fresh data if profile exists but schedule is empty", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: { schedule: [] },
      });
      mockHass.callWS.mockResolvedValueOnce({ success: true });
      const result = await handleInitializeData(mockHass, config, "en");
      expect(result.success).toBe(true);
    });

    it("should prepend 00:00 if missing in existing schedule", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: {
          schedule: [{ time: "10:00", value: 20 }, { time: "23:59", value: 20 }],
        },
      });
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(mockHass, config, "en");

      const saved = mockHass.callWS.mock.calls[1][0].service_data.schedule;
      expect(saved[0]).toEqual({ time: "00:00", value: 20 });
    });

    it("should append 23:59 if missing in existing schedule", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: {
          schedule: [{ time: "00:00", value: 20 }, { time: "10:00", value: 20 }],
        },
      });
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(mockHass, config, "en");

      const saved = mockHass.callWS.mock.calls[1][0].service_data.schedule;
      expect(saved[saved.length - 1]).toEqual({ time: "23:59", value: 20 });
    });

    it("should sort the final schedule before save", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: {
          schedule: [
            { time: "23:59", value: 20 },
            { time: "00:00", value: 10 },
            { time: "10:00", value: 15 },
          ],
        },
      });
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(mockHass, config, "en");

      const saved = mockHass.callWS.mock.calls[1][0].service_data.schedule;
      expect(saved.map((x) => x.time)).toEqual(["00:00", "10:00", "23:59"]);
    });

    it("should delete entity_prefix from meta payload", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(
        mockHass,
        {
          ...config,
          entity_prefix: "legacy_",
        },
        "en",
      );

      const meta = mockHass.callWS.mock.calls[1][0].service_data.meta;
      expect(meta.entity_prefix).toBeUndefined();
    });

    it("should keep existing global_prefix in safeMeta when provided", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(
        mockHass,
        {
          ...config,
          global_prefix: "my_prefix_",
        },
        "en",
      );

      const meta = mockHass.callWS.mock.calls[1][0].service_data.meta;
      expect(meta.global_prefix).toBe("my_prefix_");
    });

    it("should cover line 107 by preserving explicit global_prefix and entity metadata", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true });

      await handleInitializeData(
        mockHass,
        {
          preset_type: "thermostat",
          global_prefix: "explicit_prefix_",
          target_entity: "climate.office",
        },
        "en",
      );

      const payload = mockHass.callWS.mock.calls[1][0].service_data;
      expect(payload.global_prefix).toBe("explicit_prefix_");
      expect(payload.meta.global_prefix).toBe("explicit_prefix_");
      expect(payload.meta.target_entity).toBe("climate.office");
    });
  });
});
