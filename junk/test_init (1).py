"""Test Component Initialization - Full Coverage."""
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, mock_open, patch

import pytest

from custom_components.cronostar import (
    async_reload_entry,
    async_remove_entry,
    async_setup,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.cronostar.const import DOMAIN


@pytest.fixture(autouse=True)
def enable_event_loop_debug():
    """Mock per evitare RuntimeError su Python 3.13."""
    pass


# ---------------------------------------------------------------------------
# async_setup
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_setup_success(hass):
    """Test YAML setup completa con successo."""
    with patch("custom_components.cronostar.async_setup_integration", return_value=True):
        success = await async_setup(hass, {})
        assert success is True
        assert hass.data[DOMAIN]["_global_setup_done"] is True


@pytest.mark.anyio
async def test_async_setup_already_done(hass):
    """Test che async_setup non re-esegua il global setup se già completato."""
    hass.data[DOMAIN] = {"_global_setup_done": True}
    with patch("custom_components.cronostar.async_setup_integration") as mock_setup:
        success = await async_setup(hass, {})
        assert success is True
        mock_setup.assert_not_called()


@pytest.mark.anyio
async def test_async_setup_integration_raises(hass):
    """Test che async_setup continui anche se async_setup_integration lancia eccezione."""
    with patch(
        "custom_components.cronostar.async_setup_integration",
        side_effect=Exception("boom"),
    ):
        success = await async_setup(hass, {})
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


@pytest.mark.anyio
async def test_async_setup_entry_global_success(hass):
    """Test setup entry globale con successo."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "CronoStar [v1.2.3]"
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=True), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock("1.2.3"),
         ):
        success = await async_setup_entry(hass, entry)
        assert success is True


@pytest.mark.anyio
async def test_async_setup_entry_global_title_update(hass):
    """Test che il titolo venga aggiornato se non contiene la versione corretta."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "CronoStar"           # titolo senza versione
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=True), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock("1.2.3"),
         ):
        success = await async_setup_entry(hass, entry)
        assert success is True
        hass.config_entries.async_update_entry.assert_called()


@pytest.mark.anyio
async def test_async_setup_entry_global_failure(hass):
    """Test fallimento del global setup."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.options = {}

    with patch("custom_components.cronostar.async_setup_integration", return_value=False), \
         patch(
             "custom_components.cronostar.async_get_integration",
             return_value=_make_integration_mock(),
         ):
        success = await async_setup_entry(hass, entry)
        assert success is False


@pytest.mark.anyio
async def test_async_setup_entry_global_stores_config(hass):
    """Test che la config globale venga salvata in hass.data."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "CronoStar [v1.0.0]"
    entry.options = {
        "logging_enabled": True,
        "frontend_version_check": False,
        "language": "it",
    }

    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ):
        success = await async_setup_entry(hass, entry)
        assert success is True
        cfg = hass.data[DOMAIN].get("global_config", {})
        assert cfg.get("logging_enabled") is True
        assert cfg.get("frontend_version_check") is False
        assert cfg.get("language") == "it"


# ---------------------------------------------------------------------------
# async_setup_entry - Controller Entry
# ---------------------------------------------------------------------------

def _controller_entry(data=None, title="Kitchen [v1.0.0]"):
    entry = MagicMock()
    entry.data = data or {
        "name": "Kitchen",
        "preset_type": "thermostat",
        "target_entity": "climate.kitchen",
        "global_prefix": "cronostar_thermostat_kitchen_",
    }
    entry.title = title
    entry.entry_id = "ctrl_entry_id"
    entry.options = {}
    return entry


@pytest.mark.anyio
async def test_async_setup_entry_controller_success(hass):
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

        success = await async_setup_entry(hass, entry)
        assert success is True
        assert entry.runtime_data is mock_coord
        hass.config_entries.async_forward_entry_setups.assert_called_once()


