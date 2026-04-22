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
CURRENT_VERSION = "v6.5.8"

def _is_real_datetime(obj) -> bool:
    """Strict check for datetime to avoid MagicMock interference."""
    return isinstance(obj, datetime)

async def write_dashboard_yaml(hass: HomeAssistant, filename: str):
    yaml_path = hass.config.path(filename)
    profiles_dir = Path(hass.config.path(STORAGE_DIR))
    cards = []

    # 1. Gather all sources (ConfigEntries + Orphaned JSON files)
    controllers_info = []
    target_counts = {}
    seen_prefixes = set()

    # Get data from ConfigEntries
    entries = hass.config_entries.async_entries(DOMAIN)
    for entry in entries:
        if entry.data.get("component_installed"):
            continue
        prefix = entry.data.get("global_prefix")
        target = entry.data.get("target_entity")
        if prefix:
            controllers_info.append({
                "type": "entry",
                "entry_id": entry.entry_id,
                "title": entry.title,
                "prefix": prefix,
                "target": target,
                "preset": entry.data.get("preset_type")
            })
            seen_prefixes.add(prefix)
            if target:
                target_counts[target] = target_counts.get(target, 0) + 1

    # Get data from Orphaned JSON files
    if profiles_dir.exists():
        try:
            for f in profiles_dir.glob("cronostar_*_data.json"):
                if "_deleted_" in f.name or "_j_u_n_k_" in f.name:
                    continue

                # Check if this file prefix is already covered by an entry
                # We need to guess the prefix from filename if not loaded,
                # but let's try a quick load to be sure
                try:
                    with open(f, encoding="utf-8") as file:
                        data = json.load(file)
                        meta = data.get("meta", {})
                        prefix = meta.get("global_prefix")
                        target = meta.get("target_entity")

                        if not prefix:
                            prefix = f.name.replace("_data.json", "_")

                        if prefix in seen_prefixes:
                            continue

                        controllers_info.append({
                            "type": "file",
                            "title": meta.get("name") or meta.get("title") or f.name,
                            "prefix": prefix,
                            "target": target,
                            "preset": meta.get("preset_type")
                        })
                        seen_prefixes.add(prefix)
                        if target:
                            target_counts[target] = target_counts.get(target, 0) + 1
                except Exception:
                    continue
        except Exception as e:
            _LOGGER.error("Error scanning orphaned profiles for dashboard: %s", e)

    # 1.5 Sort controllers alphabetically by target_entity
    # Controllers without a target are sorted to the end
    controllers_info.sort(key=lambda x: (x["target"] is None or x["target"] == "", x["target"] or "", x["title"] or ""))

    # 2. Build Cards
    now = dt_util.utcnow()
    grace_period = timedelta(minutes=15)
    counter = 0

    for info in controllers_info:
        prefix = info["prefix"]
        target = info["target"]
        is_orphaned = info["type"] == "file"
        # Normalise preset: use stored value or fall back to "thermostat".
        # NOTE: must use `or` instead of dict.get(key, default) because
        # info["preset"] can be explicitly None (not a missing key), and
        # dict.get returns None in that case instead of the default value.
        preset = info.get("preset") or "thermostat"

        # Check target duplication
        target_display = target or "—"
        if target and target_counts.get(target, 0) > 1:
            target_display = f"{target} ⚠️ [DUPLICATO]"

        # Check if JSON exists for entries
        if not is_orphaned:
            json_filename = build_profile_filename(preset, prefix)
            json_path = profiles_dir / json_filename
            if not json_path.exists():
                # Grace period logic
                entry = hass.config_entries.async_get_entry(info["entry_id"])
                created_at = getattr(entry, "created_at", now)
                is_within_grace = False
                if _is_real_datetime(created_at):
                    try:
                        delta = now - created_at
                        is_within_grace = delta < grace_period
                    except TypeError:
                        is_within_grace = False

                if is_within_grace:
                    continue
                else:
                    _LOGGER.warning("Controller entry '%s' has no JSON file. Removing.", info["title"])
                    await hass.config_entries.async_remove(info["entry_id"])
                    continue

        counter += 1

        status_tag = ""
        if is_orphaned:
            status_tag = " [ORFANO]"

        # Costruisco un titolo parlante per l'header del controller
        full_title = f"{info['title']}{status_tag} → {target_display}"

        cards.append({
            "type": "custom:cronostar-card",
            "view_mode": "admin",
            "global_prefix": prefix,
            "preset": preset,
            "target_entity": target or "",
            "title": full_title,
            "card_id": f"admin-{prefix.replace('_', '-')}",
            "initially_collapsed": True
        })

    # Add header card at the top (once)
    cards.insert(0, {
        "type": "markdown",
        "content": f"## CronoStar Admin {CURRENT_VERSION}"
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
                    "title": f"CronoStar Admin {CURRENT_VERSION}",
                    "views": [{
                        "title": "Admin",
                        "cards": cards
                    }]
                }, f, sort_keys=False)
        except (ImportError, OSError) as e:
            # Fallback to json if yaml is not available (it should be in HA)
            _LOGGER.debug("YAML library not available or write error, using JSON fallback: %s", e)
            try:
                with open(yaml_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "title": f"CronoStar Admin {CURRENT_VERSION}",
                        "views": [{
                            "title": "Admin",
                            "cards": cards
                        }]
                    }, f, indent=2)
            except OSError as ex:
                _LOGGER.error("Failed to write dashboard file: %s", ex)
    await hass.async_add_executor_job(_write_file)

async def setup_dashboard(hass):
    _LOGGER.error("CRONOSTAR_SYSTEM: Starting setup_dashboard task")
    try:
        await write_dashboard_yaml(hass, DASHBOARD_YAML_FILENAME)
    except Exception as e:
        _LOGGER.error("Failed to write dashboard file: %s", e)