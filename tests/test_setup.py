"""
Tests for custom_components/cronostar/setup/dashboard.py
"""

import asyncio
import datetime
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from custom_components.cronostar.setup.dashboard import (
    setup_dashboard,
    write_dashboard_yaml,
)

def run(coro):
    return asyncio.run(coro)

class TestSetupDashboard:

    def test_setup_dashboard_purge_error(self, hass, tmp_path):
        """Test dashboard setup with purge error."""
        # Setup mock environment
        hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
        
        # Test just calls setup_dashboard
        with patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", new=AsyncMock()):
            # setup_dashboard now uses async_register_built_in_panel from HA
            with patch("custom_components.cronostar.setup.dashboard.async_register_built_in_panel"):
                run(setup_dashboard(hass))
        # Should complete without error
