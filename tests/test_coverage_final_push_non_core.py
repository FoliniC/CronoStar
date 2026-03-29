"""Final coverage boost for CronoStar non-core modules."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup import async_setup_integration
from custom_components.cronostar.setup.services import setup_services

@pytest.mark.anyio
async def test_setup_integration_various_branches(mock_hass, tmp_path):
    """Test branches in setup/__init__.py."""
    def mock_path(x=None):
        if x is None: return str(tmp_path)
        return str(tmp_path / x)
    mock_hass.config.path = MagicMock(side_effect=mock_path)
    
    # Create required paths
    www_path = tmp_path / "custom_components/cronostar/www/cronostar_card"
    www_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "cronostar/profiles").mkdir(parents=True, exist_ok=True)
    
    mock_hass.config.components = ["http", "frontend"]
    
    # Mock integration
    mock_integration = MagicMock()
    mock_integration.version = "1.2.3"
    with patch("custom_components.cronostar.setup.async_get_integration", return_value=mock_integration), \
         patch("custom_components.cronostar.setup.validators.validate_environment", AsyncMock(return_value=True)), \
         patch("custom_components.cronostar.setup.setup_dashboard", AsyncMock()):
        
        # Test success branch
        assert await async_setup_integration(mock_hass, {}) is True
        
        # Missing 39: if not await validators.validate_environment...
        with patch("custom_components.cronostar.setup.validators.validate_environment", AsyncMock(return_value=False)):
            assert await async_setup_integration(mock_hass, {}) is False

@pytest.mark.anyio
async def test_setup_services_remaining_handlers(mock_hass):
    """Test remaining handlers in setup/services.py."""
    storage = MagicMock()
    # Mock for list_all_profiles to hit 131, 135
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {}, # Missing preset_type, global_prefix, target_entity
        "profiles": {"P": {}}
    })
    
    mock_hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    await setup_services(mock_hass, storage)
    
    handler = [call[0][2] for call in mock_hass.services.async_register.call_args_list if call[0][1] == "list_all_profiles"][0]
    await handler(MagicMock())
    # This hits the validation logic that was missing.

@pytest.mark.anyio
async def test_storage_manager_more_coverage(mock_hass):
    """Test remaining lines in storage_manager.py."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(mock_hass, mock_hass.config.path("cronostar/profiles"))
    
    # Line 252: return cached container if mtime hasn't changed
    filename = "test.json"
    manager._cache[filename] = {"data": "cached"}
    manager._cache_mtimes[filename] = 1000
    with patch("os.path.getmtime", return_value=500): # 500 <= 1000
        res = await manager.load_profile_cached(filename)
        assert res == {"data": "cached"}
        
    # Line 318-320: delete_profile with missing container
    manager._load_container = AsyncMock(return_value={})
    assert await manager.delete_profile("P", "thermostat") is False
    
    # Line 324-327: delete_profile with missing profile
    manager._load_container = AsyncMock(return_value={"profiles": {"Other": {}}})
    assert await manager.delete_profile("P", "thermostat") is False