@pytest.mark.anyio
async def test_async_setup_entry_controller_title_update(hass):
    """Test che il titolo controller venga aggiornato con la versione."""
    entry = _controller_entry(title="Kitchen")   # nessuna versione nel titolo
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("2.0.0"),
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        await async_setup_entry(hass, entry)
        hass.config_entries.async_update_entry.assert_called()


@pytest.mark.anyio
async def test_async_setup_entry_controller_legacy_preset_migration(hass):
    """Test migrazione legacy 'preset' -> 'preset_type'.

    async_update_entry su un MagicMock non aggiorna entry.data automaticamente;
    simuliamo il comportamento reale di HA tramite side_effect che modifica
    entry.data in-place, come fa il vero ConfigEntries.async_update_entry.
    """
    entry = _controller_entry(data={
        "name": "Kitchen",
        "preset": "thermostat",           # chiave legacy
        "target_entity": "climate.kitchen",
        "global_prefix": "cronostar_thermostat_kitchen_",
    })
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    def _simulate_update_entry(e, **kwargs):
        """Simula il comportamento reale di HA: aggiorna entry.data in-place."""
        if "data" in kwargs:
            # Sostituiamo il dict originale con quello aggiornato
            e.data = kwargs["data"]
        if "title" in kwargs:
            e.title = kwargs["title"]

    hass.config_entries.async_update_entry.side_effect = _simulate_update_entry

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        success = await async_setup_entry(hass, entry)

    # async_update_entry deve essere stato chiamato per la migrazione
    hass.config_entries.async_update_entry.assert_called()
    assert success is True
    # entry.data ora deve contenere preset_type (non più la chiave legacy preset)
    assert "preset_type" in entry.data
    assert "preset" not in entry.data


@pytest.mark.anyio
async def test_async_setup_entry_controller_missing_fields(hass):
    """Test fallimento setup se mancano campi obbligatori."""
    entry = _controller_entry(data={
        "global_prefix": "cronostar_thermostat_kitchen_",
        # name, preset_type, target_entity mancanti
    })
    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ):
        success = await async_setup_entry(hass, entry)
        assert success is False


@pytest.mark.anyio
async def test_async_setup_entry_controller_lazy_global_init(hass):
    """Test che il global setup venga eseguito in modo lazy per un controller."""
    entry = _controller_entry()
    hass.data[DOMAIN] = {}   # _global_setup_done assente
    hass.config_entries.async_forward_entry_setups = AsyncMock()

    with patch(
        "custom_components.cronostar.async_get_integration",
        return_value=_make_integration_mock("1.0.0"),
    ), patch(
        "custom_components.cronostar.async_setup_integration",
        return_value=True,
    ), patch("custom_components.cronostar.CronoStarCoordinator") as mock_cls:
        mock_cls.return_value.async_initialize = AsyncMock()
        success = await async_setup_entry(hass, entry)
        assert success is True
        assert hass.data[DOMAIN].get("_global_setup_done") is True


# ---------------------------------------------------------------------------
# async_unload_entry
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_unload_entry_global(hass):
    """Test unload entry globale."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"
    hass.data[DOMAIN] = {"_global_setup_done": True}
    hass.config_entries.async_unload_platforms = AsyncMock(return_value=True)

    with patch("homeassistant.components.frontend.async_remove_panel"):
        success = await async_unload_entry(hass, entry)
        assert success is True
        assert DOMAIN not in hass.data


@pytest.mark.anyio
async def test_async_unload_entry_global_panel_removal_fails(hass):
    """Test unload globale anche se la rimozione del panel fallisce."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"
    hass.data[DOMAIN] = {"_global_setup_done": True}

    with patch(
        "homeassistant.components.frontend.async_remove_panel",
        side_effect=Exception("panel error"),
    ):
        success = await async_unload_entry(hass, entry)
        assert success is True


