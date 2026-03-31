"""Test Settings Manager."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
import json
from custom_components.cronostar.storage.settings_manager import SettingsManager, DEFAULT_SETTINGS

def run(coro):
    return asyncio.run(coro)

def test_load_settings_default(hass):
    """Test loading settings when file doesn't exist."""
    with patch("pathlib.Path.exists", return_value=False), \
         patch("pathlib.Path.mkdir"), \
         patch("pathlib.Path.write_text"):
        
        manager = SettingsManager(hass, hass.config.path("cronostar"))
        settings = run(manager.load_settings())
        assert settings == DEFAULT_SETTINGS

def test_load_settings_existing(hass):
    """Test loading existing settings."""
    custom_settings = {"keyboard": {"ctrl": {"horizontal": 10}}}
    mock_data = json.dumps(custom_settings)
    
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value=mock_data), \
         patch("pathlib.Path.mkdir"):
        
        manager = SettingsManager(hass, hass.config.path("cronostar"))
        settings = run(manager.load_settings())
        assert settings["keyboard"]["ctrl"]["horizontal"] == 10
        # Check merge
        assert settings["keyboard"]["shift"]["horizontal"] == 30

def test_load_settings_exception(hass):
    """Test loading settings with exception."""
    manager = SettingsManager(hass, hass.config.path("cronostar"))
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", side_effect=OSError("Read error")):
        
        settings = run(manager.load_settings())
        # Should return defaults on error
        assert settings["keyboard"]["shift"]["horizontal"] == 30

def test_save_settings_exception(hass):
    """Test saving settings with exception."""
    manager = SettingsManager(hass, hass.config.path("cronostar"))
    with patch("pathlib.Path.write_text", side_effect=OSError("Write error")):
        success = run(manager.save_settings({"test": 1}))
        assert success is False

def test_deep_merge_edge_cases():
    """Test deep_merge with mixed types."""
    manager = SettingsManager(MagicMock(), "/tmp")
    base = {"a": {"b": 1}, "c": [1, 2]}
    overlay = {"a": "not_a_dict", "c": [3]}
    
    result = manager._deep_merge(base, overlay)
    assert result["a"] == "not_a_dict"
    assert result["c"] == [3]
