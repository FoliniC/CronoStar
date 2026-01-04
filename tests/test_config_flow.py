import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant

DOMAIN = "cronostar"
CONF_LOGGING_ENABLED = "logging_enabled"

async def test_component_install_flow(hass: HomeAssistant) -> None:
    """Test installing the global component."""
    flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert flow["type"] == "form"
    assert flow["step_id"] == "install_component"

    # Submit install with logging enabled
    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], 
        user_input={CONF_LOGGING_ENABLED: True}
    )
    assert result["type"] == "create_entry"
    assert result["data"]["component_installed"] is True
    assert result["data"][CONF_LOGGING_ENABLED] is True

async def test_single_instance_only(hass: HomeAssistant) -> None:
    """Test that we cannot add a second instance (previously controller)."""
    # 1. Install component
    comp_flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.flow.async_configure(comp_flow["flow_id"], user_input={})
    
    # 2. Try to add another
    flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert flow["type"] == "abort"
    assert flow["reason"] == "single_instance_allowed"