"""
Fixed coverage tests — atomic, isolated, async-safe.

Fixes applied vs original suites:
  1. hass.async_add_executor_job mock is always an AsyncMock or coroutine,
     never a plain lambda (prevents "object list can't be used in 'await' expression").
  2. test_coordinator_update_data_exception_fixed: _async_update_data has NO
     try/except around hass.states.get, so we patch apply_schedule instead to
     exercise the happy-path return and cover the branch we actually want.
  3. Every sub-scenario lives in its own test function → no mock bleed-over.
  4. StorageManager is always initialised with a real tmp_path (pytest fixture),
     never with a string path that makes Path operations explode.
"""

import asyncio
import importlib
import json
import logging
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.cronostar.coordinator import CronoStarCoordinator
from custom_components.cronostar.storage.storage_manager import StorageManager
import custom_components.cronostar.setup as cronostar_setup


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_async_executor(sync_fn_results: dict | None = None, raise_for=None):
    """
    Return an AsyncMock that behaves like hass.async_add_executor_job.

    sync_fn_results : {callable: return_value}  — return a fixed value for that fn
    raise_for       : {callable: exception}      — raise for that fn
    """
    async def _executor(fn, *args):
        if raise_for and fn in raise_for:
            raise raise_for[fn]
        if sync_fn_results and fn in sync_fn_results:
            v = sync_fn_results[fn]
            return v() if callable(v) else v
        # default: call synchronously
        return fn(*args) if args else fn()
    return _executor


def _make_entry(name="T", preset_type="t", target="c.t", prefix="p_"):
    entry = MagicMock()
    entry.data = {
        "name": name,
        "preset_type": preset_type,
        "target_entity": target,
        "global_prefix": prefix,
    }
    return entry


# ---------------------------------------------------------------------------
# Setup / Init
# ---------------------------------------------------------------------------

def test_setup_import_fallback_has_static_path_false():
    """Cover the ImportError branch that sets HAS_STATIC_PATH_CONFIG = False."""
    mock_http = MagicMock(spec=[])          # no attributes → AttributeError on .StaticPathConfig
    with patch.dict("sys.modules", {"homeassistant.components.http": mock_http}):
        importlib.reload(cronostar_setup)
        assert cronostar_setup.HAS_STATIC_PATH_CONFIG is False
    # restore
    importlib.reload(cronostar_setup)


@pytest.mark.asyncio
async def test_setup_integration_with_static_path_config(hass, tmp_path):
    """Cover the HAS_STATIC_PATH_CONFIG=True branch."""
    from custom_components.cronostar.setup import async_setup_integration

    www = tmp_path / "custom_components" / "cronostar" / "www" / "cronostar_card"
    www.mkdir(parents=True)
    (www / "cronostar-card.js").write_text("x")
    hass.config.path.side_effect = lambda p: str(tmp_path / p)

    with patch("custom_components.cronostar.setup.dashboard.setup_dashboard"), \
         patch("custom_components.cronostar.setup.services.setup_services"), \
         patch("custom_components.cronostar.setup.events.setup_event_handlers"), \
         patch("custom_components.cronostar.setup.async_get_integration") as mock_get, \
         patch("homeassistant.components.frontend.add_extra_js_url"), \
         patch("custom_components.cronostar.setup.HAS_STATIC_PATH_CONFIG", True), \
         patch("homeassistant.components.http.StaticPathConfig"):
        mock_get.return_value.version = "1.0.0"
        await async_setup_integration(hass, {"version": "1.0.0"})


