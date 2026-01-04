# Fix permissions script (simulated by overwriting files completely)
import os

# Content for switch.py
switch_content = r'''"""Switch platform for CronoStar - Pause controller."""

import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar switch entities from config entry."""
    coordinator = entry.runtime_data
    async_add_entities([CronoStarPauseSwitch(coordinator)])


class CronoStarPauseSwitch(CoordinatorEntity, SwitchEntity):
    """Switch to pause/resume schedule application."""

    _attr_translation_key = "pause"
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator):
        """Initialize pause switch."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_pause"

        # Device info for grouping
        self._attr_device_info = {
            "identifiers": {(DOMAIN, coordinator.entry.entry_id)},
            "name": coordinator.name,
            "manufacturer": "CronoStar",
            "model": f"{coordinator.preset.capitalize()} Controller",
            "sw_version": coordinator.hass.data[DOMAIN].get("version", "unknown"),
        }

    @property
    def is_on(self) -> bool:
        """Return true if schedule is paused."""
        return self.coordinator.data.get("is_paused", False)

    async def async_turn_on(self, **kwargs) -> None:
        """Pause the schedule."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("Pausing controller '%s'", self.coordinator.name)

        await self.coordinator.set_paused(True)

    async def async_turn_off(self, **kwargs) -> None:
        """Resume the schedule."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("Resuming controller '%s'", self.coordinator.name)

        await self.coordinator.set_paused(False)

    @property
    def available(self) -> bool:
        """Entity availability based on target entity presence."""
        state = self.coordinator.hass.states.get(self.coordinator.target_entity)
        return state is not None and state.state not in ("unknown", "unavailable")
'''

# Content for select.py
select_content = r'''"""Select platform for CronoStar - Profile selector."""

import logging

from homeassistant.components.select import SelectEntity
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar select entities from config entry."""
    coordinator = entry.runtime_data
    async_add_entities([CronoStarProfileSelect(coordinator)])


class CronoStarProfileSelect(CoordinatorEntity, SelectEntity):
    """Select entity to choose active schedule profile."""

    _attr_translation_key = "profile"
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator):
        """Initialize profile selector."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_profile"

        # Device info for grouping
        self._attr_device_info = {
            "identifiers": {(DOMAIN, coordinator.entry.entry_id)},
            "name": coordinator.name,
            "manufacturer": "CronoStar",
            "model": f"{coordinator.preset.capitalize()} Controller",
            "sw_version": coordinator.hass.data[DOMAIN].get("version", "unknown"),
        }

    @property
    def options(self) -> list[str]:
        """Return available profile options."""
        return self.coordinator.data.get("available_profiles", ["Comfort", "Default"])

    @property
    def current_option(self) -> str | None:
        """Return currently selected profile."""
        return self.coordinator.data.get("selected_profile")

    async def async_select_option(self, option: str) -> None:
        """Handle profile selection."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("Profile selected for '%s': %s", self.coordinator.name, option)

        await self.coordinator.set_profile(option)

    @property
    def available(self) -> bool:
        """Entity availability based on target entity presence."""
        state = self.coordinator.hass.states.get(self.coordinator.target_entity)
        return state is not None and state.state not in ("unknown", "unavailable")
'''

# Content for sensor.py
sensor_content = r'''"""Sensor platform for CronoStar - Current scheduled value."""

import logging

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar sensor entities from config entry."""
    # Use runtime_data per quality scale guidance
    coordinator = entry.runtime_data
    async_add_entities([CronoStarCurrentSensor(coordinator)])


class CronoStarCurrentSensor(CoordinatorEntity, SensorEntity):
    """Sensor showing current scheduled value."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator):
        """Initialize current value sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_current"

        # Determine device class, unit, and translation key based on preset
        preset = coordinator.preset
        if preset in ["thermostat", "generic_temperature"]:
            self._attr_translation_key = "current_value_temp"
            self._attr_device_class = SensorDeviceClass.TEMPERATURE
            self._attr_native_unit_of_measurement = "°C"
            self._attr_suggested_display_precision = 1
        elif preset in ["ev_charging", "generic_kwh"]:
            self._attr_translation_key = "current_value_power"
            self._attr_device_class = SensorDeviceClass.POWER
            self._attr_native_unit_of_measurement = "kW"
            self._attr_suggested_display_precision = 2
        elif preset == "cover":
            self._attr_translation_key = "current_value_cover"
            self._attr_native_unit_of_measurement = "%"
        else:
            # Generic or switch presets - no unit
            self._attr_translation_key = "current_value"
            self._attr_native_unit_of_measurement = None

        # Device info for grouping
        self._attr_device_info = {
            "identifiers": {(DOMAIN, coordinator.entry.entry_id)},
            "name": coordinator.name,
            "manufacturer": "CronoStar",
            "model": f"{coordinator.preset.capitalize()} Controller",
            "sw_version": coordinator.hass.data[DOMAIN].get("version", "unknown"),
        }

    @property
    def native_value(self) -> float | None:
        """Return the current scheduled value."""
        return self.coordinator.data.get("current_value")

    @property
    def extra_state_attributes(self) -> dict:
        """Return additional state attributes."""
        return {
            "active_profile": self.coordinator.data.get("selected_profile"),
            "is_paused": self.coordinator.data.get("is_paused", False),
            "target_entity": self.coordinator.target_entity,
        }

    @property
    def available(self) -> bool:
        """Entity availability based on target entity presence."""
        state = self.coordinator.hass.states.get(self.coordinator.target_entity)
        return state is not None and state.state not in ("unknown", "unavailable")
'''

# Content for const.py (adding PARALLEL_UPDATES)
const_content = r'''"""Constants for the CronoStar integration."""

from homeassistant.const import Platform

# Base component constants
DOMAIN = "cronostar"

# Platforms to set up (entities must be created by the component, not YAML)
PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.SELECT,
]

PARALLEL_UPDATES = 0

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
'''

def write_file(path, content):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ Successfully updated {path}")
    except Exception as e:
        print(f"❌ Failed to update {path}: {e}")

write_file(os.path.join("custom_components", "cronostar", "switch.py"), switch_content)
write_file(os.path.join("custom_components", "cronostar", "select.py"), select_content)
write_file(os.path.join("custom_components", "cronostar", "sensor.py"), sensor_content)
write_file(os.path.join("custom_components", "cronostar", "const.py"), const_content)
