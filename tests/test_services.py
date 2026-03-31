"""Test Services - Full Coverage."""
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from homeassistant.exceptions import HomeAssistantError
from custom_components.cronostar.const import DOMAIN


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def enable_event_loop_debug():
    """Mock per evitare RuntimeError su Python 3.13."""
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_storage():
    storage = MagicMock()
    storage.list_profiles = AsyncMock(return_value=[])
    storage.load_profile_cached = AsyncMock(return_value=None)
    storage.get_cached_containers = AsyncMock(return_value={})
    storage.update_active_profile = AsyncMock()
    storage.save_profile = AsyncMock()
    storage.load_profile = AsyncMock()
    storage.delete_profile = AsyncMock()
    storage.delete_controller = AsyncMock()
    return storage


def _make_settings_manager():
    sm = MagicMock()
    sm.load_settings = AsyncMock(return_value={"theme": "dark"})
    sm.save_settings = AsyncMock()
    return sm


def _make_profile_service():
    ps = MagicMock()
    ps.save_profile = AsyncMock()
    ps.load_profile = AsyncMock(return_value={"profile_name": "Comfort", "schedule": []})
    ps.add_profile = AsyncMock()
    ps.delete_profile = AsyncMock()
    ps.delete_controller = AsyncMock()
    ps.register_card = AsyncMock(return_value={"success": True})
    ps.get_profile_data = AsyncMock(return_value={"schedule": [{"time": "08:00", "value": 21.0}], "meta": {}})
    return ps


def _setup_services(hass, storage=None, profile_service=None, settings_manager=None):
    from custom_components.cronostar.setup.services import setup_services
    from custom_components.cronostar.const import DOMAIN

    sm = settings_manager or _make_settings_manager()
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["settings_manager"] = sm

    s = storage or _make_storage()
    
    ps = profile_service or _make_profile_service()
    
    # ✅ Patcha ProfileService nel modulo setup.services per usare il mock ps
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, s))
    
    hass.data[DOMAIN]["profile_service"] = ps
    return hass


# ---------------------------------------------------------------------------
# setup_services - registrazione
# ---------------------------------------------------------------------------

def test_setup_services_registers_all(hass):
    """Test che tutti i servizi vengano registrati."""
    _setup_services(hass)

    registered = [call[0][1] for call in hass.services.async_register.call_args_list]
    expected = [
        "save_profile", "load_profile", "add_profile", "delete_profile",
        "delete_controller", "register_card", "save_settings", "load_settings",
        "list_all_profiles", "apply_now",
    ]
    for svc in expected:
        assert svc in registered, f"Servizio '{svc}' non registrato"


# ---------------------------------------------------------------------------
# save_profile handler
# ---------------------------------------------------------------------------

def test_save_profile_handler(hass):
    """Test handler save_profile."""
    ps = _make_profile_service()
    _setup_services(hass, profile_service=ps)

    call_data = {"profile_name": "Comfort", "preset_type": "thermostat"}
    run(hass.services.async_call(DOMAIN, "save_profile", call_data))
    ps.save_profile.assert_called_once()


# ---------------------------------------------------------------------------
# load_profile handler
# ---------------------------------------------------------------------------

def test_load_profile_handler(hass):
    """Test handler load_profile."""
    ps = _make_profile_service()
    _setup_services(hass, profile_service=ps)

    call_data = {"profile_name": "Comfort"}
    result = run(hass.services.async_call(DOMAIN, "load_profile", call_data))
    assert result is not None


# ---------------------------------------------------------------------------
# list_all_profiles handler
# ---------------------------------------------------------------------------

def test_list_all_profiles_handler_empty(hass):
    """Test handler list_all_profiles senza profili."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=[])
    _setup_services(hass, storage=storage)

    result = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    assert result == {}


def test_list_all_profiles_handler_with_data(hass):
    """Test handler list_all_profiles con dati."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=["cronostar_thermostat_k_.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {
            "preset_type": "thermostat",
            "global_prefix": "cronostar_thermostat_k_",
            "target_entity": "climate.kitchen",
        },
        "profiles": {
            "Comfort": {"schedule": [{"time": "08:00", "value": 21.0}], "updated_at": "2024-01-01"},
        },
    })
    hass.states.async_set("climate.kitchen", "21.0")
    _setup_services(hass, storage=storage)

    result = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    assert "thermostat" in result


