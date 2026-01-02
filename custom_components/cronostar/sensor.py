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

    def __init__(self, coordinator):
        """Initialize current value sensor."""
        super().__init__(coordinator)
        self._attr_name = f"{coordinator.name} Current Value"
        self._attr_unique_id = f"{coordinator.entry.entry_id}_current"
        self._attr_icon = "mdi:gauge"
        self._attr_has_entity_name = True

        # Determine device class and unit based on preset
        preset = coordinator.preset
        if preset in ["thermostat", "generic_temperature"]:
            self._attr_device_class = SensorDeviceClass.TEMPERATURE
            self._attr_native_unit_of_measurement = "°C"
            self._attr_suggested_display_precision = 1
        elif preset in ["ev_charging", "generic_kwh"]:
            self._attr_device_class = SensorDeviceClass.POWER
            self._attr_native_unit_of_measurement = "kW"
            self._attr_suggested_display_precision = 2
        elif preset == "cover":
            self._attr_native_unit_of_measurement = "%"
            self._attr_icon = "mdi:window-shutter"
        else:
            # Generic or switch presets - no unit
            self._attr_native_unit_of_measurement = None

        self._attr_state_class = SensorStateClass.MEASUREMENT

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
