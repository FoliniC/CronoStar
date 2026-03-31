"""Test CronoStar Switch."""
import asyncio
from unittest.mock import AsyncMock
import pytest
from custom_components.cronostar.switch import CronoStarEnabledSwitch

def run(coro):
    return asyncio.run(coro)

def test_switch_entity(hass, mock_coordinator):
    """Test switch entity properties."""
    mock_coordinator.data = {
        "is_enabled": True
    }
    
    switch = CronoStarEnabledSwitch(mock_coordinator)
    
    assert switch.unique_id == "cronostar_thermostat_test_enabled"
    assert switch.is_on is True
    
    # Test turn off
    mock_coordinator.set_enabled = AsyncMock()
    run(switch.async_turn_off())
    mock_coordinator.set_enabled.assert_called_with(False)
    
    # Test turn on
    run(switch.async_turn_on())
    mock_coordinator.set_enabled.assert_called_with(True)
