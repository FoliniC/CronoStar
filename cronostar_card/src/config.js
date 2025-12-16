/** Configuration management for CronoStar Card with Interval Support */
export const VERSION = '4.3.3';

// Interval options (minutes)
export const INTERVAL_OPTIONS = [
  { value: 60, label: '1 hour (24 points)', points: 24 },
  { value: 30, label: '30 minutes (48 points)', points: 48 },
  { value: 15, label: '15 minutes (96 points)', points: 96 },
  { value: 10, label: '10 minutes (144 points)', points: 144 },
  { value: 1, label: '1 minute (1440 points)', points: 1440 }
];

export const CARD_CONFIG_PRESETS = {
  thermostat: {
    title: "CronoStar Thermostat",
    entity_prefix: "cronostar_temp_",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 15,
    max_value: 30,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_temp_paused",
    profiles_select_entity: "input_select.cronostar_temp_profiles",
    apply_entity: "climate.climatizzazione_appartamento",
    is_switch_preset: false,
    allow_max_value: false,
    interval_minutes: 60  // Default: hourly
  },
  ev_charging: {
    title: "CronoStar EV Charging",
    entity_prefix: "cronostar_ev_",
    y_axis_label: "Power",
    unit_of_measurement: 'kW',
    min_value: 0,
    max_value: 8.0,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_ev_paused",
    profiles_select_entity: "input_select.cronostar_ev_profiles",
    apply_entity: "number.your_ev_charger_power",
    is_switch_preset: false,
    allow_max_value: true,
    interval_minutes: 60
  },
  generic_kwh: {
    title: "CronoStar Generic kWh",
    entity_prefix: "cronostar_kwh_",
    y_axis_label: "Energy",
    unit_of_measurement: 'kWh',
    min_value: 0,
    max_value: 7,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_kwh_paused",
    profiles_select_entity: "input_select.cronostar_kwh_profiles",
    apply_entity: null,
    is_switch_preset: false,
    allow_max_value: false,
    interval_minutes: 60
  },
  generic_temperature: {
    title: "CronoStar Generic Temperature",
    entity_prefix: "cronostar_gentemp_",
    y_axis_label: "Temperature",
    unit_of_measurement: '°C',
    min_value: 0,
    max_value: 40,
    step_value: 0.5,
    pause_entity: "input_boolean.cronostar_gentemp_paused",
    profiles_select_entity: "input_select.cronostar_gentemp_profiles",
    apply_entity: null,
    is_switch_preset: false,
    allow_max_value: false,
    interval_minutes: 60
  },
  generic_switch: {
    title: "CronoStar Generic Switch",
    entity_prefix: "cronostar_switch_",
    y_axis_label: "State",
    unit_of_measurement: '',
    min_value: 0,
    max_value: 1,
    step_value: 1,
    pause_entity: "input_boolean.cronostar_switch_paused",
    profiles_select_entity: "input_select.cronostar_switch_profiles",
    apply_entity: "switch.your_generic_switch",
    is_switch_preset: true,
    allow_max_value: false,
    interval_minutes: 60
  }
};

export const DEFAULT_CONFIG = {
  preset: 'thermostat',
  hour_base: "auto",
  logging_enabled: true,
  pause_entity: null,
  profiles_select_entity: null,
  apply_entity: null,
  allow_max_value: false,
  interval_minutes: 60,  // Default interval
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
  tension: 0.4
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

export const COLORS = {
  primary: "rgba(3, 169, 244, 1)",
  primaryLight: "rgba(3, 169, 244, 0.2)",
  selected: "red",
  selectedDark: "darkred",
  anchor: "#ff5252",
  anchorDark: "#b71c1c",
  max_value: '#FFD700',
  max_value_border: '#DAA520'
};

/**
 * Calculate number of points based on interval
 * @param {number} intervalMinutes - Interval in minutes
 * @returns {number} Number of points in 24 hours
 */
export function getPointsCount(intervalMinutes) {
  return Math.floor(1440 / intervalMinutes); // 1440 minutes in 24 hours
}

/**
 * Get interval configuration by value
 * @param {number} intervalMinutes - Interval value
 * @returns {Object} Interval configuration
 */
export function getIntervalConfig(intervalMinutes) {
  return INTERVAL_OPTIONS.find(opt => opt.value === intervalMinutes) || INTERVAL_OPTIONS[0];
}

/**
 * Validate configuration with interval support
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validated configuration
 */
export function validateConfig(config) {
  const presetName = config.preset || DEFAULT_CONFIG.preset;
  const presetConfig = CARD_CONFIG_PRESETS[presetName] || CARD_CONFIG_PRESETS.thermostat;

  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...presetConfig,
    ...config
  };

  if (!mergedConfig.entity_prefix) {
    throw new Error("Configuration error: entity_prefix is required");
  }
  
  // Validate interval
  const interval = mergedConfig.interval_minutes;
  if (!INTERVAL_OPTIONS.some(opt => opt.value === interval)) {
    mergedConfig.interval_minutes = 60; // Fallback to hourly
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