"""
CronoStar Setup - Global component initialization
Handles one-time setup tasks (services, storage, frontend resources, panel)
"""

import logging
import json
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

from ..storage.storage_manager import StorageManager
from ..storage.settings_manager import SettingsManager
from ..const import DOMAIN
from .services import setup_services
from .events import setup_event_handlers
from .validators import validate_environment

_LOGGER = logging.getLogger(__name__)

# URL stabile
PANEL_URL_PATH  = "cronostar-admin"
PANEL_TITLE     = "CronoStar (Dev)"
PANEL_ICON      = "mdi:thermostat"


async def async_setup_integration(hass: HomeAssistant, config: dict) -> bool:
    """Global component setup."""
    _LOGGER.info("🌟 CronoStar: Starting component setup...")

    if not await validate_environment(hass):
        return False

    if not await _setup_static_resources(hass):
        return False

    cronostar_dir = hass.config.path("cronostar")
    profiles_dir  = hass.config.path("cronostar/profiles")
    storage_manager  = StorageManager(hass, profiles_dir)
    settings_manager = SettingsManager(hass, cronostar_dir)

    hass.data.setdefault("cronostar", {})
    hass.data["cronostar"]["storage_manager"]  = storage_manager
    hass.data["cronostar"]["settings_manager"] = settings_manager

    await _preload_profile_cache(hass, storage_manager)
    await setup_services(hass, storage_manager)
    await setup_event_handlers(hass, storage_manager)

    # 🚀 Registrazione Dashboard Lovelace
    await _setup_dashboard(hass)

    _LOGGER.info("✅ CronoStar component setup completed")
    return True


async def _setup_dashboard(hass: HomeAssistant) -> None:
    """Registra la dashboard Lovelace e pulisce vecchie registrazioni."""
    
    # 1. Pulizia vecchi pannelli
    old_paths = ["cronostar", "cronostar-dashboard", "cronostar-v5"]
    for path in old_paths:
        try:
            async_remove_panel(hass, path)
        except Exception: pass

    # 2. Inizializza il file di configurazione della dashboard
    await _init_dashboard_storage(hass, PANEL_URL_PATH)

    # 3. Registra il pannello sidebar
    try:
        async_register_built_in_panel(
            hass,
            component_name="lovelace",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=PANEL_URL_PATH,
            config={"mode": "storage"},
            require_admin=False,
            update=True,
        )
        _LOGGER.info("✅ CronoStar panel registered at /%s", PANEL_URL_PATH)
    except Exception as e:
        _LOGGER.error("❌ Error registering sidebar panel: %s", e)

async def _init_dashboard_storage(hass: HomeAssistant, url_path: str):
    """Crea o aggiorna il file di storage della dashboard (Logica v5.4.97)."""
    import time
    now_str = time.strftime("%H:%M:%S")
    
    storage_id = url_path.replace("-", "_")
    storage_path = hass.config.path(".storage", f"lovelace.{storage_id}")
    
    _LOGGER.warning("!!! [DASHBOARD] Writing storage to %s at %s !!!", storage_path, now_str)
    
    # 1. Recupera controller reali esistenti
    entries = hass.config_entries.async_entries(DOMAIN)
    real_controllers = [e for e in entries if not e.data.get("component_installed")]
    controller_count = len(real_controllers)

    cards = []
    
    # Card di benvenuto / Intestazione
    cards.append({
        "type": "markdown",
        "content": f"## 🌟 CronoStar Admin Dashboard\nGenerata alle: **{now_str}** | Versione: **v5.5.6**"
    })
    
    # 2. LOGICA v5.4.97
    if controller_count == 0:
        # Se zero, mostra card Wizard per iniziare
        cards.append({
            "type": "custom:cronostar-card",
            "title": "Configura il tuo Primo Controller",
            "not_configured": True,
            "preset_type": "thermostat"
        })
    else:
        # Se > 0, mostra lista card reali + pulsante ConfigFlow
        for entry in real_controllers:
            cards.append({
                "type": "custom:cronostar-card",
                "preset_type": entry.data.get("preset_type"),
                "global_prefix": entry.data.get("global_prefix"),
                "target_entity": entry.data.get("target_entity"),
                "title": entry.data.get("title") or entry.title,
                "min_value": entry.data.get("min_value"),
                "max_value": entry.data.get("max_value"),
                "step_value": entry.data.get("step_value"),
                "unit_of_measurement": entry.data.get("unit_of_measurement"),
                "y_axis_label": entry.data.get("y_axis_label"),
            })
        
        # Pulsante aggiuntivo per nuovi controller (ConfigFlow)
        cards.append({
            "type": "button",
            "name": "Aggiungi Altro Controller",
            "icon": "mdi:plus-circle",
            "tap_action": {
                "action": "navigate",
                "navigation_path": "/config/integrations/dashboard/add?domain=cronostar"
            },
            "show_name": True
        })

    # Struttura dati Lovelace standard - USIAMO 'panel' per larghezza piena
    dashboard_data = {
        "version": 1,
        "minor_version": 1,
        "key": f"lovelace.{storage_id}",
        "data": {
            "config": {
                "title": "CronoStar Admin",
                "views": [
                    {
                        "title": "Home",
                        "path": "home",
                        "type": "panel",
                        "cards": [
                            {
                                "type": "vertical-stack",
                                "cards": cards
                            }
                        ]
                    }
                ]
            }
        }
    }

    try:
        def _write():
            with open(storage_path, "w") as f:
                json.dump(dashboard_data, f, indent=2)
        await hass.async_add_executor_job(_write)
    except Exception as e:
        _LOGGER.error("Failed to write dashboard: %s", e)


async def _setup_static_resources(hass: HomeAssistant) -> bool:
    """Register static resources."""
    try:
        www_path = Path(hass.config.path("custom_components/cronostar/www/cronostar_card"))
        if not www_path.exists(): return False

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
        if not files: return
        for filename in files:
            try:
                await storage_manager.load_profile_cached(filename, force_reload=True)
            except Exception: pass
    except Exception as e:
        _LOGGER.warning("Preload error: %s", e)
