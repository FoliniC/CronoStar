"""Test Component Initialization - Full Coverage."""
import asyncio
import json
import logging
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, mock_open, patch

import pytest

from custom_components.cronostar import (
    async_reload_entry,
    async_remove_entry,
    async_setup,
    async_setup_entry,
    async_unload_entry,
    _async_repair_entries,
)
from custom_components.cronostar.const import (
    DOMAIN,
    CONF_NAME,
    CONF_PRESET,
    CONF_TARGET_ENTITY,
    CONF_GLOBAL_PREFIX,
    CONF_LANGUAGE,
    CONF_LOGGING_ENABLED,
    CONF_FRONTEND_VERSION_CHECK,
)

def run(coro):
    return asyncio.run(coro)

# ---------------------------------------------------------------------------
# async_setup
# ---------------------------------------------------------------------------

def test_async_setup_success(hass):
    """Test YAML setup completa con successo."""
    with patch("custom_components.cronostar.async_setup_integration", return_value=True):
        success = run(async_setup(hass, {}))
        assert success is True
        assert hass.data[DOMAIN]["_global_setup_done"] is True


def test_async_setup_already_done(hass):
    """Test che async_setup non re-esegua il global setup se già completato."""
    hass.data[DOMAIN] = {"_global_setup_done": True}
    with patch("custom_components.cronostar.async_setup_integration") as mock_setup:
        success = run(async_setup(hass, {}))
        assert success is True
        mock_setup.assert_not_called()


def test_async_setup_integration_raises(hass):
    """Test che async_setup continui anche se async_setup_integration lancia eccezione."""
    with patch(
        "custom_components.cronostar.async_setup_integration",
        side_effect=Exception("boom"),
    ):
        success = run(async_setup(hass, {}))
        # Il blocco except non rilancia, restituisce True
        assert success is True
        # _global_setup_done non viene impostato in caso di eccezione
        assert not hass.data[DOMAIN].get("_global_setup_done")


# ---------------------------------------------------------------------------
# async_setup_entry - Global Entry
# ---------------------------------------------------------------------------

def _make_integration_mock(version="1.2.3"):
    integration = MagicMock()
    integration.version = version
    return integration


def test_async_setup_entry_global_success(hass):
    """Test setup entry globale con successo."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "CronoStar"
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=True), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock("1.2.3"),
         ):
        success = run(async_setup_entry(hass, entry))
        assert success is True


def test_async_setup_entry_global_title_update(hass):
    """Test che il titolo venga aggiornato se non è corretto."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Old CronoStar Name"
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=True), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock("1.2.3"),
         ):
        success = run(async_setup_entry(hass, entry))
        assert success is True
        hass.config_entries.async_update_entry.assert_called_with(entry, title="CronoStar")


def test_async_setup_entry_global_failure(hass):
    """Test fallimento del global setup."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=False), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock(),
         ):
        success = run(async_setup_entry(hass, entry))
        assert success is False


def test_async_setup_entry_global_stores_config(hass):
    """Test che la config globale venga salvata in hass.data."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "CronoStar"
    entry.options = {
        CONF_LOGGING_ENABLED: True,
        CONF_FRONTEND_VERSION_CHECK: False,
        CONF_LANGUAGE: "it",
    }

    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ):
        success = run(async_setup_entry(hass, entry))
        assert success is True
        cfg = hass.data[DOMAIN].get("global_config", {})
        assert cfg.get(CONF_LOGGING_ENABLED) is True
        assert cfg.get(CONF_FRONTEND_VERSION_CHECK) is False
        assert cfg.get(CONF_LANGUAGE) == "it"


# ---------------------------------------------------------------------------
# async_setup_entry - Controller Entry
# ---------------------------------------------------------------------------

def _controller_entry(data=None, title="Kitchen"):
    entry = MagicMock()
    entry.data = data or {
        CONF_NAME: "Kitchen",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "climate.kitchen",
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    }
    entry.title = title
    entry.entry_id = "ctrl_entry_id"
    entry.options = {}
    return entry


def test_async_setup_entry_controller_success(hass):
    """Test setup entry controller con successo."""
    entry = _controller_entry()
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_coord = mock_cls.return_value
        mock_coord.async_initialize = AsyncMock()
        mock_coord.async_config_entry_first_refresh = AsyncMock()

        success = run(async_setup_entry(hass, entry))
        assert success is True
        assert entry.runtime_data is mock_coord
        hass.config_entries.async_forward_entry_setups.assert_called_once()


