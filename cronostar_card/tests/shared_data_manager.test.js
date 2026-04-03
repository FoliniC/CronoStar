// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Logger BEFORE importing SharedDataManager
vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    Logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { SharedDataManager } from "../src/managers/shared_data_manager.js";
import { Logger } from "../src/utils.js";

describe("SharedDataManager", () => {
  let manager;
  let mockCard;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    
    // Mock card
    mockCard = {
      config: {
        global_prefix: "test_prefix_",
        preset_type: "thermostat",
      },
      hass: {
        callService: vi.fn(),
        states: {},
      },
    };
    
    manager = new SharedDataManager(mockCard);
    
    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getProfileFilename", () => {
    it("should generate filename with prefix and preset", () => {
      const filename = manager.getProfileFilename("Default", "ev_charging");
      expect(filename).toBe("cronostar_ev_charging_test_prefix_data.json");
    });
    
    it("should use default preset if none provided", () => {
        const filename = manager.getProfileFilename("Default");
        expect(filename).toBe("cronostar_temp_test_prefix_data.json");
    });
  });

  describe("getPresetType", () => {
    it("should extract preset type from prefix", () => {
      mockCard.config.global_prefix = "cronostar_thermostat_";
      expect(manager.getPresetType()).toBe("thermostat");
    });

    it("should return temp as default", () => {
      mockCard.config.global_prefix = "invalid_prefix";
      expect(manager.getPresetType()).toBe("temp");
    });

    it("should use default prefix if config or global_prefix is missing", () => {
      mockCard.config = {};
      expect(manager.getPresetType()).toBe("temp");
      expect(manager.getProfileFilename("Default")).toBe("cronostar_temp_cronostar_data.json");
    });
  });

  describe("slugify", () => {
    it("should slugify strings correctly", () => {
      expect(manager.slugify("Test String! 123")).toBe("test_string_123");
      expect(manager.slugify("èéàòù")).toBe("eeaou");
      expect(manager.slugify(null)).toBe("");
    });
  });

  describe("loadProfile", () => {
    it("should use cache if valid", async () => {
      const mockData = { schedule: Array(24).fill(20) };
      manager.cache.set("profile_Default", { data: mockData, timestamp: Date.now() });
      
      const result = await manager.loadProfile("Default");
      expect(result).toEqual(mockData);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should fetch if cache is missing or expired", async () => {
      const mockData = { schedule: Array(24).fill(22) };
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await manager.loadProfile("Default");
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalled();
    });

    it("should return null if response is not ok (e.g. 404)", async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await manager.loadProfile("Default");
      expect(result).toBeNull();
    });

    it("should throw error and return null if response is not ok and not 404", async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await manager.loadProfile("Default");
      expect(result).toBeNull();
      expect(Logger.error).toHaveBeenCalled();
    });

    it("should return null if data is invalid", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ invalid: "data" }),
        });
        const result = await manager.loadProfile("Default");
        expect(result).toBeNull();
        expect(Logger.warn).toHaveBeenCalledWith("LOAD", expect.stringContaining("Invalid profile data structure"));
    });

    it("should handle fetch errors", async () => {
      global.fetch.mockRejectedValue(new Error("Network error"));
      const result = await manager.loadProfile("Default");
      expect(result).toBeNull();
    });
  });

  describe("validateProfileData", () => {
    it("should validate valid schedule data", () => {
      expect(manager.validateProfileData({ schedule: Array(24).fill(0) })).toBe(true);
      expect(manager.validateProfileData(Array(24).fill(0))).toBe(true);
    });

    it("should return false for invalid data", () => {
      expect(manager.validateProfileData(null)).toBe(false);
      expect(manager.validateProfileData({})).toBe(false);
      expect(manager.validateProfileData({ schedule: [1, 2] })).toBe(false);
      expect(manager.validateProfileData([1, 2])).toBe(false);
    });
  });

  describe("extractSchedule", () => {
    it("should extract schedule from object", () => {
      const data = { schedule: ["10", "20.5", ...Array(22).fill(0)] };
      const schedule = manager.extractSchedule(data);
      expect(schedule[0]).toBe(10);
      expect(schedule[1]).toBe(20.5);
    });

    it("should return null for null data", () => {
        expect(manager.extractSchedule(null)).toBeNull();
    });
    
    it("should extract from array", () => {
        const data = Array(24).fill("10");
        const schedule = manager.extractSchedule(data);
        expect(schedule[0]).toBe(10);
    });

    it("should handle invalid values in array schedule (branch coverage for || 0)", () => {
        const data = Array(24).fill("not-a-number");
        data[0] = "0"; // To cover parseFloat(0) || 0
        const schedule = manager.extractSchedule(data);
        expect(schedule[0]).toBe(0);
        expect(schedule[1]).toBe(0);
    });

    it("should return null for invalid data", () => {
        expect(manager.extractSchedule({foo: "bar"})).toBeNull();
    });
  });

  describe("saveProfile", () => {
    it("should call HA service and invalidate cache", async () => {
      const schedule = Array(24).fill(15);
      const result = await manager.saveProfile("TestProfile", schedule);
      
      expect(mockCard.hass.callService).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should call HA service with default values if config is minimal", async () => {
      mockCard.config = { preset_type: "ev" }; // No global_prefix, unit_of_measurement, etc.
      const schedule = Array(24).fill(15);
      await manager.saveProfile("TestProfile", schedule);
      
      expect(mockCard.hass.callService).toHaveBeenCalledWith(
          "script",
          "cronostar_save_profile", // Default from ||
          expect.objectContaining({
              global_prefix: "", // Default from ||
              profile_name: "TestProfile"
          })
      );
      
      const lastCall = mockCard.hass.callService.mock.calls[0];
      const data = JSON.parse(lastCall[2].profile_data);
      expect(data.unit_of_measurement).toBe("");
    });

    it("should return false if hass is missing", async () => {
      mockCard.hass = null;
      const result = await manager.saveProfile("TestProfile", []);
      expect(result).toBe(false);
    });

    it("should return false on error", async () => {
      mockCard.hass.callService.mockRejectedValue(new Error("Service error"));
      const result = await manager.saveProfile("TestProfile", []);
      expect(result).toBe(false);
    });
  });

  describe("profileExists", () => {
    it("should return true if head request is ok", async () => {
      global.fetch.mockResolvedValue({ ok: true });
      const result = await manager.profileExists("Default");
      expect(result).toBe(true);
    });
    
    it("should return false on error", async () => {
        global.fetch.mockRejectedValue(new Error("Error"));
        const result = await manager.profileExists("Default");
        expect(result).toBe(false);
    });
  });

  describe("listProfiles", () => {
    it("should return empty array if no hass or entity", async () => {
      expect(await manager.listProfiles()).toEqual([]);
    });

    it("should return options from select entity", async () => {
      mockCard.config.profiles_select_entity = "input_select.profiles";
      mockCard.hass.states["input_select.profiles"] = {
        attributes: { options: ["Profile 1", "Profile 2"] }
      };
      
      const result = await manager.listProfiles();
      expect(result).toEqual(["Profile 1", "Profile 2"]);
    });
    
    it("should return empty if entity has no options", async () => {
        mockCard.config.profiles_select_entity = "input_select.profiles";
        mockCard.hass.states["input_select.profiles"] = { attributes: {} };
        expect(await manager.listProfiles()).toEqual([]);
    });
  });

  describe("cache management", () => {
    it("should clear cache", () => {
      manager.cache.set("test", "data");
      manager.clearCache();
      expect(manager.cache.size).toBe(0);
    });

    it("should invalidate specific profile", () => {
      manager.cache.set("profile_test", "data");
      manager.invalidateProfile("test");
      expect(manager.cache.has("profile_test")).toBe(false);
    });
  });
});
