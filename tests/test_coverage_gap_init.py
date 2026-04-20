import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from custom_components.cronostar import async_setup, async_setup_entry
from custom_components.cronostar.const import DOMAIN

@pytest.mark.asyncio
async def test_async_setup_integration_fails(hass):
    """Test ramo: async_setup_integration ritorna False."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    with patch("custom_components.cronostar.async_setup_integration", return_value=False):
        success = await async_setup_entry(hass, entry)
        assert success is False

@pytest.mark.asyncio
async def test_async_setup_fails_gracefully(hass):
    """Test ramo: async_setup cattura eccezione globale."""
    with patch("custom_components.cronostar.async_setup_integration", side_effect=Exception("Setup crash")):
        # async_setup deve tornare True anche se fallisce per retrocompatibilità
        success = await async_setup(hass, {})
        assert success is True
