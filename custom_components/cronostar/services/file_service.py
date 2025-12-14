import logging
import os
import json
from functools import partial

from homeassistant.core import HomeAssistant, ServiceCall

_LOGGER = logging.getLogger(__name__)

PROFILES_PATH = "cronostar/profiles" 

class FileService:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self.profiles_dir = hass.config.path(PROFILES_PATH)
        os.makedirs(self.profiles_dir, exist_ok=True)

    def save_json(self, path: str, data: dict):
        """Save JSON data to file."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load_json(self, path: str) -> dict:
        """Load JSON data from file."""
        if not os.path.exists(path):
            return {"error": "File not found"}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def create_yaml_file(self, call: ServiceCall):
        """Creates a YAML file with the given content."""
        file_path = call.data.get("file_path")
        content = call.data.get("content")
        append = call.data.get("append", False)

        if not file_path or content is None:
            _LOGGER.error("create_yaml_file: Missing file_path or content")
            return

        # Sanitize path to ensure it's within the config directory
        abs_path = self.hass.config.path(file_path)
        if not abs_path.startswith(self.hass.config.path("")):
            _LOGGER.error("Attempted to write file outside of config directory: %s", file_path)
            return

        # Ensure directory exists
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        mode = "a" if append else "w"
        try:
            await self.hass.async_add_executor_job(
                partial(self._write_file_content, abs_path, content, mode)
            )
            _LOGGER.info("Successfully wrote to file: %s (mode: %s)", file_path, mode)
        except Exception as e:
            _LOGGER.error("Failed to write file %s: %s", file_path, e)

    def _write_file_content(self, path: str, content: str, mode: str):
        with open(path, mode, encoding="utf-8") as f:
            f.write(content)

