import pytest
from homeassistant import config_entries
from homeassistant.core import HomeAssistant

DOMAIN = "cronostar"

@pytest.mark.asyncio
async def test_component_install_flow(hass: HomeAssistant) -> None:
    flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert flow["type"] == "form"
    assert flow["step_id"] in ("install_component", "user")

    # Submit install
    result = await hass.config_entries.flow.async_configure(flow["flow_id"], user_input={})
    assert result["type"] == "create_entry"
    assert result["data"]["component_installed"] is True

@pytest.mark.asyncio
async def test_controller_flow(hass: HomeAssistant) -> None:
    # Ensure component is installed first
    comp_flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.flow.async_configure(comp_flow["flow_id"], user_input={})

    # Start controller flow
    flow = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert flow["type"] == "form"
    assert flow["step_id"] == "controller"

    # Invalid target entity
    invalid = await hass.config_entries.flow.async_configure(flow["flow_id"], user_input={
        "name": "Thermostat",
        "preset": "thermostat",
        "target_entity": "climate_foo",
        "global_prefix": "cronostar_",
        "logging_enabled": False,
    })
    assert invalid["type"] == "form"
    assert invalid["errors"]["target_entity"] == "invalid"

    # Valid controller
    valid = await hass.config_entries.flow.async_configure(flow["flow_id"], user_input={
        "name": "Thermostat",
        "preset": "thermostat",
        "target_entity": "climate.foo",
        "global_prefix": "cronostar_",
        "logging_enabled": True,
    })
    assert valid["type"] == "create_entry"
    assert valid["title"].startswith("CronoStar:")
