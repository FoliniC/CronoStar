"""Final coverage boost for setup/services.py."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services, async_unload_services
from custom_components.cronostar.exceptions import ProfileNotFoundError, ScheduleApplicationError

def run(coro):
    return asyncio.run(coro)

def test_save_settings_no_settings(hass):
    """Test save_settings with no settings in data."""
    sm = MagicMock()
    sm.save_settings = AsyncMock()
    hass.data[DOMAIN] = {"settings_manager": sm}
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    run(hass.services.async_call(DOMAIN, "save_settings", {"settings": None}))
    assert not sm.save_settings.called

def test_list_all_profiles_target_entity_not_found(hass):
    """Test list_all_profiles with a non-existent target entity in running state."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"preset_type": "t", "global_prefix": "p", "target_entity": "light.missing"},
        "profiles": {"P": {"schedule": []}}
    })
    
    hass.is_running = True
    # light.missing is NOT in hass.states
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    res = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    
    errors = res["t"]["files"][0]["validation"]["errors"]
    assert "Target entity 'light.missing' not found" in errors

def test_apply_now_unsupported_domain_warning(hass):
    """Test apply_now with an unsupported domain."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}]
    })
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    call_data = {"target_entity": "unsupported.entity", "profile_name": "P"}
    
    with patch("custom_components.cronostar.setup.services._LOGGER") as mock_logger:
        run(hass.services.async_call(DOMAIN, "apply_now", call_data))
        mock_logger.warning.assert_any_call("apply_now: Unsupported domain '%s'", "unsupported")

def test_apply_now_various_domains(hass):
    """Test apply_now with switch, light, input_number, cover."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 50.0}]
    })
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    # input_number
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "input_number.test", "profile_name": "P"}))
    # Filter for input_number call
    in_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "input_number"]
    assert in_calls[0][0][1] == "set_value"
    assert in_calls[0][0][2]["value"] == 50.0
        
    # light (ON)
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "light.test", "profile_name": "P"}))
    l_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "light"]
    assert l_calls[0][0][1] == "turn_on"
        
    # switch (OFF)
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "00:00", "value": 0.0}]})
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "switch.test", "profile_name": "P"}))
    s_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "switch"]
    assert s_calls[0][0][1] == "turn_off"
        
    # cover
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "00:00", "value": 80.0}]})
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "cover.test", "profile_name": "P"}))
    c_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "cover"]
    assert c_calls[0][0][1] == "set_cover_position"
    assert c_calls[0][0][2]["position"] == 80

def test_apply_now_empty_schedule(hass):
    """Test apply_now with empty schedule."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.test", "profile_name": "P"}))
    # Only the call to apply_now itself was made (to register it), but it shouldn't call anything else.
    # Actually async_call.called would be True because we just CALLED it.
    # We check if it called OTHER domains.
    other_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] != DOMAIN]
    assert len(other_calls) == 0

def test_apply_now_profile_not_found(hass):
    """Test apply_now with profile not found."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={"error": "Not found"})
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    import custom_components.cronostar.utils.error_handler as eh_mod
    with pytest.raises(eh_mod.HomeAssistantError):
        run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.test", "profile_name": "P"}))

def test_apply_now_generic_exception(hass):
    """Test apply_now generic exception handling."""
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(side_effect=Exception("Unexpected"))
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    import custom_components.cronostar.utils.error_handler as eh_mod
    with pytest.raises(eh_mod.HomeAssistantError):
        run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.test", "profile_name": "P"}))

def test_list_all_profiles_not_running(hass):
    """Test list_all_profiles when HA is not yet running."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"preset_type": "t", "global_prefix": "p", "target_entity": "light.any"},
        "profiles": {}
    })
    
    hass.is_running = False # Not running
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    res = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    
    # Should NOT have error about target entity because not running
    errors = res["t"]["files"][0]["validation"]["errors"]
    assert "Target entity 'light.any' not found" not in errors

def test_async_unload_services_full(hass):
    """Test async_unload_services calls async_remove for all services."""
    run(async_unload_services(hass))
    assert hass.services.async_remove.call_count == 7
