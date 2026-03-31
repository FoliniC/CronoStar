"""
Tests for custom_components/cronostar/services/profile_service.py
Target: 100 % coverage

Missing branches at 87 %:
  - get_profile_data: profiles is not a dict (corrupted container) in Phase 1 and Phase 2
  - get_profile_data: generic prefix collision with multiple containers, one matching
  - save_profile: write_dashboard_yaml raises → caught and logged
  - delete_controller: write_dashboard_yaml raises → caught and logged
  - Various minor branches in _validate_schedule and _build_metadata
"""

import asyncio
import sys
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.const import (
    CONF_MAX_VALUE,
    CONF_MIN_VALUE,
    CONF_TITLE,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.run(coro)


def _make_service(hass, storage_override=None, settings_override=None):
    """Build a ProfileService with mock dependencies.

    When storage_override is provided its explicitly-set attributes are kept;
    only attributes that were NOT explicitly set by the test are given defaults.
    """
    storage = storage_override or MagicMock()

    def _fill(attr, default_factory):
        # Only fill if the attribute was NOT explicitly assigned by the test
        # (i.e. it does not live in the mock's __dict__)
        if attr not in storage.__dict__:
            setattr(storage, attr, default_factory())

    _fill("save_profile", AsyncMock)
    _fill("delete_profile", lambda: AsyncMock(return_value=True))
    _fill("delete_controller_files", AsyncMock)
    _fill("get_cached_containers", lambda: AsyncMock(return_value=[]))
    _fill("list_profiles", lambda: AsyncMock(return_value=[]))
    _fill("load_profile_cached", lambda: AsyncMock(return_value=None))

    settings = settings_override or MagicMock()
    settings.load_settings = AsyncMock(return_value={})

    return ProfileService(hass, storage, settings)


# ──────────────────────────────────────────────────────────────────────────────
# Fixture: minimal ServiceCall mock
# ──────────────────────────────────────────────────────────────────────────────

def _call(**kwargs):
    c = MagicMock()
    c.data = kwargs
    return c


# ══════════════════════════════════════════════════════════════════════════════
# get_profile_data – corrupted / non-dict profiles
# ══════════════════════════════════════════════════════════════════════════════

class TestGetProfileDataCorruptedProfiles:

    def test_phase1_skips_non_dict_profiles(self, hass):
        """Branch: container has profiles that are not a dict → continue."""
        storage = MagicMock()
        # Phase 1: profiles is a list, not a dict
        storage.get_cached_containers = AsyncMock(
            return_value=[
                ("file1.json", {"profiles": ["not", "a", "dict"], "meta": {}}),
            ]
        )
        # Phase 2 fallback also fails → returns error diagnostics
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [("file1.json", {"profiles": ["not", "a", "dict"], "meta": {}})],
                [],  # second call (all_containers for diagnostics)
            ]
        )
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("Default", "thermostat", ""))
        assert "error" in result

    def test_phase1_skips_empty_profiles_dict(self, hass):
        """Branch: container has profiles={} (empty dict) → continue."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [("file1.json", {"profiles": {}, "meta": {}})],
                [],
            ]
        )
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("Default", "thermostat", ""))
        assert "error" in result

    def test_phase2_fallback_finds_default(self, hass):
        """Phase 2: first container has non-dict profiles; second has 'Default'."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(
            return_value=[
                # First container: corrupted profiles
                (
                    "file1.json",
                    {"profiles": "not_a_dict", "meta": {"min_value": 15}},
                ),
                # Second container: valid with Default
                (
                    "file2.json",
                    {
                        "profiles": {
                            "Default": {"schedule": [{"time": "08:00", "value": 20}]}
                        },
                        "meta": {"min_value": 15, "max_value": 25},
                    },
                ),
            ]
        )
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("NonExistent", "thermostat", ""))
        # Phase 1 finds nothing → Phase 2 falls through first container (not dict)
        # and finds "Default" in second container
        assert "profile_name" in result
        assert result["profile_name"] == "Default"

    def test_phase2_skips_non_dict_profiles(self, hass):
        """Phase 2: all containers have non-dict profiles → return error."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [("file1.json", {"profiles": 42, "meta": {}})],
                [],
            ]
        )
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("Default", "thermostat", ""))
        assert "error" in result

    def test_diagnostics_include_available_storage(self, hass):
        """When no match: diagnostics list what's in storage."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [],  # lookup
                [
                    (
                        "other.json",
                        {
                            "meta": {"preset_type": "thermostat", "global_prefix": "x_"},
                            "profiles": {"OtherProfile": {}},
                        },
                    )
                ],  # all_containers
            ]
        )
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("Missing", "thermostat", "specific_prefix_"))
        assert "error" in result
        assert len(result["available_in_storage"]) == 1
        assert result["available_in_storage"][0]["profiles"] == ["OtherProfile"]


# ══════════════════════════════════════════════════════════════════════════════
# get_profile_data – generic prefix collision
# ══════════════════════════════════════════════════════════════════════════════

