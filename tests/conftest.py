import tests.mock_ha # Must be first to mock HA modules
import pytest
import os
import sys
from unittest.mock import MagicMock, AsyncMock, patch

def pytest_configure(config):
    """Add project root to python path."""
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, project_root)
    # Also add custom_components directory specifically
    sys.path.insert(0, os.path.join(project_root, "custom_components"))

@pytest.fixture
def hass():
    """Mock Home Assistant instance."""
    hass = MagicMock()
    hass.data = {"cronostar": {}}
    hass.config.path = MagicMock(side_effect=lambda x=None: f"/config/{x}" if x else "/config")
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
