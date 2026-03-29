// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalizationManager } from "../src/managers/localization_manager.js";

describe("LocalizationManager", () => {
  let lm;
  const mockCard = {};

  beforeEach(() => {
    lm = new LocalizationManager(mockCard);
  });

  it("dovrebbe tradurre chiavi semplici in inglese", () => {
    expect(lm.localize("en", "ui.title")).toBe("CronoStar");
  });

  it("dovrebbe tradurre chiavi semplici in italiano", () => {
    expect(lm.localize("it", "ui.title")).toBe("CronoStar");
    expect(lm.localize("it", "ui.loading")).toBe("Caricamento…");
  });

  it("dovrebbe fare fallback all'inglese per lingue non supportate", () => {
    expect(lm.localize("fr", "ui.loading")).toBe("Loading…");
  });

  it("dovrebbe gestire sub-tag come it-IT", () => {
    expect(lm.localize("it-IT", "ui.loading")).toBe("Caricamento…");
  });

  it("dovrebbe gestire sub-tag come en-US", () => {
    expect(lm.localize("en-US", "ui.loading")).toBe("Loading…");
  });

  it("dovrebbe restituire la chiave se la traduzione manca", () => {
    expect(lm.localize("en", "non.existent.key")).toBe("non.existent.key");
  });

  it("dovrebbe eseguire sostituzioni {placeholder}", () => {
    // apply_now_success: "Applied successfully for hour {hour}"
    const result = lm.localize("en", "ui.apply_now_success", { "{hour}": "12:00" });
    expect(result).toBe("Applied successfully for hour 12:00");
  });

  it("dovrebbe eseguire sostituzioni [placeholder] tramite il parametro replace", () => {
    const result = lm.localize("en", "ui.apply_now_success", null, { "{hour}": "14:00" });
    expect(result).toBe("Applied successfully for hour 14:00");
  });

  it("dovrebbe gestire caratteri speciali nei placeholder", () => {
    const result = lm.localize("en", "ui.apply_now_success", { "{hour}": "10:00" });
    expect(result).toBe("Applied successfully for hour 10:00");
  });

  it("dovrebbe gestire errori nel parsing della chiave", () => {
    // Forza un errore passando null come chiave
    expect(lm.localize("en", null)).toBe(null);
  });

  it("dovrebbe gestire lang undefined", () => {
    expect(lm.localize(undefined, "ui.title")).toBe("CronoStar");
  });
});
