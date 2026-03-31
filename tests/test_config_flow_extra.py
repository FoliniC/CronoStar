"""Extra tests for CronoStar Config Flow."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
import voluptuous as vol
from homeassistant.data_entry_flow import FlowResultType
from custom_components.cronostar.const import DOMAIN, CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY, CONF_GLOBAL_PREFIX
from custom_components.cronostar.config_flow import CronoStarConfigFlow, CronoStarOptionsFlow

def run(coro):
    """Run a coroutine."""
    return asyncio.run(coro)

def test_config_flow_user_menu(hass):
    """Test user step shows menu when already installed."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._async_current_entries = MagicMock(return_value=[entry])
    
    result = run(flow.async_step_user())
    assert result["type"] == FlowResultType.MENU
    assert "controller" in result["menu_options"]

def test_config_flow_controller_invalid_entity(hass):
    """Test controller step with invalid entity ID."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    result = run(flow.async_step_controller(user_input={
        CONF_NAME: "Test",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "invalid_id", # Missing dot
        CONF_GLOBAL_PREFIX: "p1"
    }))
    
    assert result["type"] == FlowResultType.FORM
    assert result["errors"][CONF_TARGET_ENTITY] == "invalid"

def test_config_flow_card_config_step(hass):
    """Test card config step."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._controller_data = {CONF_PRESET: "thermostat"}
    
    result = run(flow.async_step_card_config(user_input={"title": "Custom Title"}))
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "dashboard"

def test_config_flow_dashboard_step(hass):
    """Test dashboard selection step."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._controller_data = {}
    
    # Show form
    result = run(flow.async_step_dashboard())
    assert result["type"] == FlowResultType.FORM
    
    # Submit with dashboard
    result = run(flow.async_step_dashboard(user_input={
        "add_to_dashboard": True,
        "dashboard_path": "lovelace",
        "dashboard_view": 1
    }))
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "success"
    assert flow._controller_data["dashboard_path"] == "lovelace"

def test_config_flow_success_step(hass):
    """Test success confirmation step."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._controller_data = {CONF_NAME: "Test", "dashboard_path": "none"}
    
    # Show form
    result = run(flow.async_step_success())
    assert result["type"] == FlowResultType.FORM
    
    # Submit
    with patch.object(flow, "_async_add_card_to_dashboard", return_value=None) as mock_add:
        result = run(flow.async_step_success(user_input={}))
        assert result["type"] == FlowResultType.CREATE_ENTRY
        assert mock_add.called

def test_options_flow_controller_init(hass):
    """Test options flow init for controller."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "Old", CONF_PRESET: "thermostat", "component_installed": False}
    entry.title = "Old"
    
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    
    # Show form
    result = run(flow.async_step_init())
    assert result["type"] == FlowResultType.FORM
    
    # Submit
    result = run(flow.async_step_init(user_input={CONF_NAME: "New"}))
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "card_config"

def test_options_flow_card_config(hass):
    """Test options flow card config step."""
    entry = MagicMock()
    entry.data = {CONF_PRESET: "thermostat"}
    
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    
    # Show form
    result = run(flow.async_step_card_config())
    assert result["type"] == FlowResultType.FORM
    
    # Submit
    result = run(flow.async_step_card_config(user_input={"max_value": 50.0}))
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "success"

def test_options_flow_success(hass):
    """Test options flow success step."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "Old", "component_installed": False}
    entry.title = "Old"
    entry.entry_id = "test_id"
    
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    flow._options_data = {CONF_NAME: "New"}
    
    hass.config_entries.async_update_entry = MagicMock()
    hass.config_entries.async_reload = AsyncMock()
    
    # Show form
    result = run(flow.async_step_success())
    assert result["type"] == FlowResultType.FORM
    
    # Submit
    result = run(flow.async_step_success(user_input={}))
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert hass.config_entries.async_update_entry.called
    assert hass.config_entries.async_reload.called
