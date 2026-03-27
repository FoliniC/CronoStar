"""Test Services - Full Coverage."""
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
    hass.data = {}
    hass.services = MagicMock()
    hass.services.async_register = MagicMock()
    hass.services.async_remove = AsyncMock()
    hass.states = MagicMock()
    hass.states.get = MagicMock(return_value=None)
    hass.config_entries = MagicMock()
    hass.config_entries.async_entries = MagicMock(return_value=[])
    hass.is_running = True

    async def fake_executor(func, *args):
        if args:
            return func(*args)
        return func()

    hass.async_add_executor_job = fake_executor
    return hass


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


def _make_call(data: dict):
    call = MagicMock()
    call.data = data
    return call


async def _setup_services(hass, storage=None, profile_service=None, settings_manager=None):
    from custom_components.cronostar.setup.services import setup_services
    from custom_components.cronostar.const import DOMAIN

    sm = settings_manager or _make_settings_manager()
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["settings_manager"] = sm

    s = storage or _make_storage()
    
    ps = profile_service or _make_profile_service()
    
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        await setup_services(hass, s)
    
    return hass


# ---------------------------------------------------------------------------
# setup_services - registrazione
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_setup_services_registers_all(hass):
    """Test che tutti i servizi vengano registrati."""
    await _setup_services(hass)

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

@pytest.mark.anyio
async def test_save_profile_handler(hass):
    """Test handler save_profile."""
    ps = _make_profile_service()
    await _setup_services(hass, profile_service=ps)

    # Recupera l'handler registrato
    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "save_profile":
            handler = call[0][2]
            break

    assert handler is not None
    call = _make_call({"profile_name": "Comfort", "preset_type": "thermostat"})

    with patch.object(ps, "save_profile", AsyncMock()):
        from custom_components.cronostar.const import DOMAIN
        hass.data[DOMAIN]["profile_service"] = ps
        # Chiama l'handler direttamente
        await handler(call)
        ps.save_profile.assert_called_once_with(call)


# ---------------------------------------------------------------------------
# load_profile handler
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_load_profile_handler(hass):
    """Test handler load_profile."""
    ps = _make_profile_service()
    await _setup_services(hass, profile_service=ps)

    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "load_profile":
            handler = call[0][2]
            break

    call = _make_call({"profile_name": "Comfort"})
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps
    result = await handler(call)
    assert result is not None


# ---------------------------------------------------------------------------
# list_all_profiles handler
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_all_profiles_handler_empty(hass):
    """Test handler list_all_profiles senza profili."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=[])
    await _setup_services(hass, storage=storage)

    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "list_all_profiles":
            handler = call[0][2]
            break

    call = _make_call({})
    result = await handler(call)
    assert result == {}


@pytest.mark.anyio
async def test_list_all_profiles_handler_with_data(hass):
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
    hass.states.get = MagicMock(return_value=MagicMock(state="21.0"))
    await _setup_services(hass, storage=storage)

    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "list_all_profiles":
            handler = call[0][2]
            break

    call = _make_call({})
    result = await handler(call)
    assert "thermostat" in result


@pytest.mark.anyio
async def test_list_all_profiles_handler_missing_meta(hass):
    """Test handler list_all_profiles con container senza meta."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(return_value=["bad.json"])
    storage.load_profile_cached = AsyncMock(return_value={"profiles": {"X": {}}})
    await _setup_services(hass, storage=storage)

    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "list_all_profiles":
            handler = call[0][2]
            break

    call = _make_call({})
    result = await handler(call)
    # Profilo senza meta viene ignorato
    assert result == {}


@pytest.mark.anyio
async def test_list_all_profiles_handler_exception(hass):
    """Test handler list_all_profiles con eccezione."""
    storage = _make_storage()
    storage.list_profiles = AsyncMock(side_effect=Exception("storage error"))
    await _setup_services(hass, storage=storage)

    handler = None
    for call in hass.services.async_register.call_args_list:
        if call[0][1] == "list_all_profiles":
            handler = call[0][2]
            break

    call = _make_call({})
    result = await handler(call)
    assert "error" in result