@pytest.mark.asyncio
async def test_setup_integration_without_static_path_config(hass, tmp_path):
    """Cover the HAS_STATIC_PATH_CONFIG=False branch."""
    from custom_components.cronostar.setup import async_setup_integration

    www = tmp_path / "custom_components" / "cronostar" / "www" / "cronostar_card"
    www.mkdir(parents=True)
    (www / "cronostar-card.js").write_text("x")
    hass.config.path.side_effect = lambda p: str(tmp_path / p)

    with patch("custom_components.cronostar.setup.dashboard.setup_dashboard"), \
         patch("custom_components.cronostar.setup.services.setup_services"), \
         patch("custom_components.cronostar.setup.events.setup_event_handlers"), \
         patch("custom_components.cronostar.setup.async_get_integration") as mock_get, \
         patch("homeassistant.components.frontend.add_extra_js_url"), \
         patch("custom_components.cronostar.setup.HAS_STATIC_PATH_CONFIG", False):
        mock_get.return_value.version = "1.0.0"
        await async_setup_integration(hass, {"version": "1.0.0"})


# ---------------------------------------------------------------------------
# StorageManager — mtime OSError branches
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_active_profile_mtime_oserror(hass, tmp_path):
    """Line ~525: OSError on getmtime after successful write in update_active_profile."""
    sm = StorageManager(hass, tmp_path)
    hass.async_add_executor_job = _make_async_executor(
        raise_for={os.path.getmtime: OSError("mtime fail")}
    )
    with patch.object(sm, "_load_container", AsyncMock(return_value={"meta": {}})), \
         patch.object(sm, "_write_json", AsyncMock()):
        await sm.update_active_profile("t", "p", "prof")

    filename = "cronostar_p_data.json"
    assert sm._cache_mtimes.get(filename, 0) == 0


@pytest.mark.asyncio
async def test_load_profile_cached_mtime_oserror_on_check(hass, tmp_path):
    """OSError while checking current mtime → force reload path."""
    sm = StorageManager(hass, tmp_path)
    filename = "test.json"
    sm._cache[filename] = {"old": True}
    sm._cache_mtimes[filename] = 100

    hass.async_add_executor_job = _make_async_executor(
        raise_for={os.path.getmtime: OSError("no mtime")}
    )
    with patch.object(sm, "_load_container", AsyncMock(return_value={"new": True})):
        result = await sm.load_profile_cached(filename)

    assert result == {"new": True}


@pytest.mark.asyncio
async def test_load_profile_cached_mtime_oserror_on_update(hass, tmp_path):
    """OSError while updating mtime after fresh load → cache_mtime falls back to 0."""
    sm = StorageManager(hass, tmp_path)
    filename = "fresh.json"
    # No existing cache → goes straight to load
    hass.async_add_executor_job = _make_async_executor(
        raise_for={os.path.getmtime: OSError("no mtime")}
    )
    with patch.object(sm, "_load_container", AsyncMock(return_value={"data": 42})):
        result = await sm.load_profile_cached(filename)

    assert result == {"data": 42}
    assert sm._cache_mtimes.get(filename, 0) == 0


@pytest.mark.asyncio
async def test_save_profile_mtime_oserror(hass, tmp_path):
    """OSError on getmtime inside save_profile → _cache_mtimes entry becomes 0."""
    sm = StorageManager(hass, tmp_path)
    hass.async_add_executor_job = _make_async_executor(
        raise_for={os.path.getmtime: OSError("mtime fail")}
    )
    with patch.object(sm, "_load_container", AsyncMock(return_value={"meta": {}, "profiles": {}})), \
         patch.object(sm, "_write_json", AsyncMock()):
        await sm.save_profile("P", {}, "thermostat", "prefix")

    assert sm._cache_mtimes.get("cronostar_prefix_data.json", 0) == 0


@pytest.mark.asyncio
async def test_delete_profile_mtime_oserror(hass, tmp_path):
    """OSError on getmtime inside delete_profile → _cache_mtimes entry becomes 0."""
    sm = StorageManager(hass, tmp_path)
    filename = "cronostar_p_data.json"
    hass.async_add_executor_job = _make_async_executor(
        raise_for={os.path.getmtime: OSError("mtime fail")}
    )
    with patch.object(sm, "_load_container", AsyncMock(return_value={"profiles": {"P1": {}, "P2": {}}})), \
         patch.object(sm, "_write_json", AsyncMock()):
        await sm.delete_profile("P1", "thermostat", "p")

    assert sm._cache_mtimes.get(filename, 0) == 0


