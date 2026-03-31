"""Advanced tests for ProfileService."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.const import DOMAIN, CONF_TITLE, CONF_MIN_VALUE, CONF_MAX_VALUE

def run(coro):
    return asyncio.run(coro)

def test_save_profile_no_schedule(hass, profile_service):
    """Test save_profile with no schedule (metadata update only)."""
    call = MagicMock()
    call.data = {
        "profile_name": "P1",
        "preset_type": "thermostat",
        "global_prefix": "p1",
        "meta": {"target_entity": "climate.test"}
    }
    
    # Mock get_profile_data to return existing profile
    with patch.object(profile_service, 'get_profile_data', return_value={
        "schedule": [{"time": "08:00", "value": 20.0}]
    }):
        profile_service.storage.save_profile = AsyncMock()
        run(profile_service.save_profile(call))
        
        # Check that schedule was preserved
        profile_service.storage.save_profile.assert_called()
        args = profile_service.storage.save_profile.call_args[1]
        assert len(args["profile_data"]["schedule"]) == 1

def test_save_profile_new_metadata_config_entry(hass, profile_service):
    """Test save_profile updates config entry data."""
    call = MagicMock()
    call.data = {
        "profile_name": "P1",
        "preset_type": "thermostat",
        "global_prefix": "p1",
        "schedule": [],
        "meta": {"target_entity": "climate.new", CONF_TITLE: "New Title"}
    }
    
    # Mock existing entry
    entry = MagicMock()
    entry.data = {"global_prefix": "p1_", "target_entity": "climate.old"}
    entry.runtime_data = MagicMock()
    entry.runtime_data.async_refresh_profiles = AsyncMock()
    
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    hass.config_entries.async_update_entry = MagicMock()
    
    profile_service.storage.save_profile = AsyncMock()
    
    run(profile_service.save_profile(call))
    
    # Check that entry was updated
    assert hass.config_entries.async_update_entry.called
    new_data = hass.config_entries.async_update_entry.call_args[1]["data"]
    assert new_data["target_entity"] == "climate.new"
    assert new_data[CONF_TITLE] == "New Title"

def test_delete_controller_success(hass, profile_service):
    """Test successful controller deletion and dashboard update."""
    call = MagicMock()
    # Use normalized prefix p1_ to match entry
    call.data = {"global_prefix": "p1_", "preset_type": "thermostat"}
    
    # Mock entries
    entry = MagicMock()
    entry.entry_id = "e1"
    entry.data = {"global_prefix": "p1_"}
    entry.title = "Test Entry"
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    hass.config_entries.async_remove = AsyncMock(return_value=True)
    
    profile_service.storage.delete_controller_files = AsyncMock(return_value=True)
    
    # Mock dashboard update functions
    with patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", new=AsyncMock()) as mock_write_yaml:
        run(profile_service.delete_controller(call))
        
        assert profile_service.storage.delete_controller_files.called
        assert hass.config_entries.async_remove.called
        assert mock_write_yaml.called
        # Verify it was called with hass and the dashboard filename
        from custom_components.cronostar.setup.dashboard import DASHBOARD_YAML_FILENAME
        mock_write_yaml.assert_called_with(hass, DASHBOARD_YAML_FILENAME)

def test_register_card_no_preset_missing_from_storage(hass, profile_service):
    """Test register_card fails if preset is missing and not found in storage."""
    call = MagicMock()
    call.data = {"card_id": "c1", "global_prefix": "p1"} # No preset
    
    # get_cached_containers returns list of (filename, data)
    profile_service.storage.get_cached_containers = AsyncMock(return_value=[])
    
    # We need to mock get_profile_data to return error since Default doesn't exist
    with patch.object(profile_service, 'get_profile_data', return_value={"error": "not found"}):
        res = run(profile_service.register_card(call))
        assert res["success"] is False
        assert "Preset type is required" in res["validation"]["errors"][0]
