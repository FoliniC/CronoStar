import json
import logging
import os
from pathlib import Path
from datetime import datetime
from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.core import HomeAssistant
from ..const import DOMAIN, STORAGE_DIR
from ..utils.filename_builder import build_profile_filename
from datetime import timedelta
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)
PANEL_URL_PATH = "cronostar-admin"
DASHBOARD_YAML_FILENAME = "cronostar_dashboard_v600.yaml"

def _is_real_datetime(obj) -> bool:
    """Strict check for datetime to avoid MagicMock interference."""
    return isinstance(obj, datetime)

async def write_dashboard_yaml(hass: HomeAssistant, filename: str):
    yaml_path = hass.config.path(filename)
    profiles_dir = Path(hass.config.path(STORAGE_DIR))
    cards = []
    
    entries = hass.config_entries.async_entries(DOMAIN)
    seen_prefixes = set()
    
    now = dt_util.utcnow()
    grace_period = timedelta(minutes=15)
    
    for entry in entries:
        if entry.data.get("component_installed"):
            continue
            
        prefix = entry.data.get("global_prefix")
        preset = entry.data.get("preset_type")
        
        if not prefix or not preset:
            continue

        json_filename = build_profile_filename(preset, prefix)
        json_path = profiles_dir / json_filename
        if not json_path.exists():
            # If the entry was created very recently, give the user time to save their first profile
            created_at = getattr(entry, "created_at", now)

            is_within_grace = False
            if _is_real_datetime(created_at):
                try:
                    delta = now - created_at
                    is_within_grace = delta < grace_period
                except TypeError:
                    # Occurs if now/created_at types are incompatible in specific mock environments
                    is_within_grace = False

            if is_within_grace:
                _LOGGER.debug(
                    "Controller entry '%s' has no JSON file yet, but is within grace period. Skipping removal but HIDDEN from dashboard.", 
                    entry.title
                )
                continue
            else:
                _LOGGER.warning(
                    "Controller entry '%s' (prefix: %s) has no JSON file. Removing orphaned entry.", 
                    entry.title, prefix
                )
                await hass.config_entries.async_remove(entry.entry_id)
                continue
        # Skip if we already added a card for this prefix
        if prefix in seen_prefixes:
            continue
        seen_prefixes.add(prefix)

        cards.append({
            "type": "custom:cronostar-card", 
            "view_mode": "admin", 
            "global_prefix": prefix, 
            "title": f"Config: {entry.title}",
            "card_id": f"admin-{prefix.replace('_', '-')}"
        })

    # Add header card at the top (once)
    cards.insert(0, {
        "type": "markdown",
        "content": "# CronoStar Admin v6.3.2"
    })

    # Add footer card at the end
    cards.append({
        "type": "custom:cronostar-card", 
        "view_mode": "admin", 
        "not_configured": True, 
        "global_prefix": None,
        "title": "Aggiungi Controller",
        "card_id": "admin-footer-add-new"
    })    

    def _write_file():
        try:
            import yaml
            with open(yaml_path, "w", encoding="utf-8") as f:
                yaml.dump({
                    "title": "CronoStar Admin v6.3.2", 
                    "views": [{
                        "title": "Admin", 
                        "panel": True,
                        "cards": [{"type": "vertical-stack", "cards": cards}]
                    }]
                }, f, sort_keys=False)
        except (ImportError, OSError) as e:
            # Fallback to json if yaml is not available (it should be in HA)
            _LOGGER.debug("YAML library not available or write error, using JSON fallback: %s", e)
            try:
                with open(yaml_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "title": "CronoStar Admin v6.3.2", 
                        "views": [{
                            "title": "Admin", 
                            "panel": True,
                            "cards": [{"type": "vertical-stack", "cards": cards}]
                        }]
                    }, f, indent=2)
            except OSError as ex:
                _LOGGER.error("Failed to write dashboard file: %s", ex)
    await hass.async_add_executor_job(_write_file)

async def setup_dashboard(hass):
    try:
        await write_dashboard_yaml(hass, DASHBOARD_YAML_FILENAME)
    except Exception as e:
        _LOGGER.error("Failed to write dashboard file: %s", e)

