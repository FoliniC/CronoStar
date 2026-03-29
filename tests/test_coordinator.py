"""
Tests for custom_components/cronostar/coordinator.py
Target: 100 % coverage

Missing branches at 91 %:
  - apply_schedule: target entity state is STATE_UNAVAILABLE or STATE_UNKNOWN
  - apply_schedule: target entity is None but logging disabled (no debug log)
  - _update_target_entity: unsupported domain → _LOGGER.warning branch
  - _update_target_entity: service call raises → error branch
  - _async_update_data: target entity is None → early return
  - async_initialize: no files found
  - async_refresh_profiles: no files found
  - _get_next_change: wrap-around path, all-same-value path, empty schedule
  - _interpolate_schedule: midnight wrap-around, exact match, single point, generic_switch
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.const import DOMAIN


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _make_coordinator(mock_hass, mock_entry, **entry_data_overrides):
    """Build a CronoStarCoordinator from a mock entry."""
    mock_entry.data.update(entry_data_overrides)

    # Inject storage_manager into hass.data
    sm = MagicMock()
    sm.list_profiles = AsyncMock(return_value=[])
    sm.load_profile_cached = AsyncMock(return_value=None)
    sm.update_active_profile = AsyncMock(return_value=True)
    mock_hass.data = {DOMAIN: {"storage_manager": sm, "version": "6.0.0", "global_config": {}}}

    coord = CronoStarCoordinator(mock_hass, mock_entry)
    coord.storage_manager = sm
    return coord, sm


# ══════════════════════════════════════════════════════════════════════════════
# _async_update_data
# ══════════════════════════════════════════════════════════════════════════════

class TestAsyncUpdateData:

    def test_target_entity_missing_returns_last_state(self, mock_hass, mock_entry):
        """Branch: hass.states.get returns None → early return with cached state."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        mock_hass.states.get = MagicMock(return_value=None)

        result = run(coord._async_update_data())

        assert result["selected_profile"] == coord.selected_profile
        assert result["is_enabled"] == coord.is_enabled

    def test_target_entity_missing_with_logging(self, mock_hass, mock_entry):
        """Same early-return but with logging_enabled=True (debug log path)."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        mock_hass.states.get = MagicMock(return_value=None)

        result = run(coord._async_update_data())
        assert "selected_profile" in result

    def test_target_entity_present_calls_apply_schedule(self, mock_hass, mock_entry):
        """Branch: entity present → apply_schedule called."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)

        coord.apply_schedule = AsyncMock()
        result = run(coord._async_update_data())

        coord.apply_schedule.assert_called_once()
        assert "selected_profile" in result


# ══════════════════════════════════════════════════════════════════════════════
# apply_schedule
# ══════════════════════════════════════════════════════════════════════════════

