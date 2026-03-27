"""Test Component Setup."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.setup import async_setup_integration
from custom_components.cronostar.setup.events import setup_event_handlers
from homeassistant.core import CoreState
from homeassistant.const import EVENT_HOMEASSISTANT_START
from custom_components.cronostar.const import DOMAIN

@pytest.mark.anyio
async def test_async_setup_integration_success(hass, tmp_path):
    """Test full integration setup success."""
    def mock_path(x=None):
        if x is None: return str(tmp_path)
        return str(tmp_path / x)
    hass.config.path = MagicMock(side_effect=mock_path)
    hass.config.components = ["http", "frontend", "input_number", "input_select", "input_boolean"]
    
    # Ensure directories exist for validation
    (tmp_path / "cronostar/profiles").mkdir(parents=True, exist_ok=True)
    
    # Mock integration
    mock_integration = MagicMock()
    mock_integration.version = "1.2.3"
    with patch("custom_components.cronostar.setup.async_get_integration", return_value=mock_integration), \
         patch("custom_components.cronostar.setup.validators.validate_environment", return_value=True), \
         patch("custom_components.cronostar.setup._setup_static_resources", return_value=True), \
         patch("custom_components.cronostar.setup.services.setup_services", AsyncMock()), \
         patch("custom_components.cronostar.setup.events.setup_event_handlers", AsyncMock()), \
         patch("homeassistant.components.frontend.async_register_built_in_panel"), \
         patch("homeassistant.components.frontend.add_extra_js_url"), \
         patch("custom_components.cronostar.setup._register_lovelace_dashboard", AsyncMock()):
        
        config = {"version": "1.2.3"}
        res = await async_setup_integration(hass, config)
        assert res is True
        assert hass.data[DOMAIN]["version"] == "1.2.3"

@pytest.mark.anyio
async def test_async_setup_integration_failure_env(hass):
    """Test setup failure due to environment."""
    with patch("custom_components.cronostar.setup.validators.validate_environment", return_value=False):
        res = await async_setup_integration(hass, {})
        assert res is False

@pytest.mark.anyio
async def test_setup_dashboard_purge_error(hass, tmp_path):
    """Test dashboard setup with purge error."""
    storage_dir = tmp_path / ".storage"
    storage_dir.mkdir()
    bad_file = storage_dir / "lovelace.cronostar_test"
    bad_file.touch()
    
    # Mock os.remove to fail
    with patch("os.remove", side_effect=OSError("Permission denied")), \
         patch("custom_components.cronostar.setup.async_register_built_in_panel"), \
         patch("custom_components.cronostar.setup._write_dashboard_yaml", AsyncMock()), \
         patch("custom_components.cronostar.setup._register_lovelace_dashboard", AsyncMock()):
        
        from custom_components.cronostar.setup import _setup_dashboard
        await _setup_dashboard(hass)
        # Should not crash

@pytest.mark.anyio
async def test_register_lovelace_dashboard_variants(hass):
    """Test backend registration with different hass.data structures."""
    from custom_components.cronostar.setup import _register_lovelace_dashboard
    
    # Case 1: lovelace not in hass.data
    hass.data = {}
    await _register_lovelace_dashboard(hass, "/tmp/y.yaml")
    
    # Case 2: lovelace is a dict
    mock_dashboards = {}
    hass.data["lovelace"] = {"dashboards": mock_dashboards}
    with patch("homeassistant.components.lovelace.dashboard.LovelaceYAML") as mock_ly:
        await _register_lovelace_dashboard(hass, "/tmp/y.yaml")
        assert "cronostar-panel-v5841" in mock_dashboards

@pytest.mark.anyio
async def test_write_dashboard_yaml_error(hass):
    """Test error writing YAML."""
    from custom_components.cronostar.setup import _write_dashboard_yaml
    with patch("custom_components.cronostar.setup.async_get_integration", side_effect=Exception("Integration error")):
        await _write_dashboard_yaml(hass, "test.yaml")
        # Should catch exception

@pytest.mark.anyio
async def test_setup_static_resources_no_http(hass, tmp_path):
    """Test static resources when http is missing."""
    hass.config.components = []
    www_path = tmp_path / "custom_components/cronostar/www/cronostar_card"
    www_path.mkdir(parents=True)
    
    from custom_components.cronostar.setup import _setup_static_resources
    with patch("pathlib.Path.exists", return_value=True):
        res = await _setup_static_resources(hass)
        assert res is True # Still returns True if frontend is missing or http is missing

@pytest.mark.anyio
async def test_setup_integration_failure_static(hass):
    """Test setup failure due to static resources."""
    with patch("custom_components.cronostar.setup.validators.validate_environment", return_value=True), \
         patch("custom_components.cronostar.setup._setup_static_resources", return_value=False):
        res = await async_setup_integration(hass, {})
        assert res is False

@pytest.mark.anyio
async def test_write_dashboard_yaml_success(hass, tmp_path):
    """Test successful writing of YAML dashboard."""
    def mock_path(x=None):
        if x is None: return str(tmp_path)
        return str(tmp_path / x)
    hass.config.path = MagicMock(side_effect=mock_path)
    
    mock_integration = MagicMock()
    mock_integration.dir = tmp_path / "integration"
    manifest_path = mock_integration.dir / "www/cronostar_card/manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text('{"version": "5.0.0"}', encoding="utf-8")
    
    from custom_components.cronostar.setup import _write_dashboard_yaml
    with patch("custom_components.cronostar.setup.async_get_integration", return_value=mock_integration):
        await _write_dashboard_yaml(hass, "test.yaml")
        assert (tmp_path / "test.yaml").exists()

@pytest.mark.anyio
async def test_register_lovelace_dashboard_object(hass):
    """Test backend registration with lovelace object."""
    from custom_components.cronostar.setup import _register_lovelace_dashboard
    
    class MockLovelace:
        def __init__(self):
            self.dashboards = {}
            
    lovelace_obj = MockLovelace()
    hass.data["lovelace"] = lovelace_obj
    
    with patch("homeassistant.components.lovelace.dashboard.LovelaceYAML") as mock_ly:
        await _register_lovelace_dashboard(hass, "/tmp/y.yaml")
        assert "cronostar-panel-v5841" in lovelace_obj.dashboards
