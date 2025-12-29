/** Configuration management for CronoStar Card with Interval Support */
export const VERSION = window.CRONOSTAR_CARD_VERSION || '5.3.0';

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

// Interval options (minutes)
// Sparse mode: remove interval options

export const CARD_CONFIG_PRESETS = {
  thermostat: {
    title: "CronoStar Thermostat",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 15,
    max_value: 30,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_temp_paused",
    profiles_select_entity: "input_select.cronostar_temp_profiles",
    target_entity: "climate.climatizzazione_appartamento",
    is_switch_preset: false,
    allow_max_value: false,
    // sparse mode: no interval
  },
  ev_charging: {
    title: "CronoStar EV Charging",
    y_axis_label: "Power",
    unit_of_measurement: 'kW',
    min_value: 0,
    max_value: 8.0,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_ev_paused",
    profiles_select_entity: "input_select.cronostar_ev_profiles",
    target_entity: "number.your_ev_charger_power",
    is_switch_preset: false,
    allow_max_value: true,
    // sparse mode: no interval
  },
  generic_kwh: {
    title: "CronoStar Generic kWh",
    y_axis_label: "Energy",
    unit_of_measurement: 'kWh',
    min_value: 0,
    max_value: 7,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_kwh_paused",
    profiles_select_entity: "input_select.cronostar_kwh_profiles",
    target_entity: null,
    is_switch_preset: false,
    allow_max_value: false,
    // sparse mode: no interval
  },
  generic_temperature: {
    title: "CronoStar Generic Temperature",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 0,
    max_value: 40,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_gentemp_paused",
    profiles_select_entity: "input_select.cronostar_gentemp_profiles",
    target_entity: null,
    is_switch_preset: false,
    allow_max_value: false,
    // sparse mode: no interval
  },
  generic_switch: {
    title: "CronoStar Generic Switch",
    y_axis_label: "State",
    unit_of_measurement: '',
    min_value: 0,
    max_value: 1,
    step_value: 1,
    pause_entity: "input_boolean.cronostar_switch_paused",
    profiles_select_entity: "input_select.cronostar_switch_profiles",
    target_entity: "switch.your_generic_switch",
    is_switch_preset: true,
    allow_max_value: false,
    // sparse mode: no interval
  }
};

export const DEFAULT_CONFIG = {
  type: 'custom:cronostar-card',
  preset: 'thermostat',
  hour_base: "auto",
  logging_enabled: true,
  pause_entity: null,
  profiles_select_entity: null,
  target_entity: null,
  allow_max_value: false,
  missing_yaml_style: 'named'
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
 * Normalize alias keys used in Lovelace YAML (no-underscore) to the canonical
 * underscore-based keys expected by the card/editor/backend.
 */
export function normalizeConfigAliases(cfg = {}) {
  const out = { ...cfg };
  const pairs = [
    ['global_prefix', 'globalprefix'],
    ['target_entity', 'targetentity'],
    ['target_entity', 'apply_entity'],
    ['target_entity', 'applyentity'],
    ['pause_entity', 'pauseentity'],
    ['profiles_select_entity', 'profilesselectentity'],
    ['min_value', 'minvalue'],
    ['max_value', 'maxvalue'],
    ['step_value', 'stepvalue'],
    ['unit_of_measurement', 'unitofmeasurement'],
    ['y_axis_label', 'yaxislabel'],
    ['allow_max_value', 'allowmaxvalue'],
    ['logging_enabled', 'loggingenabled'],
    ['missing_yaml_style', 'missingyamlstyle']
  ];
  for (const [canonical, alias] of pairs) {
    const a = out[alias];
    const c = out[canonical];
    if ((a !== undefined && a !== null && a !== '') && (c === undefined || c === null || c === '')) {
      out[canonical] = a;
    }
  }
  return out;
}

// Sparse mode: getPointsCount removed

// Sparse mode: getIntervalConfig removed

/**
 * Validate configuration with interval support
 * - merges defaults, preset defaults, and user config
 * - ensures alias keys are normalized before merging
 */
export function validateConfig(config) {
  const normalized = normalizeConfigAliases(config);

  // Explicitly remove legacy aliases from the final object to avoid confusion in logs/ui
  const aliasesToRemove = [
    'globalprefix', 'targetentity', 'apply_entity', 'applyentity',
    'pauseentity', 'profilesselectentity', 'minvalue', 'maxvalue',
    'stepvalue', 'unitofmeasurement', 'yaxislabel', 'allowmaxvalue',
    'loggingenabled', 'missingyamlstyle'
  ];
  for (const alias of aliasesToRemove) {
    delete normalized[alias];
  }

  const presetName = normalized.preset || DEFAULT_CONFIG.preset;
  const presetConfig = CARD_CONFIG_PRESETS[presetName] || CARD_CONFIG_PRESETS.thermostat;
  const mergedConfig = { ...DEFAULT_CONFIG, ...presetConfig, ...normalized };

  // CRITICAL: Ensure card type is always correct and stable
  mergedConfig.type = config.type || DEFAULT_CONFIG.type;

  if (!mergedConfig.global_prefix) {
    throw new Error("Configuration error: global_prefix is required");
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
  const validKeys = [
    'type', 'preset', 'global_prefix', 'target_entity', 'pause_entity',
    'profiles_select_entity', 'min_value', 'max_value', 'step_value',
    'unit_of_measurement', 'y_axis_label', 'allow_max_value',
    'logging_enabled', 'hour_base', 'title', 'missing_yaml_style',
    'interval_minutes', 'step'
  ];
  const out = {};
  for (const key of validKeys) {
    if (src[key] !== undefined && src[key] !== null) {
      out[key] = src[key];
    }
  }
  // Map preset_type (backend) to preset (frontend)
  if (src.preset_type && !out.preset) {
    out.preset = src.preset_type;
  }
  // Ensure type is preserved if explicitly passed as preset type or missing
  if (src.type === undefined && out.type === undefined) {
    out.type = 'custom:cronostar-card';
  }
  return out;
}