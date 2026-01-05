"""Absolute final tests."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.const import DOMAIN, CONF_TARGET_ENTITY
from homeassistant.exceptions import HomeAssistantError

@pytest.fixture
def mock_hass(tmp_path):
    hass = MagicMock()
    hass.data = {DOMAIN: {}}
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    hass.config.path = MagicMock(side_effect=lambda x=None: str(config_dir / x) if x else str(config_dir))
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    return hass

async def test_profile_service_missing_name_save(mock_hass):
    """Trigger line 59 in profile_service."""
    ps = ProfileService(mock_hass, MagicMock(), MagicMock())
    call = MagicMock()
    call.data = {"profile_name": ""} # Missing
    with pytest.raises(HomeAssistantError):
        await ps.save_profile(call)

async def test_profile_service_missing_name_load(mock_hass):
    """Trigger line 187 in profile_service."""
    ps = ProfileService(mock_hass, MagicMock(), MagicMock())
    call = MagicMock()
    call.data = {"profile_name": ""} # Missing
    res = await ps.load_profile(call)
    assert "error" in res

async def test_coordinator_target_missing_logging(mock_hass):
    """Trigger lines 119, 122 in coordinator."""
    entry = MagicMock()
    entry.data = {CONF_TARGET_ENTITY: "climate.test"}
    coordinator = CronoStarCoordinator(mock_hass, entry)
    coordinator.logging_enabled = True
    
    mock_hass.states.get.return_value = None
    res = await coordinator._async_update_data()
    assert res is not None
