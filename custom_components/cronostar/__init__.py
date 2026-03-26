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
import re
from datetime import UTC
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import (
    CONF_FRONTEND_VERSION_CHECK,
    CONF_GLOBAL_PREFIX,
    CONF_LANGUAGE,
    CONF_LOGGING_ENABLED,
    CONF_NAME,
    CONF_PRESET,
    CONF_TARGET_ENTITY,
    DOMAIN,
    PLATFORMS,
    STORAGE_DIR,
)
from .coordinator import CronoStarCoordinator
from .setup import PANEL_URL_PATH, async_setup_integration

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

    # Retrieve integration version dynamically
    integration = await async_get_integration(hass, DOMAIN)
    current_version = integration.version
    hass.data[DOMAIN]["version"] = current_version
    _LOGGER.debug("INITIALIZING CronoStar version in hass.data[%s]['version'] = %s", DOMAIN, current_version)

    # 1. Global Setup (if not already done)
    if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
        _LOGGER.info("🌟 CronoStar: Installing global component...")
        setup_config = {
            "version": current_version,
            "enable_backups": False,
        }
        if not await async_setup_integration(hass, setup_config):
            _LOGGER.error("❌ CronoStar: Component installation failed")
            return False
        hass.data.setdefault(DOMAIN, {})
        hass.data[DOMAIN]["_global_setup_done"] = True

    # 2. Identify Entry Type
    if entry.data.get("component_installed"):
        # Auto-update global component title with version tag
        expected_title = f"CronoStar [v{current_version}]"
        if entry.title != expected_title:
            _LOGGER.info("Updating global component title: %s -> %s", entry.title, expected_title)
            hass.config_entries.async_update_entry(entry, title=expected_title)

        # Store global configuration in hass.data for services to access
        global_config = {
            CONF_LOGGING_ENABLED: entry.options.get(CONF_LOGGING_ENABLED, False),
            CONF_FRONTEND_VERSION_CHECK: entry.options.get(CONF_FRONTEND_VERSION_CHECK, True),
            CONF_LANGUAGE: entry.options.get(CONF_LANGUAGE, "default"),
        }
        hass.data[DOMAIN]["global_config"] = global_config
        _LOGGER.info("✅ CronoStar: Global component entry set up. Config: %s", global_config)
        return True

    # 3. Controller Setup (for entity entries)
    # Migration: Handle legacy "preset" key -> "preset_type"
    if "preset" in entry.data and CONF_PRESET not in entry.data:
        _LOGGER.warning("Migrating legacy config entry '%s': preset -> preset_type", entry.title)
        new_data = {**entry.data}
        new_data[CONF_PRESET] = new_data.pop("preset")
        hass.config_entries.async_update_entry(entry, data=new_data)

    # Auto-update controller title with current version tag
    if f"[v{current_version}]" not in entry.title:
        clean_title = re.sub(r"\s*\[v\d+\.\d+\.\d+\]", "", entry.title)
        new_title = f"{clean_title} [v{current_version}]"
        _LOGGER.info("Updating controller title: %s -> %s", entry.title, new_title)
        hass.config_entries.async_update_entry(entry, title=new_title)

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

        # Remove sidebar panel
        try:
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
            _LOGGER.info("✅ CronoStar: Sidebar panel removed")
        except Exception as e:
            _LOGGER.warning("⚠️ Failed to remove sidebar panel: %s", e)

        _LOGGER.info("✅ CronoStar: Component unloaded")
        return True

    _LOGGER.info("✅ CronoStar: Entry unload %s", "succeeded" if unloaded else "failed")
    return unloaded


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload CronoStar component."""
    _LOGGER.info("🔄 CronoStar: Reloading component...")
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle removal of an entry.

    Instead of permanently deleting profile data, marks files with a deletion
    timestamp and preserves them under a renamed path (e.g. filename_deleted_<ts>.json).
    A subsequent config flow installation can detect these marked files and offer
    the user the option to import/restore them.
    Backup files are always preserved to allow manual recovery.
    """
    import json
    from datetime import datetime

    if entry.data.get("component_installed"):
        _LOGGER.info("🗑️ CronoStar: Global component entry removed")
        return

    _LOGGER.info("🗑️ CronoStar: Marking data of controller '%s' as deleted...", entry.title)

    preset_type = entry.data.get(CONF_PRESET)
    global_prefix = entry.data.get(CONF_GLOBAL_PREFIX)

    if preset_type and global_prefix:
        from .utils.filename_builder import build_profile_filename

        filename = build_profile_filename(preset_type, global_prefix)
        profiles_dir = Path(hass.config.path(STORAGE_DIR))
        filepath = profiles_dir / filename

        # ── Mark the profile file as deleted (preserving data for future import) ──
        if filepath.exists():
            try:

                def _mark_as_deleted() -> str:
                    """Read, annotate and rename the profile file."""
                    with open(filepath, encoding="utf-8") as f:
                        data = json.load(f)

                    # Inject deletion metadata so the config flow can recognise
                    # this file and offer the user an import option
                    data.setdefault("meta", {})
                    data["meta"]["_deleted_at"] = datetime.now(UTC).isoformat()
                    data["meta"]["_deleted_entry_title"] = entry.title
                    data["meta"]["_deleted_global_prefix"] = global_prefix
                    data["meta"]["_deleted_preset_type"] = preset_type

                    # Rename to <stem>_deleted_<timestamp>.json to prevent
                    # automatic re-loading while keeping it discoverable
                    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
                    deleted_path = filepath.parent / f"{filepath.stem}_deleted_{timestamp}.json"

                    with open(deleted_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)

                    filepath.unlink()
                    return deleted_path.name

                deleted_name = await hass.async_add_executor_job(_mark_as_deleted)
                _LOGGER.info("✅ CronoStar: Profile marked as deleted and preserved as: %s", deleted_name)
            except Exception as e:
                _LOGGER.error("❌ CronoStar: Failed to mark profile '%s' as deleted: %s", filename, e)

        # ── Backup files are intentionally preserved for manual recovery ──
        backups_dir = profiles_dir / "backups"
        if backups_dir.exists():
            _LOGGER.info("ℹ️ CronoStar: Backup files for '%s' preserved in: %s", filename, backups_dir)
