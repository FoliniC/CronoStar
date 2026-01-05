"""Tests to reach final coverage goals."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services
from custom_components.cronostar.setup.validators import (
    _check_config_directory,
    _check_profiles_directory,
    validate_environment
)
from pathlib import Path

@pytest.fixture
def mock_hass():
    hass = MagicMock()
    hass.data = {DOMAIN: {"settings_manager": MagicMock()}}
    hass.config.path = MagicMock(side_effect=lambda x=None: f"/config/{x}" if x else "/config")
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    return hass

async def test_save_load_settings_services(mock_hass):
    """Test settings services in setup/services.py."""
    await setup_services(mock_hass, MagicMock())
    
    save_handler = None
    load_handler = None
    for call in mock_hass.services.async_register.call_args_list:
        if call[0][1] == "save_settings":
            save_handler = call[0][2]
        if call[0][1] == "load_settings":
            load_handler = call[0][2]
            
    sm = mock_hass.data[DOMAIN]["settings_manager"]
    sm.save_settings = AsyncMock()
    sm.load_settings = AsyncMock(return_value={"test": 1})
    
    # Test Save
    call = MagicMock()
    call.data = {"settings": {"key": "val"}}
    await save_handler(call)
    assert sm.save_settings.called
    
    # Test Load
    res = await load_handler(MagicMock())
    assert res == {"test": 1}

async def test_register_card_service(mock_hass):
    """Test register_card service handler."""
    await setup_services(mock_hass, MagicMock())
    handler = None
    for call in mock_hass.services.async_register.call_args_list:
        if call[0][1] == "register_card":
            handler = call[0][2]
            break
    
    ps = mock_hass.data[DOMAIN]["profile_service"]
    ps.register_card = AsyncMock(return_value={"success": True})
    
    await handler(MagicMock())
    assert ps.register_card.called

async def test_validator_failures(mock_hass):
    """Test validator failure paths."""
    # Config dir not found
    with patch("pathlib.Path.exists", return_value=False):
        assert _check_config_directory(mock_hass) is False
        
    # Config path not a directory
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=False):
        assert _check_config_directory(mock_hass) is False
        
    # Profiles dir not writable
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=True), \
         patch("pathlib.Path.touch", side_effect=Exception("Perm error")):
        assert _check_profiles_directory(mock_hass) is False

async def test_validate_environment_failure_path(mock_hass):
    """Test validate_environment when one check fails."""
    # Force first check to fail
    with patch("custom_components.cronostar.setup.validators._check_config_directory", return_value=False):
        assert await validate_environment(mock_hass) is False

async def test_storage_clear_cache(mock_hass):
    """Test clear_cache in StorageManager."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(mock_hass, "/config/cronostar/profiles")
    manager._cache = {"test": 1}
    await manager.clear_cache()
    assert len(manager._cache) == 0

async def test_storage_list_profiles_filtering(mock_hass):
    """Test list_profiles with filters hitting meta branches."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(mock_hass, "/config/cronostar/profiles")
    
    p1 = MagicMock(spec=Path)
    p1.name = "cronostar_bad.json"
    
    with patch("pathlib.Path.glob", return_value=[p1]):
        manager.load_profile_cached = AsyncMock(return_value=None)
        # Pass a filter to trigger the load and filtering logic
        res = await manager.list_profiles(preset_type="thermostat")
        assert len(res) == 0

async def test_storage_delete_empty_container(mock_hass):
    """Test delete_profile when container becomes empty."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(mock_hass, "/config/cronostar/profiles")
    manager._load_container = AsyncMock(return_value={"profiles": {"P1": {}}})
    
    with patch("pathlib.Path.unlink") as mock_unlink:
        await manager.delete_profile("P1", "thermostat", "prefix")
        assert mock_unlink.called