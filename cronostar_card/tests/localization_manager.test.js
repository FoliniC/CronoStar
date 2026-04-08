// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalizationManager } from "../src/managers/localization_manager.js";

describe("LocalizationManager", () => {
  let lm;
  const mockCard = {};

  beforeEach(() => {
    lm = new LocalizationManager(mockCard);
  });

  it("should translate simple keys to English", () => {
    expect(lm.localize("en", "ui.title")).toBe("CronoStar");
  });

  it("should translate simple keys to Italian", () => {
    expect(lm.localize("it", "ui.title")).toBe("CronoStar");
    expect(lm.localize("it", "ui.loading")).toBe("Caricamento…");
  });

  it("should fallback to English for unsupported languages", () => {
    expect(lm.localize("fr", "ui.loading")).toBe("Loading…");
  });

  it("should handle sub-tags like it-IT", () => {
    expect(lm.localize("it-IT", "ui.loading")).toBe("Caricamento…");
  });

  it("should handle sub-tags like en-US", () => {
    expect(lm.localize("en-US", "ui.loading")).toBe("Loading…");
  });

  it("should return the key if the translation is missing", () => {
    expect(lm.localize("en", "non.existent.key")).toBe("non.existent.key");
  });

  it("should perform {placeholder} substitutions", () => {
    // apply_now_success: "Applied successfully for hour {hour}"
    const result = lm.localize("en", "ui.apply_now_success", { "{hour}": "12:00" });
    expect(result).toBe("Applied successfully for hour 12:00");
  });

  it("should perform [placeholder] substitutions via the replace parameter", () => {
    const result = lm.localize("en", "ui.apply_now_success", null, { "{hour}": "14:00" });
    expect(result).toBe("Applied successfully for hour 14:00");
  });

  it("should handle special characters in placeholders", () => {
    const result = lm.localize("en", "ui.apply_now_success", { "{hour}": "10:00" });
    expect(result).toBe("Applied successfully for hour 10:00");
  });

  it("should handle errors in key parsing", () => {
    // Force an error by passing null as key
    expect(lm.localize("en", null)).toBe(null);
  });

  it("should handle undefined lang", () => {
    expect(lm.localize(undefined, "ui.title")).toBe("CronoStar");
  });
});
