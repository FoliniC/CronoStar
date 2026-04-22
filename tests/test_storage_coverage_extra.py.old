"""Extra coverage for storage/storage_manager.py."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import os
from custom_components.cronostar.storage.storage_manager import StorageManager

def run(coro):
    return asyncio.run(coro)

def test_save_profile_cache_mtime_error(hass):
    """Test OSError when updating cache mtime in save_profile."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    # Mock _load_container and _write_json to succeed
    manager._load_container = AsyncMock(return_value={"meta": {}, "profiles": {}})
    manager._write_json = AsyncMock()
    
    # Mock os.path.getmtime to raise OSError
    with patch("os.path.getmtime", side_effect=OSError("File missing during mtime check")):
        run(manager.save_profile("P", "thermostat", {}, {}, "prefix"))
    
    filename = "cronostar_prefix_data.json"
    assert filename in manager._cache_mtimes
    assert manager._cache_mtimes[filename] == 0

def test_load_profile_cached_mtime_error(hass):
    """Test OSError when checking mtime in load_profile_cached."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    filename = "test.json"
    manager._cache[filename] = {"data": 1}
    manager._cache_mtimes[filename] = 100
    
    # Mock os.path.getmtime to raise OSError (branch 265-267)
    with patch("os.path.getmtime", side_effect=OSError("Error")):
        manager._load_container = AsyncMock(return_value={"data": 2})
        res = run(manager.load_profile_cached(filename))
        assert res == {"data": 2}

def test_load_profile_cached_update_mtime_error(hass):
    """Test OSError when updating mtime in load_profile_cached (branch 283-285)."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    filename = "test.json"
    manager._load_container = AsyncMock(return_value={"data": 1})
    
    with patch("os.path.getmtime", side_effect=OSError("Error")):
        res = run(manager.load_profile_cached(filename))
        assert res == {"data": 1}
        assert manager._cache_mtimes[filename] == 0

def test_delete_profile_cache_mtime_error(hass):
    """Test OSError when updating mtime in delete_profile (branch 384-385)."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    filename = "cronostar_p_data.json"
    manager._load_container = AsyncMock(return_value={"profiles": {"P1": {}, "P2": {}}})
    manager._write_json = AsyncMock()
    
    with patch("os.path.getmtime", side_effect=OSError("Error")):
        run(manager.delete_profile("P1", "thermostat", "p"))
    
    assert manager._cache_mtimes[filename] == 0

def test_list_profiles_normalize_error(hass):
    """Test fallback when normalize_preset_type fails in list_profiles (branch 455-457)."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    # Mock glob to return one file
    with patch("pathlib.Path.glob", return_value=[MagicMock(name="cronostar_p_data.json")]):
        # Assign name attribute correctly to the mock path object
        filepath = MagicMock()
        filepath.name = "cronostar_p_data.json"
        with patch("pathlib.Path.glob", return_value=[filepath]):
            manager.load_profile_cached = AsyncMock(return_value={"meta": {"preset_type": "t"}})
            
            # Patch normalize_preset_type to raise Exception
            with patch("custom_components.cronostar.utils.prefix_normalizer.normalize_preset_type", side_effect=Exception("Import error")):
                res = run(manager.list_profiles(preset_type="t"))
                assert len(res) == 1

def test_update_active_profile_mtime_error(hass):
    """Test OSError when updating mtime in update_active_profile (branch 525-526)."""
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    filename = "cronostar_p_data.json"
    manager._load_container = AsyncMock(return_value={"meta": {}})
    manager._write_json = AsyncMock()
    
    with patch("os.path.getmtime", side_effect=OSError("Error")):
        run(manager.update_active_profile("t", "p", "P1"))
    
    assert manager._cache_mtimes[filename] == 0
