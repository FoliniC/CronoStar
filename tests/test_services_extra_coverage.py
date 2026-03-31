"""Extra coverage for setup/services.py."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
import pytest
from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services, async_unload_services

def run(coro):
    return asyncio.run(coro)

@pytest.fixture
def mock_profile_service():
    ps = MagicMock()
    ps.add_profile = AsyncMock()
    ps.delete_profile = AsyncMock()
    ps.delete_controller = AsyncMock()
    ps.register_card = AsyncMock(return_value={"success": True})
    ps.get_profile_data = AsyncMock()
    return ps

def test_add_profile_handler(hass, mock_profile_service):
    """Test add_profile handler."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        call_data = {"profile_name": "New"}
        run(hass.services.async_call(DOMAIN, "add_profile", call_data))
        # setup_services registers handlers that use hass.data[DOMAIN]["profile_service"]
        mock_profile_service.add_profile.assert_called_once()

def test_delete_profile_handler(hass, mock_profile_service):
    """Test delete_profile handler."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        call_data = {"profile_name": "Old"}
        run(hass.services.async_call(DOMAIN, "delete_profile", call_data))
        mock_profile_service.delete_profile.assert_called_once()

def test_delete_controller_handler(hass, mock_profile_service):
    """Test delete_controller handler."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        call_data = {"global_prefix": "p_"}
        run(hass.services.async_call(DOMAIN, "delete_controller", call_data))
        mock_profile_service.delete_controller.assert_called_once()

def test_register_card_handler(hass, mock_profile_service):
    """Test register_card handler."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        call_data = {"card_id": "c1"}
        run(hass.services.async_call(DOMAIN, "register_card", call_data))
        mock_profile_service.register_card.assert_called_once()

def test_list_all_profiles_validation_branches(hass):
    """Test validation branches in list_all_profiles_handler."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {
            "preset_type": "thermostat",
        },
        "profiles": {"P": {"schedule": []}}
    })
    
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    res = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    errors = res["thermostat"]["files"][0]["validation"]["errors"]
    assert "Missing global prefix" in errors
    assert "Target entity not configured" in errors

def test_list_all_profiles_file_error(hass):
    """Test error processing a single file in list_all_profiles."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json", "f2.json"])
    storage.load_profile_cached = AsyncMock(side_effect=[Exception("File error"), {
        "meta": {"preset_type": "thermostat", "global_prefix": "p_", "target_entity": "climate.t"},
        "profiles": {}
    }])
    
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    res = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    assert "thermostat" in res
    assert len(res["thermostat"]["files"]) == 1

def test_apply_now_interpolation_edge_cases(hass, mock_profile_service):
    """Test interpolation edge cases in apply_now."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "23:00", "value": 15.0}]
        })
        call_data = {"target_entity": "climate.t", "profile_name": "P"}
        
        with patch("custom_components.cronostar.setup.services.datetime") as mock_dt, \
             patch.object(hass.services, "async_call", wraps=hass.services.async_call) as mock_call:
            mock_dt.now.return_value = datetime(2024, 1, 1, 10, 0)
            run(hass.services.async_call(DOMAIN, "apply_now", call_data))
            # The first call is to apply_now itself, then apply_now calls set_temperature
            assert mock_call.call_count >= 2

def test_apply_now_next_candidate_none(hass, mock_profile_service):
    """Test apply_now when no next candidate is found (all points same value)."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "00:00", "value": 20.0}, {"time": "12:00", "value": 20.0}]
        })
        call_data = {"target_entity": "climate.t", "profile_name": "P"}
        with patch.object(hass.services, "async_call", wraps=hass.services.async_call) as mock_call:
            run(hass.services.async_call(DOMAIN, "apply_now", call_data))
            assert mock_call.call_count >= 2

def test_apply_now_next_change_same_day(hass, mock_profile_service):
    """Test next change calculation same day."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "08:00", "value": 20.0}, {"time": "12:00", "value": 22.0}]
        })
        call_data = {"target_entity": "climate.t", "profile_name": "P"}
        with patch("custom_components.cronostar.setup.services.datetime") as mock_dt, \
             patch.object(hass.services, "async_call", wraps=hass.services.async_call) as mock_call:
            mock_dt.now.return_value = datetime(2024, 1, 1, 9, 0)
            run(hass.services.async_call(DOMAIN, "apply_now", call_data))
            assert mock_call.call_count >= 2

def test_apply_now_ha_error(hass, mock_profile_service):
    """Test apply_now handling HomeAssistantError."""
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": mock_profile_service}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=mock_profile_service):
        run(setup_services(hass, MagicMock()))
        mock_profile_service.get_profile_data = AsyncMock(return_value={
            "schedule": [{"time": "00:00", "value": 20.0}]
        })
        call_data = {"target_entity": "climate.t", "profile_name": "P"}
        
        # We need to mock the INNER call to raise error
        # but the OUTER call (apply_now) should be fine until it calls the inner one.
        import custom_components.cronostar.utils.error_handler as eh_mod
        original_async_call = hass.services.async_call
        async def mock_call_side_effect(domain, service, *args, **kwargs):
            if domain == "climate":
                raise eh_mod.HomeAssistantError("HA error")
            return await original_async_call(domain, service, *args, **kwargs)
        
        with patch.object(hass.services, "async_call", side_effect=mock_call_side_effect):
            with pytest.raises(eh_mod.HomeAssistantError):
                run(hass.services.async_call(DOMAIN, "apply_now", call_data))