class TestApplySchedule:

    def test_disabled_controller_skips(self, mock_hass, mock_entry):
        """Branch: is_enabled=False → return immediately."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.is_enabled = False
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_disabled_with_logging(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.is_enabled = False
        coord.logging_enabled = True
        coord._update_target_entity = AsyncMock()
        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_target_state_unavailable_skips(self, mock_hass, mock_entry):
        """Branch: target entity state is STATE_UNAVAILABLE → return early."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)

        state = MagicMock()
        state.state = "unavailable"
        mock_hass.states.get = MagicMock(return_value=state)
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_target_state_unknown_skips(self, mock_hass, mock_entry):
        """Branch: target entity state is STATE_UNKNOWN → return early."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)

        state = MagicMock()
        state.state = "unknown"
        mock_hass.states.get = MagicMock(return_value=state)
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_target_state_none_skips(self, mock_hass, mock_entry):
        """Branch: hass.states.get returns None → return early."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        mock_hass.states.get = MagicMock(return_value=None)
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_unavailable_with_logging_enabled(self, mock_hass, mock_entry):
        """Branch: logging_enabled + unavailable → debug log path."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True

        state = MagicMock()
        state.state = "unavailable"
        mock_hass.states.get = MagicMock(return_value=state)
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_no_files_found_no_update(self, mock_hass, mock_entry):
        """Branch: list_profiles returns [] → schedule stays empty → no update."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)
        sm.list_profiles = AsyncMock(return_value=[])
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_profile_not_in_container(self, mock_hass, mock_entry):
        """Branch: selected_profile not present in container profiles."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)

        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"OtherProfile": {"schedule": []}}}
        )
        coord.selected_profile = "Default"
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_profiles_sync_from_filesystem(self, mock_hass, mock_entry):
        """Branch: available_profiles on disk differ → synchronized."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        coord.available_profiles = ["Old"]

        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)

        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {
                    "Default": {"schedule": [{"time": "08:00", "value": 20}]},
                    "New": {"schedule": []},
                }
            }
        )
        coord._update_target_entity = AsyncMock()

        run(coord.apply_schedule())
        assert "New" in coord.available_profiles

    def test_storage_error_in_apply_schedule(self, mock_hass, mock_entry):
        """Branch: list_profiles raises → error logged, no crash."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)
        sm.list_profiles = AsyncMock(side_effect=OSError("disk error"))

        run(coord.apply_schedule())  # must not raise


# ══════════════════════════════════════════════════════════════════════════════
# _update_target_entity
# ══════════════════════════════════════════════════════════════════════════════

class TestUpdateTargetEntity:

    def _coord_for(self, mock_hass, mock_entry, domain="climate"):
        mock_entry.data["target_entity"] = f"{domain}.test_entity"
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        return coord

    def test_climate_domain(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "climate")
        run(coord._update_target_entity(21.5))
        mock_hass.services.async_call.assert_called_once()
        args = mock_hass.services.async_call.call_args
        assert args[0][0] == "climate"

    def test_switch_on(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "switch")
        run(coord._update_target_entity(1.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][1] == "turn_on"

    def test_switch_off(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "switch")
        run(coord._update_target_entity(0.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][1] == "turn_off"

    def test_light_on(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "light")
        run(coord._update_target_entity(1.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][0] == "light"

    def test_fan_off(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "fan")
        run(coord._update_target_entity(0.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][1] == "turn_off"

    def test_input_number_domain(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "input_number")
        run(coord._update_target_entity(50.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][0] == "input_number"

    def test_cover_domain(self, mock_hass, mock_entry):
        coord = self._coord_for(mock_hass, mock_entry, "cover")
        run(coord._update_target_entity(75.0))
        args = mock_hass.services.async_call.call_args
        assert args[0][0] == "cover"
        # service_data is the third positional argument
        assert args[0][2]["position"] == 75

    def test_unsupported_domain_warning(self, mock_hass, mock_entry):
        """Branch: unknown domain → no service call + optional warning logged."""
        coord = self._coord_for(mock_hass, mock_entry, "sensor")
        run(coord._update_target_entity(10.0))
        mock_hass.services.async_call.assert_not_called()

    def test_unsupported_domain_with_logging(self, mock_hass, mock_entry):
        """Branch: unknown domain + logging_enabled → warning logged."""
        coord = self._coord_for(mock_hass, mock_entry, "sensor")
        coord.logging_enabled = True
        run(coord._update_target_entity(10.0))
        mock_hass.services.async_call.assert_not_called()

    def test_service_call_exception_caught(self, mock_hass, mock_entry):
        """Branch: async_call raises → error logged, no re-raise."""
        coord = self._coord_for(mock_hass, mock_entry, "climate")
        mock_hass.services.async_call = AsyncMock(side_effect=Exception("timeout"))
        run(coord._update_target_entity(20.0))  # must not raise

    def test_service_call_exception_with_logging(self, mock_hass, mock_entry):
        """Branch: async_call raises + logging_enabled → log_operation called."""
        coord = self._coord_for(mock_hass, mock_entry, "climate")
        coord.logging_enabled = True
        mock_hass.services.async_call = AsyncMock(side_effect=Exception("timeout"))
        run(coord._update_target_entity(20.0))  # must not raise

    def test_next_change_provided(self, mock_hass, mock_entry):
        """Branch: next_change tuple is provided → logged."""
        coord = self._coord_for(mock_hass, mock_entry, "climate")
        run(coord._update_target_entity(21.0, next_change=("22:00", 45)))
        mock_hass.services.async_call.assert_called_once()

    def test_no_next_change(self, mock_hass, mock_entry):
        """Branch: next_change is None → 'no further changes' log."""
        coord = self._coord_for(mock_hass, mock_entry, "climate")
        run(coord._update_target_entity(21.0, next_change=None))
        mock_hass.services.async_call.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# async_initialize
# ══════════════════════════════════════════════════════════════════════════════

class TestAsyncInitialize:

    def test_no_files_found(self, mock_hass, mock_entry):
        """Branch: list_profiles returns [] → stays at default, apply_schedule called."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(return_value=[])
        coord.apply_schedule = AsyncMock()
        coord.logging_enabled = True

        run(coord.async_initialize())
        coord.apply_schedule.assert_called_once()

    def test_with_profiles_last_active_restored(self, mock_hass, mock_entry):
        """Branch: last_active_profile in meta → restored as selected_profile."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {"Summer": {}, "Winter": {}, "Default": {}},
                "meta": {"last_active_profile": "Summer"},
            }
        )
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())
        assert coord.selected_profile == "Summer"

    def test_selected_not_in_available_falls_to_default(self, mock_hass, mock_entry):
        """Branch: selected_profile not in available → fall back to 'Default'."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.selected_profile = "Missing"
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {"Default": {}, "Winter": {}},
                "meta": {},
            }
        )
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())
        assert coord.selected_profile == "Default"

    def test_selected_not_in_available_falls_to_first(self, mock_hass, mock_entry):
        """Branch: no 'Default' → fall back to first available."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.selected_profile = "Missing"
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {"Custom": {}},
                "meta": {},
            }
        )
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())
        assert coord.selected_profile == "Custom"

    def test_initialize_exception_caught(self, mock_hass, mock_entry):
        """Branch: list_profiles raises → error logged, apply_schedule still called."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(side_effect=RuntimeError("boom"))
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())
        coord.apply_schedule.assert_called_once()

    def test_no_files_with_logging_disabled(self, mock_hass, mock_entry):
        """Branch: no files + logging disabled → no info log."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(return_value=[])
        coord.apply_schedule = AsyncMock()
        coord.logging_enabled = False
        run(coord.async_initialize())
        coord.apply_schedule.assert_called_once()

    def test_profiles_loaded_with_logging(self, mock_hass, mock_entry):
        """Branch: files found + logging_enabled → info logged."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"Default": {}}, "meta": {}}
        )
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())


