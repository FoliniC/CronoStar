// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyToClipboard, downloadFile, handleInitializeData, localize } from "../src/editor/services/service_handlers.js";

describe("service_handlers.js", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    
    // Mock navigator.clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
    
    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
    
    // Mock document.execCommand
    document.execCommand = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("localize", () => {
    it("should localize correctly with search/replace", () => {
      const result = localize("en", "notify.language_save_error", { "{error}": "FAIL" });
      expect(result).toBe("Error saving language preference: FAIL");
      
      const result2 = localize("en", "notify.language_save_error", null, { "{error}": "FAIL2" });
      expect(result2).toBe("Error saving language preference: FAIL2");
    });
    
    it("should return the key if translation is missing", () => {
        expect(localize("en", "missing.key")).toBe("missing.key");
    });
    
    it("should handle key as object", () => {
        expect(localize("en", "steps")).toBe("steps");
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
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      
      const result = await copyToClipboard("test-text", "Success", "Error");
      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(result.success).toBe(true);
    });

    it("should return error if both methods fail", async () => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
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
      const spy = vi.spyOn(document, "createElement");
      const result = downloadFile("test.yaml", "content", "Success", "Error");
      
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith("a");
      expect(result.success).toBe(true);
    });

    it("should handle exceptions", () => {
      global.URL.createObjectURL.mockImplementation(() => { throw new Error("URL error"); });
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
      await expect(handleInitializeData(null, config, "en")).rejects.toThrow("Home Assistant not connected");
    });

    it("should initialize fresh data if profile not found", async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
      mockHass.callWS.mockResolvedValueOnce({ success: true }); // save_profile success
      
      const result = await handleInitializeData(mockHass, config, "en");
      
      expect(mockHass.callWS).toHaveBeenCalledTimes(2); // load_profile, then save_profile
      expect(result.success).toBe(true);
      expect(result.message).toContain("Default profile initialized");
    });

    it("should use existing schedule if found", async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: {
          schedule: [{ time: "10:00", value: 20 }]
        }
      });
      
      const result = await handleInitializeData(mockHass, config, "en");
      
      expect(mockHass.callWS).toHaveBeenCalledTimes(2);
      const saveCall = mockHass.callWS.mock.calls[1][0];
      expect(saveCall.service_data.schedule).toContainEqual({ time: "00:00", value: 20 });
      expect(saveCall.service_data.schedule).toContainEqual({ time: "23:59", value: 20 });
      expect(result.message).toContain("analyzed and corrected");
    });
    
    it("should handle case where resp is the result itself", async () => {
        mockHass.callWS.mockResolvedValueOnce({
            schedule: [{ time: "00:00", value: 10 }, { time: "23:59", value: 10 }]
        });
        const result = await handleInitializeData(mockHass, config, "en");
        expect(result.success).toBe(true);
    });
    
    it("should handle missing global_prefix in meta and add it", async () => {
        mockHass.callWS.mockRejectedValueOnce(new Error("Not found"));
        mockHass.callWS.mockResolvedValueOnce({ success: true });
        
        const configWithNoPrefix = {
            preset_type: "thermostat",
            min_value: 5
        };
        
        // This will trigger getEffectivePrefix which defaults to cronostar_
        await handleInitializeData(mockHass, configWithNoPrefix, "en");
        
        const saveCall = mockHass.callWS.mock.calls[1][0];
        expect(saveCall.service_data.global_prefix).toBe("cronostar_");
        expect(saveCall.service_data.meta.global_prefix).toBe("cronostar_");
    });

    it("should initialize fresh data if profile exists but schedule is empty", async () => {
        mockHass.callWS.mockResolvedValueOnce({
            response: { schedule: [] }
        });
        mockHass.callWS.mockResolvedValueOnce({ success: true });
        const result = await handleInitializeData(mockHass, config, "en");
        expect(result.success).toBe(true);
    });
  });
});
