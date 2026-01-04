"""
CronoStar Integration for Home Assistant
Advanced time-based scheduling with profile management

This integration provides:
- Global storage manager for profiles
- Global services (save/load/delete profiles, apply schedules)
- Frontend card registration
- Controller entities (sensors, switches) via config entries
"""

import logging

import homeassistant.helpers.config_validation as cv
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS, CONF_LOGGING_ENABLED
from .coordinator import CronoStarCoordinator
from .setup import async_setup_integration

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up CronoStar component from YAML (deprecated, kept for backward compatibility)."""
    hass.data.setdefault(DOMAIN, {})
    # Register global services/resources early to satisfy bronze 'action-setup'
    # Avoid duplicate setup by checking marker
    if not hass.data[DOMAIN].get("_global_setup_done"):
        setup_config = {
            "version": "unknown",
            "enable_backups": False,
            "logging_enabled": False,
        }
        try:
            await async_setup_integration(hass, setup_config)
            hass.data[DOMAIN]["_global_setup_done"] = True
        except Exception as e:
            _LOGGER.warning("Global setup failed during async_setup; will retry on config entry setup: %s", e, exc_info=True)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up CronoStar component from a config entry.

    Handles two types of entries:
    1. Global Component: Sets up services, storage, and frontend.
    2. Controller: Sets up a specific schedule controller (entities).
    """
    hass.data.setdefault(DOMAIN, {})

    # 1. Global Component Setup
    if entry.data.get("component_installed"):
        _LOGGER.info("🌟 CronoStar: Installing component...")

        # Get logging preference from options (fallback to data or False)
        logging_enabled = entry.options.get(
            CONF_LOGGING_ENABLED, entry.data.get(CONF_LOGGING_ENABLED, False)
        )

        # Global integration setup (skip if already done by yaml async_setup)
        setup_config = {
            "version": entry.version,
            "enable_backups": False,  # Can be made configurable later
            "logging_enabled": logging_enabled,
        }

        if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
            if not await async_setup_integration(hass, setup_config):
                _LOGGER.error("❌ CronoStar: Component installation failed")
                return False
            hass.data.setdefault(DOMAIN, {})
            hass.data[DOMAIN]["_global_setup_done"] = True
        else:
             # If setup was already done (e.g. by YAML), update logging state
             hass.data[DOMAIN]["logging_enabled"] = logging_enabled

        _LOGGER.info("✅ CronoStar: Component installed successfully (logging=%s)", logging_enabled)
        return True

    # 2. Controller Setup (Entities)
    # Ensure global component is ready (should be enforced by config flow dependencies, but safe to check)
    if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
        _LOGGER.warning("CronoStar global component not ready yet. Attempting lazy init...")
        # Fallback: try to init globals if missing
        setup_config = {"version": "unknown", "enable_backups": False}
        await async_setup_integration(hass, setup_config)
        hass.data[DOMAIN]["_global_setup_done"] = True

    _LOGGER.info("🌟 CronoStar: Setting up controller '%s'", entry.title)

    coordinator = CronoStarCoordinator(hass, entry)

    # Initialize (load profiles, set initial state)
    await coordinator.async_initialize()

    # Initial refresh (this calls _async_update_data)
    await coordinator.async_config_entry_first_refresh()

    # Store coordinator in runtime_data (Quality Scale requirement)
    entry.runtime_data = coordinator

    # Forward to platforms (Sensor, Switch, etc.)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload CronoStar component."""
    _LOGGER.info("🔄 CronoStar: Unloading entry '%s'...", entry.title)

    if entry.data.get("component_installed"):
        # Installation-only entry: remove global data and services
        if DOMAIN in hass.data and hass.data[DOMAIN].get("_global_setup_done"):
            # Unregister services
            from .setup.services import async_unload_services
            await async_unload_services(hass)

            # Clear storage manager cache
            storage_manager = hass.data[DOMAIN].get("storage_manager")
            if storage_manager:
                await storage_manager.clear_cache()

            # Clean up global data (only remove _global_setup_done if no other controllers exist)
            # For now, just remove the key indicating global setup. Full DOMAIN pop could be problematic if other controllers are still running.
            hass.data[DOMAIN].pop("_global_setup_done", None)
            hass.data[DOMAIN].pop("storage_manager", None)
            hass.data[DOMAIN].pop("profile_service", None) # Remove profile_service if it was stored

        _LOGGER.info("✅ CronoStar: Component unloaded")
        return True

    # Unload Controller
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload CronoStar component."""
    _LOGGER.info("🔄 CronoStar: Reloading...")
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)
