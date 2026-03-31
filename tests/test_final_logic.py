"""Final logic tests for coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.setup.services import setup_services
from pathlib import Path

def run(coro):
    return asyncio.run(coro)

def test_coordinator_interpolation_logic(hass):
    """Test coordinator interpolation logic edge cases."""
    entry = MagicMock()
    entry.entry_id = "test"
    entry.data = {
        "target_entity": "climate.test",
        "preset_type": "generic_switch",
        "global_prefix": "p_"
    }
    entry.options = {}
    coordinator = CronoStarCoordinator(hass, entry)

    schedule = [
        {"time": "08:00", "value": 1.0},
        {"time": "20:00", "value": 0.0}
    ]

    from datetime import datetime
    with patch("custom_components.cronostar.coordinator.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        val = coordinator._interpolate_schedule(schedule)
        # Should be 1.0 (no linear interpolation)
        assert val == 1.0

def test_profile_service_ensure_controller_already_exists(hass):
    """Test _ensure_controller_exists returns early if prefix exists."""
    from custom_components.cronostar.services.profile_service import ProfileService
    from tests.conftest import MockConfigEntry
    
    ps = ProfileService(hass, MagicMock(), MagicMock())

    # ✅ Use a real-ish entry that the helper can find
    entry = MockConfigEntry(domain="cronostar", data={"global_prefix": "p1_"})
    entry.add_to_hass(hass)

    run(ps._ensure_controller_exists("p1_", "thermostat", {}))
    assert not hass.config_entries.flow.async_init.called

def test_service_handlers_errors(hass):
    """Test error branches in service handlers."""
    # Initialize hass.data[DOMAIN]
    hass.data[DOMAIN] = {
        "version": "1.0.0",
        "settings_manager": MagicMock(),
        "storage_manager": MagicMock()
    }
    
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))
    
    # Find list_all_profiles handler
    handler = [call for call in hass.services.async_register.call_args_list if call[0][1] == "list_all_profiles"][0][0][2]
    
    # Force exception in list_profiles
    hass.data[DOMAIN]["storage_manager"].list_profiles = AsyncMock(side_effect=Exception("Storage error"))
    res = run(handler(MagicMock()))
    assert "error" in res

def test_setup_services_full_coverage(hass):
    """Trigger remaining lines in setup_services."""
    storage = MagicMock()
    ps = MagicMock()
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}
    
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        from custom_components.cronostar.setup.services import setup_services
        run(setup_services(hass, storage))
    
    assert hass.data[DOMAIN]["profile_service"] == ps

def test_storage_write_json_fail(hass):
    """Test write_json failure."""
    from custom_components.cronostar.storage.storage_manager import StorageManager
    manager = StorageManager(hass, hass.config.path("cronostar/profiles"))
    
    # Mock executor to fail
    async def failing_exec(func, *args, **kwargs):
        raise OSError("Write failed")
    hass.async_add_executor_job = failing_exec

    # _write_json propagates exceptions, save_profile catch them
    with pytest.raises(OSError):
        run(manager._write_json(Path("test.json"), {}))
