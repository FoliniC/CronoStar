"""Extra coverage for setup/services.py."""
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
import pytest
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services, async_unload_services

@pytest.fixture
def mock_profile_service():
    ps = MagicMock()
    ps.add_profile = AsyncMock()
    ps.delete_profile = AsyncMock()
    ps.delete_controller = AsyncMock()
    ps.register_card = AsyncMock(return_value={"success": True})
    ps.get_profile_data = AsyncMock()
    return ps

@pytest.mark.anyio
async def test_add_profile_handler(mock_hass, mock_profile_service):
    """Test add_profile handler."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        await setup_services(mock_hass, MagicMock())
        # Find call
        handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "add_profile"][0]
        call = MagicMock()
        call.data = {"profile_name": "New"}
        await handler(call)
        mock_profile_service.add_profile.assert_called_once_with(call)

@pytest.mark.anyio
async def test_delete_profile_handler(mock_hass, mock_profile_service):
    """Test delete_profile handler."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "delete_profile"][0]
        call = MagicMock()
        call.data = {"profile_name": "Old"}
        await handler(call)
        mock_profile_service.delete_profile.assert_called_once_with(call)

@pytest.mark.anyio
async def test_delete_controller_handler(mock_hass, mock_profile_service):
    """Test delete_controller handler."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "delete_controller"][0]
        call = MagicMock()
        call.data = {"global_prefix": "p_"}
        await handler(call)
        mock_profile_service.delete_controller.assert_called_once_with(call)

@pytest.mark.anyio
async def test_register_card_handler(mock_hass, mock_profile_service):
    """Test register_card handler."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "register_card"][0]
        call = MagicMock()
        await handler(call)
        mock_profile_service.register_card.assert_called_once_with(call)

@pytest.mark.anyio
async def test_list_all_profiles_validation_branches(mock_hass):
    """Test validation branches in list_all_profiles_handler."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {
            "preset_type": "thermostat",
        },
        "profiles": {"P": {"schedule": []}}
    })
    
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, storage)
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "list_all_profiles"][0]
        res = await handler(MagicMock())
        errors = res["thermostat"]["files"][0]["validation"]["errors"]
        assert "Missing global prefix" in errors
        assert "Target entity not configured" in errors

@pytest.mark.anyio
async def test_list_all_profiles_file_error(mock_hass):
    """Test error processing a single file in list_all_profiles."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json", "f2.json"])
    storage.load_profile_cached = AsyncMock(side_effect=[Exception("File error"), {
        "meta": {"preset_type": "thermostat", "global_prefix": "p_", "target_entity": "climate.t"},
        "profiles": {}
    }])
    
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, storage)
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "list_all_profiles"][0]
        res = await handler(MagicMock())
        assert "thermostat" in res
        assert len(res["thermostat"]["files"]) == 1

@pytest.mark.anyio
async def test_apply_now_interpolation_edge_cases(mock_hass, mock_profile_service):
    """Test interpolation edge cases in apply_now."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "apply_now"][0]
        
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "23:00", "value": 15.0}]
        })
        call = MagicMock()
        call.data = {"target_entity": "climate.t", "profile_name": "P"}
        
        with patch("custom_components.cronostar.setup.services.datetime") as mock_dt, \
             patch.object(mock_hass.services, "async_call", AsyncMock()) as mock_call:
            mock_dt.now.return_value = datetime(2024, 1, 1, 10, 0)
            await handler(call)
            mock_call.assert_called()

@pytest.mark.anyio
async def test_apply_now_next_candidate_none(mock_hass, mock_profile_service):
    """Test apply_now when no next candidate is found (all points same value)."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "apply_now"][0]
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "00:00", "value": 20.0}, {"time": "12:00", "value": 20.0}]
        })
        call = MagicMock()
        call.data = {"target_entity": "climate.t", "profile_name": "P"}
        with patch.object(mock_hass.services, "async_call", AsyncMock()):
            await handler(call)
            assert mock_hass.services.async_call.called

@pytest.mark.anyio
async def test_apply_now_next_change_same_day(mock_hass, mock_profile_service):
    """Test next change calculation same day."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "apply_now"][0]
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "08:00", "value": 20.0}, {"time": "12:00", "value": 22.0}]
        })
        call = MagicMock()
        call.data = {"target_entity": "climate.t", "profile_name": "P"}
        with patch("custom_components.cronostar.setup.services.datetime") as mock_dt, \
             patch.object(mock_hass.services, "async_call", AsyncMock()):
            mock_dt.now.return_value = datetime(2024, 1, 1, 9, 0)
            await handler(call)
            assert mock_hass.services.async_call.called

@pytest.mark.anyio
async def test_apply_now_ha_error(mock_hass, mock_profile_service):
    """Test apply_now handling HomeAssistantError."""
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service), \
         patch.object(mock_hass.services, "async_register") as mock_reg:
        await setup_services(mock_hass, MagicMock())
        handler = [call[0][2] for call in mock_reg.call_args_list if call[0][1] == "apply_now"][0]
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "00:00", "value": 20.0}]
        })
        call = MagicMock()
        call.data = {"target_entity": "climate.t", "profile_name": "P"}
        with patch.object(mock_hass.services, "async_call", AsyncMock(side_effect=HomeAssistantError("HA error"))):
            with pytest.raises(HomeAssistantError):
                await handler(call)
