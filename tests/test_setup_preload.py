"Tests for setup preload and resource registration."
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.setup import _preload_profile_cache, _setup_static_resources
from pathlib import Path

@pytest.fixture
def mock_hass(tmp_path):
    hass = MagicMock()
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    hass.config.path = MagicMock(side_effect=lambda x=None: str(config_dir / x) if x else str(config_dir))
    hass.config.components = ["http", "frontend"]
    return hass

async def test_preload_profile_cache_with_files(mock_hass):
    """Test preloading cache with actual profile files."""
    storage_manager = MagicMock()
    storage_manager.list_profiles = AsyncMock(return_value=["f1.json", "f2.json"])
    storage_manager.load_profile_cached = AsyncMock(side_effect=[
        {"meta": {"global_prefix": "p1"}},
        None # Failed load
    ])
    storage_manager.get_cached_containers = AsyncMock(return_value=[
        ("f1.json", {"meta": {"global_prefix": "p1"}, "profiles": {"P1": {}}})
    ])
    
    await _preload_profile_cache(mock_hass, storage_manager)
    assert storage_manager.load_profile_cached.called

async def test_preload_profile_cache_empty(mock_hass):
    """Test preloading cache when no files exist."""
    storage_manager = MagicMock()
    storage_manager.list_profiles = AsyncMock(return_value=[])
    await _preload_profile_cache(mock_hass, storage_manager)
    # Should log and return

async def test_setup_static_resources_full(mock_hass):
    """Test full static resource setup with all components."""
    from custom_components.cronostar.setup import _setup_static_resources
    
    integration = MagicMock()
    integration.version = "1.0.0"
    
    # Mocking HAS_STATIC_PATH_CONFIG
    with patch("custom_components.cronostar.setup.HAS_STATIC_PATH_CONFIG", True), \
         patch("custom_components.cronostar.setup.StaticPathConfig", MagicMock()), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("homeassistant.loader.async_get_integration", return_value=integration), \
         patch("custom_components.cronostar.setup.add_extra_js_url") as mock_add_js:
        
        mock_hass.http.async_register_static_paths = AsyncMock()
        
        success = await _setup_static_resources(mock_hass)
        assert success is True
        assert mock_hass.http.async_register_static_paths.called
        assert mock_add_js.called

async def test_setup_static_resources_old_ha(mock_hass):
    """Test resource setup for older HA versions (without StaticPathConfig)."""
    from custom_components.cronostar.setup import _setup_static_resources
    
    integration = MagicMock()
    integration.version = "1.0.0"
    
    with patch("custom_components.cronostar.setup.HAS_STATIC_PATH_CONFIG", False), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("homeassistant.loader.async_get_integration", return_value=integration), \
         patch("custom_components.cronostar.setup.add_extra_js_url"):
        
        mock_hass.http.async_register_static_path = MagicMock()
        
        success = await _setup_static_resources(mock_hass)
        assert success is True
        assert mock_hass.http.async_register_static_path.called