@pytest.mark.anyio
async def test_async_unload_entry_controller_success(hass):
    """Test unload entry controller (non globale)."""
    entry = MagicMock()
    entry.data = {"name": "Kitchen", "preset_type": "thermostat", "target_entity": "climate.k"}
    entry.title = "Kitchen"
    hass.config_entries.async_unload_platforms = AsyncMock(return_value=True)

    success = await async_unload_entry(hass, entry)
    assert success is True
    hass.config_entries.async_unload_platforms.assert_called_once()


@pytest.mark.anyio
async def test_async_unload_entry_controller_failure(hass):
    """Test unload controller che fallisce."""
    entry = MagicMock()
    entry.data = {"name": "Kitchen", "preset_type": "thermostat", "target_entity": "climate.k"}
    hass.config_entries.async_unload_platforms = AsyncMock(side_effect=Exception("unload error"))

    success = await async_unload_entry(hass, entry)
    assert success is False


# ---------------------------------------------------------------------------
# async_reload_entry
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_reload_entry(hass):
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
        await async_reload_entry(hass, entry)
        mock_unload.assert_called_once_with(hass, entry)
        mock_setup.assert_called_once_with(hass, entry)


# ---------------------------------------------------------------------------
# async_remove_entry
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_remove_entry_global(hass):
    """Test rimozione entry globale (nessuna operazione su file)."""
    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.title = "Global"

    # Non deve sollevare eccezioni
    await async_remove_entry(hass, entry)


@pytest.mark.anyio
async def test_async_remove_entry_controller_no_profile_file(hass):
    """Test rimozione controller senza file profilo su disco.

    build_profile_filename è importato localmente dentro async_remove_entry,
    quindi va patchato nel modulo originale, non in __init__.
    """
    entry = MagicMock()
    entry.data = {
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    hass.config.path = MagicMock(return_value="/config/.storage/cronostar")

    async def fake_executor(func, *args):
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ), patch("pathlib.Path.exists", return_value=False):
        await async_remove_entry(hass, entry)


@pytest.mark.anyio
async def test_async_remove_entry_controller_marks_file(hass, tmp_path):
    """Test che il file venga marcato come eliminato e rinominato.

    Usa una directory temporanea reale per testare la logica I/O completa.
    """
    entry = MagicMock()
    entry.data = {
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    # Crea un file profilo reale nella tmp_path
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
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        await async_remove_entry(hass, entry)

    # Il file originale deve essere stato eliminato
    assert not profile_file.exists()
    # Deve esistere almeno un file _deleted_*.json
    deleted_files = list(profiles_dir.glob("*_deleted_*.json"))
    assert len(deleted_files) == 1

    # Il file rinominato deve contenere i metadati di cancellazione
    deleted_data = json.loads(deleted_files[0].read_text())
    assert "_deleted_at" in deleted_data.get("meta", {})
    assert deleted_data["meta"]["_deleted_entry_title"] == "Kitchen"


@pytest.mark.anyio
async def test_async_remove_entry_controller_mark_raises(hass, tmp_path):
    """Test che un errore nel marcare il file venga gestito senza crash."""
    entry = MagicMock()
    entry.data = {
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
    }
    entry.title = "Kitchen"

    profiles_dir = tmp_path / ".storage" / "cronostar"
    profiles_dir.mkdir(parents=True)
    profile_file = profiles_dir / "cronostar_thermostat_kitchen_.json"
    # Contenuto JSON non valido: il json.load dentro _mark_as_deleted lancerà eccezione
    profile_file.write_text("{ invalid json }", encoding="utf-8")

    hass.config.path = MagicMock(return_value=str(profiles_dir))

    async def fake_executor(func, *args):
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        # Non deve propagare eccezioni
        await async_remove_entry(hass, entry)


@pytest.mark.anyio
async def test_async_remove_entry_controller_missing_preset(hass):
    """Test rimozione controller senza preset_type e global_prefix."""
    entry = MagicMock()
    entry.data = {}
    entry.title = "Unknown"

    # Con dati mancanti non deve sollevare eccezioni
    await async_remove_entry(hass, entry)
