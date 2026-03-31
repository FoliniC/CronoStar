"""The final final push for coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

def test_coordinator_unsupported_domain_trigger(hass):
    """Trigger lines 210-216 in coordinator."""
    entry = MagicMock()
    entry.entry_id = "test_entry_id"
    entry.title = "Test Controller"
    entry.data = {
        "name": "Test Controller",
        "preset_type": "thermostat",
        "preset": "thermostat",
        "target_entity": "sensor.test", # Unsupported
        "global_prefix": "cronostar_",
        "logging_enabled": True,
    }
    entry.options = {}
    
    # Ensure DOMAIN data exists for coordinator
    hass.data[DOMAIN] = {
        "storage_manager": MagicMock(),
        "version": "6.0.0",
        "global_config": {},
    }
    
    coordinator = CronoStarCoordinator(hass, entry)
    
    # Target entity exists but domain is sensor
    hass.states.async_set("sensor.test", "20")
    
    # We need to call _update_target_entity directly
    run(coordinator._update_target_entity(20.0))

def test_coordinator_next_change_edge(hass):
    """Trigger lines 390, 395-396 in coordinator."""
    entry = MagicMock()
    entry.entry_id = "test_entry_id"
    entry.title = "Test Controller"
    entry.data = {
        "name": "Test Controller",
        "preset_type": "thermostat",
        "preset": "thermostat",
        "target_entity": "climate.test",
        "global_prefix": "cronostar_",
        "logging_enabled": False,
    }
    entry.options = {}
    
    # Ensure DOMAIN data exists for coordinator
    hass.data[DOMAIN] = {
        "storage_manager": MagicMock(),
        "version": "6.0.0",
        "global_config": {},
    }
    
    coordinator = CronoStarCoordinator(hass, entry)
    
    # Schedule with no differing values to hit 395-396
    schedule = [{"time": "08:00", "value": 20.0}]
    assert coordinator._get_next_change(schedule, 20.0) is None
    
    # Trigger line 390 wrap around loop
    schedule = [
        {"time": "08:00", "value": 20.0},
        {"time": "20:00", "value": 18.0}
    ]
    from datetime import datetime
    with patch("custom_components.cronostar.coordinator.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2023, 1, 1, 21, 0, 0)
        # Value is 18.0. Next change is 08:00 (value 20.0)
        res = coordinator._get_next_change(schedule, 18.0)
        assert res[0] == "08:00"

def test_setup_services_more_handlers(hass):
    """Trigger more lines in setup/services.py."""
    # Ensure domain data exists
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={}) # No meta
    
    ps = MagicMock()
    
    hass.data[DOMAIN] = {
        "storage_manager": storage,
        "profile_service": ps,
        "settings_manager": MagicMock(),
        "version": "6.0.0"
    }
    
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, storage))
    
    # list_all_profiles_handler - empty container branch (line 103)
    run(hass.services.async_call(DOMAIN, "list_all_profiles", {}, blocking=True))
    
    # apply_now_handler - more error paths
    # Empty schedule (line 149-150)
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.test", "profile_name": "P1"}, blocking=True))
    
    # Invalid points in apply_now (lines 163-164)
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "invalid"}]})
    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.test", "profile_name": "P1"}, blocking=True))
