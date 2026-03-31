"""Test logging logic."""
import asyncio
import pytest
import json
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from custom_components.cronostar.storage.storage_manager import StorageManager

def run(coro):
    return asyncio.run(coro)

def test_coordinator_logging_more(hass):
    """Trigger more logging lines in coordinator."""
    # Initialize hass.data[DOMAIN] as real dict
    sm = MagicMock()
    sm.list_profiles = AsyncMock(return_value=[])
    hass.data = {
        DOMAIN: {
            "version": "1.0.0",
            "settings_manager": MagicMock(),
            "storage_manager": sm,
            "global_config": {}
        }
    }

    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.title = "Test"
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    entry.options = {}
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True

    # Hit various log lines
    run(coordinator._async_update_data())

    # Mock data to trigger logs in refresh_profiles
    coordinator.available_profiles = ["Default"]
    run(coordinator.async_refresh_profiles())

    # Set profile log
    coordinator.storage_manager.update_active_profile = AsyncMock(return_value=True)
    run(coordinator.set_profile("Default"))

    # Set enabled log
    run(coordinator.set_enabled(True))

def test_coordinator_logging_branches(hass):
    """Hit logging branches in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    entry.options = {}
    entry.title = "Test"

    # ✅ Inizializza hass.data come dict reale PRIMA di creare il coordinator
    sm = MagicMock()
    sm.list_profiles = AsyncMock(return_value=[])
    hass.data = {DOMAIN: {"storage_manager": sm, "version": "6.0.0", "global_config": {}}}

    coordinator = CronoStarCoordinator(hass, entry)

    # Ora puoi sovrascrivere storage_manager dopo la creazione
    hass.data[DOMAIN]["storage_manager"] = MagicMock()
    hass.data[DOMAIN]["storage_manager"].list_profiles = AsyncMock(return_value=[])

    run(coordinator.async_initialize())

    # Trigger set_profile warning (profile not found)
    coordinator.available_profiles = ["Default"]
    run(coordinator.set_profile("NonExistent"))

def test_coordinator_interpolate_debug(hass):
    """Trigger debug logging in interpolation."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    entry.options = {}
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True

    schedule = [{"time": "08:00", "value": 20.0}]
    coordinator._interpolate_schedule(schedule)

def test_storage_backups_enabled_logs(hass, tmp_path):
    """Trigger logs when backups are enabled."""
    manager = StorageManager(hass, tmp_path)

    with patch("custom_components.cronostar.storage.storage_manager._LOGGER.debug") as mock_debug:
        run(manager._create_backup(tmp_path / "test.json"))

def test_storage_load_cache_lock(hass):
    """Hit cache lock and mtime check in load_profile_cached."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))

    manager._cache["f1.json"] = {"data": 1}
    manager._cache_mtimes["f1.json"] = 1000

    with patch("custom_components.cronostar.storage.storage_manager.os.path.getmtime", return_value=500):
        run(manager.load_profile_cached("f1.json"))

    with patch("pathlib.Path.exists", return_value=False):
        run(manager.load_profile_cached("f1.json", force_reload=True))

def test_storage_list_profiles_load_fail(hass):
    """Hit line 249-251 in list_profiles."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    p1 = MagicMock(spec=Path)
    p1.name = "cronostar_f1.json"
    with patch("pathlib.Path.glob", return_value=[p1]):
        manager.load_profile_cached = AsyncMock(return_value=None)
        run(manager.list_profiles())

def test_storage_json_errors(hass):
    """Hit various JSON and IO error paths."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    path = Path("test.json")

    # ✅ Patcha Path.read_text oppure open() — quello che usa realmente _load_container via executor
    # In StorageManager._load_container: 
    # content = await self.hass.async_add_executor_job(filepath.read_text, "utf-8")
    
    # Since our hass fixture in conftest.py defines async_add_executor_job as:
    # async def _exec(func, *args): return func(*args)
    # Patching filepath.read_text should work if we pass the right object.
    
    # But wait, manager._load_container(path) takes a Path object.
    # Let's patch the Path class or use side_effect on hass.async_add_executor_job
    
    with patch("custom_components.cronostar.storage.storage_manager._LOGGER") as mock_log:
        # 1. JSON Decode Error
        async def fail_json(func, *args, **kwargs):
            if "read_text" in str(func):
                raise json.JSONDecodeError("err", "doc", 0)
            return True # for exists
        
        hass.async_add_executor_job = AsyncMock(side_effect=fail_json)
        run(manager._load_container(path))
        assert mock_log.error.called

        # 2. IO Error
        async def fail_io(func, *args, **kwargs):
            if "read_text" in str(func):
                raise Exception("IO error")
            return True
        
        hass.async_add_executor_job = AsyncMock(side_effect=fail_io)
        run(manager._load_container(path))
        assert mock_log.error.called

    # 3. Write error - raises
    hass.async_add_executor_job = AsyncMock(side_effect=Exception("Write fail"))
    with pytest.raises(Exception):
        run(manager._write_json(path, {}))

    # 4. Backup error - logs but continues
    hass.async_add_executor_job = AsyncMock(side_effect=Exception("Backup fail"))
    run(manager._create_backup(path))
