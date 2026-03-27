"""Test Profile Service - Full Coverage."""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from homeassistant.exceptions import HomeAssistantError


@pytest.fixture(autouse=True)
def enable_event_loop_debug():
    """Mock per evitare RuntimeError su Python 3.13."""
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_hass():
    hass = MagicMock()
    hass.data = {"cronostar": {}}
    hass.states = MagicMock()
    hass.states.get = MagicMock(return_value=None)
    hass.states.async_all = MagicMock(return_value=[])
    hass.config_entries.async_entries = MagicMock(return_value=[])
    hass.config_entries.flow = MagicMock()
    hass.config_entries.flow.async_init = AsyncMock()
    hass.services.async_call = AsyncMock()
    hass.is_running = True

    async def fake_executor(func, *args):
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor
    hass.config.path = MagicMock(return_value="/config")
    return hass


def _make_storage():
    storage = MagicMock()
    storage.save_profile = AsyncMock(return_value=True)
    storage.delete_profile = AsyncMock(return_value=True)
    storage.delete_controller_files = AsyncMock(return_value=True)
    storage.get_cached_containers = AsyncMock(return_value=[])
    storage.list_profiles = AsyncMock(return_value=[])
    storage.load_profile_cached = AsyncMock(return_value=None)
    storage._cache_lock = MagicMock()
    storage._cache_lock.__aenter__ = AsyncMock(return_value=None)
    storage._cache_lock.__aexit__ = AsyncMock(return_value=None)
    storage._cache = {}
    storage.profiles_dir = MagicMock()
    storage.profiles_dir.__truediv__ = MagicMock()
    return storage


def _make_settings():
    settings = MagicMock()
    settings.load_settings = AsyncMock(return_value={})
    settings.save_settings = AsyncMock()
    return settings


def _make_service(hass=None, storage=None, settings=None):
    from custom_components.cronostar.services.profile_service import ProfileService
    h = hass or _make_hass()
    s = storage or _make_storage()
    st = settings or _make_settings()
    return ProfileService(h, s, st), h, s, st


def _make_call(data: dict):
    call = MagicMock()
    call.data = data
    return call


# ---------------------------------------------------------------------------
# add_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_add_profile_success(hass):
    """Test aggiunta profilo con successo."""
    svc, h, storage, _ = _make_service(hass=hass)
    call = _make_call({"profile_name": "Eco", "preset_type": "thermostat", "global_prefix": "cronostar_thermostat_kitchen_"})

    await svc.add_profile(call)
    storage.save_profile.assert_called_once()


@pytest.mark.anyio
async def test_add_profile_missing_name(hass):
    """Test che add_profile lanci HomeAssistantError se profile_name mancante."""
    svc, h, storage, _ = _make_service(hass=hass)
    call = _make_call({"preset_type": "thermostat"})

    with pytest.raises(HomeAssistantError, match="profile_name"):
        await svc.add_profile(call)


@pytest.mark.anyio
async def test_add_profile_notifies_coordinators(hass):
    """Test che add_profile notifichi i coordinatori."""
    svc, h, storage, _ = _make_service(hass=hass)

    mock_entry = MagicMock()
    mock_entry.data = {"global_prefix": "cronostar_thermostat_kitchen_"}
    mock_coord = MagicMock()
    mock_coord.async_refresh_profiles = AsyncMock()
    mock_entry.runtime_data = mock_coord
    h.config_entries.async_entries = MagicMock(return_value=[mock_entry])

    call = _make_call({"profile_name": "Eco", "preset_type": "thermostat", "global_prefix": "cronostar_thermostat_kitchen_"})
    await svc.add_profile(call)
    mock_coord.async_refresh_profiles.assert_called_once()


@pytest.mark.anyio
async def test_add_profile_storage_exception(hass):
    """Test che add_profile gestisca eccezioni dello storage."""
    svc, h, storage, _ = _make_service(hass=hass)
    storage.save_profile = AsyncMock(side_effect=Exception("disk error"))
    call = _make_call({"profile_name": "Eco", "preset_type": "thermostat"})

    with pytest.raises(HomeAssistantError):
        await svc.add_profile(call)


