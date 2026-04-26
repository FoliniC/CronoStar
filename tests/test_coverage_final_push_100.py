"""Final push for 100% backend coverage - Fixed version 6."""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import json

from custom_components.cronostar import (
    async_setup, 
    async_setup_entry, 
    async_unload_entry,
    async_remove_entry,
    _async_repair_entries
)
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY, CONF_PRESET, CONF_GLOBAL_PREFIX, STORAGE_DIR, CONF_NAME, CONF_TITLE
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.setup.dashboard import write_dashboard_yaml, setup_dashboard
from custom_components.cronostar.setup.services import setup_services
from custom_components.cronostar.storage.storage_manager import StorageManager

@pytest.fixture
def mock_hass():
    hass = MagicMock()
    hass.data = {}
    hass.config.path = MagicMock(side_effect=lambda *args: "/".join(args))
    hass.config.language = "en"
    hass.is_running = True
    
    async def async_add_job(func, *args):
        if callable(func): return func(*args)
        return func
    hass.async_add_executor_job = AsyncMock(side_effect=async_add_job)
    return hass

# --- __init__.py ---

@pytest.mark.asyncio
async def test_init_async_setup_error(mock_hass):
    """Line 51: Exception in global setup."""
    with patch("custom_components.cronostar.async_setup_integration", side_effect=Exception("Setup Fail")):
        res = await async_setup(mock_hass, {})
        assert res is True
        assert mock_hass.data[DOMAIN].get("_global_setup_done") is None

@pytest.mark.asyncio
async def test_init_legacy_migration_and_title_clean(mock_hass):
    """Lines 165-167, 173-176: preset migration and title cleaning."""
    entry = MagicMock()
    entry.entry_id = "e1"
    entry.title = "Test [v1.0.0]"
    entry.data = {CONF_NAME: "N", CONF_TARGET_ENTITY: "T", "preset": "thermostat", CONF_GLOBAL_PREFIX: "p_"}
    entry.options = {}
    
    mock_hass.config_entries.async_entries = MagicMock(return_value=[entry])
    
    with patch("custom_components.cronostar.async_setup_integration", return_value=True), \
         patch("custom_components.cronostar.CronoStarCoordinator") as mock_coord:
        mock_coord.return_value.async_initialize = AsyncMock()
        mock_coord.return_value.async_config_entry_first_refresh = AsyncMock()
        
        await async_setup_entry(mock_hass, entry)
        
        calls = [c for c in mock_hass.config_entries.async_update_entry.call_args_list if "title" in c.kwargs]
        assert any(c.kwargs["title"] == "Test" for c in calls)

@pytest.mark.asyncio
async def test_init_critical_setup_failure(mock_hass):
    """Line 193-194: critical failure in entry setup."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "N", CONF_PRESET: "P", CONF_TARGET_ENTITY: "T", CONF_GLOBAL_PREFIX: "p_"}
    with patch("custom_components.cronostar.CronoStarCoordinator", side_effect=Exception("Boom")):
        res = await async_setup_entry(mock_hass, entry)
        assert res is False

@pytest.mark.asyncio
async def test_init_unload_panel_error(mock_hass):
    """Line 303-305: error removing panel."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    with patch("homeassistant.components.frontend.async_remove_panel", side_effect=Exception("Panel Fail")):
        res = await async_unload_entry(mock_hass, entry)
        assert res is True

@pytest.mark.asyncio
async def test_repair_listdir_error(mock_hass):
    """Line 380: error in os.listdir."""
    mock_hass.config.path.return_value = "/tmp"
    with patch("pathlib.Path.exists", return_value=True), \
         patch("os.listdir", side_effect=Exception("List Fail")):
        await _async_repair_entries(mock_hass)

# --- coordinator.py ---

