"""Final refinement and 100% coverage for remaining non-core modules."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
import pytest
import os
import json
from pathlib import Path
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.storage.settings_manager import SettingsManager, DEFAULT_SETTINGS
from custom_components.cronostar.setup.dashboard import setup_dashboard, write_dashboard_yaml, _register_lovelace_dashboard
from custom_components.cronostar.setup.validators import validate_environment
from custom_components.cronostar.setup import async_setup_integration, _setup_static_resources

def run(coro):
    return asyncio.run(coro)

# --- SettingsManager Tests ---

def test_settings_manager_load_save(hass, tmp_path):
    """Test SettingsManager full coverage."""
    settings_dir = tmp_path / "cronostar"
    settings_dir.mkdir()
    manager = SettingsManager(hass, settings_dir)
    
    # Test load defaults (file doesn't exist)
    settings = run(manager.load_settings())
    assert settings == DEFAULT_SETTINGS
    assert (settings_dir / "settings.json").exists()
    
    # Test load from file
    custom = {"keyboard": {"ctrl": {"horizontal": 5}}}
    with open(settings_dir / "settings.json", "w") as f:
        json.dump(custom, f)
    
    manager._settings = {} # Clear cache
    settings = run(manager.load_settings())
    assert settings["keyboard"]["ctrl"]["horizontal"] == 5
    assert settings["keyboard"]["shift"]["horizontal"] == 30 # From default (deep merge)
    
    # Test load error
    with patch.object(hass, "async_add_executor_job", side_effect=Exception("Load error")):
        settings = run(manager.load_settings())
        assert settings == DEFAULT_SETTINGS
        
    # Test save success
    assert run(manager.save_settings({"new": "val"})) is True
    
    # Test save error
    with patch.object(hass, "async_add_executor_job", side_effect=Exception("Save error")):
        assert run(manager.save_settings({"fail": "val"})) is False

# --- Dashboard Tests ---

def test_dashboard_setup_full(hass, tmp_path):
    """Test dashboard setup branches."""
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    (tmp_path / ".storage").mkdir()
    (tmp_path / ".storage" / "lovelace.cronostar_old").touch()
    
    mock_integration = MagicMock()
    mock_integration.version = "1.0.0"
    
    with patch("custom_components.cronostar.setup.dashboard.async_get_integration", return_value=mock_integration), \
         patch("custom_components.cronostar.setup.dashboard.async_remove_panel"), \
         patch("custom_components.cronostar.setup.dashboard.async_register_built_in_panel") as mock_reg, \
         patch("custom_components.cronostar.setup.dashboard._register_lovelace_dashboard", AsyncMock()):
        
        run(setup_dashboard(hass))
        assert mock_reg.called
        assert not (tmp_path / ".storage" / "lovelace.cronostar_old").exists()

def test_write_dashboard_yaml_coverage(hass, tmp_path):
    """Test all branches in write_dashboard_yaml."""
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    
    mock_entry = MagicMock()
    mock_entry.data = {
        "preset_type": "thermostat",
        "global_prefix": "p1",
        "target_entity": "climate.t1",
        "min_value": 10,
        "max_value": 30,
        "step_value": 0.5,
        "unit_of_measurement": "°C",
        "y_axis_label": "Temp",
        "component_installed": False
    }
    mock_entry.title = "T1"
    
    hass.config_entries.async_entries.return_value = [mock_entry]
    
    mock_integration = MagicMock()
    mock_integration.version = "1.0.0"
    
    with patch("custom_components.cronostar.setup.dashboard.async_get_integration", return_value=mock_integration):
        run(write_dashboard_yaml(hass, "test.yaml"))
        assert (tmp_path / "test.yaml").exists()

def test_register_lovelace_dashboard_branches(hass):
    """Test branches in _register_lovelace_dashboard."""
    hass.data = {}
    run(_register_lovelace_dashboard(hass, "/path"))
    
    hass.data["lovelace"] = {}
    run(_register_lovelace_dashboard(hass, "/path"))

# --- Validators Tests ---

def test_validators_full_coverage(hass):
    """Test all branches in validators.py."""
    # Test missing components
    hass.config.components = []
    assert run(validate_environment(hass)) is True
    
    # Test all components present
    hass.config.components = ["input_number", "input_select", "input_boolean"]
    assert run(validate_environment(hass)) is True

# --- Setup Final Fixes ---

def test_setup_static_resources_fix(hass, tmp_path):
    """Fixed test for _setup_static_resources."""
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    www_path = tmp_path / "custom_components/cronostar/www/cronostar_card"
    www_path.mkdir(parents=True)
    
    hass.config.components = ["http", "frontend"]
    mock_integration = MagicMock()
    mock_integration.version = "1.0.0"
    
    # Patch async_register_static_paths as AsyncMock on hass.http
    hass.http.async_register_static_paths = AsyncMock()
    
    with patch("custom_components.cronostar.setup.async_get_integration", new=AsyncMock(return_value=mock_integration)), \
         patch("custom_components.cronostar.setup.HAS_STATIC_PATH_CONFIG", True), \
         patch("custom_components.cronostar.setup.StaticPathConfig", create=True, return_value=MagicMock()), \
         patch("custom_components.cronostar.setup.add_extra_js_url"):
        assert run(_setup_static_resources(hass)) is True
        assert hass.http.async_register_static_paths.called

# --- Storage Ext Fix ---

def test_write_json_error_fixed(hass, tmp_path):
    """Fixed version of test_write_json_error."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(hass, tmp_path)
    manager._load_container = AsyncMock(return_value={})
    
    with patch.object(hass, "async_add_executor_job", side_effect=Exception("IO Error")):
        res = run(manager.save_profile("P", "T", {}, {}))
        assert res is False