# ---------------------------------------------------------------------------
# save_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_save_profile_with_schedule(hass):
    """Test salvataggio profilo con schedule valida."""
    svc, h, storage, _ = _make_service(hass=hass)
    call = _make_call({
        "profile_name": "Comfort",
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
        "schedule": [{"time": "08:00", "value": 21.0}, {"time": "22:00", "value": 18.0}],
        "meta": {"min_value": 15.0, "max_value": 30.0},
    })

    await svc.save_profile(call)
    storage.save_profile.assert_called_once()


@pytest.mark.anyio
async def test_save_profile_metadata_only(hass):
    """Test salvataggio solo metadati (no schedule)."""
    svc, h, storage, _ = _make_service(hass=hass)
    # get_profile_data restituisce un profilo esistente
    existing = {"schedule": [{"time": "08:00", "value": 20.0}], "meta": {}}
    with patch.object(svc, "get_profile_data", AsyncMock(return_value=existing)):
        call = _make_call({
            "profile_name": "Comfort",
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_kitchen_",
        })
        await svc.save_profile(call)
        storage.save_profile.assert_called_once()


@pytest.mark.anyio
async def test_save_profile_metadata_only_new_profile(hass):
    """Test salvataggio metadati per profilo nuovo (get_profile_data restituisce errore)."""
    svc, h, storage, _ = _make_service(hass=hass)
    with patch.object(svc, "get_profile_data", AsyncMock(return_value={"error": "not found"})):
        call = _make_call({
            "profile_name": "Nuova",
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_kitchen_",
        })
        await svc.save_profile(call)
        storage.save_profile.assert_called_once()


@pytest.mark.anyio
async def test_save_profile_missing_name(hass):
    """Test che save_profile lanci HomeAssistantError se profile_name mancante."""
    svc, h, _, _ = _make_service(hass=hass)
    call = _make_call({"preset_type": "thermostat"})

    with pytest.raises(HomeAssistantError, match="profile_name"):
        await svc.save_profile(call)


@pytest.mark.anyio
async def test_save_profile_updates_config_entry(hass):
    """Test che save_profile aggiorni la config entry se i metadati cambiano."""
    svc, h, storage, _ = _make_service(hass=hass)

    mock_entry = MagicMock()
    mock_entry.data = {
        "global_prefix": "cronostar_thermostat_kitchen_",
        "target_entity": "climate.old",
    }
    mock_coord = MagicMock()
    mock_coord.async_refresh_profiles = AsyncMock()
    mock_entry.runtime_data = mock_coord
    h.config_entries.async_entries = MagicMock(return_value=[mock_entry])

    call = _make_call({
        "profile_name": "Comfort",
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
        "schedule": [{"time": "08:00", "value": 21.0}],
        "meta": {"target_entity": "climate.new"},
    })
    await svc.save_profile(call)
    h.config_entries.async_update_entry.assert_called()


# ---------------------------------------------------------------------------
# load_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_load_profile_found(hass):
    """Test caricamento profilo trovato."""
    svc, h, _, _ = _make_service(hass=hass)
    expected = {"profile_name": "Comfort", "schedule": [], "meta": {}}
    with patch.object(svc, "get_profile_data", AsyncMock(return_value=expected)):
        call = _make_call({"profile_name": "Comfort", "preset_type": "thermostat"})
        result = await svc.load_profile(call)
        assert result["profile_name"] == "Comfort"


@pytest.mark.anyio
async def test_load_profile_not_found(hass):
    """Test caricamento profilo non trovato."""
    svc, h, _, _ = _make_service(hass=hass)
    with patch.object(svc, "get_profile_data", AsyncMock(return_value={"error": "Profile not found"})):
        call = _make_call({"profile_name": "Ghost", "preset_type": "thermostat"})
        result = await svc.load_profile(call)
        assert "error" in result


@pytest.mark.anyio
async def test_load_profile_missing_name(hass):
    """Test caricamento senza profile_name."""
    svc, h, _, _ = _make_service(hass=hass)
    call = _make_call({"preset_type": "thermostat"})
    result = await svc.load_profile(call)
    assert result.get("error") == "profile_name is required"


@pytest.mark.anyio
async def test_load_profile_exception(hass):
    """Test che load_profile gestisca eccezioni."""
    svc, h, _, _ = _make_service(hass=hass)
    with patch.object(svc, "get_profile_data", AsyncMock(side_effect=Exception("boom"))):
        call = _make_call({"profile_name": "Comfort", "preset_type": "thermostat"})
        result = await svc.load_profile(call)
        assert "error" in result


