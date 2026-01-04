"""Sensor platform for CronoStar - Current scheduled value."""

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

    _attr_has_entity_name = False
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator):
        """Initialize current value sensor."""
        super().__init__(coordinator)
        # Naming requirement: global_prefix + "current"
        self._attr_name = f"{coordinator.prefix}current"
        self._attr_unique_id = f"{coordinator.prefix}current"

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
