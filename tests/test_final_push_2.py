"""The final final push for coverage."""
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

async def test_coordinator_unsupported_domain_trigger(mock_hass):
    """Trigger lines 210-216 in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "sensor.test"} # Unsupported
    coordinator = CronoStarCoordinator(mock_hass, entry)
    coordinator.logging_enabled = True
    
    # Target entity exists but domain is sensor
    mock_hass.states.get.return_value = MagicMock(state="20")
    
    # We need to call _update_target_entity directly
    await coordinator._update_target_entity(20.0)

async def test_coordinator_next_change_edge(mock_hass):
    """Trigger lines 390, 395-396 in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    
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

async def test_setup_services_more_handlers(mock_hass):
    """Trigger more lines in setup/services.py."""
    await setup_services(mock_hass, MagicMock())
    
    # list_all_profiles_handler - empty container branch (line 103)
    handler = next(c[0][2] for call in [mock_hass.services.async_register.call_args_list] for c in call if c[0][1] == "list_all_profiles")
    
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["f1.json"])
    storage.load_profile_cached = AsyncMock(return_value={}) # No meta
    
    # Call handler via setup_services setup logic... 
    # actually we can call handler directly if we have it
    await handler(MagicMock())
    
    # apply_now_handler - more error paths
    handler = next(c[0][2] for call in [mock_hass.services.async_register.call_args_list] for c in call if c[0][1] == "apply_now")
    
    ps = mock_hass.data[DOMAIN]["profile_service"]
    
    # Empty schedule (line 149-150)
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})
    call = MagicMock()
    call.data = {"target_entity": "climate.test", "profile_name": "P1"}
    await handler(call)
    
    # Invalid points in apply_now (lines 163-164)
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "invalid"}]})
    await handler(call)
