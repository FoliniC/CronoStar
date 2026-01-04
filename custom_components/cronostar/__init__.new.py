"""
CronoStar Integration for Home Assistant
Advanced time-based scheduling with profile management

This integration provides:
- Global storage manager for profiles
- Global services (save/load/delete profiles, apply schedules)
- Frontend card registration
- Controller entities (switches, sensors, selects)

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

    Handles both global component setup and controller entity setup.
    """
    hass.data.setdefault(DOMAIN, {})

    # 1. Global Setup (if not already done)
    if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
        _LOGGER.info("🌟 CronoStar: Installing global component...")
        setup_config = {
            "version": entry.version,
            "enable_backups": False,
        }
        if not await async_setup_integration(hass, setup_config):
            _LOGGER.error("❌ CronoStar: Component installation failed")
            return False
        hass.data.setdefault(DOMAIN, {})
        hass.data[DOMAIN]["_global_setup_done"] = True

    # 2. Identify Entry Type
    if entry.data.get("component_installed"):
        _LOGGER.info("✅ CronoStar: Global component entry set up")
        return True

    # 3. Controller Setup (for entity entries)
    # Validate controller entry required fields
    missing = [k for k in (CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY) if k not in entry.data]
    if missing:
        _LOGGER.error("Controller entry missing required fields: %s", ", ".join(missing))
        return False

    _LOGGER.info("🌟 CronoStar: Setting up controller '%s'...", entry.title)

    # Create and store coordinator in runtime_data
    coordinator = CronoStarCoordinator(hass, entry)
    await coordinator.async_initialize()

    # Store coordinator in ConfigEntry.runtime_data (quality scale: runtime-data)
    entry.runtime_data = coordinator

    # Forward platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload CronoStar component."""
    _LOGGER.info("🔄 CronoStar: Unloading entry %s...", entry.title)

    # If this is a controller entry, unload platforms
    unloaded = True
    if not entry.data.get("component_installed"):
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
