"""Coverage boost for setup/services.py error branches."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services

@pytest.fixture
def mock_ps(mock_hass):
    ps = MagicMock()
    mock_hass.data[DOMAIN] = {
        "settings_manager": MagicMock(),
        "profile_service": ps
    }
    return ps

@pytest.mark.anyio
async def test_save_profile_error_branch(mock_hass, mock_ps):
    """Test exception in save_profile."""
    mock_ps.save_profile = AsyncMock(side_effect=Exception("Save fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "save_profile"][0]
    
    # This should hit lines 43-44
    with patch("custom_components.cronostar.setup.services.handle_service_errors") as mock_handle:
        await handler(MagicMock())
        assert mock_handle.called

@pytest.mark.anyio
async def test_load_profile_error_branch(mock_hass, mock_ps):
    """Test exception in load_profile."""
    mock_ps.load_profile = AsyncMock(side_effect=Exception("Load fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "load_profile"][0]
    
    # This should hit lines 56-57
    with patch("custom_components.cronostar.setup.services.handle_service_errors") as mock_handle:
        await handler(MagicMock())
        assert mock_handle.called

@pytest.mark.anyio
async def test_add_profile_error_branch(mock_hass, mock_ps):
    """Test exception in add_profile."""
    mock_ps.add_profile = AsyncMock(side_effect=Exception("Add fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "add_profile"][0]
    
    # This should hit lines 63-64
    with patch("custom_components.cronostar.setup.services.handle_service_errors") as mock_handle:
        await handler(MagicMock())
        assert mock_handle.called

@pytest.mark.anyio
async def test_delete_profile_error_branch(mock_hass, mock_ps):
    """Test exception in delete_profile."""
    mock_ps.delete_profile = AsyncMock(side_effect=Exception("Del fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "delete_profile"][0]
    
    # This should hit lines 70-71
    with patch("custom_components.cronostar.setup.services.handle_service_errors") as mock_handle:
        await handler(MagicMock())
        assert mock_handle.called

@pytest.mark.anyio
async def test_register_card_error_branch(mock_hass, mock_ps):
    """Test exception in register_card."""
    mock_ps.register_card = AsyncMock(side_effect=Exception("Reg fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "register_card"][0]
    
    # This should hit lines 87-88
    with patch("custom_components.cronostar.setup.services.handle_service_errors") as mock_handle:
        await handler(MagicMock())
        assert mock_handle.called

@pytest.mark.anyio
async def test_save_settings_error_branch(mock_hass, mock_ps):
    """Test exception in save_settings."""
    sm = mock_hass.data[DOMAIN]["settings_manager"]
    sm.save_settings = AsyncMock(side_effect=Exception("Save settings fail"))
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "save_settings"][0]
    
    # This should hit line 113
    call = MagicMock()
    call.data = {"settings": {"val": 1}}
    with pytest.raises(HomeAssistantError):
        await handler(call)

@pytest.mark.anyio
async def test_apply_now_ha_error_bypass(mock_hass, mock_ps):
    """Test HomeAssistantError bypass in apply_now."""
    mock_ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "00:00", "value": 1.0}]})
    await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    
    # Line 254-255
    with patch.object(mock_hass.services, "async_call", AsyncMock(side_effect=HomeAssistantError("HA Error"))):
        call = MagicMock()
        call.data = {"target_entity": "climate.t", "profile_name": "P"}
        with pytest.raises(HomeAssistantError):
            await handler(call)