# ---------------------------------------------------------------------------
# get_profile_data
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_get_profile_data_exact_match(hass):
    """Test corrispondenza esatta per nome profilo."""
    svc, h, storage, _ = _make_service(hass=hass)

    container = {
        "meta": {
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_kitchen_",
            "min_value": 15.0,
            "max_value": 30.0,
        },
        "profiles": {
            "Comfort": {"schedule": [{"time": "08:00", "value": 21.0}]},
        },
    }
    storage.get_cached_containers = AsyncMock(return_value=[("file.json", container)])

    result = await svc.get_profile_data("Comfort", "thermostat", "cronostar_thermostat_kitchen_")
    assert result["profile_name"] == "Comfort"
    assert result["schedule"] == [{"time": "08:00", "value": 21.0}]


@pytest.mark.anyio
async def test_get_profile_data_case_insensitive(hass):
    """Test corrispondenza case-insensitive."""
    svc, h, storage, _ = _make_service(hass=hass)

    container = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {"Comfort": {"schedule": []}},
    }
    storage.get_cached_containers = AsyncMock(return_value=[("file.json", container)])

    result = await svc.get_profile_data("comfort", "thermostat", "cronostar_thermostat_k_")
    assert result["profile_name"] == "Comfort"


@pytest.mark.anyio
async def test_get_profile_data_fallback_to_default(hass):
    """Test fallback al profilo Default."""
    svc, h, storage, _ = _make_service(hass=hass)

    container = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {"Default": {"schedule": [{"time": "00:00", "value": 18.0}]}},
    }
    storage.get_cached_containers = AsyncMock(return_value=[("file.json", container)])

    result = await svc.get_profile_data("NonExistent", "thermostat", "cronostar_thermostat_k_")
    assert result["profile_name"] == "Default"


@pytest.mark.anyio
async def test_get_profile_data_fallback_to_comfort(hass):
    """Test fallback al profilo Comfort."""
    svc, h, storage, _ = _make_service(hass=hass)

    container = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {"Comfort": {"schedule": []}},
    }
    storage.get_cached_containers = AsyncMock(return_value=[("file.json", container)])

    result = await svc.get_profile_data("NonExistent", "thermostat", "cronostar_thermostat_k_")
    assert result["profile_name"] == "Comfort"


@pytest.mark.anyio
async def test_get_profile_data_not_found_returns_diagnostics(hass):
    """Test che diagnostics vengano restituiti se il profilo non è trovato."""
    svc, h, storage, _ = _make_service(hass=hass)
    storage.get_cached_containers = AsyncMock(return_value=[])
    storage.get_cached_containers = AsyncMock(return_value=[])   # chiamato due volte

    result = await svc.get_profile_data("Ghost", "thermostat", "cronostar_thermostat_k_")
    assert "error" in result
    assert "searched" in result


@pytest.mark.anyio
async def test_get_profile_data_merges_entity_overrides(hass):
    """Test che gli entity overrides per-profilo vengano uniti al meta."""
    svc, h, storage, _ = _make_service(hass=hass)

    container = {
        "meta": {"preset_type": "thermostat", "global_prefix": "cronostar_thermostat_k_"},
        "profiles": {
            "Comfort": {
                "schedule": [],
                "enabled_entity": "switch.thermostat_enabled",
                "profiles_select_entity": "select.thermostat_profile",
            }
        },
    }
    storage.get_cached_containers = AsyncMock(return_value=[("file.json", container)])

    result = await svc.get_profile_data("Comfort", "thermostat", "cronostar_thermostat_k_")
    assert result["meta"].get("enabled_entity") == "switch.thermostat_enabled"
    assert result["meta"].get("profiles_select_entity") == "select.thermostat_profile"


# ---------------------------------------------------------------------------
# delete_profile
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_profile_success(hass):
    """Test cancellazione profilo con successo."""
    svc, h, storage, _ = _make_service(hass=hass)
    call = _make_call({
        "profile_name": "Comfort",
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
    })

    await svc.delete_profile(call)
    storage.delete_profile.assert_called_once()


@pytest.mark.anyio
async def test_delete_profile_missing_name(hass):
    """Test cancellazione senza profile_name."""
    svc, h, _, _ = _make_service(hass=hass)
    call = _make_call({"preset_type": "thermostat"})

    with pytest.raises(HomeAssistantError, match="profile_name"):
        await svc.delete_profile(call)


