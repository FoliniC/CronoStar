"""Test Storage Manager - Full Coverage."""
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def enable_event_loop_debug():
    """Mock per evitare RuntimeError su Python 3.13."""
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_hass(tmp_path):
    hass = MagicMock()
    hass.config.path = MagicMock(return_value=str(tmp_path))

    async def fake_executor(func, *args):
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor
    return hass


def _make_storage(hass, tmp_path, enable_backups=False):
    from custom_components.cronostar.storage.storage_manager import StorageManager
    return StorageManager(hass, tmp_path / "profiles", enable_backups=enable_backups)


def _write_container(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_storage_manager_init(tmp_path):
    """Test inizializzazione StorageManager."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    assert storage.profiles_dir.exists()
    assert storage.enable_backups is False


# ---------------------------------------------------------------------------
# save_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_save_profile_creates_new_file(tmp_path):
    """Test salvataggio profilo crea il file JSON."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value="cronostar_thermostat_k_.json",
    ):
        ok = await storage.save_profile(
            profile_name="Comfort",
            preset_type="thermostat",
            profile_data={"schedule": [{"time": "08:00", "value": 21.0}]},
            metadata={"min_value": 15.0, "max_value": 30.0},
            global_prefix="cronostar_thermostat_k_",
        )

    assert ok is True
    saved_file = storage.profiles_dir / "cronostar_thermostat_k_.json"
    assert saved_file.exists()
    data = json.loads(saved_file.read_text())
    assert "Comfort" in data["profiles"]


@pytest.mark.anyio
async def test_save_profile_updates_existing(tmp_path):
    """Test che il salvataggio aggiorni un profilo esistente."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    existing = {
        "meta": {"preset_type": "thermostat"},
        "profiles": {"Eco": {"schedule": []}},
    }
    _write_container(storage.profiles_dir / filename, existing)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        await storage.save_profile(
            profile_name="Comfort",
            preset_type="thermostat",
            profile_data={"schedule": []},
            metadata={},
            global_prefix="cronostar_thermostat_k_",
        )

    data = json.loads((storage.profiles_dir / filename).read_text())
    assert "Eco" in data["profiles"]
    assert "Comfort" in data["profiles"]


@pytest.mark.anyio
async def test_save_profile_with_backup(tmp_path):
    """Test salvataggio con backup abilitato."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path, enable_backups=True)

    filename = "cronostar_thermostat_k_.json"
    existing = {"meta": {}, "profiles": {}}
    _write_container(storage.profiles_dir / filename, existing)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        ok = await storage.save_profile(
            profile_name="Comfort",
            preset_type="thermostat",
            profile_data={"schedule": []},
            metadata={},
            global_prefix="cronostar_thermostat_k_",
        )

    assert ok is True
    backup_dir = storage.profiles_dir / "backups"
    assert backup_dir.exists()
    backups = list(backup_dir.glob("*.json"))
    assert len(backups) >= 1


@pytest.mark.anyio
async def test_save_profile_exception_returns_false(tmp_path):
    """Test che save_profile restituisca False in caso di eccezione."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        side_effect=Exception("filename error"),
    ):
        ok = await storage.save_profile(
            profile_name="X",
            preset_type="thermostat",
            profile_data={},
            metadata={},
        )

    assert ok is False


@pytest.mark.anyio
async def test_save_profile_stores_entity_info(tmp_path):
    """Test che le entity info vengano salvate nel profilo."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    metadata = {
        "enabled_entity": "switch.enabled",
        "profiles_select_entity": "select.profile",
        "target_entity": "climate.kitchen",
    }

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value="cronostar_thermostat_k_.json",
    ):
        await storage.save_profile(
            profile_name="Test",
            preset_type="thermostat",
            profile_data={"schedule": []},
            metadata=metadata,
            global_prefix="cronostar_thermostat_k_",
        )

    data = json.loads((storage.profiles_dir / "cronostar_thermostat_k_.json").read_text())
    profile = data["profiles"]["Test"]
    assert profile["enabled_entity"] == "switch.enabled"
    assert "climate.kitchen" in profile["entities"]


