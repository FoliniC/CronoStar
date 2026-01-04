# custom_components/cronostar/setup/events.py
"""
Event handler registration for CronoStar
Handles HA state changes and component startup
"""

import logging

from homeassistant.const import EVENT_HOMEASSISTANT_START
from homeassistant.core import CoreState, Event, HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def setup_event_handlers(hass: HomeAssistant, storage_manager) -> None:
    """
    Register event handlers for CronoStar

    Args:
        hass: Home Assistant instance
        storage_manager: Storage manager instance
    """
    _LOGGER.info("Setting up event handlers")

    # --- Handle instance discovery on startup ---
    async def handle_startup(event: Event | None = None):
        """Handle Home Assistant startup"""
        _LOGGER.info("[CRONOSTAR] CronoStar: Starting initialization (Warm-up phase)...")

        # 1. Ensure cache is primed by reading all containers once
        all_profile_files = await storage_manager.list_profiles()
        for fname in all_profile_files:
            try:
                await storage_manager.load_profile_cached(fname, force_reload=False)
            except Exception:
                pass

        # 2. Update profile selectors (input_select entities if they exist)
        profile_service = hass.data["cronostar"].get("profile_service")
        if profile_service:
            await profile_service.async_update_profile_selectors(all_files=all_profile_files)

        _LOGGER.info("[CRONOSTAR] Initialization completed")

    # Run immediately if HA is already running (e.g. reload), otherwise wait for start event
    if hass.state == CoreState.running:
        hass.async_create_task(handle_startup())
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, handle_startup)

    _LOGGER.info("Event handlers registered successfully")