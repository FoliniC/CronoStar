"""Test Component Setup."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.setup import async_setup_integration
from custom_components.cronostar.setup.dashboard import setup_dashboard, write_dashboard_yaml, DASHBOARD_YAML_FILENAME, PANEL_URL_PATH
from custom_components.cronostar.setup.events import setup_event_handlers
from homeassistant.core import CoreState
from homeassistant.const import EVENT_HOMEASSISTANT_START
from custom_components.cronostar.const import DOMAIN

def run(coro):
    return asyncio.run(coro)

def test_async_setup_integration_success(hass, tmp_path):
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
    mock_integration.version = "6.0.0"
    with patch("custom_components.cronostar.setup.async_get_integration", return_value=mock_integration), \
         patch("custom_components.cronostar.setup.validators.validate_environment", return_value=True), \
         patch("custom_components.cronostar.setup._setup_static_resources", return_value=True), \
         patch("custom_components.cronostar.setup.services.setup_services", AsyncMock()), \
         patch("custom_components.cronostar.setup.events.setup_event_handlers", AsyncMock()), \
         patch("custom_components.cronostar.setup.setup_dashboard", AsyncMock()):
        
        config = {"version": "6.0.0"}
        res = run(async_setup_integration(hass, config))
        assert res is True
        assert hass.data[DOMAIN]["version"] == "6.0.0"

def test_async_setup_integration_failure_env(hass):
    """Test setup failure due to environment."""
    with patch("custom_components.cronostar.setup.validators.validate_environment", return_value=False):
        res = run(async_setup_integration(hass, {}))
        assert res is False

def test_setup_dashboard_purge_error(hass, tmp_path):
    """Test dashboard setup with purge error."""
    storage_dir = tmp_path / ".storage"
    storage_dir.mkdir()
    bad_file = storage_dir / "lovelace.cronostar_test"
    bad_file.touch()
    
    # Mock os.remove to fail
    with patch("os.remove", side_effect=OSError("Permission denied")), \
         patch("custom_components.cronostar.setup.dashboard.async_remove_panel"), \
         patch("custom_components.cronostar.setup.dashboard.async_register_built_in_panel"), \
         patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", AsyncMock()), \
         patch("custom_components.cronostar.setup.dashboard._register_lovelace_dashboard", AsyncMock()):
        
        run(setup_dashboard(hass))
        # Should not crash

def test_register_lovelace_dashboard_variants(hass):
    """Test backend registration with different hass.data structures."""
    from custom_components.cronostar.setup.dashboard import _register_lovelace_dashboard
    
    # Case 1: lovelace not in hass.data
    hass.data = {}
    run(_register_lovelace_dashboard(hass, "/tmp/y.yaml"))
    
    # Case 2: lovelace is a dict
    mock_dashboards = {}
    hass.data["lovelace"] = {"dashboards": mock_dashboards}
    with patch("homeassistant.components.lovelace.dashboard.LovelaceYAML") as mock_ly:
        run(_register_lovelace_dashboard(hass, "/tmp/y.yaml"))
        assert PANEL_URL_PATH in mock_dashboards

def test_write_dashboard_yaml_error(hass):
    """Test error writing YAML."""
    with patch("custom_components.cronostar.setup.dashboard.async_get_integration", side_effect=Exception("Integration error")):
        run(write_dashboard_yaml(hass, "test.yaml"))
        # Should catch exception

def test_write_dashboard_yaml_success(hass, tmp_path):
    """Test successful writing of YAML dashboard."""
    def mock_path(x=None):
        if x is None: return str(tmp_path)
        return str(tmp_path / x)
    hass.config.path = MagicMock(side_effect=mock_path)
    
    mock_integration = MagicMock()
    mock_integration.dir = tmp_path / "integration"
    
    with patch("custom_components.cronostar.setup.dashboard.async_get_integration", return_value=mock_integration):
        run(write_dashboard_yaml(hass, "test.yaml"))
        assert (tmp_path / "test.yaml").exists()

def test_register_lovelace_dashboard_object(hass):
    """Test backend registration with lovelace object."""
    from custom_components.cronostar.setup.dashboard import _register_lovelace_dashboard
    
    class MockLovelace:
        def __init__(self):
            self.dashboards = {}
            
    lovelace_obj = MockLovelace()
    hass.data["lovelace"] = lovelace_obj
    
    with patch("homeassistant.components.lovelace.dashboard.LovelaceYAML") as mock_ly:
        run(_register_lovelace_dashboard(hass, "/tmp/y.yaml"))
        assert PANEL_URL_PATH in lovelace_obj.dashboards
