import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta, timezone
from custom_components.cronostar.setup.dashboard import _is_real_datetime, write_dashboard_yaml, setup_dashboard
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.setup import async_setup_integration
from custom_components.cronostar import async_setup_entry, async_unload_entry
from custom_components.cronostar.const import DOMAIN
from homeassistant.util import dt as dt_util

# --- Dashboard Tests ---

def test_is_real_datetime_subclass_passes():
    class SubDateTime(datetime): pass
    assert _is_real_datetime(datetime.now()) is True
    assert _is_real_datetime(SubDateTime.now()) is True 

def test_is_real_datetime_with_naive():
    # Pass a naive datetime
    naive_dt = datetime(2026, 1, 1)
    assert _is_real_datetime(naive_dt) is True


@pytest.mark.asyncio
async def test_entry_within_grace_period_hidden_not_removed(hass, tmp_path):
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    hass.async_add_executor_job = AsyncMock()
    
    fixed_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    entry = MagicMock()
    entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
    entry.created_at = fixed_now
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    
    with patch("custom_components.cronostar.setup.dashboard.dt_util") as mock_dt, \
         patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
         patch("pathlib.Path.exists", return_value=False):
        mock_dt.utcnow.return_value = fixed_now
        await write_dashboard_yaml(hass, "test.yaml")
        hass.config_entries.async_remove.assert_not_called()

@pytest.mark.asyncio
async def test_entry_outside_grace_period_removed(hass, tmp_path):
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    
    async def side_effect(func, *args):
        if callable(func):
            return func(*args)
        return func
    hass.async_add_executor_job = AsyncMock(side_effect=side_effect)
    
    fixed_now = datetime(2025, 6, 1, 12, 20, 0, tzinfo=timezone.utc)
    entry = MagicMock()
    entry.entry_id = "test_id"
    entry.title = "Test"
    entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
    entry.created_at = fixed_now - timedelta(minutes=20)
    hass.config_entries.async_entries = MagicMock(return_value=[entry])
    hass.config_entries.async_get_entry = MagicMock(return_value=entry)
    
    with patch("custom_components.cronostar.setup.dashboard.dt_util") as mock_dt, \
         patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
         patch("pathlib.Path.exists", return_value=False), \
         patch.object(hass.config_entries, "async_remove", new_callable=AsyncMock) as mock_remove:
        mock_dt.utcnow.return_value = fixed_now
        await write_dashboard_yaml(hass, "test.yaml")
        mock_remove.assert_called_with("test_id")

# --- Coordinator/Integration Tests ---

@pytest.mark.asyncio
async def test_async_unload_entry_platforms_raise(hass):
    entry = MagicMock()
    entry.data = {"component_installed": False}
    with patch("custom_components.cronostar.PLATFORMS", ["sensor"]), \
         patch.object(hass.config_entries, "async_unload_platforms", side_effect=Exception("Unload Fail")):
        res = await async_unload_entry(hass, entry)
        assert res is False

@pytest.mark.asyncio
async def test_async_setup_entry_global_setup_fails_for_controller(hass):
    entry = MagicMock()
    entry.data = {"component_installed": False}
    with patch("custom_components.cronostar.async_setup_integration", return_value=False):
        res = await async_setup_entry(hass, entry)
        assert res is False
