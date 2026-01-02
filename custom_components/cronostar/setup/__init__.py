# custom_components/cronostar/setup/__init__.py
"""
CronoStar Setup - Global component initialization
Handles one-time setup tasks (services, storage, frontend resources)
"""

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .services import setup_services
from .validators import validate_environment

_LOGGER = logging.getLogger(__name__)


async def async_setup_integration(hass: HomeAssistant, config: dict) -> bool:
    """
    Global CronoStar component setup (runs once per HA instance).

    This function:
    1. Validates the environment
    2. Sets up static frontend resources (Lovelace card)
    3. Initializes global storage manager
    4. Registers global services

    Controllers are configured via Lovelace cards, not here.

    Args:
        hass: Home Assistant instance
        config: Component configuration

    Returns:
        True if setup successful
    """
    _LOGGER.info("🌟 CronoStar: Starting component setup...")

    # 1. Validate environment
    if not await validate_environment(hass):
        _LOGGER.error("❌ Environment validation failed")
        return False

    # 2. Setup frontend resources (Lovelace card)
    if not await _setup_static_resources(hass):
        _LOGGER.error("❌ Failed to register Lovelace card")
        return False

    # 3. Initialize global storage manager
    from ..storage.storage_manager import StorageManager

    profiles_dir = hass.config.path("cronostar/profiles")
    enable_backups = config.get("enable_backups", False)

    storage_manager = StorageManager(hass, profiles_dir, enable_backups=enable_backups)

    # Store in hass.data for access by services and frontend
    hass.data.setdefault("cronostar", {})
    hass.data["cronostar"]["storage_manager"] = storage_manager
    hass.data["cronostar"]["version"] = config.get("version", "unknown")

    _LOGGER.info("📦 Storage manager initialized: %s", profiles_dir)

    # Preload existing profile containers into cache for immediate availability
    await _preload_profile_cache(hass, storage_manager)

    # 4. Register global services
    await setup_services(hass, storage_manager)

    _LOGGER.info("✅ CronoStar component setup completed")
    _LOGGER.info("📝 Add CronoStar cards to dashboards to create controllers")

    return True


async def _setup_static_resources(hass: HomeAssistant) -> bool:
    """
    Register static resources for Lovelace card.

    Args:
        hass: Home Assistant instance

    Returns:
        True if successful
    """
    try:
        www_path = Path(hass.config.path("custom_components/cronostar/www/cronostar_card"))

        if not www_path.exists():
            _LOGGER.error("Frontend resources not found at %s", www_path)
            return False

        # Register static path for card files
        await hass.http.async_register_static_paths([StaticPathConfig(url_path="/cronostar_card", path=www_path)])

        # Add JS modules to frontend
        add_extra_js_url(hass, "/cronostar_card/cronostar-card.js?v=5")
        add_extra_js_url(hass, "/cronostar_card/card-picker-metadata.js?v=5")

        _LOGGER.info("✅ Lovelace card registered: /cronostar_card/cronostar-card.js")
        return True

    except Exception as e:  # noqa: BLE001
        _LOGGER.error("Failed to setup static resources: %s", e)
        return False


async def _preload_profile_cache(hass: HomeAssistant, storage_manager) -> None:
    """
    Preload all existing profile containers into the storage cache.

    This ensures services like load_profile can serve data immediately
    after component installation, and emits helpful logs.
    """
    try:
        files = await storage_manager.list_profiles()
        if not files:
            _LOGGER.info("📄 No CronoStar profile files found to preload")
            return

        loaded = 0
        for filename in files:
            try:
                data = await storage_manager.load_profile_cached(filename, force_reload=True)
                if data:
                    loaded += 1
            except Exception as e:  # noqa: BLE001
                _LOGGER.warning("Failed to preload %s: %s", filename, e)

        # Summarize cached content
        cached = await storage_manager.get_cached_containers()
        total_profiles = 0
        prefixes = set()
        for _fname, container in cached:
            meta = container.get("meta", {})
            if isinstance(meta, dict):
                gp = meta.get("global_prefix")
                if gp:
                    prefixes.add(gp)
            profiles = container.get("profiles", {})
            if isinstance(profiles, dict):
                total_profiles += len(profiles)

        _LOGGER.info(
            "🧠 Preloaded %d/%d containers into cache (%d total profiles; prefixes: %s)",
            loaded,
            len(files),
            total_profiles,
            ", ".join(sorted(prefixes)) or "none",
        )
    except Exception as e:  # noqa: BLE001
        _LOGGER.warning("Preload of profile cache encountered an error: %s", e)
