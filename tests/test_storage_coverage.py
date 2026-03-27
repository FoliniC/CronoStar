"""Coverage tests for CronoStar Storage Manager."""
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

def _make_hass(tmp_path):
    hass = MagicMock()
    hass.config.path = MagicMock(return_value=str(tmp_path))

    async def fake_executor(func, *args, **kwargs):
        if hasattr(func, "__call__"):
            return func(*args, **kwargs)
        return func

    hass.async_add_executor_job = AsyncMock(side_effect=fake_executor)
    return hass

def _make_storage(hass, tmp_path):
    from custom_components.cronostar.storage.storage_manager import StorageManager
    return StorageManager(hass, tmp_path / "profiles")

@pytest.mark.anyio
async def test_delete_controller_files_with_preset(tmp_path):
    """Test delete_controller_files with a specific preset."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    
    # Create a file
    filename = "cronostar_thermostat_test_.json"
    file_path = storage.profiles_dir / filename
    file_path.write_text("{}", encoding="utf-8")
    
    # Pre-fill cache
    storage._cache[filename] = {"test": 1}
    storage._cache_mtimes[filename] = 12345
    
    with patch("custom_components.cronostar.storage.storage_manager.build_profile_filename", return_value=filename):
        result = await storage.delete_controller_files("test_", "thermostat")
        
    assert result is True
    assert not file_path.exists()
    assert filename not in storage._cache
    assert filename not in storage._cache_mtimes

@pytest.mark.anyio
async def test_delete_controller_files_without_preset(tmp_path):
    """Test delete_controller_files searching by prefix."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    
    # Create two files for the same prefix
    f1 = storage.profiles_dir / "cronostar_thermostat_p1_.json"
    f2 = storage.profiles_dir / "cronostar_ev_charging_p1_.json"
    f1.write_text("{}", encoding="utf-8")
    f2.write_text("{}", encoding="utf-8")
    
    # list_profiles uses the actual filesystem if not mocked, but let's mock it for stability
    with patch.object(storage, "list_profiles", AsyncMock(return_value=[f1.name, f2.name])):
        result = await storage.delete_controller_files("p1_")
        
    assert result is True
    assert not f1.exists()
    assert not f2.exists()

@pytest.mark.anyio
async def test_delete_controller_files_exception(tmp_path):
    """Test delete_controller_files handles exceptions."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    
    # Mock profiles_dir / filename to raise something
    with patch.object(storage, "list_profiles", side_effect=Exception("Disk error")):
        result = await storage.delete_controller_files("prefix")
        
    assert result is False

@pytest.mark.anyio
async def test_load_container_json_error(tmp_path):
    """Test _load_container with invalid JSON."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    
    file_path = storage.profiles_dir / "invalid.json"
    file_path.write_text("invalid json {", encoding="utf-8")
    
    # _load_container is internal but we can test it
    result = await storage._load_container(file_path)
    assert result == {}

@pytest.mark.anyio
async def test_storage_manager_dir_creation_exists(tmp_path):
    """Test directory creation when it already exists (covers FileExistsError)."""
    hass = _make_hass(tmp_path)
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    
    # Should not raise
    from custom_components.cronostar.storage.storage_manager import StorageManager
    storage = StorageManager(hass, profiles_dir)
    assert storage.profiles_dir == profiles_dir

@pytest.mark.anyio
async def test_load_profile_cached_not_found_returns_none(tmp_path):
    """Test load_profile_cached returns None if file missing."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    
    result = await storage.load_profile_cached("missing.json")
    assert result == {}
