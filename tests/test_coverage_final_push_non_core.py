"""Final coverage boost for CronoStar non-core modules."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup import async_setup_integration
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

def test_setup_integration_various_branches(hass, tmp_path):
    """Test branches in setup/__init__.py."""
    def mock_path(x=None):
        if x is None: return str(tmp_path)
        return str(tmp_path / x)
    hass.config.path = MagicMock(side_effect=mock_path)
    
    # Create required paths
    www_path = tmp_path / "custom_components/cronostar/www/cronostar_card"
    www_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "cronostar/profiles").mkdir(parents=True, exist_ok=True)
    
    hass.config.components = {"http", "frontend"}
    
    # Mock integration
    mock_integration = MagicMock()
    mock_integration.version = "1.2.3"

    with patch("custom_components.cronostar.setup.async_get_integration", new=AsyncMock(return_value=mock_integration)), \
         patch("custom_components.cronostar.setup.validate_environment", new=AsyncMock(return_value=True)), \
         patch("custom_components.cronostar.setup._setup_static_resources", new=AsyncMock(return_value=True)), \
         patch("custom_components.cronostar.setup.StorageManager", return_value=MagicMock(list_profiles=AsyncMock(return_value=[]))), \
         patch("custom_components.cronostar.setup.SettingsManager", return_value=MagicMock()), \
         patch("custom_components.cronostar.setup.setup_services", new=AsyncMock()), \
         patch("custom_components.cronostar.setup.setup_event_handlers", new=AsyncMock()), \
         patch("custom_components.cronostar.setup.setup_dashboard", new=AsyncMock()):
        
        # Test success branch
        assert run(async_setup_integration(hass, {})) is True

    # Branch: validate_environment -> False -> return False
    with patch("custom_components.cronostar.setup.validate_environment", new=AsyncMock(return_value=False)):
        assert run(async_setup_integration(hass, {})) is False

    # Branch: _setup_static_resources -> False -> return False
    with patch("custom_components.cronostar.setup.validate_environment", new=AsyncMock(return_value=True)), \
         patch("custom_components.cronostar.setup._setup_static_resources", new=AsyncMock(return_value=False)):
        assert run(async_setup_integration(hass, {})) is False

def test_setup_services_remaining_handlers(hass):
    """Test remaining handlers in setup/services.py."""
    storage = MagicMock()
    # Mock for list_all_profiles to hit 131, 135
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {}, # Missing preset_type, global_prefix, target_entity
        "profiles": {"P": {}}
    })
    
    ps = MagicMock()
    hass.data[DOMAIN] = {"settings_manager": MagicMock(), "profile_service": ps, "version": "1.0.0"}
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    
    # Trigger list_all_profiles
    run(hass.services.async_call(DOMAIN, "list_all_profiles", {}, blocking=True))

def test_storage_manager_more_coverage(hass):
    """Test remaining lines in storage_manager.py."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    # Line 252: return cached container if mtime hasn't changed
    filename = "test.json"
    manager._cache[filename] = {"data": "cached"}
    manager._cache_mtimes[filename] = 1000
    with patch("os.path.getmtime", return_value=500): # 500 <= 1000
        res = run(manager.load_profile_cached(filename))
        assert res == {"data": "cached"}
        
    # Line 318-320: delete_profile with missing container
    manager._load_container = AsyncMock(return_value={})
    assert run(manager.delete_profile("P", "thermostat")) is False
    
    # Line 324-327: delete_profile with missing profile
    manager._load_container = AsyncMock(return_value={"profiles": {"Other": {}}})
    assert run(manager.delete_profile("P", "thermostat")) is False
