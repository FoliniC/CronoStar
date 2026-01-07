/** Configuration management for CronoStar Card */
import { log } from './utils/logger_utils.js';
export const VERSION = window.CRONOSTAR_CARD_VERSION || '5.3.5';

export const COLORS = {
  primary: "#03a9f4",
  primaryLight: "rgba(3, 169, 244, 0.2)",
  selected: "#ff0000",
  selectedDark: "#8b0000",
  anchor: "#ff5252",
  anchorDark: "#b71c1c",
  max_value: "#ffd700",
  max_value_border: "#daa520"
};

export const CARD_CONFIG_PRESETS = {
  thermostat: {
    title: "CronoStar Thermostat",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 15,
    max_value: 30,
    step_value: 0.5,
    enabled_entity: null,
    profiles_select_entity: null,
    target_entity: "climate.climatizzazione_appartamento",
    is_switch_preset: false,
    allow_max_value: false
  },
  ev_charging: {
    title: "CronoStar EV Charging",
    y_axis_label: "Power",
    unit_of_measurement: 'kW',
    min_value: 0,
    max_value: 8.0,
    step_value: 0.5,
    enabled_entity: null,
    profiles_select_entity: null,
    target_entity: "number.your_ev_charger_power",
    is_switch_preset: false,
    allow_max_value: true
  },
  generic_kwh: {
    title: "CronoStar Generic kWh",
    y_axis_label: "Energy",
    unit_of_measurement: 'kWh',
    min_value: 0,
    max_value: 7,
    step_value: 0.5,
    enabled_entity: null,
    profiles_select_entity: null,
    target_entity: null,
    is_switch_preset: false,
    allow_max_value: false
  },
  generic_temperature: {
    title: "CronoStar Generic Temperature",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 0,
    max_value: 40,
    step_value: 0.5,
    enabled_entity: null,
    profiles_select_entity: null,
    target_entity: null,
    is_switch_preset: false,
    allow_max_value: false
  },
  generic_switch: {
    title: "CronoStar Generic Switch",
    y_axis_label: "State",
    unit_of_measurement: '',
    min_value: 0,
    max_value: 1,
    step_value: 1,
    enabled_entity: null,
    profiles_select_entity: null,
    target_entity: "switch.your_generic_switch",
    is_switch_preset: true,
    allow_max_value: false
  }
};

export const DEFAULT_CONFIG = {
  type: 'custom:cronostar-card',
  preset_type: 'thermostat',
  hour_base: "auto",
  logging_enabled: true,
  enabled_entity: null,
  profiles_select_entity: null,
  target_entity: null,
  allow_max_value: false
};

export const CHART_DEFAULTS = {
  minTemperature: 0,
  maxTemperature: 50,
  suggestedMinTemperature: 15,
  suggestedMaxTemperature: 30,
  temperatureStep: 0.5,
  pointRadius: 5,
  pointHoverRadius: 8,
  pointHitRadius: 10,
  pointMaxRadius: 8,
  borderWidth: 2,
  tension: 0
};

export const TIMEOUTS = {
  entityStateWait: 3000,
  entityNumericStateWait: 4000,
  scriptCompletion: 5000,
  statePropagation: 600,
  clickSuppression: 500,
  menuSuppression: 1000,
  automationSuppression: 7000,
  editingGraceMs: 45000,
  mismatchPersistenceMs: 20000
};

/**
 * Validate configuration
 * - merges defaults, preset defaults, and user config
 */
export function validateConfig(config, isLoggingEnabled = false) {
  const normalized = { ...config };

  // Auto-migrate legacy 'preset' to 'preset_type'
  if (normalized.preset && !normalized.preset_type) {
    normalized.preset_type = normalized.preset;
    delete normalized.preset;
  }

  // ✅ IMPROVED: Infer preset from global_prefix if preset_type is missing
  if (!normalized.preset_type && normalized.global_prefix) {
    const prefix = normalized.global_prefix;
    for (const key of Object.keys(CARD_CONFIG_PRESETS)) {
      if (prefix.startsWith(`cronostar_${key}_`)) {
        normalized.preset_type = key;
        break;
      }
    }
  }

  const presetName = normalized.preset_type || DEFAULT_CONFIG.preset_type;
  const presetConfig = CARD_CONFIG_PRESETS[presetName] || CARD_CONFIG_PRESETS.thermostat;
  const mergedConfig = { ...DEFAULT_CONFIG, ...presetConfig, ...normalized };

  // Preserve meta object if provided (including language preference)
  if (config && typeof config.meta === 'object') {
    mergedConfig.meta = { ...config.meta };
  }

  // CRITICAL: Ensure card type is always correct and stable
  mergedConfig.type = config.type || DEFAULT_CONFIG.type;

  // Ensure global_prefix is present
  if (!mergedConfig.global_prefix) {
    const tags = {
      'thermostat': 'thermostat',
      'ev_charging': 'ev_charging',
      'generic_kwh': 'generic_kwh',
      'generic_temperature': 'generic_temperature',
      'generic_switch': 'generic_switch'
    };
    const tag = tags[presetName] || presetName;
    mergedConfig.global_prefix = `cronostar_${tag}_`;
    log('info', isLoggingEnabled, "Configuration: missing global_prefix initialized to " + mergedConfig.global_prefix);
  }

  if (!config.not_configured) {
    if (!mergedConfig.enabled_entity) {
      mergedConfig.enabled_entity = `switch.${mergedConfig.global_prefix}enabled`;
    }
    if (!mergedConfig.profiles_select_entity) {
      mergedConfig.profiles_select_entity = `select.${mergedConfig.global_prefix}current_profile`;
    }
  }

  mergedConfig.hour_base = normalizeHourBase(mergedConfig.hour_base);

  return mergedConfig;
}

export function normalizeHourBase(hourBase) {
  if (hourBase === 0 || hourBase === 1) {
    return { value: hourBase, determined: true };
  }
  if (typeof hourBase === 'string') {
    const norm = hourBase.trim().toLowerCase();
    if (norm === '0' || norm === 'zero' || norm === '00') {
      return { value: 0, determined: true };
    }
    if (norm === '1' || norm === 'one' || norm === '01') {
      return { value: 1, determined: true };
    }
  }
  return { value: 0, determined: false };
}

export function getStubConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * Filter an object to keep only keys that are valid for the card configuration.
 * Prevents metadata pollution from backend responses.
 */
export function extractCardConfig(src = {}) {
  if (src.preset) {
    const prefix = (src.global_prefix || '').replace(/_+$/, '') || 'prefix';
    const filename = `cronostar_${src.preset}_${prefix}_data.json`;
    throw new Error(`Configuration error: 'preset' key found in ${filename} metadata, use 'preset_type' instead.`);
  }
  const validKeys = [
    'type', 'preset_type', 'global_prefix', 'target_entity', 'enabled_entity',
    'profiles_select_entity', 'min_value', 'max_value', 'step_value',
    'unit_of_measurement', 'y_axis_label', 'allow_max_value',
    'logging_enabled', 'hour_base', 'title', 'step',
    'kb_ctrl_h', 'kb_ctrl_v', 'kb_shift_h', 'kb_shift_v', 'kb_alt_h', 'kb_alt_v',
    'kb_def_h', 'kb_def_v'
  ];
  const out = {};
  for (const key of validKeys) {
    if (src[key] !== undefined && src[key] !== null) {
      out[key] = src[key];
    }
  }
  if (src.type === undefined && out.type === undefined) {
    out.type = 'custom:cronostar-card';
  }
  return out;
}
