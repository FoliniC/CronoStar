// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// logger_utils is imported from config.js at module level; we mock it first
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
  it("is a string", () => expect(typeof VERSION).toBe("string"));
  it('falls back to "6.8.6" if window.CRONOSTAR_CARD_VERSION is not defined', () => {
    // window.CRONOSTAR_CARD_VERSION is undefined in jsdom → "6.8.6"
    expect(VERSION).toBe("6.8.6");
  });
});

// ─── COLORS ──────────────────────────────────────────────────────────────────
describe("COLORS", () => {
  it("has a primary color", () => expect(COLORS.primary).toBe("#03a9f4"));
  it("has the selected color", () => expect(COLORS.selected).toBeDefined());
  it("has the anchor color", () => expect(COLORS.anchor).toBeDefined());
  it("has primaryLight", () => expect(COLORS.primaryLight).toBeDefined());
  it("has max_value and max_value_border", () => {
    expect(COLORS.max_value).toBeDefined();
    expect(COLORS.max_value_border).toBeDefined();
  });
});

// ─── CARD_CONFIG_PRESETS ──────────────────────────────────────────────────────
describe("CARD_CONFIG_PRESETS", () => {
  it("has exactly 5 presets", () => {
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

  it("all presets have required fields", () => {
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
  it("has not_configured: true", () => expect(DEFAULT_CONFIG.not_configured).toBe(true));
  it("has the correct type", () => expect(DEFAULT_CONFIG.type).toBe("custom:cronostar-card"));
  it("has the default preset type", () => expect(DEFAULT_CONFIG.preset_type).toBe("thermostat"));
});

// ─── CHART_DEFAULTS ───────────────────────────────────────────────────────────
describe("CHART_DEFAULTS", () => {
  it("has the point radius", () => expect(CHART_DEFAULTS.pointRadius).toBeDefined());
  it("has the borderWidth", () => expect(CHART_DEFAULTS.borderWidth).toBeDefined());
});

// ─── TIMEOUTS ─────────────────────────────────────────────────────────────────
describe("TIMEOUTS", () => {
  it("has entityStateWait", () => expect(typeof TIMEOUTS.entityStateWait).toBe("number"));
  it("has automationSuppression", () => expect(typeof TIMEOUTS.automationSuppression).toBe("number"));
});

// ─── normalizeHourBase ────────────────────────────────────────────────────────
describe("normalizeHourBase", () => {
  // Numbers
  it("number 0 → { value:0, determined:true }", () =>
    expect(normalizeHourBase(0)).toEqual({ value: 0, determined: true }));
  it("number 1 → { value:1, determined:true }", () =>
    expect(normalizeHourBase(1)).toEqual({ value: 1, determined: true }));

  // Strings → 0
  it('"0" → determined 0', () => expect(normalizeHourBase("0")).toEqual({ value: 0, determined: true }));
  it('"zero" → determined 0', () => expect(normalizeHourBase("zero")).toEqual({ value: 0, determined: true }));
  it('"00" → determined 0', () => expect(normalizeHourBase("00")).toEqual({ value: 0, determined: true }));

  // Strings → 1
  it('"1" → determined 1', () => expect(normalizeHourBase("1")).toEqual({ value: 1, determined: true }));
  it('"one" → determined 1', () => expect(normalizeHourBase("one")).toEqual({ value: 1, determined: true }));
  it('"01" → determined 1', () => expect(normalizeHourBase("01")).toEqual({ value: 1, determined: true }));

  // Unknown string
  it('"auto" → not determined', () => expect(normalizeHourBase("auto")).toEqual({ value: 0, determined: false }));
  it('"blah" → not determined', () => expect(normalizeHourBase("blah")).toEqual({ value: 0, determined: false }));

  // Not a string nor 0/1
  it("undefined → not determined", () => expect(normalizeHourBase(undefined)).toEqual({ value: 0, determined: false }));
  it("null → not determined", () => expect(normalizeHourBase(null)).toEqual({ value: 0, determined: false }));
  it("string with spaces → trim applied", () => expect(normalizeHourBase("  1  ")).toEqual({ value: 1, determined: true }));
});

// ─── validateConfig ───────────────────────────────────────────────────────────
describe("validateConfig", () => {
  it("applies the default thermostat preset", () => {
    const r = validateConfig({ type: "custom:cronostar-card" });
    expect(r.preset_type).toBe("thermostat");
  });

  it("handles undefined config without errors", () => {
    const r = validateConfig(undefined);
    expect(r.type).toBe("custom:cronostar-card");
    expect(r.preset_type).toBe("thermostat");
  });

  it("migrates legacy 'preset' key → 'preset_type'", () => {
    const r = validateConfig({ preset: "thermostat", global_prefix: "p_", target_entity: "c.x" });
    expect(r.preset_type).toBe("thermostat");
    expect(r.preset).toBeUndefined();
  });

  it("infers preset_type from global_prefix", () => {
    const r = validateConfig({ global_prefix: "cronostar_ev_charging_test_", target_entity: "c.x" });
    expect(r.preset_type).toBe("ev_charging");
  });

  it("does not infer preset if prefix does not match", () => {
    const r = validateConfig({ global_prefix: "something_unknown_" });
    expect(r.preset_type).toBe("thermostat"); // default fallback
  });

  it("non_configured = false if it has prefix + entity", () => {
    const r = validateConfig({ global_prefix: "pfx_", target_entity: "climate.x" });
    expect(r.not_configured).toBe(false);
  });

  it("not_configured remains true if there is no entity", () => {
    const r = validateConfig({ not_configured: true });
    expect(r.not_configured).toBe(true);
  });

  it("preserves the meta object", () => {
    const r = validateConfig({ meta: { language: "it" } });
    expect(r.meta.language).toBe("it");
  });

  it("normalizes hour_base string", () => {
    const r = validateConfig({ hour_base: "1" });
    expect(r.hour_base).toEqual({ value: 1, determined: true });
  });

  it("does not auto-generate global_prefix if missing", () => {
    const r = validateConfig({ preset_type: "generic_switch" });
    expect(r.global_prefix).toBeUndefined();
  });

  it("does not auto-generate global_prefix for unknown preset", () => {
    const r = validateConfig({ preset_type: "custom_preset" });
    expect(r.global_prefix).toBeUndefined();
  });

  it("preserves type from original config", () => {
    const r = validateConfig({ type: "custom:cronostar-card" });
    expect(r.type).toBe("custom:cronostar-card");
  });

  it("uses ev_charging preset correctly", () => {
    const r = validateConfig({ preset_type: "ev_charging", global_prefix: "p_", target_entity: "e.x" });
    expect(r.allow_max_value).toBe(true);
  });

  it("uses generic_kwh preset", () => {
    const r = validateConfig({ preset_type: "generic_kwh" });
    expect(r.unit_of_measurement).toBe("kWh");
  });

  it("uses generic_temperature preset", () => {
    const r = validateConfig({ preset_type: "generic_temperature" });
    expect(r.unit_of_measurement).toBe("°C");
  });

  it("uses generic_switch preset", () => {
    const r = validateConfig({ preset_type: "generic_switch" });
    expect(r.is_switch_preset).toBe(true);
  });

  it("accepts preview: true without errors", () => {
    const r = validateConfig({ preview: true });
    expect(r.preview).toBe(true);
  });
});

// ─── getStubConfig ────────────────────────────────────────────────────────────
describe("getStubConfig", () => {
  it("returns an object with not_configured: true", () => {
    expect(getStubConfig().not_configured).toBe(true);
  });

  it("returns a copy independent of DEFAULT_CONFIG", () => {
    const stub = getStubConfig();
    stub.extra = "x";
    expect(DEFAULT_CONFIG.extra).toBeUndefined();
  });
});

// ─── extractCardConfig ────────────────────────────────────────────────────────
describe("extractCardConfig", () => {
  it("throws an error if it finds the deprecated 'preset' key", () => {
    expect(() => extractCardConfig({ preset: "thermostat", global_prefix: "p_" })).toThrow();
  });

  it("throws an error if it finds 'preset' with missing global_prefix (branch coverage)", () => {
    expect(() => extractCardConfig({ preset: "thermostat" })).toThrow(/cronostar_thermostat_prefix_data.json/);
  });

  it("throws an error if it finds 'preset' with global_prefix full of underscores", () => {
    expect(() => extractCardConfig({ preset: "thermostat", global_prefix: "p___" })).toThrow(/cronostar_thermostat_p_data.json/);
  });

  it("filters invalid keys", () => {
    const r = extractCardConfig({ global_prefix: "p_", unknown_key: "x", hack: true });
    expect(r.unknown_key).toBeUndefined();
    expect(r.hack).toBeUndefined();
    expect(r.global_prefix).toBe("p_");
  });

  it("adds default type if absent in src", () => {
    const r = extractCardConfig({ global_prefix: "p_" });
    expect(r.type).toBe("custom:cronostar-card");
  });

  it("does not overwrite type if already present", () => {
    const r = extractCardConfig({ type: "custom:other", global_prefix: "p_" });
    expect(r.type).toBe("custom:other");
  });

  it("skips null/undefined values", () => {
    const r = extractCardConfig({ global_prefix: null, target_entity: undefined });
    expect(r.global_prefix).toBeUndefined();
    expect(r.target_entity).toBeUndefined();
  });

  it("includes all valid keys if present", () => {
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

  it("works with an empty object (returns only default type)", () => {
    const r = extractCardConfig({});
    expect(r.type).toBe("custom:cronostar-card");
  });
});
