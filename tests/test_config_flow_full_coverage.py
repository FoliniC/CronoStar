"""
Full coverage for config_flow.py — colma i gap residui.

Gap coperti:
  - Righe 247-285: _async_add_card_to_dashboard (path success + errore)
  - Riga  291:     Logging dell'errore se l'aggiunta alla dashboard fallisce
  - Righe 313-316: OptionsFlow.__init__ per entry con component_installed
  - Righe 126, 131: abort su chiamate dirette a step interni senza input
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

DOMAIN = "cronostar"

def run(coro):
    """Run a coroutine."""
    return asyncio.run(coro)

# ──────────────────────────────────────────────────────────────────
# Helper: crea un flow con _controller_data precompilato
# ──────────────────────────────────────────────────────────────────
def _make_flow(hass, controller_data: dict):
    from custom_components.cronostar.config_flow import CronoStarConfigFlow

    flow = CronoStarConfigFlow()
    flow.hass = hass
    flow._controller_data = controller_data
    # mock necessario per async_create_entry / abort
    flow.async_create_entry = MagicMock(
        side_effect=lambda title, data: {"type": "create_entry", "title": title, "data": data}
    )
    flow.async_abort = MagicMock(
        side_effect=lambda reason: {"type": "abort", "reason": reason}
    )
    flow.async_show_form = MagicMock(
        side_effect=lambda **kw: {"type": "form", "step_id": kw.get("step_id")}
    )
    # _async_current_entries vuota di default
    flow._async_current_entries = MagicMock(return_value=[])
    return flow


# ──────────────────────────────────────────────────────────────────
# GAP 1 — Righe 247-285
# async_step_success con dashboard_path → chiama _async_add_card_to_dashboard
# ──────────────────────────────────────────────────────────────────
def test_async_step_success_with_dashboard_calls_add_card(hass):
    """
    Verifica che async_step_success chiami _async_add_card_to_dashboard
    quando dashboard_path è impostato (branch riga 248).
    """
    controller_data = {
        "name": "Test",
        "dashboard_path": "lovelace-custom",
        "dashboard_view": 0,
        "target_entity": "input_number.test",
        "global_prefix": "cronostar_",
        "preset": "thermostat",
        "title": "Test Card",
        "min_value": 5.0,
        "max_value": 30.0,
        "step_value": 0.5,
        "unit_of_measurement": "°C",
        "y_axis_label": "",
        "allow_max_value": False,
    }
    flow = _make_flow(hass, controller_data)

    with patch.object(
        flow,
        "_async_add_card_to_dashboard",
        new_callable=AsyncMock,
    ) as mock_add:
        result = run(flow.async_step_success(user_input={}))

    mock_add.assert_awaited_once()
    assert result["type"] == "create_entry"
    assert "[v5.9.1]" in result["title"]


def test_async_step_success_without_dashboard_skips_add_card(hass):
    """
    Verifica che senza dashboard_path _async_add_card_to_dashboard
    NON venga chiamata (branch negativo, riga 248).
    """
    controller_data = {"name": "NoBoard", "target_entity": "input_number.x"}
    flow = _make_flow(hass, controller_data)

    with patch.object(
        flow,
        "_async_add_card_to_dashboard",
        new_callable=AsyncMock,
    ) as mock_add:
        result = run(flow.async_step_success(user_input={}))

    mock_add.assert_not_awaited()
    assert result["type"] == "create_entry"


# ──────────────────────────────────────────────────────────────────
# GAP 1 (corpo) + GAP 2 — Righe 247-285 e 291
# _async_add_card_to_dashboard: path success e path errore con logging
# ──────────────────────────────────────────────────────────────────
def test_async_add_card_to_dashboard_success(hass):
    """
    Copre righe 247-285: percorso felice di _async_add_card_to_dashboard.
    - async_get_config restituisce config con views
    - async_save_config chiamata
    - _LOGGER.info registrato
    """
    controller_data = {
        "dashboard_path": "lovelace-custom",
        "dashboard_view": 0,
        "target_entity": "input_number.test",
        "global_prefix": "cronostar_",
        "preset": "thermostat",
        "title": "Test",
        "min_value": 5.0,
        "max_value": 30.0,
        "step_value": 0.5,
        "unit_of_measurement": "°C",
        "y_axis_label": "",
        "allow_max_value": False,
    }
    flow = _make_flow(hass, controller_data)

    fake_config = {"views": [{"title": "Home", "cards": []}]}

    with (
        patch(
            "homeassistant.components.lovelace.async_get_config",
            new=AsyncMock(return_value=fake_config),
        ),
        patch(
            "homeassistant.components.lovelace.async_save_config",
            new=AsyncMock(),
        ) as mock_save,
        patch(
            "custom_components.cronostar.config_flow._LOGGER"
        ) as mock_logger,
    ):
        run(flow._async_add_card_to_dashboard())

    mock_save.assert_awaited_once()
    # Verifica che la card sia stata inserita nella view
    assert len(fake_config["views"][0]["cards"]) == 1
    assert fake_config["views"][0]["cards"][0]["type"] == "custom:cronostar-card"
    mock_logger.info.assert_called_once()


def test_async_add_card_to_dashboard_path_none_uses_default(hass):
    """
    Verifica che dashboard_path == 'none' venga normalizzato a None
    prima di passarlo a async_get_config (riga 255-256).
    """
    controller_data = {
        "dashboard_path": "none",  # valore speciale → None
        "dashboard_view": 0,
        "target_entity": "input_number.test",
        "global_prefix": "cronostar_",
        "preset": "thermostat",
    }
    flow = _make_flow(hass, controller_data)

    fake_config = {"views": [{"cards": []}]}

    with (
        patch(
            "homeassistant.components.lovelace.async_get_config",
            new=AsyncMock(return_value=fake_config),
        ) as mock_get,
        patch(
            "homeassistant.components.lovelace.async_save_config",
            new=AsyncMock(),
        ),
    ):
        run(flow._async_add_card_to_dashboard())

    # Il primo argomento dopo hass deve essere None
    mock_get.assert_awaited_once_with(hass, None)


def test_async_add_card_to_dashboard_view_index_out_of_range(hass):
    """
    Copre il caso in cui dashboard_view sia fuori range (branch riga 274):
    nessuna card aggiunta, nessun crash.
    """
    controller_data = {
        "dashboard_path": "lovelace-custom",
        "dashboard_view": 99,  # fuori range
        "target_entity": "input_number.test",
        "global_prefix": "cronostar_",
        "preset": "thermostat",
    }
    flow = _make_flow(hass, controller_data)

    fake_config = {"views": [{"cards": []}]}  # solo view[0]

    with (
        patch(
            "homeassistant.components.lovelace.async_get_config",
            new=AsyncMock(return_value=fake_config),
        ),
        patch(
            "homeassistant.components.lovelace.async_save_config",
            new=AsyncMock(),
        ) as mock_save,
    ):
        run(flow._async_add_card_to_dashboard())

    # In questa versione, async_save_config NON è chiamata se l'if views fallisce il range
    # In riga 282: await async_save_config è DENTRO l'if views
    mock_save.assert_not_awaited()


def test_async_add_card_to_dashboard_exception_logged(hass):
    """
    GAP 2 — Riga 291: verifica che l'eccezione venga loggata con _LOGGER.error
    e che il flow non sollevi l'eccezione al chiamante.
    """
    controller_data = {
        "dashboard_path": "lovelace-custom",
        "dashboard_view": 0,
        "target_entity": "input_number.test",
        "global_prefix": "cronostar_",
        "preset": "thermostat",
    }
    flow = _make_flow(hass, controller_data)

    with (
        patch(
            "homeassistant.components.lovelace.async_get_config",
            new=AsyncMock(side_effect=Exception("Lovelace boom")),
        ),
        patch(
            "custom_components.cronostar.config_flow._LOGGER"
        ) as mock_logger,
    ):
        # Non deve sollevare
        run(flow._async_add_card_to_dashboard())

    mock_logger.error.assert_called_once()
    assert "Lovelace boom" in str(mock_logger.error.call_args)


# ──────────────────────────────────────────────────────────────────
# GAP 3 — Righe 313-316
# OptionsFlow.__init__ chiamato con entry component_installed=True
# ──────────────────────────────────────────────────────────────────
def test_options_flow_init_for_component_installed(hass):
    """
    Copre righe 313-316: async_step_init dell'OptionsFlow
    per una entry con component_installed=True.
    Deve mostrare il form con schema logging + language.
    """
    from custom_components.cronostar.config_flow import CronoStarOptionsFlow

    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.options = {"logging_enabled": True, "language": "it"}
    entry.title = "CronoStar [v5.9.1]"

    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    flow.async_show_form = MagicMock(
        side_effect=lambda **kw: {"type": "form", "step_id": kw.get("step_id")}
    )
    flow.async_create_entry = MagicMock(
        side_effect=lambda title, data: {"type": "create_entry", "title": title, "data": data}
    )

    # Prima chiamata senza input → deve mostrare il form
    result = run(flow.async_step_init(user_input=None))
    assert result["type"] == "form"
    assert result["step_id"] == "init"


def test_options_flow_init_component_installed_submit(hass):
    """
    Copre il ramo user_input is not None per component_installed=True (riga 319):
    deve creare l'entry con i nuovi valori.
    """
    from custom_components.cronostar.config_flow import CronoStarOptionsFlow

    entry = MagicMock()
    entry.data = {"component_installed": True}
    entry.options = {}
    entry.title = "CronoStar [v5.9.1]"

    flow = CronoStarOptionsFlow(entry)
    flow.hass = hass
    flow.async_create_entry = MagicMock(
        side_effect=lambda title, data: {"type": "create_entry", "title": title, "data": data}
    )

    result = run(flow.async_step_init(
        user_input={"logging_enabled": False, "language": "en"}
    ))
    assert result["type"] == "create_entry"
    assert result["data"] == {"logging_enabled": False, "language": "en"}


# ──────────────────────────────────────────────────────────────────
# GAP 4 — Righe 126, 131
# abort su chiamate dirette a step interni senza user_input
# ──────────────────────────────────────────────────────────────────
def test_async_step_create_controller_no_input_returns_abort(hass):
    """
    Riga 131: async_step_create_controller(None) → abort reason='unknown'.
    """
    flow = _make_flow(hass, {})
    result = run(flow.async_step_create_controller(user_input=None))
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


def test_async_step_install_component_already_installed_abort(hass):
    """
    Riga 126: async_step_install_component quando component già presente
    → abort reason='single_instance_allowed'.
    """
    from custom_components.cronostar.config_flow import CronoStarConfigFlow

    flow = CronoStarConfigFlow()
    flow.hass = hass

    # Simula un'entry già presente con component_installed=True
    existing = MagicMock()
    existing.data = {"component_installed": True}
    flow._async_current_entries = MagicMock(return_value=[existing])
    flow.async_abort = MagicMock(
        side_effect=lambda reason: {"type": "abort", "reason": reason}
    )

    result = run(flow.async_step_install_component(user_input=None))
    assert result["type"] == "abort"
    assert result["reason"] == "single_instance_allowed"
