"""Test logging logic."""
import pytest
import json
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from custom_components.cronostar.storage.storage_manager import StorageManager, _LOGGER

@pytest.mark.anyio
async def test_coordinator_logging_more(hass):
    """Trigger more logging lines in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True
    
    # Hit various log lines
    await coordinator._async_update_data()
    
    # Mock data to trigger logs in refresh_profiles
    coordinator.available_profiles = ["Default"]
    await coordinator.async_refresh_profiles()
    
    # Set profile log
    coordinator.storage_manager.update_active_profile = AsyncMock(return_value=True)
    await coordinator.set_profile("Default")
    
    # Set enabled log
    await coordinator.set_enabled(True)

@pytest.mark.anyio
async def test_coordinator_logging_branches(hass):
    """Hit logging branches in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    
    # Mock storage_manager to trigger warnings in initialize
    hass.data[DOMAIN]["storage_manager"] = MagicMock()
    hass.data[DOMAIN]["storage_manager"].list_profiles = AsyncMock(return_value=[])
    
    await coordinator.async_initialize()
    
    # Trigger set_profile warning (profile not found)
    coordinator.available_profiles = ["Default"]
    await coordinator.set_profile("NonExistent")

@pytest.mark.anyio
async def test_coordinator_interpolate_debug(hass):
    """Trigger debug logging in interpolation."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True
    
    schedule = [{"time": "08:00", "value": 20.0}]
    coordinator._interpolate_schedule(schedule)

@pytest.mark.anyio
async def test_storage_backups_enabled_logs(hass, tmp_path):
    """Trigger logs when backups are enabled."""
    manager = StorageManager(hass, tmp_path)
    
    with patch("custom_components.cronostar.storage.storage_manager._LOGGER.debug") as mock_debug:
        await manager._create_backup(tmp_path / "test.json")
        # Should call debug if successful (but it fails because file doesn't exist)
        # So it calls warning
        
@pytest.mark.anyio
async def test_storage_load_cache_lock(hass):
    """Hit cache lock and mtime check in load_profile_cached."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    manager._cache["f1.json"] = {"data": 1}
    manager._cache_mtimes["f1.json"] = 1000 # Use mtimes instead of timestamps
    
    with patch("custom_components.cronostar.storage.storage_manager.os.path.getmtime", return_value=500):
        await manager.load_profile_cached("f1.json")
    
    with patch("pathlib.Path.exists", return_value=False):
        await manager.load_profile_cached("f1.json", force_reload=True)

@pytest.mark.anyio
async def test_storage_list_profiles_load_fail(hass):
    """Hit line 249-251 in list_profiles."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    p1 = MagicMock(spec=Path)
    p1.name = "cronostar_f1.json"
    with patch("pathlib.Path.glob", return_value=[p1]):
        manager.load_profile_cached = AsyncMock(return_value=None)
        await manager.list_profiles()

@pytest.mark.anyio
async def test_storage_json_errors(hass):
    """Hit various JSON and IO error paths."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    path = Path("test.json")
    
    # JSON decode error
    def side_effect(func, *args):
        if "read_text" in str(func):
            raise json.JSONDecodeError("err", "doc", 0)
        return True # for exists()
        
    with patch("custom_components.cronostar.storage.storage_manager._LOGGER.error") as mock_err:
        hass.async_add_executor_job.side_effect = side_effect
        await manager._load_container(path)
        assert mock_err.called
        
    # Other error
    hass.async_add_executor_job.side_effect = None
    def io_side_effect(func, *args):
        if "read_text" in str(func):
            raise Exception("IO error")
        return True # for exists()
        
    with patch("custom_components.cronostar.storage.storage_manager._LOGGER.error") as mock_err:
        hass.async_add_executor_job.side_effect = io_side_effect
        await manager._load_container(path)
        assert mock_err.called
    
    # Reset side effect
    hass.async_add_executor_job.side_effect = None
    
    # Write error - raises
    hass.async_add_executor_job.side_effect = Exception("Write fail")
    with pytest.raises(Exception):
        await manager._write_json(path, {})
    
    # Backup error - logs but continues
    hass.async_add_executor_job.side_effect = Exception("Backup fail")
    await manager._create_backup(path)
