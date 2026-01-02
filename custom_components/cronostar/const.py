"""Constants for the CronoStar integration."""

from homeassistant.const import Platform

# Base component constants
DOMAIN = "cronostar"

# Platforms to set up (entities must be created by the component, not YAML)
PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.SELECT,
]

# Configuration keys (used by config flow/services)
CONF_NAME = "name"
CONF_PRESET = "preset"
CONF_TARGET_ENTITY = "target_entity"
CONF_GLOBAL_PREFIX = "global_prefix"
CONF_PROFILE_NAME = "profile_name"
CONF_SCHEDULE = "schedule"
CONF_LOGGING_ENABLED = "logging_enabled"

# Service names
SERVICE_SAVE_PROFILE = "save_profile"
SERVICE_LOAD_PROFILE = "load_profile"
SERVICE_ADD_PROFILE = "add_profile"
SERVICE_DELETE_PROFILE = "delete_profile"
SERVICE_LIST_ALL_PROFILES = "list_all_profiles"
SERVICE_APPLY_NOW = "apply_now"

# Storage
STORAGE_VERSION = 2
STORAGE_DIR = "cronostar/profiles"

# Defaults
DEFAULT_NAME = "CronoStar Controller"
DEFAULT_PRESET = "thermostat"
