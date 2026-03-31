"""Final boost to reach 90% coverage."""
import asyncio
import json
from datetime import timezone
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from custom_components.cronostar import async_remove_entry
from custom_components.cronostar.const import CONF_GLOBAL_PREFIX, CONF_PRESET, DOMAIN
from custom_components.cronostar.services.profile_service import ProfileService

def run(coro):
    return asyncio.run(coro)

def test_async_remove_entry_controller(hass, tmp_path):
    """Test removing a controller entry with profile file marking."""
    entry = MagicMock()
    entry.data = {CONF_PRESET: "thermostat", CONF_GLOBAL_PREFIX: "p1"}
    entry.title = "Test Controller"
    
    # Mock hass.config.path to return tmp_path regardless of input
    hass.config.path = MagicMock(return_value=str(tmp_path))
    
    # Create profile file directly in tmp_path (since hass.config.path returns it)
    profile_file = tmp_path / "cronostar_p1_data.json"
    profile_file.write_text(json.dumps({"meta": {}}))
    
    # Mock UTC
    with patch("custom_components.cronostar.UTC", timezone.utc):
        run(async_remove_entry(hass, entry))
        
    assert not profile_file.exists()
    # Check if a deleted file exists
    deleted_files = list(tmp_path.glob("*_deleted_*.json"))
    assert len(deleted_files) == 1
    
    # Check content of deleted file
    content = json.loads(deleted_files[0].read_text())
    assert content["meta"]["_deleted_entry_title"] == "Test Controller"

def test_async_remove_entry_global(hass):
    """Test removing global entry (should do nothing)."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    
    run(async_remove_entry(hass, entry))
    # Should just return

def test_profile_service_load_profile_not_found(hass, profile_service):
    """Test load_profile when profile not found."""
    call = MagicMock()
    call.data = {"profile_name": "NonExistent", "global_prefix": "p1", "preset_type": "thermostat"}
    
    # Mock get_profile_data to return error
    with patch.object(profile_service, 'get_profile_data', return_value={"error": "not found"}):
        res = run(profile_service.load_profile(call))
        assert "error" in res

def test_profile_service_delete_profile_success(hass, profile_service):
    """Test successful profile deletion."""
    call = MagicMock()
    call.data = {"profile_name": "P1", "global_prefix": "p1", "preset_type": "thermostat"}
    
    profile_service.storage.delete_profile = AsyncMock(return_value=True)
    
    # Should not raise
    run(profile_service.delete_profile(call))

def test_profile_service_get_profile_data_basic(hass, profile_service):
    """Test getting profile data."""
    profile_service.storage.get_cached_containers = AsyncMock(return_value=[
        ("f1.json", {"meta": {"preset_type": "thermostat", "global_prefix": "p1"}, "profiles": {"P1": {}}})
    ])
    
    res = run(profile_service.get_profile_data("P1", "thermostat", "p1"))
    assert res["profile_name"] == "P1"