def test_async_setup_entry_controller_title_cleaning(hass):
    """Test che il titolo controller venga pulito dai tag di versione."""
    entry = _controller_entry(title="Kitchen [v6.3.0]")
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("2.0.0"),
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        mock_cls.return_value.async_config_entry_first_refresh = AsyncMock()
        run(async_setup_entry(hass, entry))
        hass.config_entries.async_update_entry.assert_called_with(entry, title="Kitchen")


def test_async_setup_entry_controller_legacy_preset_migration(hass):
    """Test migrazione legacy 'preset' -> 'preset_type'."""
    entry = _controller_entry(data={
        CONF_NAME: "Kitchen",
        "preset": "thermostat",           # chiave legacy
        CONF_TARGET_ENTITY: "climate.kitchen",
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    })
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    def _simulate_update_entry(e, **kwargs):
        if "data" in kwargs:
            e.data = kwargs["data"]
        if "title" in kwargs:
            e.title = kwargs["title"]

    hass.config_entries.async_update_entry.side_effect = _simulate_update_entry

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        mock_cls.return_value.async_config_entry_first_refresh = AsyncMock()
        success = run(async_setup_entry(hass, entry))

    hass.config_entries.async_update_entry.assert_called()
    assert success is True
    assert CONF_PRESET in entry.data
    assert "preset" not in entry.data


def test_async_setup_entry_controller_missing_fields(hass):
    """Test fallimento setup se mancano campi obbligatori."""
    entry = _controller_entry(data={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    })
    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ):
        success = run(async_setup_entry(hass, entry))
        assert success is False


def test_async_setup_entry_controller_lazy_global_init(hass):
    """Test che il global setup venga eseguito in modo lazy per un controller."""
    entry = _controller_entry()
    hass.data[DOMAIN] = {}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ), patch(
        "custom_components.cronostar.async_setup_integration",
        return_value=True,
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        mock_cls.return_value.async_config_entry_first_refresh = AsyncMock()
        success = run(async_setup_entry(hass, entry))
        assert success is True
        assert hass.data[DOMAIN].get("_global_setup_done") is True


# ---------------------------------------------------------------------------
# async_unload_entry
# ---------------------------------------------------------------------------

def test_async_unload_entry_global(hass):
    """Test unload entry globale."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_unload_platforms = AsyncMock(return_value=True)

    with patch("homeassistant.components.frontend.async_remove_panel"):
        success = run(async_unload_entry(hass, entry))
        assert success is True
        assert DOMAIN not in hass.data


def test_async_unload_entry_global_panel_removal_fails(hass):
    """Test unload globale anche se la rimozione del panel fallisce."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"
    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "homeassistant.components.frontend.async_remove_panel",
        side_effect=Exception("panel error"),
    ):
        success = run(async_unload_entry(hass, entry))
        assert success is True


def test_async_unload_entry_controller_success(hass):
    """Test unload entry controller (non globale)."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "Kitchen", CONF_PRESET: "thermostat", CONF_TARGET_ENTITY: "climate.k"}
    entry.title = "Kitchen"
    hass.config_entries.async_unload_platforms = AsyncMock(return_value=True)

    success = run(async_unload_entry(hass, entry))
    assert success is True
    hass.config_entries.async_unload_platforms.assert_called_once()


def test_async_unload_entry_controller_failure(hass):
    """Test unload controller che fallisce."""
    entry = MagicMock()
    entry.data = {CONF_NAME: "Kitchen", CONF_PRESET: "thermostat", CONF_TARGET_ENTITY: "climate.k"}
    hass.config_entries.async_unload_platforms = AsyncMock(side_effect=Exception("unload error"))

    success = run(async_unload_entry(hass, entry))
    assert success is False


# ---------------------------------------------------------------------------
# async_reload_entry
# ---------------------------------------------------------------------------

def test_async_reload_entry(hass):
    """Test reload entry chiama unload + setup."""
    entry = MagicMock()
    entry.data = {"component_installed": True}

    with patch(
        "custom_components.cronostar.async_unload_entry",
        return_value=True,
    ) as mock_unload, patch(
        "custom_components.cronostar.async_setup_entry",
        return_value=True,
    ) as mock_setup:
        run(async_reload_entry(hass, entry))
        mock_unload.assert_called_once_with(hass, entry)
        mock_setup.assert_called_once_with(hass, entry)


# ---------------------------------------------------------------------------
# async_remove_entry
# ---------------------------------------------------------------------------

def test_async_remove_entry_global(hass):
    """Test rimozione entry globale (nessuna operazione su file)."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"
    run(async_remove_entry(hass, entry))


