import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.cronostar.const import DOMAIN, CONF_LOGGING_ENABLED

async def test_component_install_flow(hass: HomeAssistant) -> None:
    """Test installing the global component."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "install_component"

    # Submit install with logging enabled
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], 
        user_input={CONF_LOGGING_ENABLED: True}
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"]["component_installed"] is True
    assert result["data"][CONF_LOGGING_ENABLED] is True

async def test_single_instance_only(hass: HomeAssistant) -> None:
    """Test that we cannot add a second instance (previously controller)."""
    # 1. Install component
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(
        result["flow_id"], user_input={}
    )
    
    # 2. Try to add another
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"
