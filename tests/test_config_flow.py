"""Tests for CronoStar config flow."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from homeassistant.data_entry_flow import FlowResultType
from custom_components.cronostar.const import DOMAIN, CONF_LOGGING_ENABLED, CONF_TARGET_ENTITY, CONF_NAME, CONF_PRESET, CONF_GLOBAL_PREFIX
from pytest_homeassistant_custom_component.common import MockConfigEntry

def run(coro):
    return asyncio.run(coro)

def test_config_flow_user_step(hass):
    """Test user step."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # If no entries, should show install_component
    result = run(flow.async_step_user())
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "install_component"

def test_config_flow_install_component(hass):
    """Test global component installation."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # 1. Show form
    result = run(flow.async_step_install_component())
    assert result["type"] == FlowResultType.FORM
    
    # 2. Submit form
    result = run(flow.async_step_install_component(user_input={
        CONF_LOGGING_ENABLED: True
    }))
    
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"]["component_installed"] is True
    assert result["data"][CONF_LOGGING_ENABLED] is True

def test_config_flow_single_instance(hass):
    """Test only one global instance allowed."""
    # Mock existing entry using MockConfigEntry
    entry = MockConfigEntry(domain=DOMAIN, data={"component_installed": True})
    entry.add_to_hass(hass)
    
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Should abort immediately because it's already installed
    result = run(flow.async_step_install_component())
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"

def test_config_flow_create_controller(hass):
    """Test programmatic controller creation."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    result = run(flow.async_step_create_controller(user_input={
        "name": "Test Room",
        "preset": "thermostat",
        "target_entity": "climate.test",
        "global_prefix": "test_prefix_"
    }))
    
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert "Test Room" in result["title"]
    assert result["data"]["global_prefix"] == "test_prefix_"

def test_config_flow_full_controller_wizard(hass):
    """Test full multi-step controller creation wizard."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # 1. Mock component as installed so we can reach controller step
    MockConfigEntry(domain=DOMAIN, data={"component_installed": True}).add_to_hass(hass)
    
    # 2. Step user -> Menu -> Controller
    result = run(flow.async_step_user())
    assert result["type"] == FlowResultType.MENU
    
    # 3. Step controller
    result = run(flow.async_step_controller(user_input={
        CONF_NAME: "Living Room",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "climate.living_room",
        CONF_GLOBAL_PREFIX: "cr_"
    }))
    assert result["step_id"] == "card_config"
    
    # 4. Step card_config
    result = run(flow.async_step_card_config(user_input={
        "min_value": 15,
        "max_value": 25,
        "step_value": 0.5
    }))
    assert result["step_id"] == "dashboard"
    
    # 5. Step dashboard
    result = run(flow.async_step_dashboard(user_input={
        "add_to_dashboard": False
    }))
    assert result["step_id"] == "success"
    
    # 6. Step success
    result = run(flow.async_step_success(user_input={}))
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert "Living Room" in result["title"]
    assert result["data"]["min_value"] == 15

def test_config_flow_controller_error(hass):
    """Test validation error in controller step."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Missing dot in target_entity
    result = run(flow.async_step_controller(user_input={
        CONF_NAME: "Test",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "invalid",
        CONF_GLOBAL_PREFIX: "cr_"
    }))
    assert result["type"] == FlowResultType.FORM
    assert result["errors"][CONF_TARGET_ENTITY] == "invalid"

def test_options_flow_controller(hass):
    """Test options flow for a controller entry."""
    entry = MockConfigEntry(
        domain="cronostar",
        title="CronoStar: Test",
        data={
            CONF_NAME: "Test",
            CONF_PRESET: "thermostat",
            CONF_TARGET_ENTITY: "climate.test",
            CONF_GLOBAL_PREFIX: "cr_",
            "component_installed": False,
        },
        options={},
    )
    entry.add_to_hass(hass)

    from custom_components.cronostar.config_flow import CronoStarOptionsFlow
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass

    # 1. Init step
    result = run(flow.async_step_init(user_input={
        CONF_NAME: "New Name",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "climate.new",
        CONF_GLOBAL_PREFIX: "cr_",
    }))
    assert result["step_id"] == "card_config"

    # 2. Card config step
    result = run(flow.async_step_card_config(user_input={"min_value": 10}))
    assert result["step_id"] == "success"

    # 3. Success step
    result = run(flow.async_step_success(user_input={}))
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert hass.config_entries.async_update_entry.called
    assert hass.config_entries.async_reload.called
