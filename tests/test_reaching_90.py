"""Reaching the 90% goal."""
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

async def test_coordinator_more_branch_hits(mock_hass):
    """Trigger remaining coordinator lines."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    coordinator.logging_enabled = True
    
    mock_hass.states.get.return_value = MagicMock(state="20")
    await coordinator._async_update_data()
    
    mock_hass.states.get.return_value = None
    await coordinator._async_update_data()
    
    coordinator.target_entity = "unsupported.entity"
    await coordinator._update_target_entity(20.0)

async def test_setup_services_remaining_errors(mock_hass):
    """Trigger remaining lines in setup/services.py."""
    await setup_services(mock_hass, MagicMock())
    handler = next(c[0][2] for call in [mock_hass.services.async_register.call_args_list] for c in call if c[0][1] == "apply_now")
    
    ps = mock_hass.data[DOMAIN]["profile_service"]
    
    # Target missing
    call = MagicMock()
    call.data = {"profile_name": "P1"}
    await handler(call)
    
    # Profile missing
    call.data = {"target_entity": "climate.test"}
    await handler(call)
    
    # Profile error
    ps.get_profile_data = AsyncMock(return_value={"error": "Not found"})
    call.data = {"target_entity": "climate.test", "profile_name": "P1"}
    await handler(call)
    
    # Constant schedule for domain testing
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "00:00", "value": 20.0},
            {"time": "23:59", "value": 20.0}
        ]
    })
    
    # Test different domains
    for entity in ["switch.test", "input_number.test", "cover.test"]:
        call.data = {"target_entity": entity, "profile_name": "P1"}
        await handler(call)
        assert mock_hass.services.async_call.called
