// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as prefixUtils from "../src/utils/prefix_utils.js";
import * as loggerUtils from "../src/utils/logger_utils.js";
import * as filenameUtils from "../src/utils/filename_utils.js";
import * as editorUtils from "../src/utils/editor_utils.js";

describe("Utility Extended Tests", () => {

  describe("prefix_utils", () => {
    it("normalizePrefix should add an underscore if missing", () => {
      expect(prefixUtils.normalizePrefix("test")).toBe("test_");
      expect(prefixUtils.normalizePrefix("test_")).toBe("test_");
      expect(prefixUtils.normalizePrefix("  TEST  ")).toBe("test_");
      expect(prefixUtils.normalizePrefix("")).toBe("");
    });

    it("isValidPrefix should validate correctly", () => {
      expect(prefixUtils.isValidPrefix("valid_")).toBe(true);
      expect(prefixUtils.isValidPrefix("invalid")).toBe(false);
      expect(prefixUtils.isValidPrefix("")).toBe(false);
      expect(prefixUtils.isValidPrefix(null)).toBe(false);
    });

    it("humanizePrefix should make the prefix readable", () => {
      expect(prefixUtils.humanizePrefix("cronostar_thermostat_living_", "en")).toBe("thermostat living");
      expect(prefixUtils.humanizePrefix("cronostar_test_", "it")).toBe("test");
      expect(prefixUtils.humanizePrefix("", "en")).toBe("schedule");
      expect(prefixUtils.humanizePrefix("", "it")).toBe("programma");
      expect(prefixUtils.humanizePrefix("___", "en")).toBe("schedule");
      expect(prefixUtils.humanizePrefix("___", "it")).toBe("programma");
    });

    it("humanizePrefix handles the catch block (branch coverage)", () => {
      const faulty = { toString: () => { throw new Error("fail"); } };
      expect(prefixUtils.humanizePrefix(faulty, "en")).toBe("schedule");
      expect(prefixUtils.humanizePrefix(faulty, "it")).toBe("programma");
    });

    it("getEffectivePrefix should return the prefix from config", () => {
      expect(prefixUtils.getEffectivePrefix({ global_prefix: "custom_" })).toBe("custom_");
      expect(prefixUtils.getEffectivePrefix({})).toBe("cronostar_");
      expect(prefixUtils.getEffectivePrefix({ global_prefix: "  " })).toBe("cronostar_");
    });

    it("getAliasWithPrefix should generate the correct alias", () => {
      expect(prefixUtils.getAliasWithPrefix("p_", "en")).toBe("CronoStar - apply p");
      expect(prefixUtils.getAliasWithPrefix("p_", "it")).toBe("CronoStar - applica p");
    });
  });

  describe("logger_utils", () => {
    let consoleSpy;
    
    beforeEach(() => {
      consoleSpy = {
        debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
        info: vi.spyOn(console, "info").mockImplementation(() => {}),
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
        log: vi.spyOn(console, "log").mockImplementation(() => {}),
      };
    });

    afterEach(() => vi.restoreAllMocks());

    it("should log only if enabled or if level is warn/error", () => {
      loggerUtils.log("debug", false, "msg");
      expect(consoleSpy.debug).not.toHaveBeenCalled();

      loggerUtils.log("error", false, "msg");
      expect(consoleSpy.error).toHaveBeenCalled();

      loggerUtils.log("info", true, "msg");
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it("should handle the default level", () => {
      loggerUtils.log("unknown", true, "msg");
      expect(consoleSpy.log).toHaveBeenCalledWith("[CronoStar]", "msg");
    });
  });

  describe("filename_utils", () => {
    it("buildProfileFilename should generate the correct name", () => {
      expect(filenameUtils.buildProfileFilename("thermostat", "living")).toBe("cronostar_thermostat_living_data.json");
    });

    it("buildHelpersFilename should generate the correct name", () => {
      expect(filenameUtils.buildHelpersFilename("test")).toBe("test_package.yaml");
    });

    it("buildAutomationFilename should generate the correct name", () => {
      expect(filenameUtils.buildAutomationFilename("test")).toBe("test_automation.yaml");
    });

    it("getExpectedAutomationId should generate the correct ID", () => {
      expect(filenameUtils.getExpectedAutomationId("test")).toBe("test_apply");
    });
  });

  describe("editor_utils", () => {
    it("slugify should work correctly", () => {
      expect(editorUtils.slugify("Hello World")).toBe("hello_world");
      expect(editorUtils.slugify("Café")).toBe("cafe");
      expect(editorUtils.slugify("")).toBe("");
    });

    it("pad2 should format with a leading zero", () => {
      expect(editorUtils.pad2(5)).toBe("05");
      expect(editorUtils.pad2(12)).toBe("12");
    });

    it("getHoursList should generate the correct list", () => {
      const list0 = editorUtils.getHoursList(0); // 00..23
      expect(list0[0]).toBe("00");
      expect(list0[23]).toBe("23");
      expect(list0.length).toBe(24);

      const list1 = editorUtils.getHoursList(1); // 01..24 (special case hourly)
      expect(list1[0]).toBe("01");
      expect(list1[23]).toBe("24");

      const list48 = editorUtils.getHoursList(0, 30); // 00..47
      expect(list48.length).toBe(48);
      expect(list48[0]).toBe("00");
    });

    it("escapeHtml should escape HTML characters", () => {
      expect(editorUtils.escapeHtml("<b>")).toBe("&lt;b&gt;");
      expect(editorUtils.escapeHtml("a & b")).toBe("a &amp; b");
    });
  });
});
