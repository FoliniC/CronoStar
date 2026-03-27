
import sys
from unittest.mock import MagicMock

# Mock frontend before any imports that might trigger it
mock_frontend = MagicMock()
sys.modules["homeassistant.components.frontend"] = mock_frontend

import pytest
from custom_components.cronostar.coordinator import CronoStarCoordinator
from homeassistant.core import HomeAssistant

@pytest.mark.anyio
async def test_coordinator_interpolation_logic(hass: HomeAssistant):
    """Test the interpolation logic specifically to boost coverage."""
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.title = "Test Controller"
    entry.data = {
        "name": "Test",
        "preset_type": "thermostat",
        "target_entity": "climate.test",
    }
    entry.options = {}
    
    coordinator = CronoStarCoordinator(hass, entry)
    
    # Test interpolation with empty schedule
    assert coordinator._interpolate_schedule([]) is None
    
    # Test interpolation with single point
    schedule = [{"time": "12:00", "value": 20.0}]
    assert coordinator._interpolate_schedule(schedule) == 20.0
    
    # Test interpolation with two points
    schedule = [
        {"time": "00:00", "value": 18.0},
        {"time": "23:59", "value": 22.0}
    ]
    # At any time it should be between 18 and 22
    val = coordinator._interpolate_schedule(schedule)
    assert 18.0 <= val <= 22.0

@pytest.mark.asyncio
async def test_coordinator_next_change(hass: HomeAssistant):
    """Test the next change calculation logic."""
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.data = {"target_entity": "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    
    schedule = [
        {"time": "10:00", "value": 20.0},
        {"time": "15:00", "value": 22.0}
    ]
    
    # If current value is 20, next change should be at 15:00
    res = coordinator._get_next_change(schedule, 20.0)
    assert res is not None
    assert res[0] == "15:00"
