"""Diagnostics support for CronoStar."""

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    data = {
        "entry": {
            "entry_id": entry.entry_id,
            "version": entry.version,
            "domain": entry.domain,
            "title": entry.title,
            "data": dict(entry.data),
            "options": dict(entry.options),
        },
        "component_status": {
            "global_setup_done": hass.data.get(DOMAIN, {}).get("_global_setup_done", False),
            "version": hass.data.get(DOMAIN, {}).get("version", "unknown"),
        },
    }

    # If this is a controller entry, dump its state
    if entry.runtime_data:
        coordinator = entry.runtime_data
        data["controller_state"] = {
            "name": coordinator.name,
            "preset": coordinator.preset,
            "target_entity": coordinator.target_entity,
            "selected_profile": coordinator.selected_profile,
            "is_enabled": coordinator.is_enabled,
            "current_value": coordinator.current_value,
            "available_profiles": coordinator.available_profiles,
        }

    return data