# ---------------------------------------------------------------------------
# load_profile_cached
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_load_profile_cached_first_load(tmp_path):
    """Test caricamento iniziale dal disco."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {"preset_type": "thermostat"}, "profiles": {"Comfort": {"schedule": []}}}
    _write_container(storage.profiles_dir / filename, container)

    result = await storage.load_profile_cached(filename)
    assert result is not None
    assert "Comfort" in result.get("profiles", {})


@pytest.mark.anyio
async def test_load_profile_cached_uses_cache(tmp_path):
    """Test che la cache venga usata alla seconda chiamata."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"A": {}}}
    _write_container(storage.profiles_dir / filename, container)

    result1 = await storage.load_profile_cached(filename)
    result2 = await storage.load_profile_cached(filename)
    assert result1 is result2   # stessa istanza dalla cache


@pytest.mark.anyio
async def test_load_profile_cached_force_reload(tmp_path):
    """Test force_reload bypassa la cache."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"A": {}}}
    _write_container(storage.profiles_dir / filename, container)

    await storage.load_profile_cached(filename)
    # Modifica il file sul disco
    container["profiles"]["B"] = {}
    _write_container(storage.profiles_dir / filename, container)

    result2 = await storage.load_profile_cached(filename, force_reload=True)
    assert "B" in result2.get("profiles", {})


@pytest.mark.anyio
async def test_load_profile_cached_missing_file(tmp_path):
    """Test caricamento di un file non esistente restituisce dict vuoto."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    result = await storage.load_profile_cached("nonexistent.json")
    assert result == {}


# ---------------------------------------------------------------------------
# delete_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_profile_success(tmp_path):
    """Test cancellazione profilo con successo."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"Comfort": {"schedule": []}, "Eco": {"schedule": []}}}
    _write_container(storage.profiles_dir / filename, container)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        ok = await storage.delete_profile("Comfort", "thermostat", "cronostar_thermostat_k_")

    assert ok is True
    data = json.loads((storage.profiles_dir / filename).read_text())
    assert "Comfort" not in data["profiles"]
    assert "Eco" in data["profiles"]


@pytest.mark.anyio
async def test_delete_profile_deletes_empty_container(tmp_path):
    """Test che il file venga eliminato se diventa vuoto."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"Solo": {"schedule": []}}}
    _write_container(storage.profiles_dir / filename, container)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        ok = await storage.delete_profile("Solo", "thermostat", "cronostar_thermostat_k_")

    assert ok is True
    assert not (storage.profiles_dir / filename).exists()


@pytest.mark.anyio
async def test_delete_profile_not_found(tmp_path):
    """Test cancellazione profilo non trovato."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"Comfort": {}}}
    _write_container(storage.profiles_dir / filename, container)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        ok = await storage.delete_profile("Ghost", "thermostat", "cronostar_thermostat_k_")

    assert ok is False


@pytest.mark.anyio
async def test_delete_profile_missing_container(tmp_path):
    """Test cancellazione quando il container non esiste."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value="nonexistent.json",
    ):
        ok = await storage.delete_profile("X", "thermostat", "prefix_")

    assert ok is False


@pytest.mark.anyio
async def test_delete_profile_exception(tmp_path):
    """Test che delete_profile restituisca False in caso di eccezione."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        side_effect=Exception("error"),
    ):
        ok = await storage.delete_profile("X", "thermostat", "prefix_")

    assert ok is False


# ---------------------------------------------------------------------------
# list_profiles
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_profiles_no_filter(tmp_path):
    """Test lista profili senza filtri."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    for name in ["cronostar_thermostat_k_.json", "cronostar_ev_charging_g_.json"]:
        _write_container(storage.profiles_dir / name, {"meta": {}, "profiles": {}})

    result = await storage.list_profiles()
    assert len(result) == 2


@pytest.mark.anyio
async def test_list_profiles_filter_by_preset(tmp_path):
    """Test lista profili filtrata per preset."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    _write_container(
        storage.profiles_dir / "cronostar_thermostat_k_.json",
        {"meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"}, "profiles": {}},
    )
    _write_container(
        storage.profiles_dir / "cronostar_ev_charging_g_.json",
        {"meta": {"preset_type": "ev_charging", "global_prefix": "cronostar_ev_charging_g_"}, "profiles": {}},
    )

    result = await storage.list_profiles(preset_type="thermostat")
    assert len(result) == 1
    assert "thermostat" in result[0]


@pytest.mark.anyio
async def test_list_profiles_empty_dir(tmp_path):
    """Test lista profili con directory vuota."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)
    result = await storage.list_profiles()
    assert result == []


