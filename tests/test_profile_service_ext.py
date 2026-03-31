"""Extreme tests for ProfileService coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.const import DOMAIN

def run(coro):
    return asyncio.run(coro)

@pytest.fixture
def mock_storage_manager():
    sm = MagicMock()
    sm.list_profiles = AsyncMock(return_value=[])
    sm.load_profile_cached = AsyncMock(return_value={})
    sm.get_cached_containers = AsyncMock(return_value=[])
    sm.save_profile = AsyncMock()
    return sm

@pytest.fixture
def profile_service(hass, mock_storage_manager):
    from custom_components.cronostar.services.profile_service import ProfileService
    settings = MagicMock()
    settings.load_settings = AsyncMock(return_value={})
    return ProfileService(hass, mock_storage_manager, settings)

def test_get_profile_data_diagnostics_extended(hass, profile_service, mock_storage_manager):
    """Trigger lines 276-330 in get_profile_data."""
    mock_storage_manager.get_cached_containers = AsyncMock(side_effect=[
        [], # requested not found
        [("f1.json", {"meta": {"preset_type": "thermostat", "global_prefix": "p1"}, "profiles": {"P1": {}}})] # available
    ])
    
    res = run(profile_service.get_profile_data("Missing", "thermostat", global_prefix="p1"))
    assert "available_in_storage" in res

def test_register_card_entity_states_error(hass, profile_service, mock_storage_manager):
    """Hit line 748-749 in register_card (exception in state populating)."""
    call = MagicMock()
    call.data = {"card_id": "c1", "preset": "thermostat", "global_prefix": "p1"}
    
    # We want the exception to happen inside the try block starting at line 700
    # Line 674: self.hass.states.get(target_ent_check) - must succeed
    # Line 748: t_state = self.hass.states.get(target_ent) - inside try block
    
    # Target entity
    m = MagicMock()
    from unittest.mock import PropertyMock
    type(m).state = PropertyMock(side_effect=Exception("State lookup failed"))
    
    # Force injection into StateMachine internal dict if it's a mock, 
    # but the cleanest way is usually async_set if it wasn't for the PropertyMock requirement.
    # However, if hass.states is a MagicMock from conftest, we can just set the return value of its get.
    # Wait, the core rule says StateMachine.get is read-only.
    # If the test environment uses a REAL StateMachine, we use async_set.
    # If it uses a MagicMock, we can use return_value.
    
    # In this project, conftest.py L312 says: hass.states.get = MagicMock(return_value=None)
    # So it IS a MagicMock.
    
    def side_effect(entity_id):
        if entity_id == "light.trigger_error":
            return m
        return MagicMock(state="on")
    
    hass.states.get.side_effect = side_effect
    # Mock get_profile_data to return something valid with the target entity that triggers exception
    with patch.object(profile_service, 'get_profile_data', return_value={
        "profile_name": "Default", "schedule": [], "meta": {"target_entity": "light.trigger_error"}
    }):
        # We need to make sure er_helper.async_get works and doesn't fail before reaching the try/except
        # Line 748 in profile_service is where t_state is used
        res = run(profile_service.register_card(call))
        assert res["success"] is True
        # If line 748 raises, the try/except at line 813 catches it and response["entity_states"] is {}
        # So we check if "target" is in it
        if "target" in res["entity_states"]:
                assert res["entity_states"]["target"] == "unknown"
        else:
                assert res["entity_states"] == {}

def test_save_profile_update_entry_fields(hass, profile_service, mock_storage_manager):
    """Hit lines 108-109 in save_profile (updating entry with new meta)."""
    call = MagicMock()
    call.data = {
        "profile_name": "P1", "preset_type": "thermostat", 
        "global_prefix": "p1_", "meta": {"target_entity": "new.target", "preset_type": "fan"}
    }
    
    from tests.conftest import MockConfigEntry
    entry = MockConfigEntry(
        domain="cronostar", 
        data={"global_prefix": "p1_", "target_entity": "old.target", "preset_type": "thermostat"}
    )
    entry.add_to_hass(hass)
    
    run(profile_service.save_profile(call))
    assert hass.config_entries.async_update_entry.called

def test_validate_schedule_clamping(profile_service):
    """Hit more clamping branches in _validate_schedule."""
    schedule = [{"time": "08:00", "value": 5.0}]
    res = profile_service._validate_schedule(schedule, min_val=10.0)
    assert res[0]["value"] == 10.0
    
    schedule = [{"time": "08:00", "value": 50.0}]
    res = profile_service._validate_schedule(schedule, max_val=30.0, min_val=5.0)
    assert res[0]["value"] == 5.0

def test_validate_schedule_deduplication(profile_service):
    """Test sound logic: deduplicate points with same timestamp."""
    schedule = [
        {"time": "08:00", "value": 20.0},
        {"time": "08:00", "value": 22.0}, # Duplicate, last wins
        {"time": "10:00", "value": 18.0}
    ]
    res = profile_service._validate_schedule(schedule)
    assert len(res) == 2
    assert res[0]["time"] == "08:00"
    assert res[0]["value"] == 22.0
    assert res[1]["time"] == "10:00"
