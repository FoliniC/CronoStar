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
from .events import setup_event_handlers
from .services import setup_services
from .validators import validate_environment

_LOGGER = logging.getLogger(__name__)

# URL stabile
PANEL_URL_PATH = "cronostar-panel-v5841"
PANEL_TITLE = "CronoStar Dashboard"
PANEL_ICON = "mdi:clock-edit"

# File YAML della dashboard (relativo alla config dir di HA)
DASHBOARD_YAML_FILENAME = "cronostar_dashboard_v5841.yaml"


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
    await _setup_dashboard(hass)

    _LOGGER.info("✅ CronoStar component setup completed")
    return True


async def _setup_dashboard(hass: HomeAssistant) -> None:
    """Registra la dashboard Lovelace e pulisce vecchie registrazioni."""
    _LOGGER.warning("[DASHBOARD] Executing _setup_dashboard v5.7.9")

    try:
        # 1. Pulizia massiva di TUTTI i possibili vecchi percorsi
        all_possible_paths = [
            "cronostar",
            "cronostar-dashboard",
            "cronostar-v5",
            "cronostar-admin",
            "cronostar-v6",
            "cronostar-admin-final",
            "cronostar-admin-v57",
            "cronostar-v572",
            "cronostar-panel-v573",
            PANEL_URL_PATH,
        ]

        # Rimuove tutti i file .storage lovelace.cronostar* per evitare
        # che HA dia loro priorità sul file YAML
        def _purge_old_storage_files():
            storage_dir = Path(hass.config.path(".storage"))
            if storage_dir.exists():
                for storage_file in storage_dir.glob("lovelace.cronostar*"):
                    try:
                        os.remove(storage_file)
                        _LOGGER.warning("[DASHBOARD] PURGED OLD STORAGE FILE: %s", storage_file)
                    except Exception as e:
                        _LOGGER.error("[DASHBOARD] Failed to purge %s: %s", storage_file, e)

        await hass.async_add_executor_job(_purge_old_storage_files)

        for path in all_possible_paths:
            try:
                async_remove_panel(hass, path)
            except Exception:
                pass

        # 2. Scrivi il file YAML fisico sul disco
        await _write_dashboard_yaml(hass, DASHBOARD_YAML_FILENAME)

        # 3. Registra il pannello sidebar
        abs_yaml_path = hass.config.path(DASHBOARD_YAML_FILENAME)
        async_register_built_in_panel(
            hass,
            component_name="lovelace",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=PANEL_URL_PATH,
            config={"mode": "yaml", "filename": abs_yaml_path},
            require_admin=False,
            update=True,
        )
        _LOGGER.warning("✅ [DASHBOARD] Panel registered at /%s using %s", PANEL_URL_PATH, abs_yaml_path)

        # 4. Registra nel backend Lovelace
        await _register_lovelace_dashboard(hass, abs_yaml_path)

    except Exception as e:
        _LOGGER.error("❌ [DASHBOARD] Critical failure: %s", e, exc_info=True)


async def _register_lovelace_dashboard(hass: HomeAssistant, abs_yaml_path: str) -> None:
    """Registra la dashboard nella collezione interna del componente lovelace."""
    try:
        from homeassistant.components.lovelace.dashboard import LovelaceYAML

        if "lovelace" not in hass.data:
            _LOGGER.error("[DASHBOARD] 'lovelace' non presente in hass.data")
            return

        lovelace_data = hass.data["lovelace"]
        _LOGGER.warning("[DASHBOARD] DEBUG: hass.data['lovelace'] type: %s", type(lovelace_data))

        # Gestisce sia oggetto LovelaceData che eventuale dizionario
        dashboards = getattr(lovelace_data, "dashboards", None)
        if dashboards is None and isinstance(lovelace_data, dict):
            dashboards = lovelace_data.get("dashboards")

        if dashboards is None:
            _LOGGER.error("[DASHBOARD] 'dashboards' non trovato nei dati Lovelace")
            return

        # Rimuove eventuale registrazione precedente per lo stesso path
        if PANEL_URL_PATH in dashboards:
            _LOGGER.debug("[DASHBOARD] Removing previous lovelace dashboard entry for %s", PANEL_URL_PATH)
            dashboards.pop(PANEL_URL_PATH)

        # FIX: L'ordine corretto dei parametri per LovelaceYAML è (hass, url_path, config)
        dashboards[PANEL_URL_PATH] = LovelaceYAML(
            hass,
            PANEL_URL_PATH,
            {"mode": "yaml", "filename": abs_yaml_path},
        )
        _LOGGER.warning("✅ [DASHBOARD] Lovelace backend registration successful: %s", PANEL_URL_PATH)

    except Exception as e:
        _LOGGER.error("[DASHBOARD] Failed to register dashboard: %s", e, exc_info=True)