@pytest.mark.anyio
async def test_delete_profile_notifies_coordinators(hass):
    """Test che delete_profile notifichi i coordinatori."""
    svc, h, storage, _ = _make_service(hass=hass)

    mock_entry = MagicMock()
    mock_entry.data = {"global_prefix": "cronostar_thermostat_kitchen_"}
    mock_coord = MagicMock()
    mock_coord.async_refresh_profiles = AsyncMock()
    mock_entry.runtime_data = mock_coord
    h.config_entries.async_entries = MagicMock(return_value=[mock_entry])

    call = _make_call({
        "profile_name": "Comfort",
        "preset_type": "thermostat",
        "global_prefix": "cronostar_thermostat_kitchen_",
    })
    await svc.delete_profile(call)
    mock_coord.async_refresh_profiles.assert_called_once()


@pytest.mark.anyio
async def test_delete_profile_not_found_no_crash(hass):
    """Test che delete_profile non crashi se il profilo non esiste."""
    svc, h, storage, _ = _make_service(hass=hass)
    storage.delete_profile = AsyncMock(return_value=False)
    call = _make_call({"profile_name": "Ghost", "preset_type": "thermostat"})
    # Non solleva eccezione
    await svc.delete_profile(call)


# ---------------------------------------------------------------------------
# delete_controller
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_controller_with_preset(hass):
    """Test cancellazione controller con preset specificato."""
    svc, h, storage, _ = _make_service(hass=hass)

    filepath_mock = MagicMock()
    filepath_mock.exists.return_value = False
    storage.profiles_dir.__truediv__ = MagicMock(return_value=filepath_mock)

    call = _make_call({
        "global_prefix": "cronostar_thermostat_kitchen_",
        "preset_type": "thermostat",
    })

    with patch(
        "custom_components.cronostar.services.profile_service.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        await svc.delete_controller(call)


@pytest.mark.anyio
async def test_delete_controller_without_preset(hass):
    """Test cancellazione controller senza preset (ricerca per prefix)."""
    svc, h, storage, _ = _make_service(hass=hass)
    storage.list_profiles = AsyncMock(return_value=["cronostar_thermostat_kitchen_.json"])

    filepath_mock = MagicMock()
    filepath_mock.exists.return_value = False
    storage.profiles_dir.__truediv__ = MagicMock(return_value=filepath_mock)

    call = _make_call({"global_prefix": "cronostar_thermostat_kitchen_"})
    await svc.delete_controller(call)
    storage.delete_controller_files.assert_called_once_with("cronostar_thermostat_kitchen_", None)

    @pytest.mark.anyio
    async def test_delete_controller_removes_config_entry(hass):
        """Test che delete_controller rimuova la config entry."""
        svc, h, storage, _ = _make_service(hass=hass)

        mock_entry = MagicMock()
        mock_entry.data = {"global_prefix": "cronostar_thermostat_kitchen_"}
        mock_entry.entry_id = "entry123"
        mock_entry.title = "Kitchen"
        h.config_entries.async_entries = MagicMock(return_value=[mock_entry])
        h.config_entries.async_remove = AsyncMock()

        filepath_mock = MagicMock()
        filepath_mock.exists.return_value = False
        storage.profiles_dir.__truediv__ = MagicMock(return_value=filepath_mock)

        call = _make_call({
            "global_prefix": "cronostar_thermostat_kitchen_",
            "preset_type": "thermostat",
        })
        with patch(
            "custom_components.cronostar.services.profile_service.build_profile_filename",
            return_value="cronostar_thermostat_kitchen_.json",
        ):
            await svc.delete_controller(call)

        h.config_entries.async_remove.assert_called_once_with("entry123")



@pytest.mark.anyio
async def test_delete_controller_missing_prefix(hass):
    """Test che delete_controller lanci HomeAssistantError se prefix mancante."""
    svc, h, _, _ = _make_service(hass=hass)
    call = _make_call({})

    with pytest.raises(HomeAssistantError, match="global_prefix"):
        await svc.delete_controller(call)


@pytest.mark.anyio
async def test_delete_controller_deletes_existing_file(hass):
    """Test che il file venga cancellato se esiste."""
    svc, h, storage, _ = _make_service(hass=hass)

    filepath_mock = MagicMock()
    filepath_mock.exists.return_value = True
    filepath_mock.unlink = MagicMock()
    storage.profiles_dir.__truediv__ = MagicMock(return_value=filepath_mock)

    h.config_entries.async_entries = MagicMock(return_value=[])

    call = _make_call({
        "global_prefix": "cronostar_thermostat_kitchen_",
        "preset_type": "thermostat",
    })
    with patch(
        "custom_components.cronostar.services.profile_service.build_profile_filename",
        return_value="cronostar_thermostat_kitchen_.json",
    ):
        await svc.delete_controller(call)

    storage.delete_controller_files.assert_called_once_with("cronostar_thermostat_kitchen_", "thermostat")


# ---------------------------------------------------------------------------
# register_card
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_register_card_success(hass):
    """Test registrazione card con successo."""
    svc, h, storage, settings = _make_service(hass=hass)

    profile_data = {
        "profile_name": "Comfort",
        "schedule": [{"time": "08:00", "value": 21.0}],
        "meta": {"target_entity": "climate.kitchen", "global_prefix": "cronostar_thermostat_k_"},
    }
    with patch.object(svc, "get_profile_data", AsyncMock(return_value=profile_data)), \
         patch.object(svc, "_ensure_controller_exists", AsyncMock()):
        call = _make_call({
            "card_id": "card1",
            "preset": "thermostat",
            "global_prefix": "cronostar_thermostat_k_",
            "selected_profile": "Comfort",
        })
        result = await svc.register_card(call)
        assert result["success"] is True
        assert result["profile_data"] is not None


@pytest.mark.anyio
async def test_register_card_no_profile_found(hass):
    """Test registrazione card quando il profilo non è trovato."""
    svc, h, storage, _ = _make_service(hass=hass)

    with patch.object(svc, "get_profile_data", AsyncMock(return_value={"error": "not found"})), \
         patch.object(svc, "_ensure_controller_exists", AsyncMock()):
        call = _make_call({
            "card_id": "card1",
            "preset": "thermostat",
            "global_prefix": "cronostar_thermostat_k_",
        })
        result = await svc.register_card(call)
        assert result["success"] is False
        assert result["profile_data"] is None
        assert result["diagnostics"] is not None


@pytest.mark.anyio
async def test_register_card_active_profile_from_native_select(hass):
    """Test che il profilo attivo venga letto dall'entity select nativa."""
    svc, h, storage, _ = _make_service(hass=hass)

    select_state = MagicMock()
    select_state.state = "Eco"
    h.states.get = MagicMock(side_effect=lambda eid: select_state if "current_profile" in eid else None)

    profile_data = {
        "profile_name": "Eco",
        "schedule": [],
        "meta": {"target_entity": "climate.kitchen"},
    }
    with patch.object(svc, "get_profile_data", AsyncMock(return_value=profile_data)), \
         patch.object(svc, "_ensure_controller_exists", AsyncMock()):
        call = _make_call({
            "card_id": "card1",
            "preset": "thermostat",
            "global_prefix": "cronostar_thermostat_k_",
        })
        result = await svc.register_card(call)
        assert result["success"] is True

@pytest.mark.anyio
async def test_register_card_validation_errors(hass):
    """Test che la validazione rilevi errori."""
    svc, h, storage, _ = _make_service(hass=hass)

    with patch.object(svc, "get_profile_data", AsyncMock(return_value={"error": "not found"})), \
         patch.object(svc, "_ensure_controller_exists", AsyncMock()):
        call = _make_call({
            "card_id": "card1",
            "preset": "thermostat",
            "global_prefix": "",   # prefix vuoto → errore di validazione
        })
        result = await svc.register_card(call)
        assert result["validation"]["valid"] is False
        assert len(result["validation"]["errors"]) > 0


# ---------------------------------------------------------------------------
# _validate_schedule
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_validate_schedule_valid(hass):
    """Test validazione schedule corretta."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [
        {"time": "08:00", "value": 21.0},
        {"time": "22:00", "value": 18.0},
    ]
    result = svc._validate_schedule(schedule, min_val=15.0, max_val=30.0)
    assert len(result) == 2
    assert result[0]["time"] == "08:00"


@pytest.mark.anyio
async def test_validate_schedule_non_list(hass):
    """Test validazione con input non-lista."""
    svc, _, _, _ = _make_service(hass=hass)
    result = svc._validate_schedule("not a list")
    assert result == []


@pytest.mark.anyio
async def test_validate_schedule_invalid_time_format(hass):
    """Test validazione con formato orario non valido."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "25:99", "value": 21.0}]
    result = svc._validate_schedule(schedule)
    assert result == []


@pytest.mark.anyio
async def test_validate_schedule_nan_value(hass):
    """Test validazione con valore NaN."""
    import math
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00", "value": float("nan")}]
    result = svc._validate_schedule(schedule)
    assert result == []


@pytest.mark.anyio
async def test_validate_schedule_value_below_min(hass):
    """Test che valori sotto il minimo vengano portati al minimo."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00", "value": 5.0}]
    result = svc._validate_schedule(schedule, min_val=15.0, max_val=30.0)
    assert result[0]["value"] == 15.0


@pytest.mark.anyio
async def test_validate_schedule_value_above_max(hass):
    """Test che valori sopra il massimo vengano resettati al minimo."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00", "value": 50.0}]
    result = svc._validate_schedule(schedule, min_val=15.0, max_val=30.0)
    assert result[0]["value"] == 15.0


