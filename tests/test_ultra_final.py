"""Ultra final tests for coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
import sys
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.storage.storage_manager import StorageManager
from custom_components.cronostar.setup.services import setup_services, async_unload_services
from pathlib import Path

def run(coro):
    return asyncio.run(coro)

def test_unload_services(hass):
    """Test unloading services."""
    run(async_unload_services(hass))
    assert hass.services.async_remove.called

def test_storage_list_profiles_complex_prefix(hass):
    """Test list_profiles with complex prefix fallback logic."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    p1 = MagicMock(spec=Path)
    p1.name = "cronostar_myprefix_thermostat_data.json"
    
    with patch("pathlib.Path.glob", return_value=[p1]):
        manager.load_profile_cached = AsyncMock(return_value={
            "meta": {} # No prefix, no preset in meta
        })
        
        # This hits line 261-269 fallback
        res = run(manager.list_profiles(prefix="myprefix_thermostat"))
        assert len(res) == 1

def test_apply_now_handler_unsupported_domain(hass):
    """Test apply_now handler with unsupported domain."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    # Find the apply_now handler
    apply_now_call = [call for call in hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    handler = apply_now_call[0][2]
    
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 20.0}]
    })
    
    call = MagicMock()
    call.data = {"target_entity": "unsupported.entity", "profile_name": "Default"}
    run(handler(call))

def test_storage_list_profiles_exception(hass):
    """Test list_profiles exception path."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    with patch("pathlib.Path.glob", side_effect=Exception("Glob error")):
        res = run(manager.list_profiles())
        assert res == []

def test_storage_get_profile_list_exception(hass):
    """Test get_profile_list exception path."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    with patch("custom_components.cronostar.storage.storage_manager.build_profile_filename", side_effect=Exception("Error")):
        res = run(manager.get_profile_list("thermostat", "p1"))
        assert res == []
