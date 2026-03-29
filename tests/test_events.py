"""Test Events."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from homeassistant.core import CoreState, Event
from homeassistant.const import EVENT_HOMEASSISTANT_START
from custom_components.cronostar.setup.events import setup_event_handlers

@pytest.mark.anyio
async def test_setup_event_handlers_running(mock_hass):
    """Test setup when HA is already running."""
    mock_hass.state = CoreState.running
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=["p1.json"])
    storage.load_profile_cached = AsyncMock()
    
    ps = MagicMock()
    ps.async_update_profile_selectors = AsyncMock()
    mock_hass.data["cronostar"] = {"profile_service": ps}
    
    # mock_hass is a MagicMock in this context, we can just check if its method was called
    await setup_event_handlers(mock_hass, storage)
    assert mock_hass.async_create_task.called
    
    # Execute the task
    task_coro = mock_hass.async_create_task.call_args[0][0]
    await task_coro
    
    assert storage.list_profiles.called
    assert storage.load_profile_cached.called
    assert ps.async_update_profile_selectors.called

@pytest.mark.anyio
async def test_setup_event_handlers_startup(mock_hass):
    """Test setup when HA is starting up."""
    mock_hass.state = CoreState.starting
    storage = MagicMock()
    
    await setup_event_handlers(mock_hass, storage)
    assert mock_hass.bus.async_listen_once.called
    assert mock_hass.bus.async_listen_once.call_args[0][0] == EVENT_HOMEASSISTANT_START
    
    # Simulate startup event
    callback = mock_hass.bus.async_listen_once.call_args[0][1]
    
    storage.list_profiles = AsyncMock(return_value=["p1.json"])
    storage.load_profile_cached = AsyncMock(side_effect=Exception("Load error"))
    
    mock_hass.data["cronostar"] = {}
    
    await callback(Event(EVENT_HOMEASSISTANT_START))
    assert storage.list_profiles.called
