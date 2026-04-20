import pytest
import json
from unittest.mock import MagicMock, patch, AsyncMock
from custom_components.cronostar.setup.dashboard import write_dashboard_yaml

@pytest.mark.asyncio
async def test_dashboard_coverage_gaps(hass, tmp_path):
    hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
    
    # 1. Component installed = True
    entry1 = MagicMock()
    entry1.data = {"component_installed": True}
    
    # 2. Malformed data (Linea 34)
    entry2 = MagicMock()
    entry2.data = {"component_installed": False, "preset_type": None}
    
    # 3. Duplicate prefix (Linea 71-72)
    entry3 = MagicMock()
    entry3.data = {"component_installed": False, "preset_type": "thermostat", "global_prefix": "p1_"}
    entry3.title = "D1"
    
    entry4 = MagicMock()
    entry4.data = {"component_installed": False, "preset_type": "thermostat", "global_prefix": "p1_"}
    entry4.title = "D2"
    
    hass.config_entries.async_entries = MagicMock(return_value=[entry1, entry2, entry3, entry4])
    
    with patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
         patch("pathlib.Path.exists", return_value=True):
        await write_dashboard_yaml(hass, "test.yaml")
