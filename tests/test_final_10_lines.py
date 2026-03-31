"""The very last lines for 90%."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

def test_coordinator_next_change_no_diff(hass):
    """Trigger lines 395-396 in coordinator (no differing value found)."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    
    schedule = [{"time": "08:00", "value": 20.0}]
    assert coordinator._get_next_change(schedule, 20.0) is None

def test_setup_services_list_all_bad_data(hass):
    """Trigger setup/services.py line 103 (empty container)."""
    from custom_components.cronostar.setup.services import setup_services
    
    mock_storage = MagicMock()
    mock_storage.list_profiles = AsyncMock(return_value=["f1.json"])
    mock_storage.load_profile_cached = AsyncMock(return_value={}) # No meta
    
    hass.data[DOMAIN] = {
        "settings_manager": MagicMock(),
        "storage_manager": mock_storage,
        "version": "1.0.0"
    }
    
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, mock_storage))
    
    handler = next(c[0][2] for call in [hass.services.async_register.call_args_list] for c in call if c[0][1] == "list_all_profiles")
    
    run(handler(MagicMock()))

def test_coordinator_init_no_profiles_found_log(hass):
    """Trigger line 153 logging branch."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=[])
    
    hass.data[DOMAIN] = {
        "storage_manager": storage,
        "version": "1.0.0"
    }
    
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True
    coordinator.storage_manager = storage
    
    run(coordinator.async_initialize())
