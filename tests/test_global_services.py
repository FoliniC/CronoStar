"""Test Global Services Registration and Execution."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.setup.services import setup_services
from custom_components.cronostar.const import DOMAIN

def run(coro):
    return asyncio.run(coro)

def test_setup_services(hass):
    """Test service registration."""
    # Initialize hass.data[DOMAIN]
    hass.data[DOMAIN] = {
        "version": "1.0.0",
        "settings_manager": MagicMock(),
        "storage_manager": MagicMock()
    }
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    
    # Check that services were registered
    assert hass.services.async_register.called
    registered_services = [call[0][1] for call in hass.services.async_register.call_args_list]
    assert "save_profile" in registered_services
    assert "load_profile" in registered_services
    assert "apply_now" in registered_services

def get_handler(hass, service_name):
    """Utility to extract handler from registered services."""
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == service_name:
            return call[0][2]
    return None

def test_save_profile_service(hass):
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "storage_manager": MagicMock()}
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    handler = get_handler(hass, "save_profile")
    
    ps.save_profile = AsyncMock()
    
    call = MagicMock()
    call.data = {"profile_name": "Test"}
    run(handler(call))
    ps.save_profile.assert_called_with(call)

def test_load_profile_service(hass):
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "storage_manager": MagicMock()}
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    handler = get_handler(hass, "load_profile")
    
    ps.load_profile = AsyncMock()
    
    call = MagicMock()
    run(handler(call))
    ps.load_profile.assert_called_with(call)

def test_add_profile_service(hass):
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "storage_manager": MagicMock()}
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    handler = get_handler(hass, "add_profile")
    
    ps.add_profile = AsyncMock()
    
    call = MagicMock()
    run(handler(call))
    ps.add_profile.assert_called_with(call)

def test_delete_profile_service(hass):
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "storage_manager": MagicMock()}
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    handler = get_handler(hass, "delete_profile")
    
    ps.delete_profile = AsyncMock()
    
    call = MagicMock()
    run(handler(call))
    ps.delete_profile.assert_called_with(call)

def test_apply_now_service(hass):
    """Test apply_now service handler."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "storage_manager": MagicMock()}
    storage_manager = MagicMock()
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage_manager))
    handler = get_handler(hass, "apply_now")
    
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "00:00", "value": 20.0},
            {"time": "23:59", "value": 20.0}
        ]
    })
    
    call = MagicMock()
    call.data = {
        "target_entity": "climate.test",
        "profile_name": "Default"
    }
    
    run(handler(call))
    # We check if it called any climate service
    assert any(c[0][0] == "climate" for c in hass.services.async_call.call_args_list)