@pytest.mark.anyio
async def test_validate_schedule_deduplicates_times(hass):
    """Test che punti con lo stesso orario vengano deduplicati."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [
        {"time": "08:00", "value": 21.0},
        {"time": "08:00", "value": 22.0},  # duplicato
    ]
    result = svc._validate_schedule(schedule)
    assert len(result) == 1
    assert result[0]["value"] == 22.0   # ultimo vince


@pytest.mark.anyio
async def test_validate_schedule_non_numeric_value(hass):
    """Test che valori non numerici vengano scartati."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00", "value": "abc"}]
    result = svc._validate_schedule(schedule)
    assert result == []


@pytest.mark.anyio
async def test_validate_schedule_missing_fields(hass):
    """Test che elementi senza time o value vengano scartati."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00"}, {"value": 20.0}, {}]
    result = svc._validate_schedule(schedule)
    assert result == []


@pytest.mark.anyio
async def test_validate_schedule_sorted_by_time(hass):
    """Test che la schedule venga ordinata per orario."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [
        {"time": "22:00", "value": 18.0},
        {"time": "08:00", "value": 21.0},
    ]
    result = svc._validate_schedule(schedule)
    assert result[0]["time"] == "08:00"
    assert result[1]["time"] == "22:00"


@pytest.mark.anyio
async def test_validate_schedule_above_max_no_min(hass):
    """Test reset a 0.0 quando max superato e min_val è None."""
    svc, _, _, _ = _make_service(hass=hass)
    schedule = [{"time": "08:00", "value": 999.0}]
    result = svc._validate_schedule(schedule, min_val=None, max_val=100.0)
    assert result[0]["value"] == 0.0


