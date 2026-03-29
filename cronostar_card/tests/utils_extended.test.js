// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as prefixUtils from "../src/utils/prefix_utils.js";
import * as loggerUtils from "../src/utils/logger_utils.js";
import * as filenameUtils from "../src/utils/filename_utils.js";
import * as editorUtils from "../src/utils/editor_utils.js";

describe("Utility Extended Tests", () => {

  describe("prefix_utils", () => {
    it("normalizePrefix dovrebbe aggiungere underscore se mancante", () => {
      expect(prefixUtils.normalizePrefix("test")).toBe("test_");
      expect(prefixUtils.normalizePrefix("test_")).toBe("test_");
      expect(prefixUtils.normalizePrefix("  TEST  ")).toBe("test_");
      expect(prefixUtils.normalizePrefix("")).toBe("");
    });

    it("isValidPrefix dovrebbe validare correttamente", () => {
      expect(prefixUtils.isValidPrefix("valid_")).toBe(true);
      expect(prefixUtils.isValidPrefix("invalid")).toBe(false);
      expect(prefixUtils.isValidPrefix("")).toBe(false);
      expect(prefixUtils.isValidPrefix(null)).toBe(false);
    });

    it("humanizePrefix dovrebbe rendere leggibile il prefisso", () => {
      expect(prefixUtils.humanizePrefix("cronostar_thermostat_living_", "en")).toBe("thermostat living");
      expect(prefixUtils.humanizePrefix("cronostar_test_", "it")).toBe("test");
      expect(prefixUtils.humanizePrefix("", "en")).toBe("schedule");
      expect(prefixUtils.humanizePrefix("", "it")).toBe("programma");
    });

    it("getEffectivePrefix dovrebbe restituire il prefisso dalla config", () => {
      expect(prefixUtils.getEffectivePrefix({ global_prefix: "custom_" })).toBe("custom_");
      expect(prefixUtils.getEffectivePrefix({})).toBe("cronostar_");
    });

    it("getAliasWithPrefix dovrebbe generare l'alias corretto", () => {
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

    it("dovrebbe loggare solo se abilitato o se livello è warn/error", () => {
      loggerUtils.log("debug", false, "msg");
      expect(consoleSpy.debug).not.toHaveBeenCalled();

      loggerUtils.log("error", false, "msg");
      expect(consoleSpy.error).toHaveBeenCalled();

      loggerUtils.log("info", true, "msg");
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it("dovrebbe gestire il livello di default", () => {
      loggerUtils.log("unknown", true, "msg");
      expect(consoleSpy.log).toHaveBeenCalledWith("[CronoStar]", "msg");
    });
  });

  describe("filename_utils", () => {
    it("buildProfileFilename dovrebbe generare il nome corretto", () => {
      expect(filenameUtils.buildProfileFilename("thermostat", "living")).toBe("cronostar_thermostat_living_data.json");
    });

    it("buildHelpersFilename dovrebbe generare il nome corretto", () => {
      expect(filenameUtils.buildHelpersFilename("test")).toBe("test_package.yaml");
    });

    it("buildAutomationFilename dovrebbe generare il nome corretto", () => {
      expect(filenameUtils.buildAutomationFilename("test")).toBe("test_automation.yaml");
    });

    it("getExpectedAutomationId dovrebbe generare l'ID corretto", () => {
      expect(filenameUtils.getExpectedAutomationId("test")).toBe("test_apply");
    });
  });

  describe("editor_utils", () => {
    it("slugify dovrebbe funzionare correttamente", () => {
      expect(editorUtils.slugify("Hello World")).toBe("hello_world");
      expect(editorUtils.slugify("Café")).toBe("cafe");
      expect(editorUtils.slugify("")).toBe("");
    });

    it("pad2 dovrebbe formattare con zero iniziale", () => {
      expect(editorUtils.pad2(5)).toBe("05");
      expect(editorUtils.pad2(12)).toBe("12");
    });

    it("getHoursList dovrebbe generare la lista corretta", () => {
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

    it("escapeHtml dovrebbe fare l'escape dei caratteri", () => {
      expect(editorUtils.escapeHtml("<b>")).toBe("&lt;b&gt;");
      expect(editorUtils.escapeHtml("a & b")).toBe("a &amp; b");
    });
  });
});
