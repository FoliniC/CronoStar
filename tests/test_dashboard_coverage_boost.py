"""Coverage boost for dashboard setup."""
import asyncio
import logging
from unittest.mock import MagicMock, patch, mock_open

import pytest
from custom_components.cronostar.setup.dashboard import write_dashboard_yaml, setup_dashboard

def run(coro):
    return asyncio.run(coro)

@pytest.mark.asyncio
async def test_write_dashboard_yaml_fallback_to_json(hass):
    """Line 111-119: Test fallback to JSON when YAML is unavailable or fails."""
    # Use a real MagicMock for hass to support async_add_executor_job correctly
    # or just use a mock that executes the function immediately
    async def fake_executor(func, *args):
        return func(*args) if args else func()
    hass.async_add_executor_job = fake_executor
    
    # Trigger ImportError when importing yaml
    with patch("builtins.open", mock_open()), \
         patch("yaml.dump", side_effect=ImportError("No YAML")), \
         patch("json.dump") as mock_json_dump:
        
        await write_dashboard_yaml(hass, "test.yaml")
        
        # Verify json.dump was used as fallback
        mock_json_dump.assert_called()

@pytest.mark.asyncio
async def test_write_dashboard_yaml_json_fallback_fails(hass, caplog):
    """Line 125: Test ultimate failure when JSON fallback also fails."""
    async def fake_executor(func, *args):
        return func(*args) if args else func()
    hass.async_add_executor_job = fake_executor
    
    # First open (YAML) fails with OSError, then second open (JSON fallback) also fails
    with patch("builtins.open", side_effect=OSError("Disk Full")), \
         caplog.at_level(logging.ERROR, logger="custom_components.cronostar.setup.dashboard"):
        
        await write_dashboard_yaml(hass, "test.yaml")
        
        assert "Failed to write dashboard file" in caplog.text

@pytest.mark.asyncio
async def test_setup_dashboard_exception(hass, caplog):
    """Test exception logging in setup_dashboard."""
    with patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", 
               side_effect=Exception("Uncaught error")), \
         caplog.at_level(logging.ERROR, logger="custom_components.cronostar.setup.dashboard"):
        
        await setup_dashboard(hass)
        
        assert "Failed to setup dashboard panel" in caplog.text
        assert "Uncaught error" in caplog.text
