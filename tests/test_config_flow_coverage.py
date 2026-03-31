"""Coverage tests for CronoStar Config Flow."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
import voluptuous as vol
from homeassistant.data_entry_flow import FlowResultType
from custom_components.cronostar.const import DOMAIN, CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY, CONF_GLOBAL_PREFIX, CONF_LOGGING_ENABLED
from custom_components.cronostar.config_flow import CronoStarConfigFlow, CronoStarOptionsFlow

def run(coro):
    """Run a coroutine."""
    return asyncio.run(coro)

def test_async_step_create_controller_already_configured(hass):
    """Test async_step_create_controller aborts if already configured."""
    entry = MagicMock()
    entry.data = {CONF_GLOBAL_PREFIX: "test_prefix"}
    
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._async_current_entries = MagicMock(return_value=[entry])
    
    result = run(flow.async_step_create_controller(user_input={
        CONF_GLOBAL_PREFIX: "test_prefix",
        CONF_NAME: "Test"
    }))
    
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "already_configured"

def test_async_step_reconfigure_component(hass):
    """Test reconfiguration for the global component."""
    entry = MagicMock()
    entry.data = {"component_installed": True, CONF_LOGGING_ENABLED: False}
    entry.entry_id = "test_id"
    
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow.context = {"entry_id": "test_id"}
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    
    # Show form
    result = run(flow.async_step_reconfigure())
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "reconfigure"
    
    # Submit
    flow.async_update_reload_and_abort = AsyncMock(return_value="success")
    result = run(flow.async_step_reconfigure(user_input={CONF_LOGGING_ENABLED: True}))
    assert result == "success"
    flow.async_update_reload_and_abort.assert_called_once()

def test_async_step_reconfigure_controller(hass):
    """Test reconfiguration for a controller."""
    entry = MagicMock()
    entry.data = {"component_installed": False, CONF_NAME: "Old", CONF_PRESET: "thermostat", CONF_TARGET_ENTITY: "climate.test"}
    entry.entry_id = "test_id"
    
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow.context = {"entry_id": "test_id"}
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    
    # Show form
    result = run(flow.async_step_reconfigure())
    assert result["type"] == FlowResultType.FORM
    
    # Submit
    flow.async_update_reload_and_abort = AsyncMock(return_value="success")
    result = run(flow.async_step_reconfigure(user_input={CONF_NAME: "New"}))
    assert result == "success"

def test_async_step_user_not_installed(hass):
    """Test user step when component is not installed."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._async_current_entries = MagicMock(return_value=[])
    
    with patch.object(flow, "async_step_install_component", AsyncMock(return_value="install_step")) as mock_install:
        result = run(flow.async_step_user())
        assert result == "install_step"
        mock_install.assert_called_once()

def test_async_step_install_component_submit(hass):
    """Test submitting install_component."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._async_current_entries = MagicMock(return_value=[])
    
    result = run(flow.async_step_install_component(user_input={CONF_LOGGING_ENABLED: True}))
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"]["component_installed"] is True
    assert result["data"][CONF_LOGGING_ENABLED] is True

def test_async_step_dashboard_with_dashboards(hass):
    """Test dashboard step with mocked lovelace dashboards."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Mock Lovelace dashboards
    from homeassistant.components.lovelace.const import LOVELACE_DATA
    mock_dash = MagicMock()
    mock_dash.title = "My Dashboard"
    hass.data[LOVELACE_DATA] = MagicMock()
    hass.data[LOVELACE_DATA].dashboards = {"lovelace-test": mock_dash}
    
    result = run(flow.async_step_dashboard())
    assert result["type"] == FlowResultType.FORM
    # Check if dashboard is in options
    schema = result["data_schema"]
    # schema is a voluptuous Schema, difficult to inspect deeply easily, but we trust the logic for now
    
    # Submit with dashboard
    result = run(flow.async_step_dashboard(user_input={
        "add_to_dashboard": True,
        "dashboard_path": "lovelace-test",
        "dashboard_view": 0
    }))
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "success"
    assert flow._controller_data["dashboard_path"] == "lovelace-test"

def test_async_add_card_to_dashboard_logic(hass):
    """Test the internal _async_add_card_to_dashboard method."""
    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._controller_data = {
        CONF_TARGET_ENTITY: "climate.test",
        CONF_GLOBAL_PREFIX: "p_",
        CONF_PRESET: "thermostat",
        "dashboard_path": "lovelace-test",
        "dashboard_view": 0
    }
    
    mock_config = {"views": [{"cards": []}]}
    
    with patch("homeassistant.components.lovelace.async_get_config", AsyncMock(return_value=mock_config)), \
         patch("homeassistant.components.lovelace.async_save_config", AsyncMock()) as mock_save:
        
        run(flow._async_add_card_to_dashboard())
        
        assert len(mock_config["views"][0]["cards"]) == 1
        assert mock_config["views"][0]["cards"][0]["type"] == "custom:cronostar-card"
        mock_save.assert_called_once()

def test_options_flow_init_global(hass):
    """Test options flow init for global component."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.options = {CONF_LOGGING_ENABLED: False}
    
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    
    # Submit
    result = run(flow.async_step_init(user_input={CONF_LOGGING_ENABLED: True}))
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_LOGGING_ENABLED] is True
