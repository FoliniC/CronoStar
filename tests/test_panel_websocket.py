"""Test the CronoStar panel websocket."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.setup.panel_websocket import async_setup, websocket_get_controllers
from custom_components.cronostar.const import DOMAIN

@pytest.mark.anyio
async def test_websocket_setup(hass):
    """Test websocket setup."""
    # Patch the exact module where it's imported
    with patch("custom_components.cronostar.setup.panel_websocket.websocket_api.async_register_command") as mock_reg:
        async_setup(hass)
        assert mock_reg.called

@pytest.mark.anyio
async def test_websocket_get_controllers_missing_fields(hass):
    """Test getting controllers with missing optional fields."""
    entry = MagicMock()
    entry.entry_id = "c2"
    entry.title = "Controller 2"
    entry.data = {
        "preset_type": "thermostat",
        # Missing many optional fields
    }
    
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    connection = MagicMock()
    msg = {"id": 2, "type": "cronostar/get_controllers"}
    
    await websocket_get_controllers(hass, connection, msg)
    
    assert connection.send_result.called
    result = connection.send_result.call_args[0][1]
    data = result["controllers"][0]["data"]
    assert data["allow_max_value"] is False
    assert data["language"] == "default"

@pytest.mark.anyio
async def test_websocket_get_controllers(hass):
    """Test getting controllers via websocket."""
    # Mock entries
    entry_global = MagicMock()
    entry_global.data = {"component_installed": True}
    
    entry_controller = MagicMock()
    entry_controller.entry_id = "c1"
    entry_controller.title = "Controller 1"
    entry_controller.data = {
        "preset_type": "thermostat",
        "global_prefix": "p1",
        "target_entity": "climate.test",
        "title": "Living Room",
        "min_value": 10,
        "max_value": 30,
        "step_value": 0.5,
        "unit_of_measurement": "C",
        "y_axis_label": "Temp",
        "allow_max_value": True,
        "logging_enabled": True,
        "language": "it"
    }
    
    hass.config_entries.async_entries = MagicMock(return_value=[entry_global, entry_controller])
    
    connection = MagicMock()
    msg = {"id": 1, "type": "cronostar/get_controllers"}
    
    await websocket_get_controllers(hass, connection, msg)
    
    # Check result sent
    assert connection.send_result.called
    result = connection.send_result.call_args[0][1]
    assert len(result["controllers"]) == 1
    assert result["controllers"][0]["entry_id"] == "c1"
    assert result["controllers"][0]["data"]["preset_type"] == "thermostat"
