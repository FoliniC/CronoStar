// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";

// logger_utils è importato da config.js a livello di modulo; lo mocchiamo prima
vi.mock("../src/utils/logger_utils.js", () => ({ log: vi.fn() }));

import {
  VERSION,
  COLORS,
  CARD_CONFIG_PRESETS,
  DEFAULT_CONFIG,
  CHART_DEFAULTS,
  TIMEOUTS,
  validateConfig,
  normalizeHourBase,
  getStubConfig,
  extractCardConfig,
} from "../src/config.js";

// ─── VERSION ─────────────────────────────────────────────────────────────────
describe("VERSION", () => {
  it("è una stringa", () => expect(typeof VERSION).toBe("string"));
  it('fa fallback a "0.0.0" se window.CRONOSTAR_CARD_VERSION non è definita', () => {
    // window.CRONOSTAR_CARD_VERSION è undefined in jsdom → "0.0.0"
    expect(VERSION).toBe("0.0.0");
  });
});

// ─── COLORS ──────────────────────────────────────────────────────────────────
describe("COLORS", () => {
  it("ha un colore primario", () => expect(COLORS.primary).toBe("#03a9f4"));
  it("ha il colore selected", () => expect(COLORS.selected).toBeDefined());
  it("ha il colore anchor", () => expect(COLORS.anchor).toBeDefined());
  it("ha primaryLight", () => expect(COLORS.primaryLight).toBeDefined());
  it("ha max_value e max_value_border", () => {
    expect(COLORS.max_value).toBeDefined();
    expect(COLORS.max_value_border).toBeDefined();
  });
});

// ─── CARD_CONFIG_PRESETS ──────────────────────────────────────────────────────
describe("CARD_CONFIG_PRESETS", () => {
  it("ha esattamente 5 preset", () => {
    expect(Object.keys(CARD_CONFIG_PRESETS)).toHaveLength(5);
  });

  it("thermostat: is_switch_preset false, allow_max_value false", () => {
    expect(CARD_CONFIG_PRESETS.thermostat.is_switch_preset).toBe(false);
    expect(CARD_CONFIG_PRESETS.thermostat.allow_max_value).toBe(false);
  });

  it("ev_charging: allow_max_value true", () => {
    expect(CARD_CONFIG_PRESETS.ev_charging.allow_max_value).toBe(true);
  });

  it("generic_switch: is_switch_preset true", () => {
    expect(CARD_CONFIG_PRESETS.generic_switch.is_switch_preset).toBe(true);
  });

  it("tutti i preset hanno i campi obbligatori", () => {
    const required = ["title", "y_axis_label", "unit_of_measurement", "min_value", "max_value", "step_value"];
    for (const preset of Object.values(CARD_CONFIG_PRESETS)) {
      for (const key of required) {
        expect(preset[key]).toBeDefined();
      }
    }
  });
});

// ─── DEFAULT_CONFIG ───────────────────────────────────────────────────────────
describe("DEFAULT_CONFIG", () => {
  it("ha not_configured: true", () => expect(DEFAULT_CONFIG.not_configured).toBe(true));
  it("ha il tipo corretto", () => expect(DEFAULT_CONFIG.type).toBe("custom:cronostar-card"));
  it("ha il preset type di default", () => expect(DEFAULT_CONFIG.preset_type).toBe("thermostat"));
});

// ─── CHART_DEFAULTS ───────────────────────────────────────────────────────────
describe("CHART_DEFAULTS", () => {
  it("ha il raggio del punto", () => expect(CHART_DEFAULTS.pointRadius).toBeDefined());
  it("ha il borderWidth", () => expect(CHART_DEFAULTS.borderWidth).toBeDefined());
});

// ─── TIMEOUTS ─────────────────────────────────────────────────────────────────
describe("TIMEOUTS", () => {
  it("ha entityStateWait", () => expect(typeof TIMEOUTS.entityStateWait).toBe("number"));
  it("ha automationSuppression", () => expect(typeof TIMEOUTS.automationSuppression).toBe("number"));
});