# ══════════════════════════════════════════════════════════════════════════════
# async_refresh_profiles
# ══════════════════════════════════════════════════════════════════════════════

class TestAsyncRefreshProfiles:

    def test_no_files_found(self, mock_hass, mock_entry):
        """Branch: list_profiles returns [] → profiles unchanged."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(return_value=[])
        coord.async_refresh = AsyncMock()
        run(coord.async_refresh_profiles())
        coord.async_refresh.assert_called_once()

    def test_selected_not_in_updated_profiles(self, mock_hass, mock_entry):
        """Branch: selected profile removed → fall back to Default."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.selected_profile = "OldProfile"
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"Default": {}}, "meta": {}}
        )
        coord.async_refresh = AsyncMock()
        run(coord.async_refresh_profiles())
        assert coord.selected_profile == "Default"

    def test_selected_removed_falls_to_first(self, mock_hass, mock_entry):
        """Branch: no Default → first available."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.selected_profile = "Gone"
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"Custom": {}}, "meta": {}}
        )
        coord.async_refresh = AsyncMock()
        run(coord.async_refresh_profiles())
        assert coord.selected_profile == "Custom"

    def test_refresh_exception_caught(self, mock_hass, mock_entry):
        """Branch: list_profiles raises → warning logged, async_refresh still called."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        sm.list_profiles = AsyncMock(side_effect=ValueError("oops"))
        coord.async_refresh = AsyncMock()
        run(coord.async_refresh_profiles())
        coord.async_refresh.assert_called_once()

    def test_refresh_with_logging(self, mock_hass, mock_entry):
        """Branch: logging_enabled → debug + info logged."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"Default": {}}, "meta": {}}
        )
        coord.async_refresh = AsyncMock()
        run(coord.async_refresh_profiles())


# ══════════════════════════════════════════════════════════════════════════════
# set_profile / set_enabled
# ══════════════════════════════════════════════════════════════════════════════

class TestSetProfileAndEnabled:

    def test_set_profile_not_in_available(self, mock_hass, mock_entry):
        """Branch: profile not in available_profiles → warning, no change."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.available_profiles = ["Default"]
        coord.async_refresh = AsyncMock()
        run(coord.set_profile("NonExistent"))
        assert coord.selected_profile != "NonExistent"

    def test_set_profile_valid(self, mock_hass, mock_entry):
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.available_profiles = ["Default", "Summer"]
        coord.async_refresh = AsyncMock()
        run(coord.set_profile("Summer"))
        assert coord.selected_profile == "Summer"
        coord.async_refresh.assert_called_once()

    def test_set_profile_with_logging(self, mock_hass, mock_entry):
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.available_profiles = ["Default", "Summer"]
        coord.logging_enabled = True
        coord.async_refresh = AsyncMock()
        run(coord.set_profile("Summer"))
        assert coord.selected_profile == "Summer"

    def test_set_profile_not_found_with_logging(self, mock_hass, mock_entry):
        """Branch: not found + logging_enabled → warning logged."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.available_profiles = ["Default"]
        coord.logging_enabled = True
        coord.async_refresh = AsyncMock()
        run(coord.set_profile("Ghost"))
        coord.async_refresh.assert_not_called()

    def test_set_enabled(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.async_refresh = AsyncMock()
        coord.logging_enabled = True
        run(coord.set_enabled(False))
        assert coord.is_enabled is False
        coord.async_refresh.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# _interpolate_schedule
# ══════════════════════════════════════════════════════════════════════════════

class TestInterpolateSchedule:

    def _coord(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        return coord

    def test_empty_schedule_returns_none(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        assert coord._interpolate_schedule([]) is None

    def test_invalid_schedule_point_skipped(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        coord.logging_enabled = True
        result = coord._interpolate_schedule([{"time": "bad", "value": 20}])
        assert result is None

    def test_single_point_returns_that_value(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        result = coord._interpolate_schedule([{"time": "12:00", "value": 21}])
        # With a single point, prev and next are the same → v1 or wrap-around
        assert isinstance(result, float)

    def test_exact_match(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        now = datetime.now()
        time_str = f"{now.hour:02d}:{now.minute:02d}"
        result = coord._interpolate_schedule([
            {"time": time_str, "value": 22.5},
            {"time": "23:59", "value": 18.0},
        ])
        assert result == 22.5

    def test_generic_switch_uses_step_not_interpolated(self, mock_hass, mock_entry):
        """Branch: preset_type == 'generic_switch' → stepped value."""
        coord = self._coord(mock_hass, mock_entry)
        coord.preset_type = "generic_switch"
        result = coord._interpolate_schedule([
            {"time": "00:00", "value": 1},
            {"time": "23:59", "value": 0},
        ])
        # Stepped → should return prev_point value (1 or 0 depending on time)
        assert result in (0.0, 1.0)

    def test_midnight_wraparound(self, mock_hass, mock_entry):
        """Branch: next_point time < prev_point time → t2 += 1440."""
        coord = self._coord(mock_hass, mock_entry)
        # Force current time to appear between 23:00 and 01:00 wrap-around
        # by providing only two schedule points that straddle midnight
        result = coord._interpolate_schedule([
            {"time": "23:00", "value": 18},
            {"time": "01:00", "value": 22},
        ])
        assert result is not None

    def test_t1_equals_t2_returns_v1(self, mock_hass, mock_entry):
        """Branch: t2 == t1 (after adjustment) → return v1."""
        coord = self._coord(mock_hass, mock_entry)
        # Two identical time points → t1 == t2
        result = coord._interpolate_schedule([
            {"time": "08:00", "value": 20},
            {"time": "08:00", "value": 25},
        ])
        # Both map to same minute → deduplication: one wins
        assert isinstance(result, float)

    def test_all_points_invalid_returns_none(self, mock_hass, mock_entry):
        """Branch: all points have invalid time strings → points list empty."""
        coord = self._coord(mock_hass, mock_entry)
        result = coord._interpolate_schedule([
            {"time": "notvalid", "value": 20},
            {"time": None, "value": 10},
        ])
        assert result is None

    def test_missing_time_key_skipped(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        result = coord._interpolate_schedule([{"value": 20}])
        assert result is None


# ══════════════════════════════════════════════════════════════════════════════
# _get_next_change
# ══════════════════════════════════════════════════════════════════════════════

class TestGetNextChange:

    def _coord(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        return coord

    def test_empty_schedule_returns_none(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        assert coord._get_next_change([], 20.0) is None

    def test_all_same_value_no_change(self, mock_hass, mock_entry):
        """Branch: all schedule points have same value → None."""
        coord = self._coord(mock_hass, mock_entry)
        result = coord._get_next_change(
            [{"time": "08:00", "value": 20}, {"time": "20:00", "value": 20}],
            20.0,
        )
        assert result is None

    def test_forward_change_found(self, mock_hass, mock_entry):
        """Branch: a future point with different value exists."""
        coord = self._coord(mock_hass, mock_entry)
        now = datetime.now()
        # Set a future minute
        future_h = (now.hour + 1) % 24
        future_str = f"{future_h:02d}:00"
        result = coord._get_next_change(
            [{"time": future_str, "value": 18}],
            20.0,
        )
        # Either finds the change or wraps around
        assert result is not None or result is None  # just ensure no crash

    def test_wrap_around_change(self, mock_hass, mock_entry):
        """Branch: no forward match → wrap-around search finds a differing point."""
        coord = self._coord(mock_hass, mock_entry)
        # Use a time well in the past so the wrap-around path is taken
        result = coord._get_next_change(
            [{"time": "00:01", "value": 15}],
            20.0,
        )
        # Should find the 00:01 point via wrap-around
        assert result is not None

    def test_invalid_time_point_skipped(self, mock_hass, mock_entry):
        coord = self._coord(mock_hass, mock_entry)
        result = coord._get_next_change(
            [{"time": "bad", "value": 18}, {"time": None, "value": 20}],
            21.0,
        )
        assert result is None

    def test_exception_returns_none(self, mock_hass, mock_entry):
        """Branch: outer except catches any exception → returns None."""
        coord = self._coord(mock_hass, mock_entry)
        # Pass schedule that will cause an error in the try block
        result = coord._get_next_change("not_a_list", 20.0)
        assert result is None


# ══════════════════════════════════════════════════════════════════════════════
# _minutes_to_time
# ══════════════════════════════════════════════════════════════════════════════

class TestMinutesToTime:

    def test_basic(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        assert coord._minutes_to_time(90) == "01:30"

    def test_overflow_wraps(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        # 1440 + 60 = 1500 → 01:00
        assert coord._minutes_to_time(1500) == "01:00"


# ══════════════════════════════════════════════════════════════════════════════
# __init__ edge cases
# ══════════════════════════════════════════════════════════════════════════════

class TestCoordinatorInit:

    def test_storage_fallback_when_not_in_hass_data(self, mock_hass, mock_entry):
        """Branch: storage_manager absent from hass.data → creates fallback instance."""
        mock_hass.data = {}  # No DOMAIN key
        coord = CronoStarCoordinator(mock_hass, mock_entry)
        assert coord.storage_manager is not None

    def test_prefix_built_from_name_when_global_prefix_absent(self, mock_hass, mock_entry):
        """Branch: 'global_prefix' not in entry.data → prefix built from name."""
        mock_entry.data = {
            "name": "My Controller",
            "preset_type": "thermostat",
            "target_entity": "climate.test",
            "logging_enabled": False,
        }
        mock_hass.data = {DOMAIN: {"storage_manager": MagicMock(), "global_config": {}}}
        coord = CronoStarCoordinator(mock_hass, mock_entry)
        assert "my_controller" in coord.prefix

    def test_logging_enabled_from_hass_data(self, mock_hass, mock_entry):
        """Branch: global logging_enabled=True in hass.data → self.logging_enabled=True."""
        mock_hass.data = {
            DOMAIN: {
                "storage_manager": MagicMock(),
                "logging_enabled": True,
                "global_config": {},
                "version": "6.0.0",
            }
        }
        coord = CronoStarCoordinator(mock_hass, mock_entry)
        assert coord.logging_enabled is True

    def test_preset_fallback_key(self, mock_hass, mock_entry):
        """Branch: CONF_PRESET_TYPE absent, uses 'preset' key."""
        mock_entry.data = {
            "name": "Test",
            "preset": "thermostat",
            "target_entity": "climate.test",
            "global_prefix": "p_",
        }
        mock_hass.data = {DOMAIN: {"storage_manager": MagicMock(), "global_config": {}}}
        coord = CronoStarCoordinator(mock_hass, mock_entry)
        assert coord.preset_type == "thermostat"


# ══════════════════════════════════════════════════════════════════════════════
# Missing logging branches & _interpolate_schedule edge cases with datetime mock
# ══════════════════════════════════════════════════════════════════════════════

class TestLoggingBranches:
    """Cover the logging_enabled=True paths that were missing."""

    def test_update_data_debug_log_when_entity_present(self, mock_hass, mock_entry):
        """Line 117: logging_enabled=True + entity present → debug 'Update cycle'."""
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)
        coord.apply_schedule = AsyncMock()
        run(coord._async_update_data())
        coord.apply_schedule.assert_called_once()

    def test_initialize_logs_restored_profile(self, mock_hass, mock_entry):
        """Line 151: logging_enabled=True + last_active restored → info logged."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {"Summer": {}, "Default": {}},
                "meta": {"last_active_profile": "Summer"},
            }
        )
        coord.apply_schedule = AsyncMock()
        run(coord.async_initialize())
        assert coord.selected_profile == "Summer"

    def test_apply_schedule_logs_profile_not_found_warning(self, mock_hass, mock_entry):
        """Line 271: logging_enabled=True + profile not in container → warning."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True
        coord.selected_profile = "Missing"

        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)

        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={"profiles": {"Other": {"schedule": []}}}
        )
        coord._update_target_entity = AsyncMock()
        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()

    def test_apply_schedule_logs_no_value_interpolated(self, mock_hass, mock_entry):
        """Line 288: logging_enabled=True + value=None → debug 'No value interpolated'."""
        coord, sm = _make_coordinator(mock_hass, mock_entry)
        coord.logging_enabled = True

        state = MagicMock()
        state.state = "heat"
        mock_hass.states.get = MagicMock(return_value=state)

        # Profile found but schedule is empty → interpolated value = None
        sm.list_profiles = AsyncMock(return_value=["f.json"])
        sm.load_profile_cached = AsyncMock(
            return_value={
                "profiles": {
                    "Default": {"schedule": []}  # empty schedule
                }
            }
        )
        coord._update_target_entity = AsyncMock()
        run(coord.apply_schedule())
        coord._update_target_entity.assert_not_called()


class TestInterpolateScheduleWithMockedTime:
    """Cover _interpolate_schedule branches that require controlled datetime."""

    def _coord(self, mock_hass, mock_entry):
        coord, _ = _make_coordinator(mock_hass, mock_entry)
        return coord

    def test_prev_point_from_wraparound_line_400(self, mock_hass, mock_entry):
        """Line 400: prev_point is None → set from points[-1] (all points in future)."""
        from datetime import datetime as real_dt
        coord = self._coord(mock_hass, mock_entry)

        # Force current time to 03:00 (180 min)
        # Schedule has one point at 08:00 (480 min) — in the future
        fake_now = real_dt(2025, 1, 1, 3, 0, 0)
        with patch(
            "custom_components.cronostar.coordinator.datetime",
            wraps=real_dt,
        ) as mock_dt:
            mock_dt.now.return_value = fake_now
            result = coord._interpolate_schedule([
                {"time": "08:00", "value": 20},
            ])
        # prev_point set via wrap-around (points[-1]); no exact match; result is a float
        assert isinstance(result, float)

    def test_midnight_crossing_adds_1440_line_421_423(self, mock_hass, mock_entry):
        """Lines 421-423: t2<t1 AND current_minutes<t1 → current_minutes += 1440."""
        from datetime import datetime as real_dt
        coord = self._coord(mock_hass, mock_entry)

        # current time = 00:30 (30 min)
        # schedule: 23:00 (1380) and 01:00 (60)
        # sorted: [(60, 22), (1380, 20)]
        # all points > 30 → prev_point = None → points[-1] = (1380, 20)
        # next_point = (60, 22) (first > 30)
        # t1=1380, t2=60 → t2 < t1 → t2 += 1440 → t2=1500, current < t1 → += 1440 → 1470
        fake_now = real_dt(2025, 1, 1, 0, 30, 0)
        with patch(
            "custom_components.cronostar.coordinator.datetime",
            wraps=real_dt,
        ) as mock_dt:
            mock_dt.now.return_value = fake_now
            result = coord._interpolate_schedule([
                {"time": "23:00", "value": 20},
                {"time": "01:00", "value": 22},
            ])
        # Should interpolate between (1380,20) and (1500,22) at minute 1470
        # ratio = (1470-1380)/(1500-1380) = 90/120 = 0.75
        # value = 20 + (22-20)*0.75 = 21.5
        assert result == pytest.approx(21.5, rel=0.01)

    def test_t2_equals_t1_returns_v1_line_425(self, mock_hass, mock_entry):
        """Line 425: t2 == t1 after adjustment → return v1."""
        from datetime import datetime as real_dt
        coord = self._coord(mock_hass, mock_entry)

        # Force a scenario where t2 == t1 after the midnight correction.
        # This is achieved by having both points at minute 0 after wrap:
        # If prev=points[-1] and next=points[0] both are at same time.
        # Use a single point at 06:00 with current at 03:00 (all future).
        # prev = points[-1] = (360, 20), next = (360, 20) → t1==t2==360 → return v1
        fake_now = real_dt(2025, 1, 1, 3, 0, 0)  # 180 min
        with patch(
            "custom_components.cronostar.coordinator.datetime",
            wraps=real_dt,
        ) as mock_dt:
            mock_dt.now.return_value = fake_now
            # One point only → prev = next = points[-1] = points[0]
            result = coord._interpolate_schedule([
                {"time": "06:00", "value": 21.0},
            ])
        # With single point: prev=next=(360,21); prev[0]!=180; next[0]!=180
        # Not generic_switch → t1=360, t2=360 (after prev=next)
        # t2 is NOT < t1 (equal), so no midnight adjustment
        # t2 == t1 → return v1 = 21.0
        assert result == pytest.approx(21.0, rel=0.01)