@pytest.mark.anyio
async def test_list_all_profiles_with_missing_entity(hass):
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
    hass.states.get = MagicMock(return_value=None)  # entità non trovata
    hass.is_running = True
    await _setup_services(hass, storage=storage)

    handler = next(
        call[0][2]
        for call in hass.services.async_register.call_args_list
        if call[0][1] == "list_all_profiles"
    )
    call = _make_call({})
    result = await handler(call)
    assert "thermostat" in result
    assert not result["thermostat"]["files"][0]["validation"]["valid"]


# ---------------------------------------------------------------------------
# save_settings / load_settings handler
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_save_settings_handler(hass):
    """Test handler save_settings."""
    sm = _make_settings_manager()
    await _setup_services(hass, settings_manager=sm)

    handler = next(
        call[0][2]
        for call in hass.services.async_register.call_args_list
        if call[0][1] == "save_settings"
    )
    call = _make_call({"settings": {"theme": "light"}})
    await handler(call)
    sm.save_settings.assert_called_once_with({"theme": "light"})


@pytest.mark.anyio
async def test_save_settings_handler_empty(hass):
    """Test handler save_settings senza dati (non chiama save_settings)."""
    sm = _make_settings_manager()
    await _setup_services(hass, settings_manager=sm)

    handler = next(
        call[0][2]
        for call in hass.services.async_register.call_args_list
        if call[0][1] == "save_settings"
    )
    call = _make_call({})
    await handler(call)
    sm.save_settings.assert_not_called()


@pytest.mark.anyio
async def test_load_settings_handler(hass):
    """Test handler load_settings."""
    sm = _make_settings_manager()
    await _setup_services(hass, settings_manager=sm)

    handler = next(
        call[0][2]
        for call in hass.services.async_register.call_args_list
        if call[0][1] == "load_settings"
    )
    call = _make_call({})
    result = await handler(call)
    assert result == {"theme": "dark"}


# ---------------------------------------------------------------------------
# apply_now handler
# ---------------------------------------------------------------------------

async def _get_apply_now_handler(hass, storage=None, profile_service=None):
    await _setup_services(hass, storage=storage, profile_service=profile_service)
    return next(
        call[0][2]
        for call in hass.services.async_register.call_args_list
        if call[0][1] == "apply_now"
    )


@pytest.mark.anyio
async def test_apply_now_climate(hass):
    """Test apply_now su entità climate."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 21.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)

    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.kitchen",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })
    await handler(call)
    hass.services.async_call.assert_called()
    args = hass.services.async_call.call_args[0]
    assert args[0] == "climate"
    assert args[1] == "set_temperature"


@pytest.mark.anyio
async def test_apply_now_switch_on(hass):
    """Test apply_now su entità switch (value > 0)."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "switch.heater",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "On",
    })
    await handler(call)
    args = hass.services.async_call.call_args[0]
    assert args[1] == "turn_on"


@pytest.mark.anyio
async def test_apply_now_switch_off(hass):
    """Test apply_now su entità switch (value == 0)."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 0.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "switch.heater",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "Off",
    })
    await handler(call)
    args = hass.services.async_call.call_args[0]
    assert args[1] == "turn_off"


@pytest.mark.anyio
async def test_apply_now_input_number(hass):
    """Test apply_now su entità input_number."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 22.5}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "input_number.setpoint",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })
    await handler(call)
    args = hass.services.async_call.call_args[0]
    assert args[0] == "input_number"
    assert args[1] == "set_value"