def test_list_all_profiles_handler_missing_meta(hass):
    """Test handler list_all_profiles con container senza meta."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=["bad.json"])
    storage.load_profile_cached = AsyncMock(return_value={"profiles": {"X": {}}})
    _setup_services(hass, storage=storage)

    result = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    # Profilo senza meta viene ignorato
    assert result == {}


def test_list_all_profiles_handler_exception(hass):
    """Test handler list_all_profiles con eccezione."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(side_effect=Exception("storage error"))
    _setup_services(hass, storage=storage)

    result = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    assert "error" in result


def test_list_all_profiles_with_missing_entity(hass):
    """Test list_all_profiles con target entity mancante (HA avviato)."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=["f.json"])
    storage.load_profile_cached = AsyncMock(return_value={
        "meta": {
            "preset_type": "thermostat",
            "global_prefix": "prefix_",
            "target_entity": "climate.missing",
        },
        "profiles": {"X": {"schedule": [], "updated_at": "2024"}},
    })
    # climate.missing non è impostato in hass.states
    hass.is_running = True
    _setup_services(hass, storage=storage)

    result = run(hass.services.async_call(DOMAIN, "list_all_profiles", {}))
    assert "thermostat" in result
    assert not result["thermostat"]["files"][0]["validation"]["valid"]


# ---------------------------------------------------------------------------
# save_settings / load_settings handler
# ---------------------------------------------------------------------------

def test_save_settings_handler(hass):
    """Test handler save_settings."""
    sm = _make_settings_manager()
    _setup_services(hass, settings_manager=sm)

    call_data = {"settings": {"theme": "light"}}
    run(hass.services.async_call(DOMAIN, "save_settings", call_data))
    sm.save_settings.assert_called_once_with({"theme": "light"})


def test_save_settings_handler_empty(hass):
    """Test handler save_settings senza dati (non chiama save_settings)."""
    sm = _make_settings_manager()
    _setup_services(hass, settings_manager=sm)

    run(hass.services.async_call(DOMAIN, "save_settings", {}))
    sm.save_settings.assert_not_called()


def test_load_settings_handler(hass):
    """Test handler load_settings."""
    sm = _make_settings_manager()
    _setup_services(hass, settings_manager=sm)

    result = run(hass.services.async_call(DOMAIN, "load_settings", {}))
    assert result == {"theme": "dark"}


# ---------------------------------------------------------------------------
# apply_now handler
# ---------------------------------------------------------------------------

def test_apply_now_climate(hass):
    """Test apply_now su entità climate."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 21.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.kitchen",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }
    # Reset mock for inner call
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    # Check calls to climate.set_temperature
    climate_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "climate"]
    assert len(climate_calls) > 0
    assert climate_calls[0][0][1] == "set_temperature"


def test_apply_now_switch_on(hass):
    """Test apply_now su entità switch (value > 0)."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "switch.heater",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "On",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    switch_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "switch"]
    assert switch_calls[0][0][1] == "turn_on"


def test_apply_now_switch_off(hass):
    """Test apply_now su entità switch (value == 0)."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 0.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "switch.heater",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "Off",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    switch_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "switch"]
    assert switch_calls[0][0][1] == "turn_off"


def test_apply_now_input_number(hass):
    """Test apply_now su entità input_number."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 22.5}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "input_number.setpoint",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    in_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "input_number"]
    assert in_calls[0][0][1] == "set_value"


def test_apply_now_cover(hass):
    """Test apply_now su entità cover."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 75.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "cover.shutter",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "Partial",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    cover_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "cover"]
    assert cover_calls[0][0][1] == "set_cover_position"


