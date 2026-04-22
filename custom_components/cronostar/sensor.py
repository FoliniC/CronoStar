"""Sensor platform for CronoStar - Current scheduled value."""

import logging

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CONF_ALLOW_MAX_VALUE,
    CONF_MAX_VALUE,
    CONF_MIN_VALUE,
    CONF_STEP_VALUE,
    CONF_TITLE,
    CONF_UNIT_OF_MEASUREMENT,
    CONF_Y_AXIS_LABEL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar sensor entities from config entry."""
    # Use runtime_data per quality scale guidance
    coordinator = entry.runtime_data
    _LOGGER.info("[SENSOR] Setting up current value sensor for controller '%s' (prefix: %s)", coordinator.name, coordinator.prefix)
    async_add_entities([CronoStarCurrentSensor(coordinator)])


class CronoStarCurrentSensor(CoordinatorEntity, SensorEntity):
    """Sensor showing current scheduled value."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator):
        """Initialize current value sensor."""
        super().__init__(coordinator)
        # Unique ID remains based on global_prefix
        self._attr_unique_id = f"{coordinator.prefix}current"
        self._attr_has_entity_name = True
        self._attr_name = None  # Handled by translation key

        # Explicit entity_id to ensure consistency
        self.entity_id = f"sensor.{coordinator.prefix}current"
        _LOGGER.info("[SENSOR] Entity initialized: %s (unique_id: %s)", self.entity_id, self._attr_unique_id)

        # Determine device class, unit, and translation key based on preset type
        preset = getattr(coordinator, "preset_type", None) or "thermostat"
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
        # Friendly model name from preset type
        try:
            model_name = f"{preset.replace('_', ' ').title()} Controller"
        except Exception:
            model_name = "Controller"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, coordinator.entry.entry_id)},
            "name": coordinator.name,
            "manufacturer": "CronoStar",
            "model": model_name,
            "sw_version": str(coordinator.hass.data[DOMAIN].get("version", "unknown")),
        }

    @property
    def native_value(self) -> float | None:
        """Return the current scheduled value."""
        if self.coordinator.data is None:
            return 0.0
        return self.coordinator.data.get("current_value")

    @property
    def extra_state_attributes(self) -> dict:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {
                "active_profile": "Default",
                "is_enabled": True,
                "target_entity": self.coordinator.target_entity,
                "all_profiles": [],
            }

        attrs = {
            "active_profile": self.coordinator.data.get("selected_profile"),
            "is_enabled": self.coordinator.data.get("is_enabled", True),
            "target_entity": self.coordinator.target_entity,
            "all_profiles": self.coordinator.data.get("available_profiles", []),
        }

        # Merge card configuration into attributes
        card_config = self.coordinator.data.get("card_config", {})
        for key in [CONF_TITLE, CONF_MIN_VALUE, CONF_MAX_VALUE, CONF_STEP_VALUE, CONF_UNIT_OF_MEASUREMENT, CONF_Y_AXIS_LABEL, CONF_ALLOW_MAX_VALUE]:
            if key in card_config:
                attrs[key] = card_config[key]

        return attrs

    @property
    def available(self) -> bool:
        """Entity availability - always true if coordinator is initialized.
        
        This allows the entity to be visible even if target_entity is not yet set,
        letting the user see it's active.
        """
        return self.coordinator.last_update_success
