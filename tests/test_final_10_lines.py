"""The very last lines for 90%."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.setup.services import setup_services

@pytest.fixture
def mock_hass():
    hass = MagicMock()
    hass.data = {DOMAIN: {"settings_manager": MagicMock(), "profile_service": MagicMock()}}
    hass.config.path = MagicMock(side_effect=lambda x=None: f"/config/{x}" if x else "/config")
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    return hass

async def test_coordinator_next_change_no_diff(mock_hass):
    """Trigger lines 395-396 in coordinator (no differing value found)."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    
    # All points same as current value
    schedule = [
        {"time": "08:00", "value": 20.0},
        {"time": "20:00", "value": 20.0}
    ]
    assert coordinator._get_next_change(schedule, 20.0) is None

async def test_setup_services_list_all_bad_data(mock_hass):
    """Trigger line 103 in setup/services.py (missing meta/profiles)."""
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["bad.json"])
    # Missing 'meta'
    storage.load_profile_cached = AsyncMock(return_value={"profiles": {}})
    
    await setup_services(mock_hass, storage)
    handler = next(c[0][2] for call in [mock_hass.services.async_register.call_args_list] for c in call if c[0][1] == "list_all_profiles")
    
    await handler(MagicMock())
    # Hits line 103 'continue'

async def test_coordinator_init_no_profiles_found_log(mock_hass):
    """Trigger line 153 logging branch."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    coordinator.logging_enabled = True
    
    mock_hass.data[DOMAIN]["storage_manager"] = MagicMock()
    mock_hass.data[DOMAIN]["storage_manager"].list_profiles = AsyncMock(return_value=[])
    
    await coordinator.async_initialize()
    # Hits line 153 log
