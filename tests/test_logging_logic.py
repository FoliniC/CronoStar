"""Tests targeting logging and rare logic paths."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
import json
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.storage.storage_manager import StorageManager
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY, CONF_LOGGING_ENABLED
from pathlib import Path

@pytest.fixture
def mock_hass(tmp_path):
    hass = MagicMock()
    hass.data = {DOMAIN: {}}
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    hass.config.path = MagicMock(side_effect=lambda x=None: str(config_dir / x) if x else str(config_dir))
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    return hass

async def test_coordinator_logging_branches(mock_hass):
    """Trigger various logging branches in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test", CONF_LOGGING_ENABLED: True}
    entry.options = {}
    
    mock_hass.data[DOMAIN] = {"logging_enabled": True}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    
    mock_hass.states.get.return_value = MagicMock(state="20")
    await coordinator._async_update_data()
    
    mock_hass.states.get.return_value = None
    await coordinator._async_update_data()

async def test_coordinator_interpolate_debug(mock_hass):
    """Trigger debug logging in interpolation."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    coordinator.logging_enabled = True
    
    schedule = [{"time": "invalid", "value": 20}]
    coordinator._interpolate_schedule(schedule)

async def test_storage_backups_enabled_logs(mock_hass):
    """Trigger logging when backups enabled."""
    with patch("pathlib.Path.mkdir"):
        manager = StorageManager(mock_hass, mock_hass.config.path("cronostar/profiles"), enable_backups=True)

async def test_storage_load_cache_lock(mock_hass):
    """Hit the cache age logic in load_profile_cached."""
    manager = StorageManager(mock_hass, mock_hass.config.path("cronostar/profiles"))
    from datetime import datetime
    
    manager._cache["f1.json"] = {"data": 1}
    manager._cache_mtimes["f1.json"] = 1000 # Use mtimes instead of timestamps
    
    with patch("custom_components.cronostar.storage.storage_manager.os.path.getmtime", return_value=500):
        await manager.load_profile_cached("f1.json")
    
    with patch("pathlib.Path.exists", return_value=False):
        await manager.load_profile_cached("f1.json", force_reload=True)

async def test_storage_list_profiles_load_fail(mock_hass):
    """Hit line 249-251 in list_profiles."""
    manager = StorageManager(mock_hass, mock_hass.config.path("cronostar/profiles"))
    p1 = MagicMock(spec=Path)
    p1.name = "cronostar_f1.json"
    with patch("pathlib.Path.glob", return_value=[p1]):
        manager.load_profile_cached = AsyncMock(return_value=None)
        await manager.list_profiles(preset_type="thermostat")

async def test_storage_json_errors(mock_hass):
    """Hit various JSON and IO error paths."""
    manager = StorageManager(mock_hass, mock_hass.config.path("cronostar/profiles"))
    path = Path("test.json")
    
    # JSON decode error
    with patch("pathlib.Path.exists", return_value=True):
        mock_hass.async_add_executor_job.side_effect = json.JSONDecodeError("err", "doc", 0)
        await manager._load_container(path)
        
    # Other error
    mock_hass.async_add_executor_job.side_effect = Exception("IO error")
    await manager._load_container(path)
    
    # Write error - raises
    with pytest.raises(Exception):
        await manager._write_json(path, {})
    
    # Backup error - logs but continues
    mock_hass.async_add_executor_job.side_effect = Exception("Backup fail")
    await manager._create_backup(path)