# ---------------------------------------------------------------------------
# _build_metadata
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_build_metadata_filters_allowed_keys(hass):
    """Test che solo le chiavi consentite vengano incluse nei metadati."""
    svc, _, _, _ = _make_service(hass=hass)
    user_meta = {
        "title": "Cucina",
        "min_value": 15.0,
        "max_value": 30.0,
        "unknown_field": "should_be_excluded",
    }
    result = svc._build_metadata("thermostat", "cronostar_thermostat_k_", user_meta)
    assert result["title"] == "Cucina"
    assert result["min_value"] == 15.0
    assert "unknown_field" not in result


@pytest.mark.anyio
async def test_build_metadata_sets_core_fields(hass):
    """Test che i campi core vengano sempre impostati."""
    svc, _, _, _ = _make_service(hass=hass)
    result = svc._build_metadata("thermostat", "cronostar_thermostat_k_", {})
    assert result["preset_type"] == "thermostat"
    assert result["global_prefix"] == "cronostar_thermostat_k_"
    assert "updated_at" in result


@pytest.mark.anyio
async def test_build_metadata_removes_preset_key(hass):
    """Test che la chiave legacy 'preset' venga rimossa."""
    svc, _, _, _ = _make_service(hass=hass)
    user_meta = {"preset": "thermostat", "title": "Test"}
    result = svc._build_metadata("thermostat", "prefix_", user_meta)
    assert "preset" not in result