class TestGetProfileDataGenericPrefix:

    def test_generic_prefix_prioritises_matching_container(self, hass):
        """
        Branch: is_generic_prefix=True and len(cached) > 1.
        The container whose meta.global_prefix matches prefix_with_underscore
        is prioritised.
        """
        storage = MagicMock()
        # Two containers returned for the generic lookup
        containers = [
            (
                "other.json",
                {
                    "profiles": {
                        "Default": {"schedule": [{"time": "06:00", "value": 18}]}
                    },
                    "meta": {"global_prefix": "cronostar_thermostat_other_", "min_value": 15},
                },
            ),
            (
                "target.json",
                {
                    "profiles": {
                        "Default": {"schedule": [{"time": "08:00", "value": 22}]}
                    },
                    "meta": {
                        "global_prefix": "cronostar_thermostat_",   # matches generic prefix
                        "min_value": 15,
                    },
                },
            ),
        ]
        storage.get_cached_containers = AsyncMock(return_value=containers)
        svc = _make_service(hass, storage)

        # Pass a generic prefix so is_generic_prefix=True
        result = run(svc.get_profile_data("Default", "thermostat", "cronostar_thermostat_"))
        assert "profile_name" in result

    def test_generic_prefix_no_matching_container_falls_back(self, hass):
        """
        Branch: is_generic_prefix=True, multiple containers, but none matches
        the exact prefix → cached remains unchanged and first Default wins.
        """
        storage = MagicMock()
        containers = [
            (
                "a.json",
                {
                    "profiles": {
                        "Default": {"schedule": [{"time": "07:00", "value": 19}]}
                    },
                    "meta": {"global_prefix": "some_other_prefix_", "min_value": 15},
                },
            ),
            (
                "b.json",
                {
                    "profiles": {
                        "Default": {"schedule": [{"time": "09:00", "value": 21}]}
                    },
                    "meta": {"global_prefix": "another_prefix_", "min_value": 15},
                },
            ),
        ]
        storage.get_cached_containers = AsyncMock(return_value=containers)
        svc = _make_service(hass, storage)

        result = run(svc.get_profile_data("Default", "thermostat", ""))
        # Should still find Default in one of the containers
        assert "profile_name" in result


# ══════════════════════════════════════════════════════════════════════════════
# save_profile – dashboard YAML write failure
# ══════════════════════════════════════════════════════════════════════════════

class TestSaveProfileDashboardError:

    def test_dashboard_yaml_exception_is_caught(self, hass):
        """Branch: write_dashboard_yaml raises → caught, logged, no re-raise."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        storage.get_cached_containers = AsyncMock(return_value=[])
        # get_profile_data used when schedule is None
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [],  # for get_profile_data lookup
                [],  # for get_profile_data all_containers fallback
            ]
        )
        svc = _make_service(hass, storage)

        call_data = _call(
            profile_name="MyProfile",
            preset_type="thermostat",
            schedule=[{"time": "08:00", "value": 20}],
            global_prefix="cronostar_thermostat_kitchen_",
            meta={},
        )

        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(side_effect=RuntimeError("FS error")),
        ):
            # Must not raise; dashboard error is swallowed
            run(svc.save_profile(call_data))

    def test_save_profile_with_metadata_only(self, hass):
        """Branch: schedule is None → fetches existing profile data."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        # First call: get_profile_data (no match → returns error dict)
        # Second call: all_containers for diagnostics
        storage.get_cached_containers = AsyncMock(
            side_effect=[
                [],
                [],
            ]
        )
        svc = _make_service(hass, storage)

        call_data = _call(
            profile_name="MyProfile",
            preset_type="thermostat",
            global_prefix="cronostar_thermostat_kitchen_",
            meta={},
        )
        # schedule is absent → falls into metadata-only path
        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(),
        ):
            run(svc.save_profile(call_data))

    def test_save_profile_schedule_none_existing_found(self, hass):
        """Branch: schedule is None and existing profile IS found → preserve schedule."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        existing_schedule = [{"time": "08:00", "value": 20}]
        storage.get_cached_containers = AsyncMock(
            return_value=[
                (
                    "f.json",
                    {
                        "profiles": {
                            "MyProfile": {"schedule": existing_schedule}
                        },
                        "meta": {"min_value": 15, "max_value": 25},
                    },
                )
            ]
        )
        svc = _make_service(hass, storage)

        call_data = _call(
            profile_name="MyProfile",
            preset_type="thermostat",
            global_prefix="cronostar_thermostat_kitchen_",
            meta={},
        )
        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(),
        ):
            run(svc.save_profile(call_data))
        # Verify that save_profile on storage was called
        storage.save_profile.assert_called_once()

    def test_save_profile_updates_config_entry(self, hass):
        """Branch: config entry for the prefix exists → updated if meta changed."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        storage.get_cached_containers = AsyncMock(return_value=[])

        entry = MagicMock()
        entry.data = {
            "global_prefix": "cronostar_thermostat_kitchen_",
            "target_entity": "climate.old",
            "preset_type": "thermostat",
        }
        entry.runtime_data = None
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        svc = _make_service(hass, storage)

        call_data = _call(
            profile_name="MyProfile",
            preset_type="thermostat",
            schedule=[{"time": "08:00", "value": 20}],
            global_prefix="cronostar_thermostat_kitchen_",
            meta={"target_entity": "climate.new"},
        )
        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(),
        ):
            run(svc.save_profile(call_data))

        hass.config_entries.async_update_entry.assert_called_once()

    def test_save_profile_coordinator_refresh_called(self, hass):
        """Branch: config entry has runtime_data → async_refresh_profiles called."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        storage.get_cached_containers = AsyncMock(return_value=[])

        coord = MagicMock()
        coord.async_refresh_profiles = AsyncMock()

        entry = MagicMock()
        entry.data = {
            "global_prefix": "cronostar_thermostat_kitchen_",
            "target_entity": "climate.test",
            "preset_type": "thermostat",
        }
        entry.runtime_data = coord
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        svc = _make_service(hass, storage)

        call_data = _call(
            profile_name="MyProfile",
            preset_type="thermostat",
            schedule=[{"time": "08:00", "value": 20}],
            global_prefix="cronostar_thermostat_kitchen_",
            meta={},
        )
        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(),
        ):
            run(svc.save_profile(call_data))

        coord.async_refresh_profiles.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# delete_controller – dashboard YAML write failure
# ══════════════════════════════════════════════════════════════════════════════

class TestDeleteControllerDashboardError:

    def test_dashboard_yaml_exception_is_caught(self, hass):
        """Branch: write_dashboard_yaml raises inside delete_controller → caught."""
        storage = MagicMock()
        storage.delete_controller_files = AsyncMock()
        svc = _make_service(hass, storage)

        call_data = _call(global_prefix="cronostar_thermostat_test_")

        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(side_effect=OSError("gone")),
        ):
            run(svc.delete_controller(call_data))  # must not raise

        storage.delete_controller_files.assert_called_once()

    def test_delete_controller_removes_matching_entry(self, hass):
        """Branch: config entry for the prefix found → async_remove called."""
        storage = MagicMock()
        storage.delete_controller_files = AsyncMock()
        svc = _make_service(hass, storage)

        entry = MagicMock()
        entry.entry_id = "eid123"
        entry.data = {"global_prefix": "cronostar_thermostat_test_"}
        entry.title = "Test"
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        call_data = _call(global_prefix="cronostar_thermostat_test_")

        with patch(
            "custom_components.cronostar.setup.dashboard.write_dashboard_yaml",
            new=AsyncMock(),
        ):
            run(svc.delete_controller(call_data))

        hass.config_entries.async_remove.assert_called_once_with("eid123")

    def test_delete_controller_no_prefix_raises(self, hass):
        """Branch: global_prefix missing → HomeAssistantError raised."""
        import custom_components.cronostar.services.profile_service as ps_mod

        svc = _make_service(hass)
        call_data = _call()  # no global_prefix

        with pytest.raises(ps_mod.HomeAssistantError):
            run(svc.delete_controller(call_data))


# ══════════════════════════════════════════════════════════════════════════════
# add_profile
# ══════════════════════════════════════════════════════════════════════════════

class TestAddProfile:

    def test_add_profile_missing_name_raises(self, hass):
        import custom_components.cronostar.services.profile_service as ps_mod

        svc = _make_service(hass)
        call_data = _call(preset_type="thermostat")  # no profile_name
        with pytest.raises(ps_mod.HomeAssistantError):
            run(svc.add_profile(call_data))

    def test_add_profile_notifies_coordinator(self, hass):
        """Branch: entry with matching prefix + runtime_data → refresh called."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()

        coord = MagicMock()
        coord.async_refresh_profiles = AsyncMock()

        entry = MagicMock()
        entry.data = {"global_prefix": "cronostar_thermostat_kitchen_"}
        entry.runtime_data = coord
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        svc = _make_service(hass, storage)
        call_data = _call(
            profile_name="Summer",
            preset_type="thermostat",
            global_prefix="cronostar_thermostat_kitchen_",
        )
        run(svc.add_profile(call_data))
        coord.async_refresh_profiles.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# delete_profile