async def _write_dashboard_yaml(hass: HomeAssistant, filename: str) -> None:
    """Scrive la configurazione della dashboard su file.

    FIX: usa json.dump invece di yaml.dump — JSON è YAML valido al 100% e
    non presenta edge case di formattazione (stringhe multiline, caratteri
    Unicode, valori None) che causano la vista vuota 'Nuova sezione'.
    """
    import time

    now_str = time.strftime("%H:%M:%S")
    yaml_path = hass.config.path(filename)
    _LOGGER.warning("!!! [DASHBOARD] WRITING YAML TO DISK: %s at %s !!!", yaml_path, now_str)

    try:
        integration = await async_get_integration(hass, DOMAIN)
        version = integration.version

        # Recupera controller reali
        entries = hass.config_entries.async_entries(DOMAIN)
        real_controllers = [e for e in entries if not e.data.get("component_installed")]

        cards = []

        # Intestazione
        cards.append(
            {
                "type": "markdown",
                "content": (f"## CronoStar Admin Dashboard\nVersione: **v{version}** | Aggiornato: **{now_str}**\n*Dashboard in modalita YAML (Read-only UI)*"),
            }
        )

        # Controllers
        for entry in real_controllers:
            # FIX: filtra i valori None — evita chiavi null nel JSON/YAML
            # che alcuni parser HA non gestiscono correttamente
            card = {
                "type": "custom:cronostar-card",
                "view_mode": "admin",  # ← FIX: attiva la modalità box compatto
                "not_configured": False,  # ← FIX: forza lo stato configurato per evitare il default 'true'
                "preset_type": entry.data.get("preset_type"),
                "global_prefix": entry.data.get("global_prefix"),
                "target_entity": entry.data.get("target_entity"),
                "title": entry.data.get("title") or entry.title,
            }
            optional_fields = {
                "min_value": entry.data.get("min_value"),
                "max_value": entry.data.get("max_value"),
                "step_value": entry.data.get("step_value"),
                "unit_of_measurement": entry.data.get("unit_of_measurement"),
                "y_axis_label": entry.data.get("y_axis_label"),
            }
            # Aggiunge i campi opzionali solo se valorizzati
            card.update({k: v for k, v in optional_fields.items() if v is not None})
            cards.append(card)

        # Aggiunge SEMPRE un box 'Aggiungi Nuovo' alla fine della lista (stile Admin Box)
        cards.append({"type": "custom:cronostar-card", "view_mode": "admin", "not_configured": True, "preset_type": "thermostat", "title": "Nuovo Controller"})

        # Struttura Lovelace — view standard senza 'type: panel' o 'type: sections'
        # per massima compatibilità con tutte le versioni di HA
        dashboard_config = {
            "title": "CronoStar Admin Dashboard",
            "views": [
                {
                    "title": "Overview",
                    "path": "overview",
                    "cards": [
                        {
                            "type": "vertical-stack",
                            "cards": cards,
                        }
                    ],
                }
            ],
        }

        def _write() -> None:
            # Scrive JSON con pretty-print: è YAML valido, zero ambiguità
            # di formattazione rispetto a yaml.dump
            with open(yaml_path, "w", encoding="utf-8") as f:
                json.dump(dashboard_config, f, indent=2, ensure_ascii=False)

        await hass.async_add_executor_job(_write)
        _LOGGER.warning("✅ [DASHBOARD] FILE WRITTEN SUCCESSFULLY: %s", yaml_path)

    except Exception as e:
        _LOGGER.error("❌ [DASHBOARD] Failed to write dashboard file: %s", e, exc_info=True)


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
