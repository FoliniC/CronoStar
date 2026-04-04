"""
CronoStar Dashboard Setup - Lovelace configuration and YAML generator
"""

import json
import logging
import os
import time
from pathlib import Path

from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from ..const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# URL stabile
PANEL_URL_PATH = "cronostar-panel-v600"
PANEL_TITLE = "CronoStar Dashboard"
PANEL_ICON = "mdi:clock-edit"

# File YAML della dashboard (relativo alla config dir di HA)
DASHBOARD_YAML_FILENAME = "cronostar_dashboard_v600.yaml"


async def setup_dashboard(hass: HomeAssistant) -> None:
    """Registra la dashboard Lovelace e pulisce vecchie registrazioni."""
    _LOGGER.warning("[DASHBOARD] Executing setup_dashboard v6.1.0")

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
            "cronostar-admin-v572",
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
        await write_dashboard_yaml(hass, DASHBOARD_YAML_FILENAME)

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


async def write_dashboard_yaml(hass: HomeAssistant, filename: str) -> None:
    """Scrive la configurazione della dashboard su file."""
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
            prefix = entry.data.get("global_prefix", "cronostar_")
            # Ensure prefix ends with underscore for entity id
            if not prefix.endswith("_"):
                prefix += "_"
            
            show_chart_entity = f"input_boolean.{prefix}show_chart"
            
            # 1. Titolo del Controller
            cards.append({
                "type": "custom:mushroom-title-card",
                "title": f"🎮 {entry.title}",
                "subtitle": f"Preset: {entry.data.get('preset_type', 'N/A')}"
            })

            # 2. Card Admin (Informazioni Testuali) - SEMPRE VISIBILE
            admin_card = {
                "type": "custom:cronostar-card",
                "view_mode": "admin",
                "not_configured": False,
                "preset_type": entry.data.get("preset_type"),
                "global_prefix": entry.data.get("global_prefix"),
                "target_entity": entry.data.get("target_entity"),
                "title": f"Configurazione: {entry.data.get('title') or entry.title}",
            }
            optional_fields = {
                "min_value": entry.data.get("min_value"),
                "max_value": entry.data.get("max_value"),
                "step_value": entry.data.get("step_value"),
                "unit_of_measurement": entry.data.get("unit_of_measurement"),
            }
            admin_card.update({k: v for k, v in optional_fields.items() if v is not None})
            cards.append(admin_card)

            # 3. Toggle per mostrare/nascondere il grafico
            cards.append({
                "type": "custom:mushroom-template-card",
                "primary": "Grafico Programmazione",
                "secondary": f"{{{{ 'Chiudi Grafico' if is_state('{show_chart_entity}', 'on') else 'Apri Grafico per Modifica' }}}}",
                "icon": "mdi:chart-bell-curve",
                "icon_color": f"{{{{ 'orange' if is_state('{show_chart_entity}', 'on') else 'grey' }}}}",
                "tap_action": {
                    "action": "toggle"
                },
                "entity": show_chart_entity
            })

            # 4. Card CronoStar Standard (Grafico) - CONDIZIONALE
            chart_card = {
                "type": "custom:cronostar-card",
                "preset_type": entry.data.get("preset_type"),
                "global_prefix": entry.data.get("global_prefix"),
                "target_entity": entry.data.get("target_entity"),
                "title": entry.data.get("title") or entry.title,
            }
            chart_optional_fields = {
                "min_value": entry.data.get("min_value"),
                "max_value": entry.data.get("max_value"),
                "step_value": entry.data.get("step_value"),
                "unit_of_measurement": entry.data.get("unit_of_measurement"),
                "y_axis_label": entry.data.get("y_axis_label"),
            }
            chart_card.update({k: v for k, v in chart_optional_fields.items() if v is not None})
            
            # Aggiungi profiles_select_entity se disponibile
            profiles_select = f"select.{prefix}current_profile"
            chart_card["profiles_select_entity"] = profiles_select

            cards.append({
                "type": "conditional",
                "conditions": [
                    {
                        "entity": show_chart_entity,
                        "state": "on"
                    }
                ],
                "card": chart_card
            })

        # Aggiunge SEMPRE un box 'Aggiungi Nuovo' alla fine della lista (stile Admin Box)
        cards.append({
            "type": "custom:mushroom-title-card",
            "title": "➕ Aggiunta Nuovo Controller",
            "subtitle": "Crea una nuova istanza CronoStar"
        })
        cards.append({"type": "custom:cronostar-card", "view_mode": "admin", "not_configured": True, "title": "Nuovo Controller"})

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