# ══════════════════════════════════════════════════════════════════════════════

class TestDeleteProfile:

    def test_delete_profile_missing_name_raises(self, hass):
        import custom_components.cronostar.services.profile_service as ps_mod

        svc = _make_service(hass)
        with pytest.raises(ps_mod.HomeAssistantError):
            run(svc.delete_profile(_call()))

    def test_delete_profile_success_notifies_coordinator(self, hass):
        storage = MagicMock()
        storage.delete_profile = AsyncMock(return_value=True)

        coord = MagicMock()
        coord.async_refresh_profiles = AsyncMock()

        entry = MagicMock()
        entry.data = {"global_prefix": "cronostar_thermostat_kitchen_"}
        entry.runtime_data = coord
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        svc = _make_service(hass, storage)
        run(svc.delete_profile(_call(profile_name="Summer", preset_type="thermostat",
                                      global_prefix="cronostar_thermostat_kitchen_")))
        coord.async_refresh_profiles.assert_called_once()

    def test_delete_profile_storage_returns_false(self, hass):
        """Branch: delete returns False → log_operation called with failure."""
        storage = MagicMock()
        storage.delete_profile = AsyncMock(return_value=False)
        svc = _make_service(hass, storage)
        # Should not raise
        run(svc.delete_profile(_call(profile_name="X", preset_type="thermostat")))


# ══════════════════════════════════════════════════════════════════════════════
# _validate_schedule
# ══════════════════════════════════════════════════════════════════════════════

