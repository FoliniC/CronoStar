"""Test CronoStar platforms (select, sensor, switch)."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from homeassistant.const import STATE_ON, STATE_OFF, STATE_UNAVAILABLE
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.select import CronoStarProfileSelect
from custom_components.cronostar.sensor import CronoStarCurrentSensor
from custom_components.cronostar.switch import CronoStarEnabledSwitch

def run(coro):
    return asyncio.run(coro)

@pytest.fixture
def mock_coordinator(hass):
    # Ensure hass.data[DOMAIN] is initialized for sw_version
    hass.data[DOMAIN] = {"version": "6.0.0"}
    
    coord = MagicMock()
    coord.hass = hass
    coord.entry = MagicMock()
    coord.entry.entry_id = "test_entry"
    coord.name = "Test Controller"
    coord.preset_type = "thermostat"
    coord.prefix = "cr_"
    coord.target_entity = "climate.test"
    coord.logging_enabled = True
    coord.data = {
        "available_profiles": ["Default", "Comfort"],
        "selected_profile": "Default",
        "is_enabled": True,
        "current_value": 21.5,
        "card_config": {"title": "Test Card"}
    }
    return coord

def test_select_entity(hass, mock_coordinator):
    """Test profile select entity."""
    entity = CronoStarProfileSelect(mock_coordinator)
    
    assert entity.options == ["Default", "Comfort"]
    assert entity.current_option == "Default"
    
    # Test selection
    mock_coordinator.set_profile = AsyncMock()
    run(entity.async_select_option("Comfort"))
    mock_coordinator.set_profile.assert_called_with("Comfort")
    
    # Test availability
    hass.states.async_set("climate.test", "heat")
    assert entity.available is True
    
    hass.states.async_set("climate.test", STATE_UNAVAILABLE)
    assert entity.available is False

def test_sensor_entity(hass, mock_coordinator):
    """Test current value sensor entity."""
    entity = CronoStarCurrentSensor(mock_coordinator)
    
    assert entity.native_value == 21.5
    assert entity.extra_state_attributes["active_profile"] == "Default"
    assert entity.extra_state_attributes["title"] == "Test Card"
    
    # Test availability
    hass.states.async_set("climate.test", "heat")
    assert entity.available is True
    
    # Test different presets
    mock_coordinator.preset_type = "ev_charging"
    entity_ev = CronoStarCurrentSensor(mock_coordinator)
    assert entity_ev._attr_native_unit_of_measurement == "kW"
    
    mock_coordinator.preset_type = "cover"
    entity_cover = CronoStarCurrentSensor(mock_coordinator)
    assert entity_cover._attr_native_unit_of_measurement == "%"
    
    mock_coordinator.preset_type = "generic_switch"
    entity_switch = CronoStarCurrentSensor(mock_coordinator)
    assert entity_switch._attr_native_unit_of_measurement is None

def test_switch_entity(hass, mock_coordinator):
    """Test enabled switch entity."""
    entity = CronoStarEnabledSwitch(mock_coordinator)
    
    assert entity.is_on is True
    
    mock_coordinator.set_enabled = AsyncMock()
    run(entity.async_turn_off())
    mock_coordinator.set_enabled.assert_called_with(False)
    
    run(entity.async_turn_on())
    mock_coordinator.set_enabled.assert_called_with(True)

def test_platform_setup_entries(hass, mock_coordinator):
    """Test async_setup_entry for all platforms."""
    from custom_components.cronostar.select import async_setup_entry as setup_select
    from custom_components.cronostar.sensor import async_setup_entry as setup_sensor
    from custom_components.cronostar.switch import async_setup_entry as setup_switch
    
    entry = MagicMock()
    entry.runtime_data = mock_coordinator
    async_add_entities = MagicMock()
    
    run(setup_select(hass, entry, async_add_entities))
    assert async_add_entities.called
    
    async_add_entities.reset_mock()
    run(setup_sensor(hass, entry, async_add_entities))
    assert async_add_entities.called
    
    async_add_entities.reset_mock()
    run(setup_switch(hass, entry, async_add_entities))
    assert async_add_entities.called
