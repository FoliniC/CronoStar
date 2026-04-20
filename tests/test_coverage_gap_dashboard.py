import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from custom_components.cronostar.setup.dashboard import setup_dashboard

@pytest.mark.asyncio
async def test_setup_dashboard_frontend_error(hass):
    """Test errore in async_register_built_in_panel."""
    hass.config_entries.async_entries = MagicMock(return_value=[])
    with patch("custom_components.cronostar.setup.dashboard.async_register_built_in_panel", side_effect=Exception("Frontend Fail")):
        await setup_dashboard(hass)
    # Dovrebbe essere catturato internamente

@pytest.mark.asyncio
async def test_setup_dashboard_storage_access_denied(hass, tmp_path):
    """Test errore accesso directory profili."""
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    # Simula permessi negati forzando un errore nel path
    with patch("pathlib.Path.exists", side_effect=PermissionError("Denied")):
        await setup_dashboard(hass)
