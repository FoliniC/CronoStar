"""Test to reach 90% coverage."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.services.profile_service import ProfileService

def run(coro):
    return asyncio.run(coro)

def test_get_profile_data_invalid_entities(hass):
    """Test get_profile_data with invalid entities in schedule."""
    sm = MagicMock()
    # ProfileService expects a list of (filename, data) tuples
    sm.get_cached_containers = AsyncMock(return_value=[
        ("f1.json", {
            "profiles": {
                "P": {"schedule": [{"time": "08:00", "value": 20}, {"time": "10:00", "value": 18}]}
            },
            "meta": {"target_entity": "input_number.test"}
        })
    ])
    
    hass.states.async_set("input_number.test", "20")
    
    ps = ProfileService(hass, sm, MagicMock())
    res = run(ps.get_profile_data("P", "thermostat"))
    assert "schedule" in res
    
    # Test entity missing
    hass.states.get.side_effect = lambda eid: None # Force missing
    res = run(ps.get_profile_data("P", "thermostat"))
    assert "schedule" in res
