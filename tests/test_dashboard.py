"""
Tests for custom_components/cronostar/setup/dashboard.py
Target: 100 % coverage

Missing branches at 71 %:
  - _register_lovelace_dashboard when "lovelace" is absent from hass.data
  - _register_lovelace_dashboard when dashboards attr is None on a plain object
  - _register_lovelace_dashboard when lovelace_data is a dict (uses .get path)
  - _register_lovelace_dashboard when lovelace_data is dict but "dashboards" key absent
  - _purge_old_storage_files when os.remove raises (error branch)
  - write_dashboard_yaml when the file write raises
  - async_remove_panel raises inside setup_dashboard cleanup loop
"""

import asyncio
import os
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

# The source file lives at:
#   custom_components/cronostar/setup/dashboard.py
# It is already importable through the package installed in sys.path via conftest.
from custom_components.cronostar.setup import dashboard as dash_mod
from custom_components.cronostar.setup.dashboard import (
    _register_lovelace_dashboard,
    setup_dashboard,
    write_dashboard_yaml,
    PANEL_URL_PATH,
    DASHBOARD_YAML_FILENAME,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helper: run a coroutine in a test
# ──────────────────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.run(coro)


# ══════════════════════════════════════════════════════════════════════════════
# _register_lovelace_dashboard
# ══════════════════════════════════════════════════════════════════════════════

class TestRegisterLovelaceDashboard:

    def test_lovelace_absent_from_hass_data(self, hass):
        """Branch: 'lovelace' not in hass.data → logs error and returns early."""
        hass.data = {}  # no 'lovelace' key
        run(_register_lovelace_dashboard(hass, "/tmp/fake.yaml"))
        # Should not raise; the early-return path must be hit

    def test_dashboards_attr_none_and_not_dict(self, hass):
        """Branch: lovelace_data has no .dashboards attribute and is not a dict."""
        lovelace_obj = MagicMock(spec=[])           # no .dashboards attribute
        type(lovelace_obj).dashboards = property(lambda self: None)  # returns None
        hass.data = {"lovelace": lovelace_obj}

        # getattr returns None; isinstance(lovelace_obj, dict) is False
        # → dashboards remains None → error + return
        run(_register_lovelace_dashboard(hass, "/tmp/fake.yaml"))

    def test_lovelace_data_is_dict_with_dashboards(self, hass):
        """Branch: lovelace_data is a dict that contains 'dashboards'."""
        dashboards = {}
        hass.data = {"lovelace": {"dashboards": dashboards}}

        # Patch LovelaceYAML so we can assert it's called
        fake_instance = MagicMock()
        with patch(
            "custom_components.cronostar.setup.dashboard.LovelaceYAML"
            if hasattr(dash_mod, "LovelaceYAML")
            else "homeassistant.components.lovelace.dashboard.LovelaceYAML",
            return_value=fake_instance,
        ):
            run(_register_lovelace_dashboard(hass, "/tmp/my_dash.yaml"))

        assert PANEL_URL_PATH in dashboards

    def test_lovelace_data_is_dict_without_dashboards_key(self, hass):
        """Branch: lovelace_data is a dict but has no 'dashboards' key → logs error."""
        hass.data = {"lovelace": {"other_key": "value"}}
        run(_register_lovelace_dashboard(hass, "/tmp/fake.yaml"))
        # Must reach the "dashboards is None" error branch without raising

    def test_existing_entry_is_removed_before_re_registration(self, hass):
        """Branch: PANEL_URL_PATH already exists in dashboards → it is removed first."""
        old_entry = MagicMock()
        dashboards = {PANEL_URL_PATH: old_entry}
        hass.data = {"lovelace": {"dashboards": dashboards}}

        fake_instance = MagicMock()
        with patch(
            "homeassistant.components.lovelace.dashboard.LovelaceYAML",
            return_value=fake_instance,
        ):
            run(_register_lovelace_dashboard(hass, "/tmp/my_dash.yaml"))

        # Old entry replaced by new one
        assert dashboards[PANEL_URL_PATH] is not old_entry

    def test_lovelace_data_object_with_dashboards_attribute(self, hass):
        """Branch: lovelace_data has a .dashboards attribute (normal object path)."""
        dashboards = {}
        lovelace_obj = MagicMock()
        lovelace_obj.dashboards = dashboards
        hass.data = {"lovelace": lovelace_obj}

        fake_instance = MagicMock()
        with patch(
            "homeassistant.components.lovelace.dashboard.LovelaceYAML",
            return_value=fake_instance,
        ):
            run(_register_lovelace_dashboard(hass, "/tmp/my_dash.yaml"))

        assert PANEL_URL_PATH in dashboards

    def test_register_raises_is_caught(self, hass):
        """Branch: LovelaceYAML() raises an exception → caught and logged."""
        dashboards = {}
        hass.data = {"lovelace": {"dashboards": dashboards}}

        with patch(
            "homeassistant.components.lovelace.dashboard.LovelaceYAML",
            side_effect=RuntimeError("boom"),
        ):
            # Must not propagate – the outer try/except in _register_lovelace_dashboard
            run(_register_lovelace_dashboard(hass, "/tmp/my_dash.yaml"))


# ══════════════════════════════════════════════════════════════════════════════
# write_dashboard_yaml
# ══════════════════════════════════════════════════════════════════════════════

class TestWriteDashboardYaml:

    def test_happy_path_creates_file(self, hass, tmp_path):
        """File is written successfully with at least the header card."""
        # Entries registry is already empty in hass fixture
        run(write_dashboard_yaml(hass, "cronostar_test.yaml"))

        written = tmp_path / "cronostar_test.yaml"
        assert written.exists()
        content = written.read_text()
        assert "CronoStar" in content

    def test_with_real_controller_entry(self, hass, tmp_path):
        """A real controller entry produces a cronostar-card in the output."""
        from tests.conftest import MockConfigEntry
        entry = MockConfigEntry(
            domain="cronostar",
            title="Living Room",
            data={
                "component_installed": False,
                "preset_type": "thermostat",
                "global_prefix": "cronostar_thermostat_living_",
                "target_entity": "climate.living",
                "title": "Living Room",
            }
        )
        entry.add_to_hass(hass)

        run(write_dashboard_yaml(hass, "cronostar_test.yaml"))

        written = tmp_path / "cronostar_test.yaml"
        content = written.read_text()
        assert "cronostar-card" in content
        assert "Living Room" in content

    def test_file_write_error_is_caught(self, hass, tmp_path):
        """Branch: the file write raises → exception is caught, no re-raise."""
        # Entries registry empty

        # Make async_add_executor_job raise instead of running _write
        async def _failing_exec(func, *args):
            raise OSError("disk full")

        hass.async_add_executor_job = _failing_exec

        # Must not propagate
        run(write_dashboard_yaml(hass, "cronostar_test.yaml"))

    def test_entry_with_none_optional_fields_excluded(self, hass, tmp_path):
        """Optional fields that are None must not appear in the card dict."""
        import json

        entry = MagicMock()
        entry.data = {
            "component_installed": False,
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_test_",
            "target_entity": "climate.test",
            "title": "Test",
            "min_value": None,
            "max_value": None,
        }
        entry.title = "Test"
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        run(write_dashboard_yaml(hass, "cronostar_test.yaml"))

        written = tmp_path / "cronostar_test.yaml"
        card_data = json.loads(written.read_text())
        cards = card_data["views"][0]["cards"][0]["cards"]
        controller_card = cards[1]  # index 0 = markdown header, 1 = first controller
        # None fields must not be present
        assert "min_value" not in controller_card
        assert "max_value" not in controller_card


# ══════════════════════════════════════════════════════════════════════════════
# _purge_old_storage_files  (exercised through setup_dashboard)
# ══════════════════════════════════════════════════════════════════════════════

class TestPurgeOldStorageFiles:

    def test_purge_removes_matching_files(self, hass, tmp_path):
        """Lovelace storage files matching the glob are deleted."""
        storage_dir = tmp_path / ".storage"
        storage_dir.mkdir()
        stale = storage_dir / "lovelace.cronostar_old"
        stale.write_text("{}")

        hass.config_entries.async_entries = MagicMock(return_value=[])
        hass.data = {}

        with (
            patch("homeassistant.components.frontend.async_register_built_in_panel"),
            patch("homeassistant.components.frontend.async_remove_panel"),
        ):
            run(setup_dashboard(hass))

        assert not stale.exists()

    def test_purge_os_remove_error_is_caught(self, hass, tmp_path):
        """Branch: os.remove raises during purge → error is logged, no crash."""
        storage_dir = tmp_path / ".storage"
        storage_dir.mkdir()
        stale = storage_dir / "lovelace.cronostar_bad"
        stale.write_text("{}")

        hass.config_entries.async_entries = MagicMock(return_value=[])
        hass.data = {}

        original_remove = os.remove

        def _bad_remove(path):
            if "lovelace.cronostar" in str(path):
                raise PermissionError("no permission")
            return original_remove(path)

        with (
            patch("os.remove", side_effect=_bad_remove),
            patch("homeassistant.components.frontend.async_register_built_in_panel"),
            patch("homeassistant.components.frontend.async_remove_panel"),
        ):
            run(setup_dashboard(hass))

        # File still exists (remove failed) but no exception escaped
        assert stale.exists()


# ══════════════════════════════════════════════════════════════════════════════
# setup_dashboard – top-level integration
# ══════════════════════════════════════════════════════════════════════════════

class TestSetupDashboard:

    def test_async_remove_panel_exception_is_swallowed(self, hass, tmp_path):
        """Branch: async_remove_panel raises → silently continued."""
        hass.config_entries.async_entries = MagicMock(return_value=[])
        hass.data = {}

        with (
            patch(
                "custom_components.cronostar.setup.dashboard.async_remove_panel",
                side_effect=Exception("not registered"),
            ),
            patch("homeassistant.components.frontend.async_register_built_in_panel"),
        ):
            run(setup_dashboard(hass))  # must not raise

    def test_critical_failure_is_caught(self, hass, tmp_path):
        """Branch: write_dashboard_yaml raises unexpectedly → logged, no crash."""
        hass.config_entries.async_entries = MagicMock(return_value=[])
        hass.data = {}

        with (
            patch(
                "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
                new=AsyncMock(side_effect=RuntimeError("disk gone")),
            ),
            patch("homeassistant.components.frontend.async_remove_panel"),
            patch("homeassistant.components.frontend.async_register_built_in_panel"),
        ):
            run(setup_dashboard(hass))  # must not raise

    def test_full_happy_path(self, hass, tmp_path):
        """Full successful run: panel registered and lovelace backend updated."""
        dashboards: dict = {}
        lovelace_obj = MagicMock()
        lovelace_obj.dashboards = dashboards
        hass.data = {"lovelace": lovelace_obj}
        hass.config_entries.async_entries = MagicMock(return_value=[])

        fake_yaml_instance = MagicMock()
        with (
            patch("homeassistant.components.frontend.async_remove_panel"),
            patch("homeassistant.components.frontend.async_register_built_in_panel"),
            patch(
                "homeassistant.components.lovelace.dashboard.LovelaceYAML",
                return_value=fake_yaml_instance,
            ),
        ):
            run(setup_dashboard(hass))

        assert PANEL_URL_PATH in dashboards