# ---------------------------------------------------------------------------
# StorageManager — _load_container exception
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_load_container_read_exception(hass, tmp_path):
    """Exception during read_text inside _load_container → returns {}."""
    sm = StorageManager(hass, tmp_path)

    async def selective(fn, *args):
        if fn == Path.exists:
            return True
        if fn == Path.read_text:
            raise Exception("disk error")
        return fn(*args) if args else fn()

    hass.async_add_executor_job = selective
    result = await sm._load_container(tmp_path / "broken.json")
    assert result == {}


# ---------------------------------------------------------------------------
# StorageManager — list_profiles edge cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_profiles_load_returns_none(hass, tmp_path):
    """
    load_profile_cached returning None → list_profiles does not crash.

    The branch (line ~252 in storage_manager) that handles a None result from
    load_profile_cached is executed. Whether the file ends up in the final list
    or not depends on the internal logic; we only assert the function completes
    without raising and returns a list.
    """
    sm = StorageManager(hass, tmp_path)
    (tmp_path / "cronostar_x_data.json").write_text("{}")

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch.object(sm, "load_profile_cached", AsyncMock(return_value=None)):
        result = await sm.list_profiles()

    assert isinstance(result, list)  # no crash, branch covered


@pytest.mark.asyncio
async def test_list_profiles_normalize_exception(hass, tmp_path):
    """Exception in normalize_preset_type → file is still included (fallback)."""
    sm = StorageManager(hass, tmp_path)
    (tmp_path / "cronostar_t_p_data.json").write_text(
        json.dumps({"meta": {"preset_type": "t"}})
    )

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch(
        "custom_components.cronostar.utils.prefix_normalizer.normalize_preset_type",
        side_effect=Exception("import error"),
    ):
        result = await sm.list_profiles(preset_type="t")

    assert "cronostar_t_p_data.json" in result


@pytest.mark.asyncio
async def test_list_profiles_prefix_mismatch_fallback(hass, tmp_path):
    """File whose name contains the prefix is included even without meta prefix match."""
    sm = StorageManager(hass, tmp_path)
    (tmp_path / "cronostar_p_data.json").write_text(json.dumps({"meta": {}}))

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    result = await sm.list_profiles(prefix="p")
    assert "cronostar_p_data.json" in result


@pytest.mark.asyncio
async def test_list_profiles_os_error(hass, tmp_path):
    """Exception in os.listdir (or glob) → returns []."""
    sm = StorageManager(hass, tmp_path)

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch("os.listdir", side_effect=Exception("disk gone")):
        result = await sm.list_profiles()

    assert result == []


# ---------------------------------------------------------------------------
# StorageManager — generic exception paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_profile_list_exception(hass, tmp_path):
    """Exception in load_profile_cached inside get_profile_list → returns []."""
    sm = StorageManager(hass, tmp_path)

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch.object(sm, "load_profile_cached", side_effect=Exception("boom")):
        result = await sm.get_profile_list("t", "p")

    assert result == []


@pytest.mark.asyncio
async def test_update_enabled_state_exception(hass, tmp_path):
    """Exception in _load_container inside update_enabled_state → returns False."""
    sm = StorageManager(hass, tmp_path)

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch.object(sm, "_load_container", side_effect=Exception("boom")):
        result = await sm.update_enabled_state("t", "p", True)

    assert result is False


@pytest.mark.asyncio
async def test_delete_controller_files_exception(hass, tmp_path):
    """Exception in list_profiles inside delete_controller_files → returns False."""
    sm = StorageManager(hass, tmp_path)

    with patch.object(sm, "list_profiles", side_effect=Exception("boom")):
        result = await sm.delete_controller_files("p")

    assert result is False


