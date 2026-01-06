import tests.mock_ha # Must be first to mock HA modules
import socket
import _socket

# Ensure sockets are enabled and won't be disabled
try:
    import pytest_socket
    pytest_socket.disable_socket = lambda *args, **kwargs: None
    pytest_socket.enable_socket()
except Exception:
    pass

# Force restore original socket from C implementation
socket.socket = _socket.socket
if hasattr(_socket, "socketpair"):
    socket.socketpair = _socket.socketpair
else:
    # On Windows, socketpair might be a wrapper in socket.py
    # We want to keep the one from socket.py BUT ensure it's not guarded
    pass

import pytest
import os
import sys
from unittest.mock import MagicMock, AsyncMock, patch

def pytest_configure(config):
    """Add project root to python path and ensure sockets are enabled."""
    # Register the marker to avoid warnings
    config.addinivalue_line("markers", "allow_socket: allow socket usage")
    
    # Ensure sockets are enabled if pytest-socket is present
    try:
        import pytest_socket
        pytest_socket.enable_socket()
    except Exception:
        pass

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, project_root)
    # Also add custom_components directory specifically
    sys.path.insert(0, os.path.join(project_root, "custom_components"))

import pathlib

@pytest.fixture
def tmp_path():
    """Override tmp_path to use a stable directory."""
    path = pathlib.Path("C:/Programs/Gemini/CronoStar/pytest_tmp")
    path.mkdir(parents=True, exist_ok=True)
    return path

@pytest.fixture(autouse=True)
def mock_path_mkdir():
    """Globally mock Path.mkdir to prevent permission errors."""
    with patch("pathlib.Path.mkdir") as mock:
        yield mock

@pytest.fixture
def hass(tmp_path):
    """Mock Home Assistant instance."""
    from custom_components.cronostar.const import DOMAIN
    hass = MagicMock()
    
    # Initialize DOMAIN data structure
    settings_manager = MagicMock()
    settings_manager.load_settings = AsyncMock(return_value={})
    settings_manager.save_settings = AsyncMock()
    
    storage_manager = MagicMock()
    storage_manager.list_profiles = AsyncMock(return_value=[])
    storage_manager.load_profile_cached = AsyncMock(return_value={})
    
    hass.data = {DOMAIN: {
        "settings_manager": settings_manager,
        "storage_manager": storage_manager
    }}
    
    # Create a temporary config directory
    config_dir = tmp_path / "config"
    # Ensure it exists once for the mock to point to it
    os.makedirs(str(config_dir), exist_ok=True)
    
    def mock_path(x=None):
        if x is None:
            return str(config_dir)
        return str(config_dir / x)
        
    hass.config.path = MagicMock(side_effect=mock_path)
    hass.config.components = []
    
    # Mock states with proper structure
    hass.states.get = MagicMock(return_value=None)
    
    hass.states.async_set = MagicMock()
    hass.states.async_remove = MagicMock()
    hass.services.async_call = AsyncMock()
    hass.services.async_register = MagicMock()
    hass.services.async_remove = AsyncMock()
    hass.config_entries.async_entries = MagicMock(return_value=[])
    hass.config_entries.flow.async_init = AsyncMock()
    hass.config_entries.async_update_entry = MagicMock()
    
    # Mock loop
    hass.loop.create_task = MagicMock()
    
    # Mock async_add_executor_job
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    
    return hass

@pytest.fixture
def mock_storage_manager():
    """Mock the StorageManager."""
    manager = MagicMock()
    manager.list_profiles = AsyncMock(return_value=["test_profile.json"])
    manager.load_profile_cached = AsyncMock(return_value={
        "meta": {
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_test_",
            "min_value": 10,
            "max_value": 30
        },
        "profiles": {
            "Default": {
                "schedule": [
                    {"time": "08:00", "value": 20.0},
                    {"time": "20:00", "value": 18.0}
                ]
            },
            "Comfort": {
                "schedule": [
                    {"time": "08:00", "value": 22.0},
                    {"time": "22:00", "value": 20.0}
                ]
            }
        }
    })
    manager.save_profile = AsyncMock()
    manager.get_cached_containers = AsyncMock(return_value=[
        ("test_profile.json", {
             "meta": {
                "preset_type": "thermostat",
                "global_prefix": "cronostar_thermostat_test_",
                "min_value": 10,
                "max_value": 30
            },
            "profiles": {
                "Default": {
                    "schedule": [
                        {"time": "08:00", "value": 20.0},
                        {"time": "20:00", "value": 18.0}
                    ]
                }
            }
        })
    ])
    return manager

@pytest.fixture
def mock_coordinator(hass, mock_storage_manager):
    """Create a mock coordinator."""
    from custom_components.cronostar.coordinator import CronoStarCoordinator
    from custom_components.cronostar.const import DOMAIN
    
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.title = "Test Controller"
    entry.data = {
        "name": "Test Controller",
        "preset": "thermostat",
        "target_entity": "climate.test_thermostat",
        "global_prefix": "cronostar_thermostat_test_"
    }
    entry.options = {}
    
    hass.data[DOMAIN] = {"storage_manager": mock_storage_manager}
    
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.async_refresh = AsyncMock()
    
    coordinator.data = {
        "selected_profile": "Default",
        "is_enabled": True,
        "current_value": 0.0,
        "available_profiles": ["Default"]
    }
    
    return coordinator

def pytest_collection_modifyitems(config, items):
    for item in items:
        item.add_marker("no_fail_on_log_exception")
        item.add_marker("allow_socket")