@pytest.mark.anyio
async def test_apply_now_cover(hass):
    """Test apply_now su entità cover."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 75.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "cover.shutter",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "Partial",
    })
    await handler(call)
    args = hass.services.async_call.call_args[0]
    assert args[0] == "cover"
    assert args[1] == "set_cover_position"


@pytest.mark.anyio
async def test_apply_now_unsupported_domain(hass):
    """Test apply_now con dominio non supportato."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "unknown_domain.entity",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })
    # Non deve sollevare eccezioni, solo logga un warning
    await handler(call)
    hass.services.async_call.assert_not_called()


@pytest.mark.anyio
async def test_apply_now_missing_target_entity(hass):
    """Test apply_now senza target_entity."""
    ps = _make_profile_service()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({"profile_name": "Comfort"})
    # Ritorna senza fare nulla
    await handler(call)
    hass.services.async_call.assert_not_called()


@pytest.mark.anyio
async def test_apply_now_missing_profile_name(hass):
    """Test apply_now senza profile_name."""
    ps = _make_profile_service()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({"target_entity": "climate.k"})
    await handler(call)
    hass.services.async_call.assert_not_called()


@pytest.mark.anyio
async def test_apply_now_profile_not_found(hass):
    """Test apply_now quando il profilo non è trovato."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={"error": "not found"})
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Ghost",
    })
    with pytest.raises(HomeAssistantError):
        await handler(call)


@pytest.mark.anyio
async def test_apply_now_empty_schedule(hass):
    """Test apply_now con schedule vuota."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={"schedule": [], "meta": {}})
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Empty",
    })
    await handler(call)
    hass.services.async_call.assert_not_called()


@pytest.mark.anyio
async def test_apply_now_selects_current_value(hass):
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
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })

    # Fissa l'ora a 10:00 → valore atteso 21.0
    with patch("custom_components.cronostar.setup.services.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2024, 1, 1, 10, 0)
        await handler(call)

    args = hass.services.async_call.call_args
    assert args[0][2]["temperature"] == 21.0


@pytest.mark.anyio
async def test_apply_now_generic_exception(hass):
    """Test apply_now gestisce eccezioni generiche."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(side_effect=RuntimeError("unexpected"))
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })
    with pytest.raises(HomeAssistantError):
        await handler(call)


@pytest.mark.anyio
async def test_apply_now_next_change_wraparound(hass):
    """Test che apply_now calcoli correttamente il wrap-around per il prossimo cambio."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [
            {"time": "08:00", "value": 21.0},
            {"time": "22:00", "value": 18.0},
        ],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "climate.k",
        "preset_type": "thermostat",
        "global_prefix": "prefix_",
        "profile_name": "Comfort",
    })

    # Ora 23:00 → valore 18.0, next change è 08:00 (wrap-around)
    with patch("custom_components.cronostar.setup.services.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2024, 1, 1, 23, 0)
        await handler(call)

    hass.services.async_call.assert_called()


@pytest.mark.anyio
async def test_apply_now_light_domain(hass):
    """Test apply_now su entità light."""
    ps = _make_profile_service()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "00:00", "value": 1.0}],
        "meta": {},
    })
    hass.services.async_call = AsyncMock()
    handler = await _get_apply_now_handler(hass, profile_service=ps)
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN]["profile_service"] = ps

    call = _make_call({
        "target_entity": "light.room",
        "preset_type": "generic_switch",
        "global_prefix": "prefix_",
        "profile_name": "On",
    })
    await handler(call)
    args = hass.services.async_call.call_args[0]
    assert args[0] == "light"


# ---------------------------------------------------------------------------
# async_unload_services
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_async_unload_services(hass):
    """Test deregistrazione di tutti i servizi."""
    from custom_components.cronostar.setup.services import async_unload_services
    await async_unload_services(hass)

    removed = [call[0][1] for call in hass.services.async_remove.call_args_list]
    expected = [
        "save_profile", "load_profile", "add_profile", "delete_profile",
        "register_card", "list_all_profiles", "apply_now",
    ]
    for svc in expected:
        assert svc in removed, f"Servizio '{svc}' non deregistrato"
