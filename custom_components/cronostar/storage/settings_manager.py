# custom_components/cronostar/storage/settings_manager.py
"""
Settings Manager - handles global integration settings
Manages /config/cronostar/settings.json
"""

import asyncio
import json
import logging
from pathlib import Path

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "keyboard": {
        "ctrl": {"horizontal": 1, "vertical": 0.1},
        "shift": {"horizontal": 30, "vertical": 1.0},
        "alt": {"horizontal": 60, "vertical": 5.0}
    }
}

class SettingsManager:
    """Manages global settings for CronoStar"""

    def __init__(self, hass: HomeAssistant, settings_dir: str | Path):
        """Initialize SettingsManager"""
        self.hass = hass
        self.settings_dir = Path(settings_dir)
        self.settings_file = self.settings_dir / "settings.json"
        self._settings = {}
        self._lock = asyncio.Lock()

        # Ensure directory exists
        self.settings_dir.mkdir(parents=True, exist_ok=True)

    async def load_settings(self) -> dict:
        """Load settings from disk"""
        async with self._lock:
            if not self.settings_file.exists():
                self._settings = DEFAULT_SETTINGS.copy()
                await self._save_settings_locked()
                return self._settings

            try:
                content = await self.hass.async_add_executor_job(
                    self.settings_file.read_text, "utf-8"
                )
                self._settings = json.loads(content)
                
                # Merge with defaults to ensure all keys exist
                self._settings = self._deep_merge(DEFAULT_SETTINGS, self._settings)
                
                return self._settings
            except Exception as e:
                _LOGGER.error("Error loading settings: %s", e)
                return DEFAULT_SETTINGS.copy()

    async def save_settings(self, settings: dict) -> bool:
        """Save settings to disk"""
        async with self._lock:
            self._settings = settings
            return await self._save_settings_locked()

    async def _save_settings_locked(self) -> bool:
        """Save settings while holding the lock"""
        try:
            json_str = json.dumps(self._settings, indent=2, ensure_ascii=False)
            await self.hass.async_add_executor_job(
                self.settings_file.write_text, json_str, "utf-8"
            )
            return True
        except Exception as e:
            _LOGGER.error("Error saving settings: %s", e)
            return False

    def _deep_merge(self, base: dict, overlay: dict) -> dict:
        """Deep merge two dictionaries"""
        result = base.copy()
        for key, value in overlay.items():
            if isinstance(value, dict) and key in result and isinstance(result[key], dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result
