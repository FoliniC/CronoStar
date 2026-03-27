"""
CronoStar Setup - Global component initialization
Handles one-time setup tasks (services, storage, frontend resources, panel)
"""

import json
import logging
import os
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, async_register_built_in_panel, async_remove_panel

try:
    from homeassistant.components.http import StaticPathConfig

    HAS_STATIC_PATH_CONFIG = True
except ImportError:
    HAS_STATIC_PATH_CONFIG = False

from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from ..const import DOMAIN
from ..storage.settings_manager import SettingsManager
from ..storage.storage_manager import StorageManager
from .dashboard import DASHBOARD_YAML_FILENAME, setup_dashboard
from .events import setup_event_handlers
from .services import setup_services
from .validators import validate_environment


async def async_setup_integration(hass: HomeAssistant, config: dict) -> bool:
    """Global component setup."""
    _LOGGER.info("🌟 CronoStar: Starting component setup...")

    if not await validate_environment(hass):
        return False

    if not await _setup_static_resources(hass):
        return False

    cronostar_dir = hass.config.path("cronostar")
    profiles_dir = hass.config.path("cronostar/profiles")
    storage_manager = StorageManager(hass, profiles_dir)
    settings_manager = SettingsManager(hass, cronostar_dir)

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["storage_manager"] = storage_manager
    hass.data[DOMAIN]["settings_manager"] = settings_manager

    # Store version passed from __init__.py
    if "version" in config:
        hass.data[DOMAIN]["version"] = config["version"]
        _LOGGER.debug("CronoStar global setup: version %s stored in hass.data", config["version"])

    await _preload_profile_cache(hass, storage_manager)
    await setup_services(hass, storage_manager)
    await setup_event_handlers(hass, storage_manager)

    # 🚀 Registrazione Dashboard Lovelace
    await setup_dashboard(hass)

    _LOGGER.info("✅ CronoStar component setup completed")
    return True


async def _setup_static_resources(hass: HomeAssistant) -> bool:
    """Register static resources."""
    try:
        www_path = Path(hass.config.path("custom_components/cronostar/www/cronostar_card"))
        if not www_path.exists():
            return False

        if "http" in hass.config.components:
            if HAS_STATIC_PATH_CONFIG:
                await hass.http.async_register_static_paths([StaticPathConfig(url_path="/cronostar_card", path=www_path)])
            else:
                hass.http.async_register_static_path(url_path="/cronostar_card", path=str(www_path))

        integration = await async_get_integration(hass, "cronostar")
        version = integration.version
        import time

        boot_id = int(time.time())

        if "frontend" in hass.config.components:
            url_params = f"v={version}&b={boot_id}"
            add_extra_js_url(hass, f"/cronostar_card/cronostar-card.js?{url_params}")
            add_extra_js_url(hass, f"/cronostar_card/card-picker-metadata.js?{url_params}")
        return True
    except Exception as e:
        _LOGGER.error("Failed static resources: %s", e)
        return False


async def _preload_profile_cache(hass: HomeAssistant, storage_manager: StorageManager) -> None:
    """Preload profile containers."""
    try:
        files = await storage_manager.list_profiles()
        if not files:
            return
        for filename in files:
            try:
                await storage_manager.load_profile_cached(filename, force_reload=True)
            except Exception:
                pass
    except Exception as e:
        _LOGGER.warning("Preload error: %s", e)