@pytest.mark.anyio
async def test_list_profiles_exception(tmp_path):
    """Test che list_profiles restituisca lista vuota in caso di eccezione.

    Non è possibile fare patch.object su PosixPath.glob (read-only), quindi
    simuliamo il fallimento rendendo il metodo async_add_executor_job problematico.
    """
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    async def failing_executor(func, *args):
        raise OSError("glob error")

    hass.async_add_executor_job = failing_executor

    result = await storage.list_profiles()
    assert result == []


# ---------------------------------------------------------------------------
# get_profile_list
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_get_profile_list_success(tmp_path):
    """Test lista nomi profili per un container."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {"Comfort": {}, "Eco": {}}}
    _write_container(storage.profiles_dir / filename, container)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value=filename,
    ):
        result = await storage.get_profile_list("thermostat", "cronostar_thermostat_k_")

    assert set(result) == {"Comfort", "Eco"}


@pytest.mark.anyio
async def test_get_profile_list_missing_container(tmp_path):
    """Test lista profili con container mancante."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.storage.storage_manager.build_profile_filename",
        return_value="nonexistent.json",
    ):
        result = await storage.get_profile_list("thermostat")

    assert result == []


# ---------------------------------------------------------------------------
# clear_cache
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_clear_cache(tmp_path):
    """Test pulizia cache."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    # Popola la cache manualmente
    storage._cache["test.json"] = {"meta": {}, "profiles": {}}
    storage._cache_mtimes["test.json"] = 12345.0

    await storage.clear_cache()

    assert storage._cache == {}
    assert storage._cache_mtimes == {}


# ---------------------------------------------------------------------------
# get_cached_containers
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_get_cached_containers_no_filter(tmp_path):
    """Test recupero container dalla cache senza filtri."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    storage._cache["file1.json"] = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {},
    }

    result = await storage.get_cached_containers()
    assert len(result) == 1


@pytest.mark.anyio
async def test_get_cached_containers_filter_preset(tmp_path):
    """Test filtro per preset."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    storage._cache["f1.json"] = {"meta": {"preset_type": "thermostat"}, "profiles": {}}
    storage._cache["f2.json"] = {"meta": {"preset_type": "ev_charging"}, "profiles": {}}

    result = await storage.get_cached_containers(preset_type="thermostat")
    assert len(result) == 1
    assert result[0][0] == "f1.json"


@pytest.mark.anyio
async def test_get_cached_containers_filter_prefix(tmp_path):
    """Test filtro per global_prefix."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    storage._cache["f1.json"] = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {},
    }
    storage._cache["f2.json"] = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_g_"},
        "profiles": {},
    }

    result = await storage.get_cached_containers(global_prefix="cronostar_thermostat_k_")
    assert len(result) == 1


@pytest.mark.anyio
async def test_get_cached_containers_skips_non_dict(tmp_path):
    """Test che elementi non-dict vengano ignorati."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    storage._cache["bad.json"] = "not a dict"
    storage._cache["good.json"] = {"meta": {}, "profiles": {}}

    result = await storage.get_cached_containers()
    assert len(result) == 1


# ---------------------------------------------------------------------------
# update_active_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_update_active_profile_success(tmp_path):
    """Test aggiornamento profilo attivo.

    build_profile_filename in update_active_profile è importato localmente
    (from ..utils.filename_builder import build_profile_filename), quindi
    va patchato nel modulo originale.
    """
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filename = "cronostar_thermostat_k_.json"
    container = {"meta": {}, "profiles": {}}
    _write_container(storage.profiles_dir / filename, container)

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value=filename,
    ):
        ok = await storage.update_active_profile("thermostat", "cronostar_thermostat_k_", "Comfort")

    assert ok is True
    data = json.loads((storage.profiles_dir / filename).read_text())
    assert data["meta"]["last_active_profile"] == "Comfort"


@pytest.mark.anyio
async def test_update_active_profile_missing_container(tmp_path):
    """Test aggiornamento profilo attivo con container mancante."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        return_value="nonexistent.json",
    ):
        ok = await storage.update_active_profile("thermostat", "prefix_", "Comfort")

    assert ok is False


