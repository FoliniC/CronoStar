# custom_components/cronostar/setup/events.py
"""
Event handler registration for CronoStar
Handles HA state changes and automation triggers
"""

import logging

from homeassistant.const import EVENT_HOMEASSISTANT_START, EVENT_STATE_CHANGED
from homeassistant.core import CoreState, Event, HomeAssistant, callback

_LOGGER = logging.getLogger(__name__)


async def setup_event_handlers(hass: HomeAssistant, storage_manager) -> None:
    """
    Register event handlers for CronoStar

    Args:
        hass: Home Assistant instance
        storage_manager: Storage manager instance
    """
    _LOGGER.info("Setting up event handlers")

    # Listen to profile selector changes
    @callback
    def profile_selector_changed(event: Event):
        """Handle profile selector state changes"""
        entity_id = event.data.get("entity_id", "")

        if not entity_id.endswith("_profiles"):
            return

        new_state = event.data.get("new_state")
        if not new_state or new_state.state in ("unknown", "unavailable"):
            return

        old_state = event.data.get("old_state")
        if old_state and old_state.state == new_state.state:
            return

        # Extract prefix and new profile
        parts = entity_id.replace("input_select.", "").rsplit("_profiles", 1)
        if not parts:
            return

        prefix = parts[0] + "_"
        new_profile = new_state.state

        _LOGGER.info("Profile selector changed: %s -> %s (prefix: %s)", old_state.state if old_state else "unknown", new_profile, prefix)

        # Trigger scheduler update
        hass.async_create_task(_trigger_scheduler_update(hass, prefix, new_profile))

    hass.bus.async_listen(EVENT_STATE_CHANGED, profile_selector_changed)

    # --- 1. Perform immediate profile data quality check ---
    try:
        from ..deep_checks.file_checker import FileChecker

        file_checker = FileChecker(hass)

        _LOGGER.info("Performing startup data quality check on profiles...")

        # List all profile files
        profiles_dir = hass.config.path("cronostar/profiles")
        import pathlib

        path = pathlib.Path(profiles_dir)

        if path.exists():
            json_files = list(path.glob("cronostar_*.json"))
            _LOGGER.info("Found %d profile files to check", len(json_files))

            for filepath in json_files:
                try:
                    # Run validation
                    file_info = await file_checker._validate_profile_file(filepath)

                    if file_info["valid"]:
                        _LOGGER.info("Profile file OK: %s (Profiles: %d)", filepath.name, file_info["profiles_count"])
                    else:
                        _LOGGER.warning("Profile file issues found in %s: %s", filepath.name, "; ".join(file_info["issues"]))

                except Exception as e:
                    _LOGGER.error("Error checking file %s: %s", filepath.name, e)
        else:
            _LOGGER.warning("Profiles directory not found at setup: %s", profiles_dir)

    except Exception as e:
        _LOGGER.error("Startup data check failed: %s", e)

    # --- 2. Handle instance discovery on startup ---
    async def handle_startup(event: Event | None = None):
        """Handle Home Assistant startup"""
        _LOGGER.info("[CRONOSTAR] CronoStar: Starting initialization (Warm-up phase)...")

        # 1. Ensure cache is primed by reading all containers once
        #    We enumerate filenames only to warm the cache, not for matching.
        all_profile_files = await storage_manager.list_profiles()
        for fname in all_profile_files:
            try:
                await storage_manager.load_profile_cached(fname, force_reload=False)
            except Exception:
                pass

        # 2. Update profile selectors and initialize scheduler
        profile_service = hass.data["cronostar"]["profile_service"]
        scheduler = hass.data["cronostar"]["scheduler"]

        await profile_service.async_update_profile_selectors(all_files=all_profile_files)
        await scheduler.async_initialize(files=all_profile_files)

        _LOGGER.info("Running startup discovery for CronoStar instances")

        count = 0
        # Scan for profile selectors
        for state in hass.states.async_all("input_select"):
            entity_id = state.entity_id
            if entity_id.endswith("_profiles"):
                # Extract prefix
                # input_select.prefix_profiles -> prefix_
                parts = entity_id.replace("input_select.", "").rsplit("_profiles", 1)
                if parts:
                    prefix = parts[0] + "_"
                    current_profile = state.state

                    if current_profile not in ("unknown", "unavailable"):
                        count += 1
                        _LOGGER.info("Discovered CronoStar instance: %s (Profile: %s)", prefix, current_profile)
                        # Use async_create_task to run the update
                        hass.async_create_task(_trigger_scheduler_update(hass, prefix, current_profile))

        if count == 0:
            _LOGGER.info("No active CronoStar instances found on startup")

    # Run immediately if HA is already running (e.g. reload), otherwise wait for start event
    if hass.state == CoreState.running:
        hass.async_create_task(handle_startup())
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, handle_startup)

    _LOGGER.info("Event handlers registered successfully")


async def _trigger_scheduler_update(hass: HomeAssistant, prefix: str, profile_name: str):
    """
    Trigger scheduler update when profile changes

    Args:
        hass: Home Assistant instance
        prefix: Global prefix
        profile_name: New profile name
    """
    try:
        scheduler = hass.data.get("cronostar", {}).get("scheduler")

        if not scheduler:
            _LOGGER.warning("Scheduler not available for update")
            return

        # Determine preset type from prefix
        preset_type = await _infer_preset_type(hass, prefix)

        if preset_type:
            _LOGGER.debug("Triggering scheduler update: preset=%s, profile=%s", preset_type, profile_name)
            await scheduler.update_preset(preset_type, global_prefix=prefix.rstrip("_"))

    except Exception as e:
        _LOGGER.error("Error triggering scheduler update: %s", e)


async def _infer_preset_type(hass: HomeAssistant, prefix: str) -> str | None:
    """
    Infer preset type from existing entities

    Args:
        hass: Home Assistant instance
        prefix: Global prefix

    Returns:
        Preset type or None
    """
    # Check common entity patterns (prefix normalized)
    # Note: previously computed 'base' was unused, so remove to satisfy linting

    # Look for target entity that might indicate type
    target_entity_id = f"input_text.{prefix}target_entity"
    target_state = hass.states.get(target_entity_id)

    if target_state and target_state.state:
        target = target_state.state

        # Infer from target entity domain
        if target.startswith("climate."):
            return "thermostat"
        elif target.startswith("fan."):
            return "fan"
        elif target.startswith(("light.", "switch.")):
            return "switch"

    # Default to thermostat
    return "thermostat"
