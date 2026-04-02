// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Sopprime il log "Missing translation" dallo stderr ──────────────────────
vi.mock("../src/utils/logger_utils.js", () => ({ log: vi.fn() }));

import { EditorI18n, I18N } from "../src/editor/EditorI18n.js";
import { log } from "../src/utils/logger_utils.js";

// ─── _t – lingua di base ──────────────────────────────────────────────────────
describe("EditorI18n – _t lingua", () => {
  it("ritorna la traduzione inglese di default (editor oggetto senza _language)", () => {
    const i18n = new EditorI18n({});
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("ritorna la traduzione inglese esplicita", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("supporta la lingua italiana", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._t("actions.save")).toBe("Salva");
  });

  it("gestisce sub-tag en-US → en", () => {
    const i18n = new EditorI18n({ _language: "en-US" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("gestisce sub-tag it-IT → it (editor come oggetto)", () => {
    const i18n = new EditorI18n({ _language: "it-IT" });
    expect(i18n._t("steps.tipo")).toBe("Setup");
  });

  it("gestisce sub-tag it-IT → it (editor come stringa)", () => {
    const i18n = new EditorI18n("it-IT");
    expect(i18n._t("steps.tipo")).toBe("Setup");
  });

  it("usa _lang come fallback quando _language è assente", () => {
    const i18n = new EditorI18n({ _lang: "it" });
    expect(i18n._t("actions.save")).toBe("Salva");
  });

  it("usa 'en' se editor è null", () => {
    const i18n = new EditorI18n(null);
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("usa 'en' se editor è undefined", () => {
    const i18n = new EditorI18n(undefined);
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("usa 'en' se editor è una stringa sconosciuta senza trattino", () => {
    // 'fr' non esiste in I18N → fallback I18N.en
    const i18n = new EditorI18n({ _language: "fr" });
    expect(i18n._t("actions.save")).toBe("Save");
  });

  it("usa 'en' per sub-tag di lingua sconosciuta (es. fr-FR)", () => {
    const i18n = new EditorI18n({ _language: "fr-FR" });
    expect(i18n._t("actions.save")).toBe("Save");
  });
});

// ─── _t – chiave mancante ─────────────────────────────────────────────────────
describe("EditorI18n – _t chiave mancante", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ritorna il path se la traduzione manca in entrambe le lingue", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("missing.key")).toBe("missing.key");
  });

  it("chiama log('warn', ...) quando la traduzione manca", () => {
    const i18n = new EditorI18n({ _language: "en" });
    i18n._t("totally.missing.key");
    expect(log).toHaveBeenCalledWith(
      "warn",
      undefined,
      expect.stringContaining("totally.missing.key"),
    );
  });

  it("usa il fallback inglese se la chiave manca solo nella lingua corrente", () => {
    // Simula chiave presente in 'en' ma non in 'it': usiamo una chiave reale
    // 'descriptions.step0' esiste in entrambe, verifichiamo solo che il fallback funzioni
    // Patch temporanea dell'oggetto I18N per questo test
    const originalIt = I18N.it.descriptions.step0;
    delete I18N.it.descriptions.step0;
    const i18n = new EditorI18n({ _language: "it" });
    const result = i18n._t("descriptions.step0");
    // Deve tornare il valore inglese
    expect(result).toBe(I18N.en.descriptions.step0);
    // Ripristina
    I18N.it.descriptions.step0 = originalIt;
  });

  it("ritorna il path se la chiave manca anche nel fallback inglese", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._t("ghost.key")).toBe("ghost.key");
  });

  it("usa logging_enabled dal config se disponibile", () => {
    const i18n = new EditorI18n({ _language: "en", _config: { logging: true } });
    i18n._t("another.missing");
    expect(log).toHaveBeenCalled();
  });
});

// ─── _t – rimpiazzi dinamici ──────────────────────────────────────────────────
describe("EditorI18n – _t rimpiazzi", () => {
  it("effettua rimpiazzi dinamici con placeholder", () => {
    const i18n = new EditorI18n({ _language: "en" });
    const msg = i18n._t("notify.language_save_error", { "{error}": "FAILED" });
    expect(msg).toBe("Error saving language preference: FAILED");
  });

  it("effettua rimpiazzi multipli nella stessa stringa", () => {
    // Patch temporanea per testare rimpiazzi multipli
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

  it("rimpiazza tutte le occorrenze globalmente (regex 'g')", () => {
    const original = I18N.en.ui.no_matching_entities;
    I18N.en.ui.no_matching_entities = "{x} and {x}";
    const i18n = new EditorI18n({ _language: "en" });
    const result = i18n._t("ui.no_matching_entities", { "{x}": "TEST" });
    expect(result).toBe("TEST and TEST");
    I18N.en.ui.no_matching_entities = original;
  });

  it("non effettua rimpiazzi se replacements è vuoto", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._t("actions.save", {})).toBe("Save");
  });

  it("rimpiazzi in italiano", () => {
    const i18n = new EditorI18n({ _language: "it" });
    const msg = i18n._t("notify.language_save_error", { "{error}": "ERRORE" });
    expect(msg).toBe("Errore nel salvataggio della lingua: ERRORE");
  });

  it("escape dei caratteri speciali regex nel placeholder", () => {
    // Patch per testare un placeholder con caratteri speciali come '.'
    const original = I18N.en.ui.prefix_ok;
    I18N.en.ui.prefix_ok = "Value is {val.ue}";
    const i18n = new EditorI18n({ _language: "en" });
    const result = i18n._t("ui.prefix_ok", { "{val.ue}": "42" });
    expect(result).toBe("Value is 42");
    I18N.en.ui.prefix_ok = original;
  });
});

// ─── _t – accesso a tutti i namespace (coverage completo di I18N) ─────────────
describe("EditorI18n – copertura namespace I18N", () => {
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
    it(`en: "${key}" ritorna una stringa non vuota`, () => {
      const result = enI18n._t(key);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  }

  // Chiavi presenti solo in 'en' (campi non tradotti in 'it' usano fallback)
  const itOnlyKeys = [
    "steps.tipo", "presetNames.thermostat", "presetNames.ev_charging",
    "actions.save", "notify.language_saved", "ui.prefix_ok",
  ];
  for (const key of itOnlyKeys) {
    it(`it: "${key}" ritorna una stringa`, () => {
      expect(typeof itI18n._t(key)).toBe("string");
    });
  }
});

// ─── _getPresetName ───────────────────────────────────────────────────────────
describe("EditorI18n – _getPresetName", () => {
  it("ritorna il nome del preset selezionato in italiano", () => {
    const i18n = new EditorI18n({ _selectedPreset: "ev_charging", _language: "it" });
    expect(i18n._getPresetName()).toBe("Ricarica EV");
  });

  it("ritorna il nome del preset in inglese", () => {
    const i18n = new EditorI18n({ _selectedPreset: "thermostat", _language: "en" });
    expect(i18n._getPresetName()).toBe("Thermostat");
  });

  it("usa 'thermostat' come preset di default se _selectedPreset è assente", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._getPresetName()).toBe("Thermostat");
  });

  it("tutti i preset hanno un nome in inglese", () => {
    const presets = ["thermostat", "ev_charging", "generic_kwh", "generic_temperature", "generic_switch"];
    for (const preset of presets) {
      const i18n = new EditorI18n({ _selectedPreset: preset, _language: "en" });
      expect(typeof i18n._getPresetName()).toBe("string");
    }
  });
});

// ─── _localizePreset ──────────────────────────────────────────────────────────
describe("EditorI18n – _localizePreset", () => {
  it("ritorna il nome localizzato del preset in italiano", () => {
    const i18n = new EditorI18n({ _language: "it" });
    expect(i18n._localizePreset("thermostat")).toBe("Termostato");
  });

  it("ritorna il nome localizzato del preset in inglese", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._localizePreset("generic_switch")).toBe("Generic switch");
  });

  it("ritorna il path per un preset inesistente", () => {
    const i18n = new EditorI18n({ _language: "en" });
    expect(i18n._localizePreset("unknown_preset")).toBe("presetNames.unknown_preset");
  });
});
