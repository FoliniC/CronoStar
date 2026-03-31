"""Coverage Final Boost."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.setup.services import setup_services

def run(coro):
    return asyncio.run(coro)

def test_apply_now_missing_data(hass):
    """Test apply_now with missing target_entity or profile_name."""
    sm = MagicMock()
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}

    # ✅ Patcha ProfileService nel modulo services così setup_services usa il mock
    ps = MagicMock()
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, sm))

    # Missing target_entity → deve gestire silenziosamente
    run(hass.services.async_call(
        DOMAIN, "apply_now", {"profile_name": "test"}, blocking=True
    ))

    # Missing profile_name → deve gestire silenziosamente
    run(hass.services.async_call(
        DOMAIN, "apply_now", {"target_entity": "input_number.test"}, blocking=True
    ))

def test_apply_now_parse_error(hass):
    """Test apply_now with invalid schedule data — should not raise."""
    from custom_components.cronostar.const import DOMAIN
    sm = MagicMock()
    ps = MagicMock()
    ps.get_profile_data = AsyncMock(return_value={
        "schedule": [{"time": "invalid", "value": 10}]
    })
    hass.data[DOMAIN] = {"settings_manager": MagicMock()}

    # ✅ Patcha ProfileService nel modulo services così setup_services usa il nostro ps
    with patch("custom_components.cronostar.setup.services.ProfileService", return_value=ps):
        run(setup_services(hass, sm))

    # Deve gestire l'errore di parsing senza crashare (parse error silenzioso)
    run(hass.services.async_call(
        DOMAIN, "apply_now",
        {"target_entity": "input_number.test", "profile_name": "test"},
        blocking=True
    ))
