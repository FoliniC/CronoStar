"""Select platform for CronoStar - Profile selector."""

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
    _attr_has_entity_name = False
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator):
        """Initialize profile selector."""
        super().__init__(coordinator)
        # Naming requirement: global_prefix + "current_profile"
        self._attr_name = f"{coordinator.prefix}current_profile"
        self._attr_unique_id = f"{coordinator.prefix}current_profile"

        # Device info for grouping
        try:
            preset = getattr(coordinator, "preset_type", None) or "controller"
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
    def options(self) -> list[str]:
        """Return available profile options."""
        return self.coordinator.data.get("available_profiles", ["Default"])

    @property
    def current_option(self) -> str | None:
        """Return currently selected profile."""
        return self.coordinator.data.get("selected_profile") or "Default"

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
