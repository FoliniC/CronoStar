// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Suppresses the 'Missing translation' log from stderr ──────────────────────
vi.mock("../src/utils/logger_utils.js", () => ({ log: vi.fn() }));

import { EditorI18n, I18N } from "../src/editor/EditorI18n.js";
import { log } from "../src/utils/logger_utils.js";

// ─── _t – base language ──────────────────────────────────────────────────────
describe("EditorI18n – _t language", () => {
  it("returns the default English translation (editor object without _language)", () => {
    const i18n = new EditorI18n({});
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("returns the explicit English translation", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("supports the Italian language", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._t("actions.save")).toBe("Salva");
  });

  it("handles en-US → en sub-tags", () => {
    const i18n = new EditorI18n({ _language: "en-US" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("handles it-IT → it sub-tags (editor as object)", () => {
    const i18n = new EditorI18n({ _language: "it-IT" });
    expect(i18n._t("steps.tipo")).toBe("Setup");
  });

  it("handles it-IT → it sub-tags (editor as string)", () => {
    const i18n = new EditorI18n("it-IT");
    expect(i18n._t("steps.tipo")).toBe("Setup");
  });

  it("uses _lang as fallback when _language is absent", () => {
    const i18n = new EditorI18n({ _lang: "it" });
    expect(i18n._t("actions.save")).toBe("Salva");
  });

  it("uses 'en' if editor is null", () => {
    const i18n = new EditorI18n(null);
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("uses 'en' if editor is undefined", () => {
    const i18n = new EditorI18n(undefined);
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("uses 'en' if editor is an unknown string without hyphen", () => {
    // 'fr' does not exist in I18N → fallback I18N.en
    const i18n = new EditorI18n({ _language: "fr" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("uses 'en' for unknown language sub-tags (e.g., fr-FR)", () => {
    const i18n = new EditorI18n({ _language: "fr-FR" });
    expect(i18n._t("actions.save")).toBe("Save");
  });
});

// ─── _t – missing key ─────────────────────────────────────────────────────
describe("EditorI18n – _t missing key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the path if the translation is missing in both languages", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("missing.key")).toBe("missing.key");
  });

  it("calls log('warn', ...) when the translation is missing", () => {
    const i18n = new EditorI18n({ _language: "en" });
    i18n._t("totally.missing.key");
    expect(log).toHaveBeenCalledWith(
      "warn",
      undefined,
      expect.stringContaining("totally.missing.key"),
    );
  });

  it("uses the English fallback if the key is missing only in the current language", () => {
    // Simulate key present in 'en' but not in 'it': we use a real key
    // 'descriptions.step0' exists in both, we only check that the fallback works
    // Temporary patch of the I18N object for this test
    const originalIt = I18N.it.descriptions.step0;
    delete I18N.it.descriptions.step0;
    const i18n = new EditorI18n({ _language: "it" });
    const result = i18n._t("descriptions.step0");
    // Must return the English value
    expect(result).toBe(I18N.en.descriptions.step0);
    // Restore
    I18N.it.descriptions.step0 = originalIt;
  });

  it("returns the path if the key is missing even in the English fallback", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._t("ghost.key")).toBe("ghost.key");
  });

  it("uses logging_enabled from config if available", () => {
    const i18n = new EditorI18n({ _language: "en", _config: { logging: true } });
    i18n._t("another.missing");
    expect(log).toHaveBeenCalled();
  });
});

// ─── _t – dynamic replacements ──────────────────────────────────────────────────
describe("EditorI18n – _t replacements", () => {
  it("performs dynamic replacements with placeholders", () => {
    const i18n = new EditorI18n({ _language: "en" });
    const msg = i18n._t("notify.language_save_error", { "{error}": "FAILED" });
    expect(msg).toBe("Error saving language preference: FAILED");
  });

  it("performs multiple replacements in the same string", () => {
    // Temporary patch to test multiple replacements
    const original = I18N.en.ui.no_matching_entities;
    I18N.en.ui.no_matching_entities = "Types: {domains} and {extra}";
    const i18n = new EditorI18n({ _language: "en" });
    const result = i18n._t("ui.no_matching_entities", {
      "{domains}": "climate",
      "{extra}": "switch",
    });
    expect(result).toBe("Types: climate and switch");
    I18N.en.ui.no_matching_entities = original;
  });

  it("replaces all occurrences globally (regex 'g')", () => {
    const original = I18N.en.ui.no_matching_entities;
    I18N.en.ui.no_matching_entities = "{x} and {x}";
    const i18n = new EditorI18n({ _language: "en" });
    const result = i18n._t("ui.no_matching_entities", { "{x}": "TEST" });
    expect(result).toBe("TEST and TEST");
    I18N.en.ui.no_matching_entities = original;
  });

  it("does not perform replacements if replacements is empty", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("actions.save", {})).toBe("Save");
  });

  it("replacements in Italian", () => {
    const i18n = new EditorI18n({ _language: "it" });
    const msg = i18n._t("notify.language_save_error", { "{error}": "ERRORE" });
    expect(msg).toBe("Errore nel salvataggio della lingua: ERRORE");
  });

  it("escape regex special characters in the placeholder", () => {
    // Patch to test a placeholder with special characters like '.'
    const original = I18N.en.ui.prefix_ok;
    I18N.en.ui.prefix_ok = "Value is {val.ue}";
    const i18n = new EditorI18n({ _language: "en" });
    const result = i18n._t("ui.prefix_ok", { "{val.ue}": "42" });
    expect(result).toBe("Value is 42");
    I18N.en.ui.prefix_ok = original;
  });
});

// ─── _t – access to all namespaces (full I18N coverage) ─────────────
describe("EditorI18n – I18N namespace coverage", () => {
  const enI18n = new EditorI18n({ _language: "en" });
  const itI18n = new EditorI18n({ _language: "it" });

  const namespacesToCheck = [
    "steps.tipo", "steps.entita", "steps.opzioni", "steps.fine",
    "headers.step0", "headers.step1", "headers.step1_edit",
    "headers.step2", "headers.step3", "headers.step4", "headers.step5",
    "descriptions.step0", "descriptions.step1", "descriptions.step2",
    "descriptions.step3", "descriptions.step4", "descriptions.step5",
    "presetNames.thermostat", "presetNames.ev_charging", "presetNames.generic_kwh",
    "presetNames.generic_temperature", "presetNames.generic_switch",
    "fields.title_label", "fields.y_axis_label", "fields.unit_label",
    "fields.min_label", "fields.max_label", "fields.step_label",
    "fields.allow_max_label", "fields.interval_label", "fields.logging_label",
    "fields.enable_logging_label", "fields.enable_logging_desc",
    "fields.target_entity_label", "fields.target_entity_desc",
    "fields.package_label", "fields.package_desc",
    "fields.enable_pause_label", "fields.enable_profiles_label",
    "fields.keyboard_modifiers_title", "fields.keyboard_modifiers_desc",
    "fields.ctrl_label", "fields.shift_label", "fields.alt_label", "fields.def_label",
    "fields.horizontal_step", "fields.vertical_step",
    "fields.language_label", "fields.language_desc",
    "actions.back", "actions.next", "actions.save", "actions.save_and_close",
    "actions.advanced_config", "actions.show_preview", "actions.edit_config",
    "actions.edit_config_desc", "actions.new_config", "actions.new_config_desc",
    "actions.analyze_status", "actions.analyze_status_desc", "actions.component_info",
    "prompts.reset_confirm",
    "notify.language_saved", "notify.language_save_error",
    "ui.card_config_complete", "ui.card_config_ready",
    "ui.minimal_config_complete", "ui.minimal_config_needed", "ui.minimal_config_help",
    "ui.identification_prefix", "ui.prefix_description", "ui.prefix_description_simple",
    "ui.prefix_hint", "ui.prefix_ok", "ui.prefix_bad", "ui.no_matching_entities",
    "ui.current_entity", "ui.not_set",
    "ui.final_mod_title", "ui.final_mod_text",
    "finalmodtitle", "finalmodtext",
  ];

  for (const key of namespacesToCheck) {
    it(`en: "${key}" returns a non-empty string`, () => {
      const result = enI18n._t(key);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  }

  // Keys present only in 'en' (fields not translated in 'it' use fallback)
  const itOnlyKeys = [
    "steps.tipo", "presetNames.thermostat", "presetNames.ev_charging",
    "actions.save", "notify.language_saved", "ui.prefix_ok",
  ];
  for (const key of itOnlyKeys) {
    it(`it: "${key}" returns a string`, () => {
      expect(typeof itI18n._t(key)).toBe("string");
    });
  }
});

// ─── _getPresetName ───────────────────────────────────────────────────────────
describe("EditorI18n – _getPresetName", () => {
  it("returns the name of the selected preset in Italian", () => {
    const i18n = new EditorI18n({ _selectedPreset: "ev_charging", _language: "it" });
    expect(i18n._getPresetName()).toBe("Ricarica EV");
  });

  it("returns the name of the preset in English", () => {
    const i18n = new EditorI18n({ _selectedPreset: "thermostat", _language: "en" });
    expect(i18n._getPresetName()).toBe("Thermostat");
  });

  it("uses 'thermostat' as default preset if _selectedPreset is absent", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._getPresetName()).toBe("Thermostat");
  });

  it("all presets have a name in English", () => {
    const presets = ["thermostat", "ev_charging", "generic_kwh", "generic_temperature", "generic_switch"];
    for (const preset of presets) {
      const i18n = new EditorI18n({ _selectedPreset: preset, _language: "en" });
      expect(typeof i18n._getPresetName()).toBe("string");
    }
  });
});

// ─── _localizePreset ──────────────────────────────────────────────────────────
describe("EditorI18n – _localizePreset", () => {
  it("returns the localized name of the preset in Italian", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._localizePreset("thermostat")).toBe("Termostato");
  });

  it("returns the localized name of the preset in English", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._localizePreset("generic_switch")).toBe("Generic switch");
  });

  it("returns the path for a non-existent preset", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._localizePreset("unknown_preset")).toBe("presetNames.unknown_preset");
  });
});