@pytest.mark.anyio
async def test_update_active_profile_exception(tmp_path):
    """Test che update_active_profile restituisca False in caso di eccezione."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    with patch(
        "custom_components.cronostar.utils.filename_builder.build_profile_filename",
        side_effect=Exception("error"),
    ):
        ok = await storage.update_active_profile("thermostat", "prefix_", "Comfort")

    assert ok is False


# ---------------------------------------------------------------------------
# _load_container
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_load_container_valid_json(tmp_path):
    """Test caricamento container JSON valido."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filepath = storage.profiles_dir / "test.json"
    data = {"meta": {"preset_type": "thermostat"}, "profiles": {}}
    _write_container(filepath, data)

    result = await storage._load_container(filepath)
    assert result["meta"]["preset_type"] == "thermostat"


@pytest.mark.anyio
async def test_load_container_missing_file(tmp_path):
    """Test caricamento container con file mancante."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    result = await storage._load_container(storage.profiles_dir / "nonexistent.json")
    assert result == {}


@pytest.mark.anyio
async def test_load_container_invalid_json(tmp_path):
    """Test caricamento container con JSON non valido."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filepath = storage.profiles_dir / "bad.json"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text("{ invalid json }", encoding="utf-8")

    result = await storage._load_container(filepath)
    assert result == {}


@pytest.mark.anyio
async def test_load_container_non_dict_json(tmp_path):
    """Test caricamento container con JSON che non è un dizionario."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filepath = storage.profiles_dir / "list.json"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text("[1, 2, 3]", encoding="utf-8")

    result = await storage._load_container(filepath)
    assert result == {}


# ---------------------------------------------------------------------------
# _write_json
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_write_json_success(tmp_path):
    """Test scrittura JSON su disco."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filepath = storage.profiles_dir / "out.json"
    await storage._write_json(filepath, {"key": "value"})

    assert filepath.exists()
    assert json.loads(filepath.read_text())["key"] == "value"


@pytest.mark.anyio
async def test_write_json_exception_propagates(tmp_path):
    """Test che _write_json propaghi le eccezioni."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    filepath = storage.profiles_dir / "out.json"

    async def fail_executor(func, *args):
        raise OSError("disk full")

    hass.async_add_executor_job = fail_executor

    with pytest.raises(OSError):
        await storage._write_json(filepath, {"key": "value"})


# ---------------------------------------------------------------------------
# _create_backup e _cleanup_old_backups
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_create_backup_creates_file(tmp_path):
    """Test che _create_backup crei il file di backup."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path, enable_backups=True)

    source = storage.profiles_dir / "cronostar_thermostat_k_.json"
    _write_container(source, {"meta": {}, "profiles": {}})

    await storage._create_backup(source)

    backup_dir = storage.profiles_dir / "backups"
    assert backup_dir.exists()
    backups = list(backup_dir.glob("*.json"))
    assert len(backups) == 1


@pytest.mark.anyio
async def test_create_backup_missing_source(tmp_path):
    """Test che _create_backup gestisca file sorgente mancante senza crash."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    source = storage.profiles_dir / "missing.json"
    # File non esiste: backup fallisce silenziosamente
    await storage._create_backup(source)


@pytest.mark.anyio
async def test_cleanup_old_backups_keeps_last_10(tmp_path):
    """Test che _cleanup_old_backups mantenga solo gli ultimi 10 backup."""
    hass = _make_hass(tmp_path)
    storage = _make_storage(hass, tmp_path)

    backup_dir = storage.profiles_dir / "backups"
    backup_dir.mkdir(parents=True)

    stem = "cronostar_thermostat_k_"
    for i in range(15):
        f = backup_dir / f"{stem}_backup_2024010{i:02d}_120000.json"
        f.write_text("{}", encoding="utf-8")

    await storage._cleanup_old_backups(stem)

    remaining = list(backup_dir.glob(f"{stem}_backup_*.json"))
    assert len(remaining) == 10


# load_all_profiles test rimosso perché la funzionalità è stata deprecata o spostata