def test_async_remove_entry_controller_no_profile_file(hass):
    """Test rimozione controller senza file profilo su disco."""
    entry = MagicMock()
    entry.data = {
        CONF_PRESET: "thermostat",
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    hass.config.path = MagicMock(return_value="/config/.storage/cronostar")

    async def fake_executor(func, *args):
        return func(*args) if args else func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ), patch("pathlib.Path.exists", return_value=False):
        run(async_remove_entry(hass, entry))


def test_async_remove_entry_controller_marks_file(hass, tmp_path):
    """Test che il file venga marcato come eliminato e rinominato."""
    entry = MagicMock()
    entry.data = {
        CONF_PRESET: "thermostat",
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    profiles_dir = tmp_path / ".storage" / "cronostar"
    profiles_dir.mkdir(parents=True)
    profile_file = profiles_dir / "cronostar_thermostat_kitchen_.json"
    fake_data = {
        "profiles": {"Default": {"schedule": []}},
        "meta": {},
    }
    profile_file.write_text(json.dumps(fake_data), encoding="utf-8")

    hass.config.path = MagicMock(return_value=str(profiles_dir))

    async def fake_executor(func, *args):
        return func(*args) if args else func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        run(async_remove_entry(hass, entry))

    assert not profile_file.exists()
    deleted_files = list(profiles_dir.glob("*_deleted_*.json"))
    assert len(deleted_files) == 1

    deleted_data = json.loads(deleted_files[0].read_text())
    assert "_deleted_at" in deleted_data.get("meta", {})
    assert deleted_data["meta"]["_deleted_entry_title"] == "Kitchen"


def test_async_remove_entry_controller_mark_raises(hass, tmp_path):
    """Test che un errore nel marcare il file venga gestito senza crash."""
    entry = MagicMock()
    entry.data = {
        CONF_PRESET: "thermostat",
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    profiles_dir = tmp_path / ".storage" / "cronostar"
    profiles_dir.mkdir(parents=True)
    profile_file = profiles_dir / "cronostar_thermostat_kitchen_.json"
    profile_file.write_text("{ invalid json }", encoding="utf-8")

    hass.config.path = MagicMock(return_value=str(profiles_dir))

    async def fake_executor(func, *args):
        return func(*args) if args else func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        run(async_remove_entry(hass, entry))


def test_async_remove_entry_controller_missing_preset(hass):
    """Test rimozione controller senza preset_type e global_prefix."""
    entry = MagicMock()
    entry.data = {}
    entry.title = "Unknown"
    run(async_remove_entry(hass, entry))

@pytest.mark.asyncio
async def test_async_remove_entry_marks_file_as_deleted_boost():
    """Lines 161-162: _mark_as_deleted renames the file and returns the new name."""
    hass = MagicMock()
    entry = MagicMock()
    entry.data = {
        "component_installed": False,
        CONF_PRESET: "thermostat",
        CONF_GLOBAL_PREFIX: "cronostar_",
    }
    entry.title = "Kitchen"

    fake_profile_data = {
        "meta": {CONF_PRESET: "thermostat", CONF_GLOBAL_PREFIX: "cronostar_"},
        "slots": [],
    }

    with (
        patch(
            "custom_components.cronostar.utils.filename_builder.build_profile_filename",
            return_value="cronostar_thermostat.json",
        ),
        patch("pathlib.Path.exists", return_value=True),
        patch("builtins.open", mock_open(read_data=json.dumps(fake_profile_data))),
        patch("pathlib.Path.unlink") as mock_unlink,
    ):
        async def real_executor(fn, *args):
            return fn(*args) if args else fn()
        hass.async_add_executor_job = real_executor
        await async_remove_entry(hass, entry)

    mock_unlink.assert_called()


@pytest.mark.asyncio
async def test_async_remove_entry_logs_backup_preservation(caplog):
    """Line 242: log message fires when backup directory exists."""
    hass = MagicMock()
    entry = MagicMock()
    entry.data = {
        "component_installed": False,
        CONF_PRESET: "thermostat",
        CONF_GLOBAL_PREFIX: "cronostar_",
    }
    entry.title = "Kitchen"

    with (
        patch(
            "custom_components.cronostar.utils.filename_builder.build_profile_filename",
            return_value="cronostar_thermostat.json",
        ),
        patch.object(Path, "exists", side_effect=[False, True]),
    ):
        with caplog.at_level(logging.INFO, logger="custom_components.cronostar"):
            await async_remove_entry(hass, entry)

    assert "preserved" in caplog.text or "Backup" in caplog.text


# ---------------------------------------------------------------------------
# _async_repair_entries – full branch coverage (lines 250-315)
# ---------------------------------------------------------------------------

def _make_hass_for_repair(profiles_dir, existing_entries=None):
    """Build a minimal hass mock suitable for _async_repair_entries tests."""
    hass = MagicMock()
    hass.config.path = MagicMock(return_value=str(profiles_dir))
    hass.config_entries.async_entries.return_value = existing_entries or []
    hass.config_entries.flow.async_init = AsyncMock(return_value={"type": "create_entry"})

    async def fake_executor(fn, *args):
        return fn(*args) if args else fn()

    hass.async_add_executor_job = fake_executor
    return hass


def _write_profile(directory, filename, meta, profiles=None):
    """Write a JSON profile file."""
    data = {"meta": meta, "profiles": profiles or {}}
    (directory / filename).write_text(json.dumps(data), encoding="utf-8")


@pytest.mark.asyncio
async def test_repair_profiles_dir_missing(tmp_path):
    """_async_repair_entries returns immediately if the directory does not exist."""
    missing_dir = tmp_path / "nonexistent"
    hass = _make_hass_for_repair(missing_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_empty_directory(tmp_path):
    """_async_repair_entries handles an empty profiles directory gracefully."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)
    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_skips_non_matching_files(tmp_path):
    """Files not ending in _data.json, or containing _deleted_ / _j_u_n_k_, are skipped."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    (profiles_dir / "readme.txt").write_text("docs", encoding="utf-8")
    (profiles_dir / "cronostar_thermostat_abc_deleted_20240101T000000_data.json").write_text("{}", encoding="utf-8")
    (profiles_dir / "cronostar_thermostat_j_u_n_k__data.json").write_text("{}", encoding="utf-8")
    (profiles_dir / "cronostar_thermostat_some_profile.json").write_text("{}", encoding="utf-8")

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_creates_entry_from_filename_when_prefix_missing(tmp_path):
    """Files whose meta lacks global_prefix use fallback prefix from filename."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_abc_data.json", meta={
        CONF_PRESET: "thermostat",
        CONF_NAME: "ABC",
        CONF_TARGET_ENTITY: "climate.abc",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_called_once()


@pytest.mark.asyncio
async def test_repair_skips_already_existing_prefix(tmp_path):
    """Files whose prefix already has a config entry are skipped."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    prefix = "cronostar_thermostat_kitchen_"
    _write_profile(profiles_dir, "cronostar_thermostat_kitchen_data.json", meta={
        CONF_GLOBAL_PREFIX: prefix,
        CONF_PRESET: "thermostat",
        CONF_NAME: "Kitchen",
        CONF_TARGET_ENTITY: "climate.kitchen",
    })

    existing_entry = MagicMock()
    existing_entry.data = {CONF_GLOBAL_PREFIX: prefix}
    hass = _make_hass_for_repair(profiles_dir, existing_entries=[existing_entry])

    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_skips_dummy_prefix_ddddd(tmp_path):
    """Prefixes containing 'ddddd' are skipped."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_ddddd_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_ddddd_",
        CONF_PRESET: "thermostat",
        CONF_NAME: "Dummy",
        CONF_TARGET_ENTITY: "climate.dummy",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_skips_test_prefix(tmp_path):
    """Prefixes containing 'test' are skipped."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_test_kitchen_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_test_kitchen_",
        CONF_PRESET: "thermostat",
        CONF_NAME: "Test Kitchen",
        CONF_TARGET_ENTITY: "climate.test_kitchen",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_not_called()


@pytest.mark.asyncio
async def test_repair_creates_entry_for_orphaned_profile(tmp_path):
    """A valid orphaned profile triggers async_init."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    prefix = "cronostar_thermostat_livingroom_"
    _write_profile(profiles_dir, "cronostar_thermostat_livingroom_data.json", meta={
        CONF_GLOBAL_PREFIX: prefix,
        CONF_PRESET: "thermostat",
        CONF_NAME: "Living Room",
        CONF_TARGET_ENTITY: "climate.livingroom",
        CONF_LANGUAGE: "it",
        "_internal_flag": "skip",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)

    hass.config_entries.flow.async_init.assert_called_once()
    _, kwargs = hass.config_entries.flow.async_init.call_args
    entry_data = kwargs["data"]

    assert entry_data[CONF_GLOBAL_PREFIX] == prefix
    assert entry_data[CONF_PRESET] == "thermostat"
    assert entry_data[CONF_NAME] == "Living Room"
    assert entry_data[CONF_TARGET_ENTITY] == "climate.livingroom"
    assert entry_data.get(CONF_LANGUAGE) == "it"
    assert "_internal_flag" not in entry_data


@pytest.mark.asyncio
async def test_repair_uses_dummy_target_when_target_missing(tmp_path, caplog):
    """If target_entity is absent, a dummy placeholder is used."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_bedroom_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_bedroom_",
        CONF_PRESET: "thermostat",
        CONF_NAME: "Bedroom",
    })

    hass = _make_hass_for_repair(profiles_dir)

    with caplog.at_level(logging.WARNING, logger="custom_components.cronostar"):
        await _async_repair_entries(hass)

    hass.config_entries.flow.async_init.assert_called_once()
    _, kwargs = hass.config_entries.flow.async_init.call_args
    assert kwargs["data"][CONF_TARGET_ENTITY] == "sensor.dummy_placeholder"


@pytest.mark.asyncio
async def test_repair_derives_name_from_prefix_when_missing(tmp_path):
    """If meta has no 'name', it is derived from prefix."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_garage_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_garage_",
        CONF_PRESET: "thermostat",
        CONF_TARGET_ENTITY: "climate.garage",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)

    hass.config_entries.flow.async_init.assert_called_once()
    _, kwargs = hass.config_entries.flow.async_init.call_args
    assert kwargs["data"][CONF_NAME]


@pytest.mark.asyncio
async def test_repair_defaults_preset_to_thermostat_when_missing(tmp_path):
    """preset defaults to 'thermostat' when absent."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_hall_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_hall_",
        CONF_NAME: "Hall",
        CONF_TARGET_ENTITY: "climate.hall",
    })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)

    hass.config_entries.flow.async_init.assert_called_once()
    _, kwargs = hass.config_entries.flow.async_init.call_args
    assert kwargs["data"][CONF_PRESET] == "thermostat"