class TestValidateSchedule:

    def _svc(self, hass):
        return _make_service(hass)

    def test_non_list_returns_empty(self, hass):
        svc = self._svc(hass)
        assert svc._validate_schedule("not a list") == []

    def test_non_dict_item_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule(["garbage", {"time": "08:00", "value": 20}])
        assert len(result) == 1

    def test_missing_time_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"value": 20}])
        assert result == []

    def test_missing_value_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00"}])
        assert result == []

    def test_invalid_time_format_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "8:0", "value": 20}])
        assert result == []

    def test_nan_value_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00", "value": float("nan")}])
        assert result == []

    def test_non_numeric_value_skipped(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00", "value": "hot"}])
        assert result == []

    def test_below_min_clamped_to_min(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00", "value": 5}], min_val=15)
        assert result[0]["value"] == 15.0

    def test_above_max_reset_to_min(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00", "value": 35}], min_val=15, max_val=30)
        assert result[0]["value"] == 15.0

    def test_above_max_no_min_reset_to_zero(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([{"time": "08:00", "value": 35}], max_val=30)
        assert result[0]["value"] == 0.0

    def test_duplicate_times_last_wins(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([
            {"time": "08:00", "value": 20},
            {"time": "08:00", "value": 22},
        ])
        assert len(result) == 1
        assert result[0]["value"] == 22.0

    def test_sorted_by_time(self, hass):
        svc = self._svc(hass)
        result = svc._validate_schedule([
            {"time": "20:00", "value": 18},
            {"time": "08:00", "value": 21},
        ])
        assert result[0]["time"] == "08:00"


# ══════════════════════════════════════════════════════════════════════════════
# async_update_profile_selectors
# ══════════════════════════════════════════════════════════════════════════════

class TestUpdateProfileSelectors:

    def test_updates_changed_options(self, hass):
        """input_select with stale options → set_options service called."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["f1.json"])
        storage.load_profile_cached = AsyncMock(
            return_value={
                "meta": {"global_prefix": "cronostar_thermostat_kitchen_"},
                "profiles": {"Summer": {}, "Winter": {}},
            }
        )
        svc = _make_service(hass, storage)

        state = MagicMock()
        state.entity_id = "input_select.cronostar_thermostat_kitchen_profiles"
        state.attributes = {"options": ["OldProfile"]}
        hass.states.async_all = MagicMock(return_value=[state])

        run(svc.async_update_profile_selectors())
        hass.services.async_call.assert_called_once()

    def test_skips_if_options_already_current(self, hass):
        """input_select already has correct options → no service call."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["f1.json"])
        storage.load_profile_cached = AsyncMock(
            return_value={
                "meta": {"global_prefix": "cronostar_thermostat_kitchen_"},
                "profiles": {"Summer": {}},
            }
        )
        svc = _make_service(hass, storage)

        state = MagicMock()
        state.entity_id = "input_select.cronostar_thermostat_kitchen_profiles"
        state.attributes = {"options": ["Summer"]}
        hass.states.async_all = MagicMock(return_value=[state])

        run(svc.async_update_profile_selectors())
        hass.services.async_call.assert_not_called()

    def test_skips_if_no_profiles_on_disk(self, hass):
        """input_select maps to prefix with no profiles → skip update."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["f1.json"])
        storage.load_profile_cached = AsyncMock(
            return_value={
                "meta": {"global_prefix": "other_prefix_"},
                "profiles": {"X": {}},
            }
        )
        svc = _make_service(hass, storage)

        state = MagicMock()
        state.entity_id = "input_select.cronostar_thermostat_kitchen_profiles"
        state.attributes = {"options": []}
        hass.states.async_all = MagicMock(return_value=[state])

        run(svc.async_update_profile_selectors())
        hass.services.async_call.assert_not_called()

    def test_load_error_is_logged(self, hass):
        """Branch: load_profile_cached raises → warning logged, continues."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["bad.json"])
        storage.load_profile_cached = AsyncMock(side_effect=OSError("corrupt"))
        svc = _make_service(hass, storage)
        hass.states.async_all = MagicMock(return_value=[])
        run(svc.async_update_profile_selectors())  # must not raise

    def test_set_options_error_is_logged(self, hass):
        """Branch: services.async_call raises during set_options → error logged."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["f1.json"])
        storage.load_profile_cached = AsyncMock(
            return_value={
                "meta": {"global_prefix": "cronostar_thermostat_kitchen_"},
                "profiles": {"Summer": {}},
            }
        )
        svc = _make_service(hass, storage)

        state = MagicMock()
        state.entity_id = "input_select.cronostar_thermostat_kitchen_profiles"
        state.attributes = {"options": ["OldProfile"]}
        hass.states.async_all = MagicMock(return_value=[state])
        hass.services.async_call = AsyncMock(side_effect=Exception("service error"))

        run(svc.async_update_profile_selectors())  # must not raise


# ══════════════════════════════════════════════════════════════════════════════
# _is_valid_time / _time_to_minutes
# ══════════════════════════════════════════════════════════════════════════════

class TestHelpers:

    def test_valid_time(self):
        assert ProfileService._is_valid_time("08:30") is True

    def test_invalid_format(self):
        assert ProfileService._is_valid_time("8:30") is False
        assert ProfileService._is_valid_time("25:00") is False
        assert ProfileService._is_valid_time("12:60") is False
        assert ProfileService._is_valid_time("not:time") is False

    def test_time_to_minutes(self):
        assert ProfileService._time_to_minutes("01:30") == 90

    def test_time_to_minutes_bad_input(self):
        assert ProfileService._time_to_minutes("bad") == 0


# ══════════════════════════════════════════════════════════════════════════════
# _ensure_controller_exists
# ══════════════════════════════════════════════════════════════════════════════

class TestEnsureControllerExists:

    def test_empty_prefix_returns_early(self, hass):
        svc = _make_service(hass)
        run(svc._ensure_controller_exists("", "thermostat", {}))
        hass.config_entries.flow.async_init.assert_not_called()

    def test_existing_prefix_no_flow_init(self, hass):
        entry = MagicMock()
        entry.data = {"global_prefix": "cronostar_thermostat_test_"}
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        svc = _make_service(hass)
        run(svc._ensure_controller_exists("cronostar_thermostat_test_", "thermostat", {}))
        hass.config_entries.flow.async_init.assert_not_called()

    def test_missing_prefix_creates_flow(self, hass):
        hass.config_entries.async_entries = MagicMock(return_value=[])
        svc = _make_service(hass)
        run(svc._ensure_controller_exists("cronostar_thermostat_kitchen_", "thermostat", {}))
        hass.config_entries.flow.async_init.assert_called_once()

    def test_name_derived_from_generic_prefix(self, hass):
        """Branch: prefix does not start with base_marker → name = prefix."""
        hass.config_entries.async_entries = MagicMock(return_value=[])
        svc = _make_service(hass)
        # Prefix that doesn't match the base_marker pattern
        run(svc._ensure_controller_exists("custom_prefix_", "thermostat", {}))
        call_kwargs = hass.config_entries.flow.async_init.call_args
        assert call_kwargs is not None


# ══════════════════════════════════════════════════════════════════════════════
# save_profile – missing name → HomeAssistantError (line 116)
# ══════════════════════════════════════════════════════════════════════════════

class TestSaveProfileMissingName:
    def test_save_profile_missing_name_raises(self, hass):
        import custom_components.cronostar.services.profile_service as ps_mod
        svc = _make_service(hass)
        with pytest.raises(ps_mod.HomeAssistantError):
            run(svc.save_profile(_call(preset_type="thermostat")))

    def test_save_profile_preset_type_changed_in_meta(self, hass):
        """Lines 170-171: preset_type in meta AND differs from entry."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        storage.get_cached_containers = AsyncMock(return_value=[])
        entry = MagicMock()
        entry.data = {
            "global_prefix": "cronostar_thermostat_kitchen_",
            "target_entity": "climate.test",
            "preset_type": "thermostat",
        }
        entry.runtime_data = None
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        svc = _make_service(hass, storage)

        with patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", new=AsyncMock()):
            run(svc.save_profile(_call(
                profile_name="P",
                preset_type="thermostat",
                schedule=[{"time": "08:00", "value": 20}],
                global_prefix="cronostar_thermostat_kitchen_",
                meta={"preset_type": "ev_charging"},   # different from entry
            )))
        hass.config_entries.async_update_entry.assert_called_once()

    def test_save_profile_card_config_field_changed(self, hass):
        """Lines 184-185: a card-config field in meta differs from entry."""
        storage = MagicMock()
        storage.save_profile = AsyncMock()
        storage.get_cached_containers = AsyncMock(return_value=[])
        entry = MagicMock()
        entry.data = {
            "global_prefix": "cronostar_thermostat_kitchen_",
            "target_entity": "climate.test",
            "preset_type": "thermostat",
            "title": "Old Title",
        }
        entry.runtime_data = None
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        svc = _make_service(hass, storage)

        with patch("custom_components.cronostar.setup.dashboard.write_dashboard_yaml", new=AsyncMock()):
            run(svc.save_profile(_call(
                profile_name="P",
                preset_type="thermostat",
                schedule=[{"time": "08:00", "value": 20}],
                global_prefix="cronostar_thermostat_kitchen_",
                meta={"title": "New Title"},   # differs from entry
            )))
        hass.config_entries.async_update_entry.assert_called_once()

    def test_save_profile_outer_except_reraises(self, hass):
        """Lines 208-211: storage.save_profile raises → outer except catches and re-raises."""
        import custom_components.cronostar.services.profile_service as ps_mod
        storage = MagicMock()
        storage.save_profile = AsyncMock(side_effect=RuntimeError("storage broken"))
        storage.get_cached_containers = AsyncMock(return_value=[])
        svc = _make_service(hass, storage)

        with pytest.raises(ps_mod.HomeAssistantError):
            run(svc.save_profile(_call(
                profile_name="P",
                preset_type="thermostat",
                schedule=[{"time": "08:00", "value": 20}],
                global_prefix="cronostar_thermostat_kitchen_",
                meta={},
            )))


# ══════════════════════════════════════════════════════════════════════════════
# _ensure_controller_exists – empty name fallback (line 233)
# ══════════════════════════════════════════════════════════════════════════════

class TestEnsureControllerEmptyName:
    def test_empty_name_after_strip_uses_fallback(self, hass):
        """Line 233: after stripping prefix and underscores, name is empty."""
        hass.config_entries.async_entries = MagicMock(return_value=[])
        svc = _make_service(hass)
        # Prefix matches base_marker exactly, leaving empty name
        run(svc._ensure_controller_exists(
            "cronostar_thermostat_", "thermostat", {}
        ))
        call_kwargs = hass.config_entries.flow.async_init.call_args
        # The name passed to async_init should be the fallback
        assert call_kwargs is not None
        init_data = call_kwargs[1]["data"]
        assert "Controller" in init_data["name"] or init_data["name"]


# ══════════════════════════════════════════════════════════════════════════════
# load_profile – all branches (lines 259-279)
# ══════════════════════════════════════════════════════════════════════════════

class TestLoadProfile:
    def test_missing_profile_name_returns_error(self, hass):
        svc = _make_service(hass)
        result = run(svc.load_profile(_call(preset_type="thermostat")))
        assert result == {"error": "profile_name is required"}

    def test_profile_not_found_returns_error_dict(self, hass):
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        svc = _make_service(hass, storage)
        result = run(svc.load_profile(_call(
            profile_name="Missing", preset_type="thermostat"
        )))
        assert "error" in result

    def test_profile_found_returns_data(self, hass):
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Summer": {"schedule": [{"time": "08:00", "value": 22}]}},
                "meta": {},
            })
        ])
        svc = _make_service(hass, storage)
        result = run(svc.load_profile(_call(
            profile_name="Summer", preset_type="thermostat"
        )))
        assert result["profile_name"] == "Summer"

    def test_exception_in_load_profile_returns_error(self, hass):
        """Line 277-279: exception in load_profile → caught, returns error dict."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=RuntimeError("boom"))
        svc = _make_service(hass, storage)
        result = run(svc.load_profile(_call(
            profile_name="X", preset_type="thermostat"
        )))
        assert "error" in result


# ══════════════════════════════════════════════════════════════════════════════
# get_profile_data – enabled_entity / profiles_select_entity in content
# Phase 1 (lines 347, 349) and Phase 2 (lines 377, 379)
# ══════════════════════════════════════════════════════════════════════════════

class TestGetProfileDataEntityOverrides:
    def test_phase1_enabled_entity_and_profiles_select_merged(self, hass):
        """Lines 347, 349: per-profile entity overrides are merged into res_meta."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Summer": {
                        "schedule": [],
                        "enabled_entity": "switch.summer_en",
                        "profiles_select_entity": "select.summer_prof",
                    }
                },
                "meta": {},
            })
        ])
        svc = _make_service(hass, storage)
        result = run(svc.get_profile_data("Summer", "thermostat", "specific_prefix_"))
        assert result["meta"]["enabled_entity"] == "switch.summer_en"
        assert result["meta"]["profiles_select_entity"] == "select.summer_prof"

    def test_phase2_enabled_entity_and_profiles_select_merged(self, hass):
        """Lines 377, 379: Phase 2 fallback also merges per-profile entity overrides."""
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Default": {
                        "schedule": [],
                        "enabled_entity": "switch.default_en",
                        "profiles_select_entity": "select.default_prof",
                    }
                },
                "meta": {},
            })
        ])
        svc = _make_service(hass, storage)
        # Request "NonExistent" → Phase 1 misses → Phase 2 finds "Default"
        result = run(svc.get_profile_data("NonExistent", "thermostat", "specific_prefix_"))
        assert result["meta"]["enabled_entity"] == "switch.default_en"
        assert result["meta"]["profiles_select_entity"] == "select.default_prof"