@pytest.mark.asyncio
async def test_save_profile_write_exception(hass, tmp_path):
    """Exception in _write_json inside save_profile → returns False."""
    sm = StorageManager(hass, tmp_path)

    async def real_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = real_executor

    with patch.object(sm, "_load_container", AsyncMock(return_value={"meta": {}, "profiles": {}})), \
         patch.object(sm, "_write_json", side_effect=Exception("write fail")):
        result = await sm.save_profile("n", {}, "t", "p")

    assert result is False


# ---------------------------------------------------------------------------
# CronoStarCoordinator
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_coordinator_refresh_profiles_exception(hass):
    """Exception in list_profiles inside async_refresh_profiles → logged, no crash."""
    coordinator = CronoStarCoordinator(hass, _make_entry())

    with patch.object(coordinator.storage_manager, "list_profiles", side_effect=Exception("oops")), \
         patch.object(coordinator, "async_refresh", AsyncMock()):
        # Should not raise
        await coordinator.async_refresh_profiles()


@pytest.mark.asyncio
async def test_coordinator_update_data_entity_missing(hass):
    """
    _async_update_data when target entity is None → returns last-known state dict.

    NOTE: _async_update_data has NO try/except. Cover the 'entity not found'
    branch by making hass.states.get return None via patch.object.
    """
    coordinator = CronoStarCoordinator(hass, _make_entry())

    with patch.object(hass.states, "get", return_value=None):
        result = await coordinator._async_update_data()

    assert result["selected_profile"] == coordinator.selected_profile
    assert result["is_enabled"] == coordinator.is_enabled


@pytest.mark.asyncio
async def test_coordinator_apply_schedule_exception(hass):
    """
    Exception raised inside apply_schedule → logged as ERROR, no crash.

    Covers the `except Exception` block at line ~283 of apply_schedule.

    Key insight from debugging:
    - hass.states.get.return_value does NOT work reliably with the HA test
      fixture because states.get may have a side_effect=None or a spec that
      overrides return_value. Use patch.object(hass.states, "get", ...) instead.
    - caplog misses records in session-scoped asyncio loops; use a manual handler.
    """
    import logging as _logging

    coordinator = CronoStarCoordinator(hass, _make_entry())
    coordinator.logging_enabled = False  # silence unrelated debug branches

    # Capture ERROR records directly from the module logger.
    coord_logger = _logging.getLogger("custom_components.cronostar.coordinator")
    captured: list[str] = []

    class _Capture(_logging.Handler):
        def emit(self, record: _logging.LogRecord) -> None:
            captured.append(record.getMessage())

    handler = _Capture(level=_logging.ERROR)
    coord_logger.addHandler(handler)
    original_level = coord_logger.level
    coord_logger.setLevel(_logging.ERROR)

    mock_state = MagicMock()
    mock_state.state = "21.0"  # not STATE_UNKNOWN / STATE_UNAVAILABLE → enters try block

    try:
        with patch.object(hass.states, "get", return_value=mock_state), \
             patch.object(
                 coordinator.storage_manager,
                 "list_profiles",
                 AsyncMock(side_effect=Exception("schedule load fail")),
             ):
            await coordinator.apply_schedule()
    finally:
        coord_logger.removeHandler(handler)
        coord_logger.setLevel(original_level)

    assert any("Error loading schedule" in m for m in captured), (
        f"Expected 'Error loading schedule' in log output, got: {captured}"
    )


@pytest.mark.asyncio
async def test_coordinator_update_data_calls_apply_schedule(hass):
    """
    _async_update_data when entity IS present → calls apply_schedule and returns dict.
    """
    coordinator = CronoStarCoordinator(hass, _make_entry())

    mock_state = MagicMock()
    mock_state.state = "20.0"

    with patch.object(hass.states, "get", return_value=mock_state), \
         patch.object(coordinator, "apply_schedule", AsyncMock()):
        result = await coordinator._async_update_data()

    assert "selected_profile" in result
    assert "is_enabled" in result
