"""Select platform for CronoStar - Profile selector."""

import logging

from homeassistant.components.select import SelectEntity
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up CronoStar select entities from config entry."""
    # Use runtime_data (HA 2024.4+) with fallback to hass.data
    if hasattr(entry, "runtime_data"):
        coordinator = entry.runtime_data
    else:
        coordinator = hass.data[DOMAIN][entry.entry_id]
    _LOGGER.info("[SELECT] Setting up profile selector for controller '%s' (prefix: %s)", coordinator.name, coordinator.prefix)
    async_add_entities([CronoStarProfileSelect(coordinator)])


class CronoStarProfileSelect(CoordinatorEntity, SelectEntity):
    """Select entity to choose active schedule profile."""

    _attr_translation_key = "profile"
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator):
        """Initialize profile selector."""
        super().__init__(coordinator)
        # Unique ID remains based on global_prefix
        self._attr_unique_id = f"{coordinator.prefix}current_profile"
        self._attr_name = None  # Handled by translation key

        # Explicit entity_id to ensure consistency
        self.entity_id = f"select.{coordinator.prefix}current_profile"
        _LOGGER.info("[SELECT] Entity initialized: %s (unique_id: %s)", self.entity_id, self._attr_unique_id)

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
            "sw_version": str(coordinator.hass.data[DOMAIN].get("version", "unknown")),
        }

    @property
    def options(self) -> list[str]:
        """Return available profile options."""
        if self.coordinator.data is None:
            return ["Default"]
        return self.coordinator.data.get("available_profiles", ["Default"])

    @property
    def current_option(self) -> str | None:
        """Return currently selected profile."""
        if self.coordinator.data is None:
            return "Default"
        return self.coordinator.data.get("selected_profile") or "Default"

    async def async_select_option(self, option: str) -> None:
        """Handle profile selection."""
        if self.coordinator.logging_enabled:
            _LOGGER.info("[PERSIST_TRACE] Profile selected for '%s': %s", self.coordinator.name, option)

        await self.coordinator.set_profile(option)

    @property
    def available(self) -> bool:
        """Entity availability - always true if coordinator is initialized."""
        return self.coordinator.last_update_success
