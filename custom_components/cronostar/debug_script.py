import json
import logging
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: dict):
    _LOGGER.info("!!! DEBUG SCRIPT START !!!")
    for entry in hass.config_entries.async_entries("cronostar"):
        _LOGGER.info("Entry: %s, Title: %s, Data: %s", entry.entry_id, entry.title, entry.data)
    _LOGGER.info("!!! DEBUG SCRIPT END !!!")
    return True