# ---------------------------------------------------------------------------
# _is_valid_time / _time_to_minutes (statici)
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_is_valid_time(hass):
    """Test validazione formato orario."""
    from custom_components.cronostar.services.profile_service import ProfileService
    assert ProfileService._is_valid_time("00:00") is True
    assert ProfileService._is_valid_time("23:59") is True
    assert ProfileService._is_valid_time("24:00") is False
    assert ProfileService._is_valid_time("12:60") is False
    assert ProfileService._is_valid_time("abc") is False
    assert ProfileService._is_valid_time("1:00") is False


@pytest.mark.anyio
async def test_time_to_minutes(hass):
    """Test conversione orario in minuti."""
    from custom_components.cronostar.services.profile_service import ProfileService
    assert ProfileService._time_to_minutes("00:00") == 0
    assert ProfileService._time_to_minutes("01:00") == 60
    assert ProfileService._time_to_minutes("23:59") == 23 * 60 + 59
    assert ProfileService._time_to_minutes("invalid") == 0


# ---------------------------------------------------------------------------
# async_update_profile_selectors
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_update_profile_selectors_updates_input_select(hass):
    """Test aggiornamento input_select con profili trovati."""
    svc, h, storage, _ = _make_service(hass=hass)

    storage.list_profiles = AsyncMock(return_value=["cronostar_thermostat_k_.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"global_prefix": "cronostar_thermostat_k_"},
        "profiles": {"Comfort": {}, "Eco": {}},
    })

    mock_state = MagicMock()
    mock_state.entity_id = "input_select.cronostar_thermostat_k_profiles"
    mock_state.attributes = {"options": ["OldProfile"]}
    h.states.async_all = MagicMock(return_value=[mock_state])

    await svc.async_update_profile_selectors()
    h.services.async_call.assert_called_once()


@pytest.mark.anyio
async def test_async_update_profile_selectors_no_change(hass):
    """Test che non venga chiamato async_call se le opzioni non cambiano."""
    svc, h, storage, _ = _make_service(hass=hass)

    storage.list_profiles = AsyncMock(return_value=["cronostar_thermostat_k_.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {"global_prefix": "cronostar_thermostat_k_"},
        "profiles": {"Comfort": {}},
    })

    mock_state = MagicMock()
    mock_state.entity_id = "input_select.cronostar_thermostat_k_profiles"
    mock_state.attributes = {"options": ["Comfort"]}  # già aggiornato
    h.states.async_all = MagicMock(return_value=[mock_state])

    await svc.async_update_profile_selectors()
    h.services.async_call.assert_not_called()


@pytest.mark.anyio
async def test_async_update_profile_selectors_bad_container(hass):
    """Test che un container malformato non causi crash."""
    svc, h, storage, _ = _make_service(hass=hass)

    storage.list_profiles = AsyncMock(return_value=["bad.json"])
    storage.load_profile_cached = AsyncMock(side_effect=Exception("bad data"))

    mock_state = MagicMock()
    mock_state.entity_id = "input_select.cronostar_thermostat_k_profiles"
    mock_state.attributes = {"options": []}
    h.states.async_all = MagicMock(return_value=[mock_state])

    # Non deve sollevare eccezioni
    await svc.async_update_profile_selectors()


# ---------------------------------------------------------------------------
# _ensure_controller_exists
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_ensure_controller_exists_already_present(hass):
    """Test che non venga creato un controller se già esiste."""
    svc, h, _, _ = _make_service(hass=hass)

    mock_entry = MagicMock()
    mock_entry.data = {"global_prefix": "cronostar_thermostat_k_"}
    h.config_entries.async_entries = MagicMock(return_value=[mock_entry])

    await svc._ensure_controller_exists("cronostar_thermostat_k_", "thermostat", {})
    h.config_entries.flow.async_init.assert_not_called()


@pytest.mark.anyio
async def test_ensure_controller_exists_creates_new(hass):
    """Test che un nuovo controller venga creato se mancante."""
    svc, h, _, _ = _make_service(hass=hass)
    h.config_entries.async_entries = MagicMock(return_value=[])

    await svc._ensure_controller_exists("cronostar_thermostat_k_", "thermostat", {})
    h.config_entries.flow.async_init.assert_called_once()


@pytest.mark.anyio
async def test_ensure_controller_exists_empty_prefix(hass):
    """Test che _ensure_controller_exists ritorni subito con prefix vuoto."""
    svc, h, _, _ = _make_service(hass=hass)
    await svc._ensure_controller_exists("", "thermostat", {})
    h.config_entries.flow.async_init.assert_not_called()