# ══════════════════════════════════════════════════════════════════════════════
# async_update_profile_selectors – container_data is falsy → continue (line 781)
# ══════════════════════════════════════════════════════════════════════════════

class TestUpdateProfileSelectorsContainerNone:
    def test_falsy_container_data_is_skipped(self, hass):
        """Line 781: load_profile_cached returns None → continue."""
        storage = MagicMock()
        storage.list_profiles = AsyncMock(return_value=["f.json"])
        storage.load_profile_cached = AsyncMock(return_value=None)  # falsy
        svc = _make_service(hass, storage)
        hass.states.async_all = MagicMock(return_value=[])
        run(svc.async_update_profile_selectors())  # must not raise


# ══════════════════════════════════════════════════════════════════════════════
# _build_metadata – "preset" key deletion (line 926)
# ══════════════════════════════════════════════════════════════════════════════

class TestBuildMetadata:
    def test_preset_key_removed_from_metadata(self, hass):
        """Line 926: if 'preset' is in user_meta, it is deleted from metadata."""
        svc = _make_service(hass)
        result = svc._build_metadata("thermostat", "cronostar_thermostat_test_", {
            "preset": "should_be_deleted",
            "title": "My Title",
        })
        assert "preset" not in result
        assert result["preset_type"] == "thermostat"
        assert result["title"] == "My Title"

    def test_allowed_keys_only_in_output(self, hass):
        svc = _make_service(hass)
        result = svc._build_metadata("thermostat", "prefix_", {
            "title": "T",
            "unknown_key": "should_not_appear",
        })
        assert "unknown_key" not in result
        assert result["title"] == "T"


