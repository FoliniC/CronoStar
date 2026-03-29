"""Test CronoStar Switch - Full Coverage."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from custom_components.cronostar.switch import CronoStarEnabledSwitch, async_setup_entry
from custom_components.cronostar.const import DOMAIN

@pytest.fixture
def mock_coordinator(mock_hass, mock_entry):
    """Build a mock coordinator for switch tests."""
    # Setup hass.data for device info sw_version
    mock_hass.data[DOMAIN] = {"version": "1.2.3"}
    
    coordinator = MagicMock()
    coordinator.hass = mock_hass
    coordinator.entry = mock_entry
    coordinator.prefix = "p1_"
    coordinator.name = "Test Controller"
    coordinator.preset_type = "thermostat"
    coordinator.target_entity = "climate.target"
    coordinator.logging_enabled = True
    coordinator.data = {"is_enabled": True}
    coordinator.set_enabled = AsyncMock()
    return coordinator

@pytest.mark.anyio
async def test_async_setup_entry(mock_hass, mock_entry):
    """Test switch platform setup."""
    mock_coordinator = MagicMock()
    mock_entry.runtime_data = mock_coordinator
    async_add_entities = MagicMock()
    
    await async_setup_entry(mock_hass, mock_entry, async_add_entities)
    assert async_add_entities.called
    entities = async_add_entities.call_args[0][0]
    assert len(entities) == 1
    assert isinstance(entities[0], CronoStarEnabledSwitch)

@pytest.mark.anyio
async def test_switch_entity_properties(mock_coordinator):
    """Test switch entity properties and states."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Init - using internal _attr because SwitchEntity isn't fully initialized
    assert switch._attr_unique_id == "p1_enabled"
    assert switch.entity_id == "switch.p1_enabled"
    assert switch._attr_name is None
    
    # is_on
    assert switch.is_on is True
    mock_coordinator.data = {"is_enabled": False}
    assert switch.is_on is False
    mock_coordinator.data = None
    assert switch.is_on is True # Default True when no data
    
    # Device info - using internal _attr
    info = switch._attr_device_info
    assert info["identifiers"] == {(DOMAIN, mock_coordinator.entry.entry_id)}
    assert info["sw_version"] == "1.2.3"

@pytest.mark.anyio
async def test_switch_actions(mock_coordinator):
    """Test switch turn_on/off actions."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Turn off
    await switch.async_turn_off()
    mock_coordinator.set_enabled.assert_called_with(False)
    
    # Turn on
    await switch.async_turn_on()
    mock_coordinator.set_enabled.assert_called_with(True)
    
    # Test logging disabled path
    mock_coordinator.logging_enabled = False
    await switch.async_turn_on()
    # No crash, covered branch

@pytest.mark.anyio
async def test_switch_availability(mock_coordinator, mock_hass):
    """Test switch availability logic."""
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    # Target entity exists and is active
    state = MagicMock()
    state.state = "heat"
    mock_hass.states.get = MagicMock(return_value=state)
    assert switch.available is True
    
    # Target entity missing
    mock_hass.states.get = MagicMock(return_value=None)
    assert switch.available is False
    
    # Target entity unknown
    state.state = "unknown"
    mock_hass.states.get = MagicMock(return_value=state)
    assert switch.available is False
    
    # Target entity unavailable
    state.state = "unavailable"
    assert switch.available is False
