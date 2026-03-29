"""Final coverage boost for setup/services.py."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services, async_unload_services
from custom_components.cronostar.exceptions import ProfileNotFoundError, ScheduleApplicationError

@pytest.mark.anyio
async def test_save_settings_no_settings(mock_hass):
    """Test save_settings with no settings in data."""
    sm = MagicMock()
    mock_hass.data[DOMAIN] = {"settings_manager": sm}
    await setup_services(mock_hass, MagicMock())
    
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "save_settings"][0]
    call = MagicMock()
    call.data = {"settings": None}
    await handler(call)
    assert not sm.save_settings.called

@pytest.mark.anyio
async def test_list_all_profiles_target_entity_not_found(mock_hass):
    """Test list_all_profiles with a non-existent target entity in running state."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"preset_type": "t", "global_prefix": "p", "target_entity": "light.missing"},
        "profiles": {"P": {"schedule": []}}
    })
    
    mock_hass.is_running = True
    mock_hass.states.get = MagicMock(return_value=None)
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    
    await setup_services(mock_hass, storage)
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "list_all_profiles"][0]
    res = await handler(MagicMock())
    
    errors = res["t"]["files"][0]["validation"]["errors"]
    assert "Target entity 'light.missing' not found" in errors

@pytest.mark.anyio
async def test_apply_now_unsupported_domain_warning(mock_hass):
    """Test apply_now with an unsupported domain."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}]
    })
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(mock_hass, MagicMock())
    
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    call = MagicMock()
    call.data = {"target_entity": "unsupported.entity", "profile_name": "P"}
    
    with patch("custom_components.cronostar.setup.services._LOGGER") as mock_logger:
        await handler(call)
        mock_logger.warning.assert_any_call("apply_now: Unsupported domain '%s'", "unsupported")

@pytest.mark.anyio
async def test_apply_now_various_domains(mock_hass):
    """Test apply_now with switch, light, input_number, cover."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 50.0}]
    })
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    
    # input_number
    call = MagicMock()
    call.data = {"target_entity": "input_number.test", "profile_name": "P"}
    with patch.object(mock_hass.services, "async_call", AsyncMock()) as mock_call:
        await handler(call)
        mock_call.assert_called_with("input_number", "set_value", {"entity_id": "input_number.test", "value": 50.0}, blocking=False)
        
    # light (ON)
    call.data = {"target_entity": "light.test", "profile_name": "P"}
    with patch.object(mock_hass.services, "async_call", AsyncMock()) as mock_call:
        await handler(call)
        mock_call.assert_called_with("light", "turn_on", {"entity_id": "light.test"}, blocking=False)
        
    # switch (OFF)
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "00:00", "value": 0.0}]})
    call.data = {"target_entity": "switch.test", "profile_name": "P"}
    with patch.object(mock_hass.services, "async_call", AsyncMock()) as mock_call:
        await handler(call)
        mock_call.assert_called_with("switch", "turn_off", {"entity_id": "switch.test"}, blocking=False)
        
    # cover
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "00:00", "value": 80.0}]})
    call.data = {"target_entity": "cover.test", "profile_name": "P"}
    with patch.object(mock_hass.services, "async_call", AsyncMock()) as mock_call:
        await handler(call)
        mock_call.assert_called_with("cover", "set_cover_position", {"entity_id": "cover.test", "position": 80}, blocking=False)

@pytest.mark.anyio
async def test_apply_now_empty_schedule(mock_hass):
    """Test apply_now with empty schedule."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    
    call = MagicMock()
    call.data = {"target_entity": "climate.test", "profile_name": "P"}
    await handler(call)
    assert not mock_hass.services.async_call.called

@pytest.mark.anyio
async def test_apply_now_profile_not_found(mock_hass):
    """Test apply_now with profile not found."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={"error": "Not found"})
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    
    call = MagicMock()
    call.data = {"target_entity": "climate.test", "profile_name": "P"}
    with pytest.raises(ProfileNotFoundError):
        await handler(call)

@pytest.mark.anyio
async def test_apply_now_generic_exception(mock_hass):
    """Test apply_now generic exception handling."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(side_effect=Exception("Unexpected"))
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(mock_hass, MagicMock())
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "apply_now"][0]
    
    call = MagicMock()
    call.data = {"target_entity": "climate.test", "profile_name": "P"}
    with pytest.raises(ScheduleApplicationError):
        await handler(call)

@pytest.mark.anyio
async def test_list_all_profiles_not_running(mock_hass):
    """Test list_all_profiles when HA is not yet running."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"preset_type": "t", "global_prefix": "p", "target_entity": "light.any"},
        "profiles": {}
    })
    
    mock_hass.is_running = False # Not running
    mock_hass.states.get = MagicMock(return_value=None) # Entity missing
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    
    await setup_services(mock_hass, storage)
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "list_all_profiles"][0]
    res = await handler(MagicMock())
    
    # Should NOT have error about target entity because not running
    errors = res["t"]["files"][0]["validation"]["errors"]
    assert "Target entity 'light.any' not found" not in errors

@pytest.mark.anyio
async def test_async_unload_services_full(mock_hass):
    """Test async_unload_services calls async_remove for all services."""
    with patch.object(mock_hass.services, "async_remove", AsyncMock()) as mock_remove:
        await async_unload_services(mock_hass)
        assert mock_remove.call_count == 7
