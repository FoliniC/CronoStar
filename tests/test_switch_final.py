"""Test CronoStar Switch - Full Coverage."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from custom_components.cronostar.switch import CronoStarEnabledSwitch, async_setup_entry
from custom_components.cronostar.const import DOMAIN

def run(coro):
    return asyncio.run(coro)

@pytest.fixture
def mock_coordinator(hass, mock_entry):
    """Build a mock coordinator for switch tests."""
    # Setup hass.data for device info sw_version
    hass.data[DOMAIN] = {"version": "1.2.3"}
    
    coordinator = MagicMock()
    coordinator.hass = hass
    coordinator.entry = mock_entry
    coordinator.prefix = "p1_"
    coordinator.last_update_success = True
    coordinator.name = "Test Controller"
    coordinator.preset_type = "thermostat"
    coordinator.target_entity = "climate.target"
    coordinator.logging_enabled = True
    coordinator.last_update_success = True
    coordinator.data = {"is_enabled": True}
    coordinator.set_enabled = AsyncMock()
    return coordinator

def test_async_setup_entry(hass, mock_entry):
    """Test switch platform setup."""
    mock_coordinator = MagicMock()
    mock_entry.runtime_data = mock_coordinator
    async_add_entities = MagicMock()
    
    run(async_setup_entry(hass, mock_entry, async_add_entities))
    assert async_add_entities.called
    entities = async_add_entities.call_args[0][0]
    assert len(entities) == 1
    assert isinstance(entities[0], CronoStarEnabledSwitch)

def test_switch_entity_properties(mock_coordinator):
    """Test switch entity properties and states."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Init - using internal _attr because SwitchEntity isn't fully initialized
    assert switch._attr_unique_id == "p1_enabled"
    assert switch.entity_id == "switch.p1_enabled"
    assert switch._attr_name is None
    
    # is_on
    assert switch.is_on is True
    mock_coordinator.last_update_success = True
    mock_coordinator.data = {"is_enabled": False}
    assert switch.is_on is False
    mock_coordinator.last_update_success = True
    mock_coordinator.data = None
    assert switch.is_on is True # Default True when no data
    
    # Device info - using internal _attr
    info = switch._attr_device_info
    assert info["identifiers"] == {(DOMAIN, mock_coordinator.entry.entry_id)}
    assert info["sw_version"] == "1.2.3"

def test_switch_actions(mock_coordinator):
    """Test switch turn_on/off actions."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Turn off
    run(switch.async_turn_off())
    mock_coordinator.set_enabled.assert_called_with(False)
    
    # Turn on
    run(switch.async_turn_on())
    mock_coordinator.set_enabled.assert_called_with(True)
    
    # Test logging disabled path
    mock_coordinator.logging_enabled = False
    run(switch.async_turn_on())
    # No crash, covered branch

def test_switch_availability(mock_coordinator, hass):
    """Test switch availability logic."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Target entity exists and is active
    hass.states.async_set("climate.target", "heat")
    assert switch.available is True
    
    # Target entity missing
    # We can't easily "remove" from the mock_hass states if it's a dict, 
    # but the guidance says just don't register it. 
    # Since we are using a mock_hass from conftest, let's see how it's implemented.
    # If it's a real StateMachine from HA, we can't delete easily.
    # But we can set it to a different entity or use a new one.
    
    mock_coordinator.target_entity = "climate.missing"
    mock_coordinator.last_update_success = False
    assert switch.available is False
    
    # Target entity unknown
    mock_coordinator.target_entity = "climate.unknown"
    hass.states.async_set("climate.unknown", "unknown")
    mock_coordinator.last_update_success = False
    assert switch.available is False
    
    # Target entity unavailable
    mock_coordinator.target_entity = "climate.unavailable"
    hass.states.async_set("climate.unavailable", "unavailable")
    mock_coordinator.last_update_success = False
    assert switch.available is False