// ─── normalizeHourBase ────────────────────────────────────────────────────────
describe("normalizeHourBase", () => {
  // Numeri
  it("numero 0 → { value:0, determined:true }", () =>
    expect(normalizeHourBase(0)).toEqual({ value: 0, determined: true }));
  it("numero 1 → { value:1, determined:true }", () =>
    expect(normalizeHourBase(1)).toEqual({ value: 1, determined: true }));

  // Stringhe → 0
  it('"0" → determinato 0', () => expect(normalizeHourBase("0")).toEqual({ value: 0, determined: true }));
  it('"zero" → determinato 0', () => expect(normalizeHourBase("zero")).toEqual({ value: 0, determined: true }));
  it('"00" → determinato 0', () => expect(normalizeHourBase("00")).toEqual({ value: 0, determined: true }));

  // Stringhe → 1
  it('"1" → determinato 1', () => expect(normalizeHourBase("1")).toEqual({ value: 1, determined: true }));
  it('"one" → determinato 1', () => expect(normalizeHourBase("one")).toEqual({ value: 1, determined: true }));
  it('"01" → determinato 1', () => expect(normalizeHourBase("01")).toEqual({ value: 1, determined: true }));

  // Stringa sconosciuta
  it('"auto" → non determinato', () => expect(normalizeHourBase("auto")).toEqual({ value: 0, determined: false }));
  it('"blah" → non determinato', () => expect(normalizeHourBase("blah")).toEqual({ value: 0, determined: false }));

  // Non stringa né 0/1
  it("undefined → non determinato", () => expect(normalizeHourBase(undefined)).toEqual({ value: 0, determined: false }));
  it("null → non determinato", () => expect(normalizeHourBase(null)).toEqual({ value: 0, determined: false }));
  it("stringa con spazi → trim applicato", () => expect(normalizeHourBase("  1  ")).toEqual({ value: 1, determined: true }));
});

// ─── validateConfig ───────────────────────────────────────────────────────────
describe("validateConfig", () => {
  it("applica il preset thermostat di default", () => {
    const r = validateConfig({ type: "custom:cronostar-card" });
    expect(r.preset_type).toBe("thermostat");
  });

  it("migra la chiave legacy 'preset' → 'preset_type'", () => {
    const r = validateConfig({ preset: "thermostat", global_prefix: "p_", target_entity: "c.x" });
    expect(r.preset_type).toBe("thermostat");
    expect(r.preset).toBeUndefined();
  });

  it("inferisce preset_type dal global_prefix", () => {
    const r = validateConfig({ global_prefix: "cronostar_ev_charging_test_", target_entity: "c.x" });
    expect(r.preset_type).toBe("ev_charging");
  });

  it("non inferisce il preset se il prefix non corrisponde", () => {
    const r = validateConfig({ global_prefix: "something_unknown_" });
    expect(r.preset_type).toBe("thermostat"); // fallback default
  });

  it("non_configured = false se ha prefix + entity", () => {
    const r = validateConfig({ global_prefix: "pfx_", target_entity: "climate.x" });
    expect(r.not_configured).toBe(false);
  });

  it("not_configured rimane true se non c'è entity", () => {
    const r = validateConfig({ not_configured: true });
    expect(r.not_configured).toBe(true);
  });

  it("preserva l'oggetto meta", () => {
    const r = validateConfig({ meta: { language: "it" } });
    expect(r.meta.language).toBe("it");
  });

  it("normalizza hour_base stringa", () => {
    const r = validateConfig({ hour_base: "1" });
    expect(r.hour_base).toEqual({ value: 1, determined: true });
  });

  it("auto-genera global_prefix se mancante", () => {
    const r = validateConfig({ preset_type: "generic_switch" });
    expect(r.global_prefix).toBe("cronostar_generic_switch_");
  });

  it("auto-genera global_prefix per preset sconosciuto", () => {
    const r = validateConfig({ preset_type: "custom_preset" });
    expect(r.global_prefix).toBe("cronostar_custom_preset_");
  });

  it("preserva type dalla config originale", () => {
    const r = validateConfig({ type: "custom:cronostar-card" });
    expect(r.type).toBe("custom:cronostar-card");
  });

  it("usa il preset ev_charging correttamente", () => {
    const r = validateConfig({ preset_type: "ev_charging", global_prefix: "p_", target_entity: "e.x" });
    expect(r.allow_max_value).toBe(true);
  });

  it("usa il preset generic_kwh", () => {
    const r = validateConfig({ preset_type: "generic_kwh" });
    expect(r.unit_of_measurement).toBe("kWh");
  });

  it("usa il preset generic_temperature", () => {
    const r = validateConfig({ preset_type: "generic_temperature" });
    expect(r.unit_of_measurement).toBe("°C");
  });

  it("usa il preset generic_switch", () => {
    const r = validateConfig({ preset_type: "generic_switch" });
    expect(r.is_switch_preset).toBe(true);
  });

  it("accetta preview: true senza errori", () => {
    const r = validateConfig({ preview: true });
    expect(r.preview).toBe(true);
  });
});