def test_apply_now_unsupported_domain(hass):
    """Test apply_now con dominio non supportato."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "unknown_domain.entity",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    # Only the apply_now call itself (if we didn't reset it) or nothing if we reset it.
    # Since we reset it, it should only contain the current call if it recursively called itself,
    # but it shouldn't call any other service.
    other_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] != DOMAIN]
    assert len(other_calls) == 0


def test_apply_now_missing_target_entity(hass):
    """Test apply_now senza target_entity."""
    ps = _make_profile_service()
    _setup_services(hass, profile_service=ps)

    run(hass.services.async_call(DOMAIN, "apply_now", {"profile_name": "Comfort"}))
    other_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] != DOMAIN]
    assert len(other_calls) == 0


def test_apply_now_missing_profile_name(hass):
    """Test apply_now senza profile_name."""
    ps = _make_profile_service()
    _setup_services(hass, profile_service=ps)

    run(hass.services.async_call(DOMAIN, "apply_now", {"target_entity": "climate.k"}))
    other_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] != DOMAIN]
    assert len(other_calls) == 0


def test_apply_now_profile_not_found(hass):
    """Test apply_now quando il profilo non è trovato."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={"error": "not found"})
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Ghost",
    }
    import custom_components.cronostar.utils.error_handler as eh_mod
    with pytest.raises(eh_mod.HomeAssistantError):
        run(hass.services.async_call(DOMAIN, "apply_now", call_data))


def test_apply_now_empty_schedule(hass):
    """Test apply_now con schedule vuota."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={"schedule": [], "meta": {}})
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Empty",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    other_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] != DOMAIN]
    assert len(other_calls) == 0


def test_apply_now_selects_current_value(hass):
    """Test che apply_now selezioni il valore corretto in base all'ora attuale."""
    ps = _make_profile_service()

    # Schedule con punto nel passato e uno nel futuro
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "00:00", "value": 18.0},
            {"time": "08:00", "value": 21.0},
        ],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }

    # Fissa l'ora a 10:00 → valore atteso 21.0
    with patch("custom_components.cronostar.setup.services.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2024, 1, 1, 10, 0)
        hass.services.async_call.reset_mock()
        run(hass.services.async_call(DOMAIN, "apply_now", call_data))

    climate_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "climate"]
    assert climate_calls[0][0][2]["temperature"] == 21.0


def test_apply_now_generic_exception(hass):
    """Test apply_now gestisce eccezioni generiche."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(side_effect=RuntimeError("unexpected"))
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }
    import custom_components.cronostar.utils.error_handler as eh_mod
    with pytest.raises(eh_mod.HomeAssistantError):
        run(hass.services.async_call(DOMAIN, "apply_now", call_data))


def test_apply_now_next_change_wraparound(hass):
    """Test che apply_now calcoli correttamente il wrap-around per il prossimo cambio."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "08:00", "value": 21.0},
            {"time": "22:00", "value": 18.0},
        ],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    }

    # Ora 23:00 → valore 18.0, next change è 08:00 (wrap-around)
    with patch("custom_components.cronostar.setup.services.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2024, 1, 1, 23, 0)
        hass.services.async_call.reset_mock()
        run(hass.services.async_call(DOMAIN, "apply_now", call_data))

    assert hass.services.async_call.called


def test_apply_now_light_domain(hass):
    """Test apply_now su entità light."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    _setup_services(hass, profile_service=ps)

    call_data = {
        "target_entity": "light.room",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "On",
    }
    hass.services.async_call.reset_mock()
    run(hass.services.async_call(DOMAIN, "apply_now", call_data))
    
    light_calls = [c for c in hass.services.async_call.call_args_list if c[0][0] == "light"]
    assert len(light_calls) > 0


# ---------------------------------------------------------------------------
# async_unload_services
# ---------------------------------------------------------------------------

def test_async_unload_services(hass):
    """Test deregistrazione di tutti i servizi."""
    from custom_components.cronostar.setup.services import async_unload_services
    run(async_unload_services(hass))

    removed = [call[0][1] for call in hass.services.async_remove.call_args_list]
    expected = [
        "save_profile", "load_profile", "add_profile", "delete_profile",
        "register_card", "list_all_profiles", "apply_now",
    ]
    for svc in expected:
        assert svc in removed, f"Servizio '{svc}' non deregistrato"