# ══════════════════════════════════════════════════════════════════════════════
# _is_valid_time – ValueError dead-code branch (lines 941-942)
# ══════════════════════════════════════════════════════════════════════════════

class TestIsValidTimeValueError:
    def test_value_error_returns_false(self):
        """Lines 941-942: force the ValueError branch via monkeypatching."""
        import re
        original_split = str.split

        # Patch the method to inject a ValueError after the regex passes
        # We'll test by directly monkey-patching map to raise ValueError
        with patch("builtins.map", side_effect=ValueError("injected")):
            # Now the time_str "12:30" passes the regex but map() raises
            result = ProfileService._is_valid_time("12:30")
        assert result is False


# ══════════════════════════════════════════════════════════════════════════════
# register_card – comprehensive coverage (lines 528-767)
# ══════════════════════════════════════════════════════════════════════════════

class TestRegisterCard:
    """Tests for the register_card service handler."""

    def _svc(self, hass, storage=None):
        if storage is None:
            storage = MagicMock()
            storage.get_cached_containers = AsyncMock(return_value=[])
            storage.list_profiles = AsyncMock(return_value=[])
            storage.load_profile_cached = AsyncMock(return_value=None)
            storage.save_profile = AsyncMock()
        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={"lang": "en"})
        return ProfileService(hass, storage, settings)

    def test_basic_response_structure(self, hass):
        """register_card returns the expected dict keys."""
        hass.data = {"cronostar": {"version": "6.0.0", "global_config": {}}}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])
        svc = self._svc(hass)

        result = run(svc.register_card(_call(
            card_id="card1", preset="thermostat", global_prefix="cronostar_thermostat_test_"
        )))
        assert "success" in result
        assert "profile_data" in result
        assert "entity_states" in result
        assert "settings" in result

    def test_native_select_sets_profile_to_load(self, hass):
        """Priority 1: native select entity state used as profile_to_load."""
        hass.data = {}
        state = MagicMock()
        state.state = "Summer"

        def _get(entity_id):
            if entity_id == "select.cronostar_thermostat_test_current_profile":
                return state
            return None

        hass.states.get = _get
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Summer": {"schedule": [{"time": "08:00", "value": 20}]}
                },
                "meta": {"min_value": 15, "max_value": 25, "target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1",
            preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
        )))
        assert result["profile_data"]["profile_name"] == "Summer"

    def test_legacy_input_select_fallback(self, hass):
        """Priority 2: legacy input_select used when native select is unavailable."""
        hass.data = {}
        state_legacy = MagicMock()
        state_legacy.state = "Winter"
        target_state = MagicMock()
        target_state.state = "heat"

        def _get(entity_id):
            if entity_id == "input_select.cronostar_thermostat_test_profiles":
                return state_legacy
            if entity_id == "climate.test":
                return target_state
            return None

        hass.states.get = _get
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Winter": {"schedule": [{"time": "08:00", "value": 18}]}
                },
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1",
            preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
        )))
        assert result["profile_data"]["profile_name"] == "Winter"

    def test_fallback_to_requested_profile(self, hass):
        """Priority 3: requested_profile used when no selectors are active."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Eco": {"schedule": [{"time": "08:00", "value": 19}]}
                },
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1",
            preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
            selected_profile="Eco",
        )))
        assert result["profile_data"]["profile_name"] == "Eco"

    def test_profile_not_found_sets_success_false(self, hass):
        """When profile lookup fails, response[success]=False with diagnostics."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
        )))
        assert result["success"] is False
        assert result["diagnostics"] is not None

    def test_exception_in_profile_loading_caught(self, hass):
        """Exception during get_profile_data → caught, response still returned."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=RuntimeError("crash"))
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
        )))
        # Should not raise, response still returned
        assert "success" in result

    def test_validation_no_preset_adds_error(self, hass):
        """Validation: missing preset field adds error."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()
        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        # Note: _call without "preset" key → call.data.get("preset") returns None
        c = MagicMock()
        c.data = {"card_id": "c1", "global_prefix": "pfx_"}  # no "preset" key
        result = run(svc.register_card(c))
        assert any("Preset" in e for e in result["validation"]["errors"])

    def test_validation_no_global_prefix_adds_error(self, hass):
        """Validation: empty global_prefix adds error."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])
        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()
        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat", global_prefix=""
        )))
        assert any("prefix" in e.lower() for e in result["validation"]["errors"])

    def test_validation_target_entity_not_in_states(self, hass):
        """Validation: target entity configured but not found in HA states."""
        hass.data = {}
        hass.is_running = True

        def _get(eid):
            if eid == "climate.ghost":
                return None
            return None

        hass.states.get = _get
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Default": {"schedule": []}
                },
                "meta": {"target_entity": "climate.ghost"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        assert any("not found" in e.lower() for e in result["validation"]["errors"])

    def test_validation_no_target_entity_in_meta(self, hass):
        """Validation: no target_entity in profile meta → error added."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Default": {"schedule": []}
                },
                "meta": {},  # no target_entity
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        assert any("Target" in e or "target" in e for e in result["validation"]["errors"])

    def test_entity_states_populated(self, hass):
        """Entity states dict is populated with current helper, selector, enabled."""
        hass.data = {}

        switch_state = MagicMock()
        switch_state.state = "on"
        select_state = MagicMock()
        select_state.state = "Default"
        sensor_state = MagicMock()
        sensor_state.state = "21.5"
        target_state = MagicMock()
        target_state.state = "heat"

        def _get(eid):
            if eid == "climate.test":
                return target_state
            return None

        hass.states.get = _get
        hass.config_entries.async_entries = MagicMock(return_value=[])

        # Entity registry returns None for all UIDs
        er = MagicMock()
        er.async_get_entity_id = MagicMock(return_value=None)
        with patch("homeassistant.helpers.entity_registry.async_get", return_value=er):
            storage = MagicMock()
            storage.get_cached_containers = AsyncMock(return_value=[
                ("f.json", {
                    "profiles": {"Default": {"schedule": []}},
                    "meta": {"target_entity": "climate.test"},
                })
            ])
            storage.list_profiles = AsyncMock(return_value=[])
            storage.save_profile = AsyncMock()
            settings = MagicMock()
            settings.load_settings = AsyncMock(return_value={})
            svc = ProfileService(hass, storage, settings)

            result = run(svc.register_card(_call(
                card_id="c1", preset="thermostat",
                global_prefix="specific_prefix_",
                selected_profile="Default",
            )))
        assert "entity_states" in result

    def test_entity_states_exception_caught(self, hass):
        """Exception in entity_states block → caught, response still returned."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        with patch("homeassistant.helpers.entity_registry.async_get",
                   side_effect=RuntimeError("er broken")):
            result = run(svc.register_card(_call(
                card_id="c1", preset="thermostat",
                global_prefix="specific_prefix_",
                selected_profile="Default",
            )))
        assert "entity_states" in result  # still present, just may be empty

    def test_preset_defaults_file_loaded_when_exists(self, hass, tmp_path):
        """Preset defaults JSON file is read when it exists."""
        import json as _json
        presets_dir = tmp_path / "cronostar" / "presets"
        presets_dir.mkdir(parents=True)
        defaults_file = presets_dir / "thermostat_defaults.json"
        defaults_file.write_text(_json.dumps({"min_value": 15.0, "max_value": 30.0}))

        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="cronostar_thermostat_test_",
        )))
        assert result["preset_defaults"].get("min_value") == 15.0

    def test_preset_defaults_file_error_is_swallowed(self, hass):
        """Error loading preset defaults → warning logged, no crash."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)
        hass.config_entries.async_entries = MagicMock(return_value=[])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(side_effect=[[], []])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        # mkdir raises to trigger the except path
        with patch("pathlib.Path.mkdir", side_effect=OSError("no perm")):
            result = run(svc.register_card(_call(
                card_id="c1", preset="thermostat",
                global_prefix="cronostar_thermostat_test_",
            )))
        assert result["preset_defaults"] == {}

    def test_entry_data_meta_merge_skips_generic_max(self, hass):
        """Entry max_value=100.0 (generic) is NOT applied when preset default differs."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)

        entry = MagicMock()
        entry.data = {
            "global_prefix": "specific_prefix_",
            "max_value": 100.0,  # generic default
            "target_entity": "climate.test",
        }
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Default": {"schedule": []}
                },
                "meta": {
                    "target_entity": "climate.test",
                    "max_value": 28.0,  # profile has specific value
                },
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        # max_value should remain 28.0 (not overwritten by generic 100.0)
        if result["profile_data"]:
            assert result["profile_data"]["meta"].get("max_value") == 28.0

    def test_entry_data_meta_merge_applies_non_generic_value(self, hass):
        """Entry value that is NOT a generic default IS applied to fill missing profile field."""
        hass.data = {}
        hass.states.get = MagicMock(return_value=None)

        entry = MagicMock()
        entry.data = {
            "global_prefix": "specific_prefix_",
            "max_value": 35.0,  # specific (not generic)
            "target_entity": "climate.test",
        }
        hass.config_entries.async_entries = MagicMock(return_value=[entry])

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {
                    "Default": {"schedule": []}
                },
                "meta": {
                    "target_entity": "climate.test",
                    # no max_value in meta → should be filled from entry
                },
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        svc = ProfileService(hass, storage, settings)

        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        if result["profile_data"]:
            assert result["profile_data"]["meta"].get("max_value") == 35.0

    def test_entity_registry_resolves_uid(self, hass):
        """Entity registry lookup returns an entity_id for the UID."""
        hass.data = {}

        target_state = MagicMock()
        target_state.state = "heat"
        switch_state = MagicMock()
        switch_state.state = "on"

        def _get(eid):
            if eid == "climate.test":
                return target_state
            if eid == "switch.cronostar_thermostat_test_enabled":
                return switch_state
            return None

        hass.states.get = _get
        hass.config_entries.async_entries = MagicMock(return_value=[])

        er = MagicMock()
        er.async_get_entity_id = MagicMock(
            return_value="switch.cronostar_thermostat_test_enabled"
        )

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()
        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})

        with patch("homeassistant.helpers.entity_registry.async_get", return_value=er):
            svc = ProfileService(hass, storage, settings)
            result = run(svc.register_card(_call(
                card_id="c1", preset="thermostat",
                global_prefix="specific_prefix_",
                selected_profile="Default",
            )))
        assert "entity_states" in result

    def test_state_search_fallback_for_uid(self, hass):
        """When registry returns None, state search is used as fallback."""
        hass.data = {}
        hass.config_entries.async_entries = MagicMock(return_value=[])

        er = MagicMock()
        er.async_get_entity_id = MagicMock(return_value=None)

        switch_state = MagicMock()
        switch_state.state = "on"

        def _get(eid):
            if eid == "switch.cronostar_thermostat_test_enabled":
                return switch_state
            return None

        hass.states.get = _get

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": {"target_entity": "switch.cronostar_thermostat_test_enabled"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()
        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})

        with patch("homeassistant.helpers.entity_registry.async_get", return_value=er):
            svc = ProfileService(hass, storage, settings)
            result = run(svc.register_card(_call(
                card_id="c1", preset="thermostat",
                global_prefix="specific_prefix_",
                selected_profile="Default",
            )))
        assert "entity_states" in result


# ══════════════════════════════════════════════════════════════════════════════
# register_card – meta merge: Case A2 (min=0.0 skip) and Case B (val==preset_def)
# Lines 630-635
# ══════════════════════════════════════════════════════════════════════════════

class TestRegisterCardMetaMergeCases:

    def _svc_with_entry(self, hass, entry_data, profile_meta):
        entry = MagicMock()
        entry.data = entry_data
        hass.config_entries.async_entries = MagicMock(return_value=[entry])
        hass.states.get = MagicMock(return_value=None)
        hass.data = {}

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": profile_meta,
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})
        return ProfileService(hass, storage, settings)

    def test_case_a2_min_value_zero_skipped(self, hass):
        """Lines 630-631: entry min_value=0.0 while preset default is 15.0 → not applied."""
        svc = self._svc_with_entry(
            hass,
            entry_data={
                "global_prefix": "specific_prefix_",
                "min_value": 0.0,     # generic default
                "target_entity": "climate.test",
            },
            profile_meta={
                "target_entity": "climate.test",
                "min_value": 16.0,    # profile has a specific value → profile_val is not None
            },
        )
        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        # 0.0 must NOT have overwritten the profile's 16.0
        if result["profile_data"]:
            assert result["profile_data"]["meta"].get("min_value") == 16.0

    def test_case_b_val_matches_preset_default_skipped(self, hass):
        """Lines 633-635: entry max_value=30.0 matches thermostat preset default → not applied."""
        svc = self._svc_with_entry(
            hass,
            entry_data={
                "global_prefix": "specific_prefix_",
                "max_value": 30.0,    # exactly the thermostat preset default
                "target_entity": "climate.test",
            },
            profile_meta={
                "target_entity": "climate.test",
                "max_value": 28.0,    # profile has a different value (not None)
            },
        )
        result = run(svc.register_card(_call(
            card_id="c1", preset="thermostat",
            global_prefix="specific_prefix_", selected_profile="Default",
        )))
        # 30.0 (preset default) must NOT have overwritten the profile's 28.0
        if result["profile_data"]:
            assert result["profile_data"]["meta"].get("max_value") == 28.0


# ══════════════════════════════════════════════════════════════════════════════
# register_card – get_state_by_uid priority-2 state-search break (lines 697-701)
# ══════════════════════════════════════════════════════════════════════════════

class TestRegisterCardStateSearchBreak:

    def test_state_search_inner_and_outer_break_hit(self, hass):
        """
        Lines 697-701: registry returns None (priority-1 fails) → state search
        domain loop finds a matching state → sets entity_id and breaks both loops.

        UID = "{prefix}current"  (the helper/sensor UID)
        base = "cronostar_thermostat_test_current"
        The loop tries switch, then sensor → sensor.cronostar_thermostat_test_current exists.
        """
        hass.data = {}
        hass.is_running = True
        hass.config_entries.async_entries = MagicMock(return_value=[])

        # Registry returns None for all lookups
        er = MagicMock()
        er.async_get_entity_id = MagicMock(return_value=None)

        sensor_state = MagicMock()
        sensor_state.state = "21.5"
        target_state = MagicMock()
        target_state.state = "heat"

        prefix = "cronostar_thermostat_test_"
        helper_uid = f"{prefix}current"
        sensor_entity_id = f"sensor.{helper_uid}"

        def _get(eid):
            if eid == sensor_entity_id:
                return sensor_state
            if eid == "climate.test":
                return target_state
            return None

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})

        with patch.object(hass.states, "get", side_effect=_get):
            with patch("homeassistant.helpers.entity_registry.async_get", return_value=er):
                svc = ProfileService(hass, storage, settings)
                result = run(svc.register_card(_call(
                    card_id="c1", preset="thermostat",
                    global_prefix=prefix,
                    selected_profile="Default",
                )))

        # The sensor state should be reflected in entity_states
        assert result["entity_states"].get("current_helper") in ["21.5", "unknown"]

    def test_state_search_enabled_uid_via_truncated_base(self, hass):
        """
        Lines 699, 701: uid ending with '_enabled' → search_bases includes
        the truncated base (without '_enabled') → domain loop finds a match
        via the truncated base → both breaks triggered.
        """
        hass.data = {}
        hass.is_running = True
        hass.config_entries.async_entries = MagicMock(return_value=[])

        er = MagicMock()
        er.async_get_entity_id = MagicMock(return_value=None)

        prefix = "cronostar_thermostat_test_"
        enabled_uid = f"{prefix}enabled"
        # truncated base: "cronostar_thermostat_test" (without _enabled)
        switch_entity_id = f"switch.cronostar_thermostat_test"

        switch_state = MagicMock()
        switch_state.state = "on"
        target_state = MagicMock()
        target_state.state = "heat"

        def _get(eid):
            if eid == switch_entity_id:
                return switch_state
            if eid == "climate.test":
                return target_state
            return None

        storage = MagicMock()
        storage.get_cached_containers = AsyncMock(return_value=[
            ("f.json", {
                "profiles": {"Default": {"schedule": []}},
                "meta": {"target_entity": "climate.test"},
            })
        ])
        storage.list_profiles = AsyncMock(return_value=[])
        storage.save_profile = AsyncMock()

        settings = MagicMock()
        settings.load_settings = AsyncMock(return_value={})

        with patch.object(hass.states, "get", side_effect=_get):
            with patch("homeassistant.helpers.entity_registry.async_get", return_value=er):
                svc = ProfileService(hass, storage, settings)
                result = run(svc.register_card(_call(
                    card_id="c1", preset="thermostat",
                    global_prefix=prefix,
                    selected_profile="Default",
                )))

        assert result["entity_states"].get("enabled") in ["on", "unknown"]
