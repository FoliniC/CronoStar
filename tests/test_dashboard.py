"""
Tests for custom_components/cronostar/setup/dashboard.py
Target: 100 % coverage
"""

import asyncio
import os
import sys
import datetime
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call
import logging
import pytest

from custom_components.cronostar.setup.dashboard import (
    setup_dashboard,
    write_dashboard_yaml,
)

def run(coro):
    return asyncio.run(coro)

class TestOrphanRemoval:
    def test_entry_within_grace_period_hidden_not_removed(self, hass, tmp_path):
        hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
        fixed_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        
        entry = MagicMock()
        entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
        entry.created_at = fixed_now
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        
        with patch("custom_components.cronostar.setup.dashboard.dt_util") as mock_dt, \
             patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
             patch("pathlib.Path.exists", return_value=False):
            mock_dt.utcnow.return_value = fixed_now
            run(write_dashboard_yaml(hass, "test.yaml"))
            hass.config_entries.async_remove.assert_not_called()

    def test_entry_outside_grace_period_removed(self, hass, tmp_path):
        hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
        fixed_now = datetime(2025, 6, 1, 12, 20, 0, tzinfo=timezone.utc)
        
        entry = MagicMock()
        entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
        entry.created_at = fixed_now - timedelta(minutes=20)
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        
        with patch("custom_components.cronostar.setup.dashboard.dt_util") as mock_dt, \
             patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
             patch("pathlib.Path.exists", return_value=False), \
             patch.object(hass.config_entries, "async_remove", new_callable=AsyncMock) as mock_remove:
            mock_dt.utcnow.return_value = fixed_now
            run(write_dashboard_yaml(hass, "test.yaml"))
            mock_remove.assert_awaited_once()

    def test_entry_naive_datetime_triggers_removal(self, hass, tmp_path):
        # Naive datetime - aware datetime subtraction raises TypeError, grace period -> False
        hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
        fixed_now = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        
        entry = MagicMock()
        entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
        entry.created_at = datetime(2025, 6, 1, 11, 55, 0) # Naive
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        
        with patch("custom_components.cronostar.setup.dashboard.dt_util") as mock_dt, \
             patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
             patch("pathlib.Path.exists", return_value=False), \
             patch.object(hass.config_entries, "async_remove", new_callable=AsyncMock) as mock_remove:
            mock_dt.utcnow.return_value = fixed_now
            run(write_dashboard_yaml(hass, "test.yaml"))
            # Should have triggered removal because TypeError sets is_within_grace=False
            mock_remove.assert_awaited_once()

class TestDashboardContent:
    def test_dashboard_yaml_content(self, hass, tmp_path):
        hass.config.path = MagicMock(side_effect=lambda x: str(tmp_path / x))
        
        entry = MagicMock()
        entry.title = "Test Controller"
        entry.data = {"preset_type": "thermostat", "global_prefix": "p1_"}
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        
        with patch("custom_components.cronostar.setup.dashboard.build_profile_filename", return_value="test.json"), \
             patch("pathlib.Path.exists", return_value=True):
            run(write_dashboard_yaml(hass, "test.yaml"))
            
        yaml_path = tmp_path / "test.yaml"
        assert yaml_path.exists()
        
        import yaml
        with open(yaml_path, encoding="utf-8") as f:
            content = yaml.safe_load(f)
            
        cards = content["views"][0]["cards"]
        # Index 0: Header
        # Index 1: Box #1 Inizio blocco
        # Index 2: Box #1 (The one we added/modified)
        # Index 3: custom:cronostar-card
        
        assert cards[1]["content"] == "--- \n ### Box #1 - Inizio blocco per: **Test Controller**"
        assert cards[2]["content"] == "### Box #1"
        assert cards[3]["type"] == "custom:cronostar-card"