@pytest.mark.asyncio
async def test_coordinator_sync_target_and_fallback(mock_hass):
    """Lines 150-155, 169-170: Recover target and fallback profile."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "N", CONF_PRESET: "thermostat", CONF_TARGET_ENTITY: "", CONF_GLOBAL_PREFIX: "p_"}
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["p.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"target_entity": "sensor.recovered"},
        "profiles": {"P1": {}}
    })
    
    coord = CronoStarCoordinator(mock_hass, entry)
    coord.storage_manager = storage
    await coord.async_initialize()
    assert coord.target_entity == "sensor.recovered"
    # Fallback profile
    coord.selected_profile = "Missing"
    await coord.async_initialize()
    assert coord.selected_profile == "P1"

# --- profile_service.py ---

@pytest.mark.asyncio
async def test_profile_service_defaults_and_validation(mock_hass):
    """Lines 545-546, 672, 718-721: Defaults error, missing target sync, validation error."""
    settings = MagicMock()
    settings.load_settings = AsyncMock(return_value={})
    service = ProfileService(mock_hass, MagicMock(), settings)
    service.storage.get_cached_containers = AsyncMock(return_value=[])
    
    # 545-546: Defaults error
    with patch("pathlib.Path.exists", side_effect=Exception("File Fail")):
        call = MagicMock()
        call.data = {"preset": "thermostat", "global_prefix": "p_"}
        res = await service.register_card(call)
        assert res["success"] is True

    # 672: Missing target sync
    service.storage.get_cached_containers = AsyncMock(return_value=[("f.json", {"profiles": {"D": {}}})])
    service.get_profile_data = AsyncMock(return_value={"meta": {CONF_TITLE: "CronoStar"}})
    entry = MagicMock()
    entry.data = {"global_prefix": "p_", "target_entity": "sensor.entry_target"}
    mock_hass.config_entries.async_entries = MagicMock(return_value=[entry])
    
    res = await service.register_card(call)
    assert res["profile_data"]["meta"]["target_entity"] == "sensor.entry_target"

    # 718-721: Target not found validation
    service.get_profile_data = AsyncMock(return_value={"meta": {"target_entity": "sensor.missing"}})
    mock_hass.states.get = MagicMock(return_value=None)
    res = await service.register_card(call)
    assert "not found" in res["validation"]["errors"][0]

# --- dashboard.py ---

@pytest.mark.asyncio
async def test_dashboard_gaps(mock_hass):
    """Lines 31, 127, 142-143: Orphans, grace error, missing JSON."""
    from custom_components.cronostar.setup.dashboard import _get_orphaned_profiles
    
    # 31: Dir not exists
    with patch("pathlib.Path.exists", return_value=False):
        assert _get_orphaned_profiles(Path("/tmp/none"), set()) == []
        
    # 127: TypeError in delta
    entry = MagicMock()
    entry.entry_id = "id"
    entry.title = "T"
    entry.created_at = "not a datetime"
    mock_hass.config_entries.async_entries = MagicMock(return_value=[entry])
    mock_hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    mock_hass.config_entries.async_remove = AsyncMock()
    entry.data = {"global_prefix": "p_", "preset_type": "thermostat"}
    
    with patch("pathlib.Path.exists", return_value=False), \
         patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="f.json"):
        await write_dashboard_yaml(mock_hass, "t.yaml")
        mock_hass.config_entries.async_remove.assert_called_with("id")

# --- setup/services.py ---

@pytest.mark.asyncio
async def test_services_apply_now_gaps(mock_hass):
    """Lines 198-203, 349-350: Empty schedule, interpolation, unsupported domain."""
    storage = MagicMock()
    settings = MagicMock()
    mock_hass.data[DOMAIN] = {"settings_manager": settings}
    
    with patch("custom_components.cronostar.setup.services.ProfileService") as mock_ps_class:
        service = mock_ps_class.return_value
        service.save_profile = AsyncMock()
        service.load_profile = AsyncMock()
        service.add_profile = AsyncMock()
        service.delete_profile = AsyncMock()
        service.register_card = AsyncMock()
        service.get_profile_data = AsyncMock()
        
        await setup_services(mock_hass, storage)
        handler = mock_hass.services.async_register.call_args_list[-1][0][2]
        
        # 198-203: Empty schedule
        service.get_profile_data.return_value = {"schedule": []}
        call = MagicMock(data={"target_entity": "climate.x", "profile_name": "P1"})
        await handler(call)
        
        # 349-350: Unsupported domain
        service.get_profile_data.return_value = {"schedule": [{"time": "00:00", "value": 10}]}
        call.data["target_entity"] = "unsupported.x"
        await handler(call)

@pytest.mark.asyncio
async def test_services_list_all_sync(mock_hass):
    """Lines 151-161: Synced target/preset from entry in list_all."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"global_prefix": "p_", "preset_type": "ev_charging"}, 
        "profiles": {}
    })
    
    settings = MagicMock()
    mock_hass.data[DOMAIN] = {"settings_manager": settings}
    
    entry = MagicMock()
    entry.data = {"global_prefix": "p_", "target_entity": "s.entry", "preset_type": "ev_charging"}
    mock_hass.config_entries.async_entries = MagicMock(return_value=[entry])
    
    with patch("custom_components.cronostar.setup.services.ProfileService") as mock_ps_class:
        service = mock_ps_class.return_value
        service.save_profile = AsyncMock()
        service.load_profile = AsyncMock()
        service.add_profile = AsyncMock()
        service.delete_profile = AsyncMock()
        service.register_card = AsyncMock()
        
        await setup_services(mock_hass, storage)
        list_all_handler = next(c[0][2] for c in mock_hass.services.async_register.call_args_list if c[0][1] == "list_all_profiles")
        
        res = await list_all_handler(MagicMock())
        assert "ev_charging" in res
        assert res["ev_charging"]["files"][0]["meta"]["target_entity"] == "s.entry"

# --- storage_manager.py ---

@pytest.mark.asyncio
async def test_storage_manager_errors(mock_hass):
    """Lines 229, 289, 379-380, 390-393, 456-457: listing error, list error, cache skip, fallback, update error."""
    sm = StorageManager(mock_hass, "/tmp")
    
    # 229: Listing error
    with patch("pathlib.Path.glob", side_effect=Exception("Glob Fail")):
        assert await sm.list_profiles() == []
        
    # 289: Get profile list error
    with patch.object(sm, "load_profile_cached", side_effect=Exception("Load Fail")):
        assert await sm.get_profile_list("p") == []
        
    # 379-380: Cache skip if not dict
    sm._cache["f.json"] = "not a dict"
    res = await sm.get_cached_containers(global_prefix="p")
    assert res == []
    
    # 390-393: Fallback filename-based match
    sm._cache.clear()
    # Correct filename for partition: cronostar_p1_data.json -> rest="p1_data", base_part="p1"
    sm._cache["cronostar_p1_data.json"] = {"meta": {}, "profiles": {}}
    res = await sm.get_cached_containers(global_prefix="p1")
    assert len(res) == 1
    
    # 456-457: Update error
    with patch.object(sm, "_load_container", side_effect=Exception("Fail")):
        assert await sm.update_active_profile("t", "p", "P") is False
        assert await sm.update_enabled_state("t", "p", True) is False