// ─── getStubConfig ────────────────────────────────────────────────────────────
describe("getStubConfig", () => {
  it("ritorna un oggetto con not_configured: true", () => {
    expect(getStubConfig().not_configured).toBe(true);
  });

  it("ritorna una copia indipendente da DEFAULT_CONFIG", () => {
    const stub = getStubConfig();
    stub.extra = "x";
    expect(DEFAULT_CONFIG.extra).toBeUndefined();
  });
});

// ─── extractCardConfig ────────────────────────────────────────────────────────
describe("extractCardConfig", () => {
  it("lancia errore se trova la chiave 'preset' deprecata", () => {
    expect(() => extractCardConfig({ preset: "thermostat", global_prefix: "p_" })).toThrow();
  });

  it("filtra chiavi non valide", () => {
    const r = extractCardConfig({ global_prefix: "p_", unknown_key: "x", hack: true });
    expect(r.unknown_key).toBeUndefined();
    expect(r.hack).toBeUndefined();
    expect(r.global_prefix).toBe("p_");
  });

  it("aggiunge type di default se assente in src", () => {
    const r = extractCardConfig({ global_prefix: "p_" });
    expect(r.type).toBe("custom:cronostar-card");
  });

  it("non sovrascrive type se già presente", () => {
    const r = extractCardConfig({ type: "custom:other", global_prefix: "p_" });
    expect(r.type).toBe("custom:other");
  });

  it("salta valori null/undefined", () => {
    const r = extractCardConfig({ global_prefix: null, target_entity: undefined });
    expect(r.global_prefix).toBeUndefined();
    expect(r.target_entity).toBeUndefined();
  });

  it("include tutte le chiavi valide se presenti", () => {
    const src = {
      type: "custom:cronostar-card",
      preset_type: "thermostat",
      global_prefix: "pfx_",
      target_entity: "climate.x",
      enabled_entity: "switch.x",
      profiles_select_entity: "input_select.x",
      min_value: 15,
      max_value: 30,
      step_value: 0.5,
      unit_of_measurement: "°C",
      y_axis_label: "Temp",
      allow_max_value: false,
      logging_enabled: true,
      hour_base: "auto",
      title: "Test",
      step: 1,
      language: "en",
      not_configured: false,
      kb_ctrl_h: 1,
      kb_ctrl_v: 0.1,
      kb_shift_h: 30,
      kb_shift_v: 1,
      kb_alt_h: 60,
      kb_alt_v: 5,
      kb_def_h: 5,
      kb_def_v: 0.5,
    };
    const r = extractCardConfig(src);
    expect(r.preset_type).toBe("thermostat");
    expect(r.language).toBe("en");
    expect(r.kb_ctrl_h).toBe(1);
  });

  it("funziona con oggetto vuoto (ritorna solo type default)", () => {
    const r = extractCardConfig({});
    expect(r.type).toBe("custom:cronostar-card");
  });
});
