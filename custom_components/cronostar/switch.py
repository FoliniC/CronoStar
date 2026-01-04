"""Switch platform for CronoStar - Pause controller."""

import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar switch entities from config entry."""
    coordinator = entry.runtime_data
    async_add_entities([CronoStarEnabledSwitch(coordinator)])


class CronoStarEnabledSwitch(CoordinatorEntity, SwitchEntity):
    """Switch to enable/disable schedule application."""

    _attr_translation_key = "enabled"
    _attr_has_entity_name = False
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator):
        """Initialize enabled switch."""
        super().__init__(coordinator)
        # Naming requirement: global_prefix + "enabled"
        self._attr_name = f"{coordinator.prefix}enabled"
        self._attr_unique_id = f"{coordinator.prefix}enabled"

        # Device info for grouping
        self._attr_device_info = {
            "identifiers": {(DOMAIN, coordinator.entry.entry_id)},
            "name": coordinator.name,
            "manufacturer": "CronoStar",
            "model": f"{coordinator.preset_type.capitalize()} Controller",
            "sw_version": coordinator.hass.data[DOMAIN].get("version", "unknown"),
        }

    @property
    def is_on(self) -> bool:
        """Return true if schedule is enabled."""
        return self.coordinator.data.get("is_enabled", True)

    async def async_turn_on(self, **kwargs) -> None:
        """Enable the schedule."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("Enabling controller '%s'", self.coordinator.name)

        await self.coordinator.set_enabled(True)

    async def async_turn_off(self, **kwargs) -> None:
        """Disable the schedule."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("Disabling controller '%s'", self.coordinator.name)

        await self.coordinator.set_enabled(False)

    @property
    def available(self) -> bool:
        """Entity availability based on target entity presence."""
        state = self.coordinator.hass.states.get(self.coordinator.target_entity)
        return state is not None and state.state not in ("unknown", "unavailable")
