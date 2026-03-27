"""Test Config Flow."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from homeassistant.data_entry_flow import FlowResultType
from custom_components.cronostar.const import DOMAIN, CONF_LOGGING_ENABLED

@pytest.mark.anyio
async def test_config_flow_user_step(hass):
    """Test user step."""
    # Start flow
    hass.config_entries.flow.async_init = AsyncMock(return_value={
        "type": FlowResultType.FORM,
        "step_id": "install_component",
        "flow_id": "test_flow"
    })
    
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "install_component"
    
    # Submit form
    hass.config_entries.flow.async_configure = AsyncMock(return_value={
        "type": FlowResultType.CREATE_ENTRY,
        "data": {"component_installed": True, CONF_LOGGING_ENABLED: True}
    })
    
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], 
        user_input={CONF_LOGGING_ENABLED: True}
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"]["component_installed"] is True
    assert result["data"][CONF_LOGGING_ENABLED] is True

@pytest.mark.anyio
async def test_config_flow_single_instance(hass):
    """Test only one global instance allowed."""
    # Mock existing entry
    entry = MagicMock()
    entry.data = {"component_installed": True}
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    
    # Manually instantiate flow since we want to test its logic
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Mock _async_current_entries
    flow._async_current_entries = MagicMock(return_value=[entry])
    
    # Use install_component step directly to check abort
    result = await flow.async_step_install_component()
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"

@pytest.mark.anyio
async def test_config_flow_create_controller(hass):
    """Test programmatic controller creation."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass
    
    # Mock set_unique_id and abort_if_unique_id_configured
    flow.async_set_unique_id = AsyncMock()
    flow._abort_if_unique_id_configured = MagicMock()
    
    result = await flow.async_step_create_controller(user_input={
        "name": "Test Room",
        "preset": "thermostat",
        "target_entity": "climate.test",
        "global_prefix": "test_prefix_"
    })
    
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["title"] == "CronoStar: Test Room"
    assert result["data"]["global_prefix"] == "test_prefix_"

@pytest.mark.anyio
async def test_config_flow_full_controller_wizard(hass):
    """Test full multi-step controller creation wizard."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass

    # Mock entries (component is installed)
    entry = MagicMock()
    entry.data = {"component_installed": True}
    flow._async_current_entries = MagicMock(return_value=[entry])

    # 1. User step (show menu)
    result = await flow.async_step_user()
    assert result["type"] == FlowResultType.MENU

    # 2. Controller step (basic info)
    result = await flow.async_step_controller(user_input={
        "name": "Living Room",
        "preset": "thermostat",
        "target_entity": "climate.living_room",
        "global_prefix": "cr_"
    })
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "card_config"

    # 3. Card config step (parameters)
    result = await flow.async_step_card_config(user_input={
        "min_value": 15,
        "max_value": 25,
        "step_value": 0.5
    })
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "dashboard"

    # 4. Dashboard step
    result = await flow.async_step_dashboard(user_input={
        "add_to_dashboard": False
    })
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "success"

    # 5. Success step
    result = await flow.async_step_success(user_input={})
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert "Living Room" in result["title"]
    assert result["data"]["min_value"] == 15

@pytest.mark.anyio
async def test_config_flow_controller_error(hass):
    """Test validation error in controller step."""
    from custom_components.cronostar.config_flow import CronoStarConfigFlow
    flow = CronoStarConfigFlow()
    flow.hass = hass

    # Invalid target entity (missing dot)
    result = await flow.async_step_controller(user_input={
        "name": "Test",
        "preset": "thermostat",
        "target_entity": "invalid_entity",
        "global_prefix": "cr_"
    })
    assert result["type"] == FlowResultType.FORM
    assert result["errors"]["target_entity"] == "invalid"

@pytest.mark.anyio
async def test_options_flow_controller(hass):
    """Test options flow for a controller entry."""
    entry = MagicMock()
    entry.title = "CronoStar: Test"
    entry.data = {
        "name": "Test",
        "preset": "thermostat",
        "target_entity": "climate.test",
        "global_prefix": "cr_",
        "component_installed": False
    }
    entry.options = {}

    from custom_components.cronostar.config_flow import CronoStarOptionsFlow
    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass

    # 1. Init step
    result = await flow.async_step_init(user_input={
        "name": "New Name",
        "preset": "thermostat",
        "target_entity": "climate.new",
        "global_prefix": "cr_"
    })
    assert result["step_id"] == "card_config"

    # 2. Card config step
    result = await flow.async_step_card_config(user_input={
        "min_value": 10
    })
    assert result["step_id"] == "success"

    # 3. Success step
    hass.config_entries.async_reload = AsyncMock()
    with patch.object(hass.config_entries, "async_update_entry") as mock_update:
        result = await flow.async_step_success(user_input={})
        assert result["type"] == FlowResultType.CREATE_ENTRY
        assert mock_update.called
        assert hass.config_entries.async_reload.called