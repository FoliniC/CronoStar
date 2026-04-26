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

import homeassistant.helpers.config_validation as cv
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

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
from .coordinator import CronoStarCoordinator
from .setup import async_setup_integration
from .setup.dashboard import PANEL_URL_PATH

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up CronoStar component from YAML (deprecated, kept for backward compatibility)."""
    _LOGGER.info("🌟 [SETUP] CronoStar starting...")
    
    # Debug: log all entries
    for entry in hass.config_entries.async_entries(DOMAIN):
        _LOGGER.info("🔍 [SETUP] Entry found: id=%s, title='%s', data=%s", entry.entry_id, entry.title, entry.data)

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
    _LOGGER.info("🚀 [ENTRY_SETUP] Starting for entry: %s (id: %s)", entry.title, entry.entry_id)
    hass.data.setdefault(DOMAIN, {})

    # Retrieve integration version dynamically
    integration = await async_get_integration(hass, DOMAIN)
    current_version = str(integration.version)
    hass.data[DOMAIN]["version"] = current_version
    _LOGGER.debug("[ENTRY_SETUP] Version: %s", current_version)

    # 1. Global Setup (if not already done)
    if not hass.data.get(DOMAIN, {}).get("_global_setup_done"):
        _LOGGER.info("🌟 [ENTRY_SETUP] Installing global component...")
        setup_config = {
            "version": current_version,
            "enable_backups": False,
        }
        if not await async_setup_integration(hass, setup_config):
            _LOGGER.error("❌ [ENTRY_SETUP] Component installation failed")
            return False
        hass.data[DOMAIN]["_global_setup_done"] = True
        _LOGGER.info("✅ [ENTRY_SETUP] Global component installed.")

    # ✅ ALWAYS check for orphaned profiles on entry setup to ensure data consistency
    # But only once using a marker to avoid parallel repair tasks
    if not hass.data[DOMAIN].get("_repair_task_started"):
        hass.data[DOMAIN]["_repair_task_started"] = True
        hass.async_create_task(_async_repair_entries(hass))

    # 2. Identify Entry Type
    if entry.data.get("component_installed"):
        _LOGGER.info("ℹ️ [ENTRY_SETUP] Entry is the global component. Setup finished.")
        # Auto-update global component title
        expected_title = "CronoStar"
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

    # Auto-update controller title (clean any legacy version tags like [v6.3.0])
    if "[" in entry.title:
        import re
        new_title = re.sub(r"\s*\[v?\d+\.\d+\.\d+\]", "", entry.title)
        if entry.title != new_title:
            _LOGGER.info("Cleaning controller title: %s -> %s", entry.title, new_title)
            hass.config_entries.async_update_entry(entry, title=new_title)

    # Validate controller entry required fields
    missing = [k for k in (CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY) if k not in entry.data]
    if missing:
        _LOGGER.error("Controller entry missing required fields: %s", ", ".join(missing))
        return False

    _LOGGER.info("🌟 [ENTRY_SETUP] Setting up controller '%s' (entry_id: %s)...", entry.title, entry.entry_id)

    try:
        # Create and store coordinator in runtime_data
        _LOGGER.debug("[ENTRY_SETUP] [%s] Creating coordinator instance", entry.title)
        coordinator = CronoStarCoordinator(hass, entry)
        
        # ✅ MANDATORY: Initialize coordinator first (load profiles, restore state)
        _LOGGER.info("🛠️ [ENTRY_SETUP] [%s] Initializing coordinator (restoring state)...", entry.title)
        await coordinator.async_initialize()
        _LOGGER.debug("✅ [ENTRY_SETUP] [%s] Coordinator initialization complete", entry.title)

        # Use standard HA pattern for first refresh
        _LOGGER.info("📡 [ENTRY_SETUP] [%s] Performing first refresh...", entry.title)
        await coordinator.async_config_entry_first_refresh()
        _LOGGER.info("✅ [ENTRY_SETUP] [%s] First refresh completed successfully", entry.title)

        # Store coordinator in ConfigEntry.runtime_data
        entry.runtime_data = coordinator

        # Forward platforms
        _LOGGER.info("🔌 [ENTRY_SETUP] [%s] Forwarding platforms to: %s", entry.title, PLATFORMS)
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        _LOGGER.info("🏁 [ENTRY_SETUP] [%s] Setup process finished for all platforms.", entry.title)

    except Exception as e:
        _LOGGER.error("❌ [ENTRY_SETUP] [%s] CRITICAL SETUP FAILURE: %s", entry.title, e, exc_info=True)
        return False

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
        try:
            def _mark_as_deleted() -> str | None:
                """Read, annotate and rename the profile file."""
                if not filepath.exists():
                    return None

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
            if deleted_name:
                _LOGGER.info("✅ CronoStar: Profile marked as deleted and preserved as: %s", deleted_name)
        except Exception as e:
            _LOGGER.error("❌ CronoStar: Failed to mark profile '%s' as deleted: %s", filename, e)

        # ── Backup files are intentionally preserved for manual recovery ──
        backups_dir = profiles_dir / "backups"
        if await hass.async_add_executor_job(backups_dir.exists):
            _LOGGER.info("ℹ️ CronoStar: Backup files for '%s' preserved in: %s", filename, backups_dir)


async def _async_repair_entries(hass: HomeAssistant) -> None:
    """Scan profile files and recreate missing config entries or fix incomplete ones."""
    import json
    import os

    _LOGGER.info("🔍 [REPAIR] Starting CronoStar profile repair task...")
    profiles_dir = Path(hass.config.path(STORAGE_DIR))
    if not await hass.async_add_executor_job(profiles_dir.exists):
        _LOGGER.info("🔍 [REPAIR] Profiles directory not found: %s", profiles_dir)
        return

    _LOGGER.info("🔍 [REPAIR] Starting check for orphaned or incomplete profiles in: %s", profiles_dir)

    # Get existing global prefixes and their entries
    existing_entries = {
        entry.data.get(CONF_GLOBAL_PREFIX): entry 
        for entry in hass.config_entries.async_entries(DOMAIN) 
        if entry.data.get(CONF_GLOBAL_PREFIX)
    }
    _LOGGER.debug("🔍 [REPAIR] Existing prefixes: %s", list(existing_entries.keys()))

    # Scan for files like cronostar_preset_prefix_data.json
    try:
        filenames = await hass.async_add_executor_job(os.listdir, profiles_dir)
    except Exception as e:
        _LOGGER.error("❌ [REPAIR] Failed to list profiles directory: %s", e)
        return

    repair_count = 0
    fix_count = 0
    for filename in filenames:
        if not filename.endswith("_data.json") or "_deleted_" in filename or "_j_u_n_k_" in filename:
            continue

        filepath = profiles_dir / filename
        try:
            def _read_profile():
                with open(filepath, encoding="utf-8") as f:
                    return json.load(f)

            data = await hass.async_add_executor_job(_read_profile)
            meta = data.get("meta", {})
            prefix = meta.get(CONF_GLOBAL_PREFIX)
            preset = meta.get(CONF_PRESET)

            # Fallback prefix detection for older files if meta is missing
            if not prefix:
                prefix = filename.replace("_data.json", "_")

            # CASE 1: Prefix already has an entry - Check if it needs fixing
            if prefix in existing_entries:
                entry = existing_entries[prefix]
                target = entry.data.get(CONF_TARGET_ENTITY)
                
                # If target is missing in entry but present in file, FIX IT
                if (not target or target == "") and meta.get(CONF_TARGET_ENTITY):
                    _LOGGER.info("🛠️ [REPAIR] Incomplete entry found for %s. Fixing target_entity...", prefix)
                    new_data = {**entry.data, CONF_TARGET_ENTITY: meta.get(CONF_TARGET_ENTITY)}
                    hass.config_entries.async_update_entry(entry, data=new_data)
                    fix_count += 1
                continue

            # Skip dummy/test prefixes
            if prefix and ("ddddd" in prefix or "test" in prefix):
                continue

            # CASE 2: Orphaned profile (no entry) - Recreate it
            _LOGGER.info("🛠️ [REPAIR] Found orphaned profile: %s. Recreating entry...", filename)

            # Extract info for entry creation
            name = meta.get(CONF_NAME, prefix.replace("cronostar_", "").replace("_", " ").title().strip())
            target = meta.get(CONF_TARGET_ENTITY)

            if not target:
                _LOGGER.warning("⚠️ [REPAIR] Target entity missing in profile %s; using dummy", filename)
                target = "sensor.dummy_placeholder"

            # Prepare data for ConfigEntry
            entry_data = {
                CONF_NAME: name,
                CONF_PRESET: preset or "thermostat",
                CONF_TARGET_ENTITY: target,
                CONF_GLOBAL_PREFIX: prefix,
            }
            # Add all other meta fields to preserve configuration
            for key, value in meta.items():
                if key not in entry_data and not key.startswith("_"):
                    entry_data[key] = value

            # Create entry programmatically
            _LOGGER.info("🚀 [REPAIR] Triggering config flow for: %s (prefix: %s)", name, prefix)
            result = await hass.config_entries.flow.async_init(
                DOMAIN, 
                context={"source": "create_controller"}, 
                data=entry_data
            )
            
            if result.get("type") == "create_entry":
                _LOGGER.info("✅ [REPAIR] Successfully recreated entry for %s", name)
                repair_count += 1
            else:
                _LOGGER.warning("⚠️ [REPAIR] Config flow for %s returned: %s", name, result.get("type"))

        except Exception as e:
            _LOGGER.error("❌ [REPAIR] Failed to process profile %s: %s", filename, e, exc_info=True)

    _LOGGER.info("🏁 [REPAIR] Process finished. Repaired %d and fixed %d entries.", repair_count, fix_count)
    
    # ✅ Regenerate dashboard after repair to reflect fixed targets
    if repair_count > 0 or fix_count > 0:
        from .setup.dashboard import setup_dashboard
        await setup_dashboard(hass)
