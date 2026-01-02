"""
CronoStar Integration for Home Assistant
Advanced time-based scheduling with profile management

This integration provides:
- Global storage manager for profiles
- Global services (save/load/delete profiles, apply schedules)
- Frontend card registration

Controllers are configured via Lovelace cards, not config entries.
"""

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY, DOMAIN, PLATFORMS
from .coordinator import CronoStarCoordinator
from .setup import async_setup_integration

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up CronoStar component from YAML (deprecated, kept for backward compatibility)."""
    hass.data.setdefault(DOMAIN, {})
    # Register global services/resources early to satisfy bronze 'action-setup'
    # Avoid duplicate setup by checking marker
    if not hass.data[DOMAIN].get("_global_setup_done"):
        setup_config = {"version": "unknown", "enable_backups": False}
        try:
            await async_setup_integration(hass, setup_config)
            hass.data[DOMAIN]["_global_setup_done"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Global setup failed during async_setup; will retry on config entry setup")
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up CronoStar component from a config entry.

    This is a component-level setup, not per-controller.
    All controller configuration is handled by Lovelace cards.
    """
    hass.data.setdefault(DOMAIN, {})

    # Check if this is the component installation entry
    if not entry.data.get("component_installed"):
        _LOGGER.warning("Invalid config entry for CronoStar, expected component installation entry")
        return False

    _LOGGER.info("🌟 CronoStar: Installing component...")

    # Global integration setup (skip if already done by yaml async_setup)
    setup_config = {
        "version": entry.version,
        "enable_backups": False,  # Can be made configurable later
    }

    if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
        if not await async_setup_integration(hass, setup_config):
            _LOGGER.error("❌ CronoStar: Component installation failed")
            return False
        hass.data.setdefault(DOMAIN, {})
        hass.data[DOMAIN]["_global_setup_done"] = True

    _LOGGER.info("✅ CronoStar: Component installed successfully")
    _LOGGER.info("📝 Add CronoStar cards to your dashboards to create controllers")

    # If this entry is a controller entry (created by config flow), set up coordinator and platforms
    # The component installation entry only carries component_installed flag.
    # Controller entries will carry required fields; detect and set up entities accordingly.
    if entry.data.get("component_installed"):
        # Installation-only entry: nothing more to do
        return True

    # Validate controller entry required fields
    missing = [k for k in (CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY) if k not in entry.data]
    if missing:
        _LOGGER.error("Controller entry missing required fields: %s", ", ".join(missing))
        return False

    # Create and store coordinator in runtime_data
    coordinator = CronoStarCoordinator(hass, entry)
    await coordinator.async_initialize()

    # Store coordinator in ConfigEntry.runtime_data (quality scale: runtime-data)
    entry.runtime_data = coordinator

    # Forward platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload CronoStar component.

    Note: This removes all global services and storage access.
    Controllers in Lovelace cards will stop functioning.
    """
    _LOGGER.info("🔄 CronoStar: Unloading entry...")

    # If this is a controller entry, unload platforms
    unloaded = True
    try:
        unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    except Exception:
        unloaded = False

    if entry.data.get("component_installed"):
        # Installation-only entry: remove global data and services will be handled by HA
        if DOMAIN in hass.data:
            hass.data.pop(DOMAIN)
        _LOGGER.info("✅ CronoStar: Component unloaded")
        return True

    _LOGGER.info("✅ CronoStar: Entry unload %s", "succeeded" if unloaded else "failed")
    return unloaded


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload CronoStar component."""
    _LOGGER.info("🔄 CronoStar: Reloading component...")
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)
