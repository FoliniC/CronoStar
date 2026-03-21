"""WebSocket API per il pannello sidebar di CronoStar.

Espone un comando WebSocket che restituisce la lista dei controller
configurati con i relativi dati, usata dal pannello frontend.
"""

import logging

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN

_LOGGER = logging.getLogger(__name__)


@callback
def async_setup(hass: HomeAssistant) -> None:
    """Registra i comandi WebSocket del pannello."""
    websocket_api.async_register_command(hass, websocket_get_controllers)


@websocket_api.websocket_command({"type": "cronostar/get_controllers"})
@websocket_api.async_response
async def websocket_get_controllers(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Restituisce la lista dei controller CronoStar configurati.

    Esclude la entry globale (component_installed) e restituisce solo
    le entry controller con i dati necessari alla card.
    """
    entries = hass.config_entries.async_entries(DOMAIN)

    controllers = []
    for entry in entries:
        # Salta la entry di installazione globale
        if entry.data.get("component_installed"):
            continue

        controllers.append({
            "entry_id": entry.entry_id,
            "title": entry.title,
            "data": {
                "preset_type":          entry.data.get("preset_type"),
                "global_prefix":        entry.data.get("global_prefix"),
                "target_entity":        entry.data.get("target_entity"),
                "title":                entry.data.get("title"),
                "min_value":            entry.data.get("min_value"),
                "max_value":            entry.data.get("max_value"),
                "step_value":           entry.data.get("step_value"),
                "unit_of_measurement":  entry.data.get("unit_of_measurement"),
                "y_axis_label":         entry.data.get("y_axis_label"),
                "allow_max_value":      entry.data.get("allow_max_value", False),
                "logging_enabled":      entry.data.get("logging_enabled", False),
                "language":             entry.data.get("language", "default"),
            },
        })

    _LOGGER.debug("[CronoStar Panel] Returning %d controllers", len(controllers))
    connection.send_result(msg["id"], {"controllers": controllers})
