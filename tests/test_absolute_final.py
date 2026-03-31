"""Absolute final tests."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from homeassistant.exceptions import HomeAssistantError

def run(coro):
    """Run a coroutine."""
    return asyncio.run(coro)

def test_profile_service_missing_name_save(hass):
    """Trigger line 59 in profile_service."""
    import custom_components.cronostar.services.profile_service as ps_mod
    ps = ProfileService(hass, MagicMock(), MagicMock())
    call = MagicMock()
    call.data = {"profile_name": ""} # Missing
    with pytest.raises(ps_mod.HomeAssistantError):
        run(ps.save_profile(call))

def test_profile_service_missing_name_load(hass):
    """Trigger line 187 in profile_service."""
    ps = ProfileService(hass, MagicMock(), MagicMock())
    call = MagicMock()
    call.data = {"profile_name": ""} # Missing
    res = run(ps.load_profile(call))
    assert "error" in res

def test_coordinator_target_missing_logging(hass):
    """Trigger lines 119, 122 in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(hass, entry)
    coordinator.logging_enabled = True
    
    # "climate.test" does not exist in hass → states.get("climate.test") == None by default
    # No mock needed for hass.states.get as it is read-only.
    run(coordinator._async_update_data())

    res = run(coordinator._async_update_data())
    assert res is not None
