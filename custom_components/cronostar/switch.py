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
    async_add_entities([CronoStarPauseSwitch(coordinator)])


class CronoStarPauseSwitch(CoordinatorEntity, SwitchEntity):
    """Switch to pause/resume schedule application."""

    def __init__(self, coordinator):
        """Initialize pause switch."""
        super().__init__(coordinator)
        self._attr_name = f"{coordinator.name} Pause"
        self._attr_unique_id = f"{coordinator.entry.entry_id}_pause"
        self._attr_icon = "mdi:pause"
        self._attr_entity_category = EntityCategory.CONFIG
        self._attr_has_entity_name = True

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

    @property
    def icon(self) -> str:
        """Return icon based on state."""
        return "mdi:play" if self.is_on else "mdi:pause"

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