@pytest.mark.asyncio
async def test_repair_handles_exception_during_file_read(tmp_path, caplog):
    """Loop continues if file read fails."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    (profiles_dir / "cronostar_thermostat_bad_data.json").write_text("{ BAD }", encoding="utf-8")
    _write_profile(profiles_dir, "cronostar_thermostat_good_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_good_",
        CONF_PRESET: "thermostat",
        CONF_NAME: "Good",
        CONF_TARGET_ENTITY: "climate.good",
    })

    hass = _make_hass_for_repair(profiles_dir)
    with caplog.at_level(logging.ERROR, logger="custom_components.cronostar"):
        await _async_repair_entries(hass)

    assert "Failed to repair" in caplog.text or "❌" in caplog.text
    hass.config_entries.flow.async_init.assert_called_once()


@pytest.mark.asyncio
async def test_repair_processes_multiple_orphaned_profiles(tmp_path):
    """Repair multiple profiles."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    for i in range(3):
        _write_profile(profiles_dir, f"cronostar_thermostat_zone{i}_data.json", meta={
            CONF_GLOBAL_PREFIX: f"cronostar_thermostat_zone{i}_",
            CONF_PRESET: "thermostat",
            CONF_NAME: f"Zone {i}",
            CONF_TARGET_ENTITY: f"climate.zone{i}",
        })

    hass = _make_hass_for_repair(profiles_dir)
    await _async_repair_entries(hass)
    assert hass.config_entries.flow.async_init.call_count == 3


@pytest.mark.asyncio
async def test_repair_existing_entry_without_prefix_does_not_block(tmp_path):
    """Component entry without prefix doesn't block repair."""
    profiles_dir = tmp_path / "cronostar"
    profiles_dir.mkdir(parents=True)

    _write_profile(profiles_dir, "cronostar_thermostat_office_data.json", meta={
        CONF_GLOBAL_PREFIX: "cronostar_thermostat_office_",
        CONF_PRESET: "thermostat",
        CONF_NAME: "Office",
        CONF_TARGET_ENTITY: "climate.office",
    })

    component_entry = MagicMock()
    component_entry.data = {"component_installed": True}

    hass = _make_hass_for_repair(profiles_dir, existing_entries=[component_entry])
    await _async_repair_entries(hass)
    hass.config_entries.flow.async_init.assert_called_once()
