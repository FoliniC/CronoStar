"""
CronoStar Setup - Global component initialization
Handles one-time setup tasks (services, storage, frontend resources, panel)
"""

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
try:
    from homeassistant.components.http import StaticPathConfig
    HAS_STATIC_PATH_CONFIG = True
except ImportError:
    HAS_STATIC_PATH_CONFIG = False

from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from ..storage.storage_manager import StorageManager
from ..storage.settings_manager import SettingsManager
from .services import setup_services
from .events import setup_event_handlers
from .validators import validate_environment
from .panel_websocket import async_setup as async_setup_panel_ws  # NEW

_LOGGER = logging.getLogger(__name__)

PANEL_URL_PATH  = "cronostar"
PANEL_TITLE     = "CronoStar"
PANEL_ICON      = "mdi:thermostat"
PANEL_JS_FILE   = "cronostar-panel.js"


async def async_setup_integration(hass: HomeAssistant, config: dict) -> bool:
    """
    Global CronoStar component setup (runs once per HA instance).

    This function:
     1. Validates the environment
     2. Sets up static frontend resources (Lovelace card)
     3. Initializes global services (Storage, Profile, Settings)
     4. Registers the sidebar panel                              ← NEW
     5. Registers WebSocket commands for the panel              ← NEW
    """
    _LOGGER.info("🌟 CronoStar: Starting component setup...")

    # 1. Validate environment
    if not await validate_environment(hass):
        _LOGGER.error("❌ Environment validation failed")
        return False

    # 2. Setup frontend resources (Lovelace card + panel JS)
    if not await _setup_static_resources(hass):
        _LOGGER.error("❌ Failed to register Lovelace card")
        return False

    # 3. Initialize global managers
    cronostar_dir = hass.config.path("cronostar")
    profiles_dir  = hass.config.path("cronostar/profiles")
    enable_backups = config.get("enable_backups", False)

    storage_manager  = StorageManager(hass, profiles_dir, enable_backups=enable_backups)
    settings_manager = SettingsManager(hass, cronostar_dir)

    hass.data.setdefault("cronostar", {})
    hass.data["cronostar"]["storage_manager"]  = storage_manager
    hass.data["cronostar"]["settings_manager"] = settings_manager
    hass.data["cronostar"]["version"]          = config.get("version", "unknown")
    hass.data["cronostar"]["logging_enabled"]  = config.get("logging_enabled", False)

    _LOGGER.info("📦 Storage manager initialized: %s", profiles_dir)
    _LOGGER.info("⚙️  Settings manager initialized: %s", cronostar_dir)

    # Preload existing profile containers into cache
    await _preload_profile_cache(hass, storage_manager)

    # 4. Register global services
    await setup_services(hass, storage_manager)

    # 5. Register event handlers
    await setup_event_handlers(hass, storage_manager)

    # 6. Register sidebar panel                                  ← NEW
    await _setup_panel(hass)

    # 7. Register WebSocket commands for the panel              ← NEW
    async_setup_panel_ws(hass)

    _LOGGER.info("✅ CronoStar component setup completed")
    _LOGGER.info("📝 Add CronoStar cards to dashboards to create controllers")

    return True


# ──────────────────────────────────────────────────────────────────────────────
# NEW: Sidebar panel registration
# ──────────────────────────────────────────────────────────────────────────────

async def _setup_panel(hass: HomeAssistant) -> None:
    """Registra il pannello CronoStar nella sidebar.

    Il file JS del pannello è servito dallo stesso path statico già
    registrato per la card (/cronostar_card), quindi non serve un
    nuovo StaticPathConfig.
    """
    try:
        from homeassistant.components import panel_custom
    except ImportError:
        _LOGGER.warning("panel_custom non disponibile, pannello sidebar non registrato")
        return

    # Evita doppia registrazione tra riavvii senza reload completo
    if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):
        _LOGGER.debug("CronoStar panel già registrato, skip")
        return

    try:
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="cronostar-panel",
            frontend_url_path=PANEL_URL_PATH,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            module_url=f"/cronostar_card/{PANEL_JS_FILE}",
            embed_iframe=False,
            require_admin=False,
        )
        _LOGGER.info("✅ CronoStar sidebar panel registrato: /%s", PANEL_URL_PATH)
    except Exception as e:  # noqa: BLE001
        _LOGGER.error("❌ Errore registrazione pannello sidebar: %s", e)


# ──────────────────────────────────────────────────────────────────────────────
# Existing helpers (unchanged)
# ──────────────────────────────────────────────────────────────────────────────

async def _setup_static_resources(hass: HomeAssistant) -> bool:
    """Register static resources for Lovelace card."""
    try:
        www_path = Path(hass.config.path("custom_components/cronostar/www/cronostar_card"))

        if not www_path.exists():
            _LOGGER.error("Frontend resources not found at %s", www_path)
            return False

        if "http" in hass.config.components:
            if HAS_STATIC_PATH_CONFIG:
                await hass.http.async_register_static_paths(
                    [StaticPathConfig(url_path="/cronostar_card", path=www_path)]
                )
            else:
                hass.http.async_register_static_path(
                    url_path="/cronostar_card", path=str(www_path)
                )
        else:
            _LOGGER.debug("HTTP component not loaded, skipping static path registration")

        integration = await async_get_integration(hass, "cronostar")
        version = integration.version

        import time
        boot_id = int(time.time())

        if "frontend" in hass.config.components:
            url_params = f"v={version}&b={boot_id}"
            add_extra_js_url(hass, f"/cronostar_card/cronostar-card.js?{url_params}")
            add_extra_js_url(hass, f"/cronostar_card/card-picker-metadata.js?{url_params}")
            # Registra anche il JS del pannello sidebar               ← NEW
            add_extra_js_url(hass, f"/cronostar_card/{PANEL_JS_FILE}?{url_params}")
            _LOGGER.info(
                "✅ Lovelace card + panel JS registrati (%s)", url_params
            )
        else:
            _LOGGER.debug("Frontend component not loaded, skipping extra JS URLs")

        return True

    except Exception as e:  # noqa: BLE001
        _LOGGER.error("Failed to setup static resources: %s", e, exc_info=True)
        return False


async def _preload_profile_cache(hass: HomeAssistant, storage_manager: StorageManager) -> None:
    """Preload all existing profile containers into the storage cache."""
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
                _LOGGER.warning("Failed to preload %s: %s", filename, e, exc_info=True)

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
        _LOGGER.warning("Preload of profile cache encountered an error: %s", e, exc_info=True)
