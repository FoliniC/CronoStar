"""Coverage boost for setup/services.py error branches."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

@pytest.fixture
def mock_ps(hass):
    ps = MagicMock()
    # ProfileService methods are awaited, so they should be AsyncMock if they need to be awaited.
    ps.save_profile = AsyncMock()
    ps.load_profile = AsyncMock()
    ps.add_profile = AsyncMock()
    ps.delete_profile = AsyncMock()
    ps.register_card = AsyncMock()
    ps.get_profile_data = AsyncMock()
    
    # settings_manager must be awaitable too
    sm = MagicMock()
    sm.load_settings = AsyncMock(return_value={})
    sm.save_settings = AsyncMock()

    hass.data[DOMAIN] = {
        "settings_manager": sm,
        "profile_service": ps
    }
    return ps

def test_save_profile_error_branch(hass, mock_ps):
    """Test exception in save_profile."""
    mock_ps.save_profile.side_effect = Exception("Save fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    # handle_service_errors is a decorator, we want to see if it catches the exception
    # Since it raises HomeAssistantError on unexpected exceptions, we check for that
    with pytest.raises(HomeAssistantError, match="Service failed: Save fail"):
        run(hass.services.async_call(DOMAIN, "save_profile", {"profile_name": "P"}))

def test_load_profile_error_branch(hass, mock_ps):
    """Test exception in load_profile."""
    mock_ps.load_profile.side_effect = Exception("Load fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    with pytest.raises(HomeAssistantError, match="Service failed: Load fail"):
        run(hass.services.async_call(DOMAIN, "load_profile", {"profile_name": "P"}))

def test_add_profile_error_branch(hass, mock_ps):
    """Test exception in add_profile."""
    mock_ps.add_profile.side_effect = Exception("Add fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    with pytest.raises(HomeAssistantError, match="Service failed: Add fail"):
        run(hass.services.async_call(DOMAIN, "add_profile", {"profile_name": "P"}))

def test_delete_profile_error_branch(hass, mock_ps):
    """Test exception in delete_profile."""
    mock_ps.delete_profile.side_effect = Exception("Del fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    with pytest.raises(HomeAssistantError, match="Service failed: Del fail"):
        run(hass.services.async_call(DOMAIN, "delete_profile", {"profile_name": "P"}))

def test_register_card_error_branch(hass, mock_ps):
    """Test exception in register_card."""
    mock_ps.register_card.side_effect = Exception("Reg fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    with pytest.raises(HomeAssistantError, match="Service failed: Reg fail"):
        run(hass.services.async_call(DOMAIN, "register_card", {"card_id": "C"}))

def test_save_settings_error_branch(hass, mock_ps):
    """Test exception in save_settings."""
    sm = hass.data[DOMAIN]["settings_manager"]
    sm.save_settings.side_effect = Exception("Save settings fail")
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    call_data = {"settings": {"val": 1}}
    with pytest.raises(HomeAssistantError, match="Service failed: Save settings fail"):
        run(hass.services.async_call(DOMAIN, "save_settings", call_data))

def test_apply_now_ha_error_bypass(hass, mock_ps):
    """Test HomeAssistantError bypass in apply_now."""
    mock_ps.get_profile_data.return_value = {"schedule": [{"time": "00:00", "value": 1.0}]}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_ps):
        run(setup_services(hass, MagicMock()))
    
    import custom_components.cronostar.utils.error_handler as eh_mod
    original_async_call = hass.services.async_call
    async def side_effect(domain, service, *args, **kwargs):
        if domain == "climate":
            raise eh_mod.HomeAssistantError("HA Error")
        return await original_async_call(domain, service, *args, **kwargs)

    with patch.object(hass.services, "async_call", side_effect=side_effect):
        call_data = {"target_entity": "climate.t", "profile_name": "P"}
        with pytest.raises(eh_mod.HomeAssistantError, match="HA Error"):
            run(hass.services.async_call(DOMAIN, "apply_now", call_data))
