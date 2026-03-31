"""Test Final Gold Coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from homeassistant.data_entry_flow import FlowResultType
from custom_components.cronostar.const import DOMAIN, CONF_LOGGING_ENABLED, CONF_NAME, CONF_TARGET_ENTITY
from custom_components.cronostar.exceptions import ScheduleApplicationError
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

# === Config Flow Tests ===

def test_config_flow_reconfigure_global(hass):
    """Test reconfigure flow for global component."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Mock entry
    entry = MagicMock()
    entry.entry_id = "test_global"
    entry.title = "CronoStar"
    entry.data = {"component_installed": True, CONF_LOGGING_ENABLED: False}
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    flow.context = {"entry_id": "test_global"}
    
    # Step 1: Show form
    result = run(flow.async_step_reconfigure())
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "reconfigure"
    
    # Step 2: Submit
    flow.async_update_reload_and_abort = AsyncMock(return_value={"type": "abort", "reason": "reconfigure_successful"})
    result = run(flow.async_step_reconfigure(user_input={CONF_LOGGING_ENABLED: True}))
    assert result["type"] == "abort"
    assert flow.async_update_reload_and_abort.call_args[1]["data"][CONF_LOGGING_ENABLED] is True

def test_config_flow_reconfigure_controller(hass):
    """Test reconfigure flow for controller."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Mock entry
    entry = MagicMock()
    entry.entry_id = "test_controller"
    entry.title = "My Controller"
    entry.data = {"component_installed": False, CONF_NAME: "My Controller", CONF_TARGET_ENTITY: "climate.old"}
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    flow.context = {"entry_id": "test_controller"}
    
    # Step 1: Show form
    result = run(flow.async_step_reconfigure())
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "reconfigure"
    
    # Step 2: Submit
    flow.async_update_reload_and_abort = AsyncMock(return_value={"type": "abort", "reason": "reconfigure_successful"})
    result = run(flow.async_step_reconfigure(user_input={CONF_NAME: "New Name", CONF_TARGET_ENTITY: "climate.new"}))
    assert result["type"] == "abort"
    data = flow.async_update_reload_and_abort.call_args[1]["data"]
    assert data[CONF_NAME] == "New Name"
    assert data[CONF_TARGET_ENTITY] == "climate.new"

# === Services Tests ===

def test_apply_now_edge_cases(hass):
    """Test apply_now service edge cases."""
    from custom_components.cronostar.exceptions import ScheduleApplicationError

    # Initialize hass.data[DOMAIN]
    hass.data[DOMAIN] = {
        "version": "1.0.0",
        "settings_manager": MagicMock(),
        "storage_manager": MagicMock()
    }
    
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})

    # ✅ Patcha ProfileService così setup_services usa il nostro ps
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, MagicMock()))

    # Estrai l'handler dal registro mock
    handler = next(
        c[0][2]
        for c in hass.services.async_register.call_args_list
        if c[0][1] == "apply_now"
    )
    
    call = MagicMock()
    call.data = {"target_entity": "climate.test", "profile_name": "P1"}
    
    # 1. Invalid points in schedule
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "bad", "value": 20.0}, # Invalid time
            {"time": "08:00", "value": None}, # Invalid value
            {"time": "09:00", "value": 21.0} # Valid
        ]
    })
    hass.services.async_call.reset_mock()
    run(handler(call))
    # Should work and use the valid point
    assert any(c[0][0] == "climate" for c in hass.services.async_call.call_args_list)

    # 2. No points at all
    ps.get_profile_data = AsyncMock(return_value={"schedule": []})
    run(handler(call))
    
    # 3. Points exist but none valid (empty after filtering)
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "bad", "value": 20}]
    })
    run(handler(call)) # Should warn and return
    
    # 4. Wrap around logic
    with patch("custom_components.cronostar.setup.services.datetime") as mock_dt:
        mock_now = MagicMock()
        mock_now.hour = 23
        mock_now.minute = 0
        mock_dt.now.return_value = mock_now
        
        ps.get_profile_data = AsyncMock(return_value={
            "schedule": [
                {"time": "08:00", "value": 10.0},
                {"time": "20:00", "value": 20.0}
            ]
        })
        hass.services.async_call.reset_mock()
        run(handler(call))
        assert any(c[0][0] == "climate" for c in hass.services.async_call.call_args_list)

    # 5. Unsupported domain
    call.data = {"target_entity": "unsupported.entity", "profile_name": "P1"}
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "08:00", "value": 10.0}]
    })
    run(handler(call))
    
    # 6. Exception handling
    ps.get_profile_data = AsyncMock(side_effect=Exception("Boom"))
    # handle_service_errors catches Exception and raises HomeAssistantError
    with pytest.raises(Exception):
        run(handler(call))
