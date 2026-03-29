"""
conftest.py – installs Home Assistant stub modules into sys.modules
before any test file imports the sources under test.
"""

import sys
import types
import logging
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# ──────────────────────────────────────────────────────────────────────────────
# 1.  HA stub modules - FORCE INJECTION
# ──────────────────────────────────────────────────────────────────────────────

class HomeAssistantError(Exception):
    pass

class ConfigEntryAuthFailed(HomeAssistantError):
    pass

class ConfigEntryNotReady(HomeAssistantError):
    pass

class UnknownEntry(HomeAssistantError):
    pass

class DataUpdateCoordinator:
    """Minimal stub that matches the real HA coordinator interface."""
    def __init__(self, hass, logger, *, name, update_interval):
        self.hass = hass
        self.logger = logger
        self.name = name
        self.update_interval = update_interval
        self.data = None

    async def async_refresh(self):
        pass

    async def _async_update_data(self):
        return {}

class Platform:
    SENSOR = "sensor"
    SWITCH = "switch"
    SELECT = "select"
    CLIMATE = "climate"
    LIGHT = "light"
    FAN = "fan"
    INPUT_NUMBER = "input_number"
    COVER = "cover"

class CoreState:
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    FINAL_WRITE = "FINAL_WRITE"
    starting = "starting"
    running = "running"
    stopping = "stopping"
    final_write = "final_write"

class ConfigFlow:
    def __init_subclass__(cls, domain=None, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.domain = domain
    async def async_step_user(self, user_input=None): return {}
    async def async_step_init(self, user_input=None): return {}
    def async_show_form(self, **kwargs): return {"type": "form", **kwargs}
    def async_abort(self, **kwargs): return {"type": "abort", **kwargs}
    def async_create_entry(self, **kwargs): return {"type": "create_entry", **kwargs}
    def async_show_menu(self, **kwargs): return {"type": "menu", **kwargs}
    def _async_current_entries(self): return []
    def async_set_unique_id(self, unique_id, **kwargs): return unique_id
    def _abort_if_unique_id_configured(self, **kwargs): pass

class OptionsFlow:
    def __init__(self, config_entry): self.config_entry = config_entry
    async def async_step_init(self, user_input=None): return {}
    def async_show_form(self, **kwargs): return {"type": "form", **kwargs}
    def async_create_entry(self, **kwargs): return {"type": "create_entry", **kwargs}
    def async_abort(self, **kwargs): return {"type": "abort", **kwargs}

class CoordinatorEntity:
    def __init__(self, coordinator, context=None):
        self.coordinator = coordinator
        self.hass = coordinator.hass

class SelectEntity: pass
class SensorEntity: pass
class SwitchEntity: pass
class SensorDeviceClass:
    TEMPERATURE = "temperature"
    ENERGY = "energy"
class SensorStateClass:
    MEASUREMENT = "measurement"
    TOTAL_INCREASING = "total_increasing"

def _install_ha_stubs():
    STATE_UNAVAILABLE = "unavailable"
    STATE_UNKNOWN = "unknown"
    STATE_ON = "on"
    STATE_OFF = "off"

    # homeassistant.exceptions
    exc_mod = types.ModuleType("homeassistant.exceptions")
    exc_mod.HomeAssistantError = HomeAssistantError
    exc_mod.ConfigEntryAuthFailed = ConfigEntryAuthFailed
    exc_mod.ConfigEntryNotReady = ConfigEntryNotReady
    sys.modules["homeassistant.exceptions"] = exc_mod

    # homeassistant.config_entries
    ce_mod = types.ModuleType("homeassistant.config_entries")
    ce_mod.ConfigEntryAuthFailed = ConfigEntryAuthFailed
    ce_mod.ConfigEntryNotReady = ConfigEntryNotReady
    ce_mod.UnknownEntry = UnknownEntry
    ce_mod.ConfigEntry = MagicMock
    ce_mod.ConfigFlow = ConfigFlow
    ce_mod.OptionsFlow = OptionsFlow
    sys.modules["homeassistant.config_entries"] = ce_mod

    # homeassistant.const
    const_mod = types.ModuleType("homeassistant.const")
    const_mod.STATE_UNAVAILABLE = STATE_UNAVAILABLE
    const_mod.STATE_UNKNOWN = STATE_UNKNOWN
    const_mod.STATE_ON = STATE_ON
    const_mod.STATE_OFF = STATE_OFF
    const_mod.CONF_NAME = "name"
    const_mod.CONF_MIN_VALUE = "min_value"
    const_mod.CONF_MAX_VALUE = "max_value"
    const_mod.CONF_UNIT_OF_MEASUREMENT = "unit_of_measurement"
    const_mod.EVENT_HOMEASSISTANT_START = "homeassistant_start"
    const_mod.EVENT_HOMEASSISTANT_STOP = "homeassistant_stop"
    const_mod.Platform = Platform
    sys.modules["homeassistant.const"] = const_mod

    # homeassistant.core
    core_mod = types.ModuleType("homeassistant.core")
    core_mod.HomeAssistant = MagicMock
    core_mod.ServiceCall = MagicMock
    core_mod.ServiceResponse = dict
    core_mod.callback = lambda x: x
    core_mod.CoreState = CoreState
    core_mod.Event = MagicMock
    sys.modules["homeassistant.core"] = core_mod

    # homeassistant.helpers.update_coordinator
    coord_mod = types.ModuleType("homeassistant.helpers.update_coordinator")
    coord_mod.DataUpdateCoordinator = DataUpdateCoordinator
    coord_mod.CoordinatorEntity = CoordinatorEntity
    sys.modules["homeassistant.helpers.update_coordinator"] = coord_mod

    # homeassistant.components.select
    select_comp_mod = types.ModuleType("homeassistant.components.select")
    select_comp_mod.SelectEntity = SelectEntity
    sys.modules["homeassistant.components.select"] = select_comp_mod

    # homeassistant.components.sensor
    sensor_comp_mod = types.ModuleType("homeassistant.components.sensor")
    sensor_comp_mod.SensorEntity = SensorEntity
    sys.modules["homeassistant.components.sensor"] = sensor_comp_mod

    # homeassistant.components.switch
    switch_comp_mod = types.ModuleType("homeassistant.components.switch")
    switch_comp_mod.SwitchEntity = SwitchEntity
    sys.modules["homeassistant.components.switch"] = switch_comp_mod

    # homeassistant.helpers.entity_registry
    er_mod = types.ModuleType("homeassistant.helpers.entity_registry")
    er_mod.async_get = MagicMock(return_value=MagicMock())
    er_mod.EntityRegistryStore = MagicMock
    sys.modules["homeassistant.helpers.entity_registry"] = er_mod

    # homeassistant.helpers.frame
    frame_mod = types.ModuleType("homeassistant.helpers.frame")
    frame_mod.report_usage = MagicMock()
    sys.modules["homeassistant.helpers.frame"] = frame_mod

    # homeassistant.helpers
    helpers_mod = types.ModuleType("homeassistant.helpers")
    helpers_mod.entity_registry = er_mod
    helpers_mod.update_coordinator = coord_mod
    helpers_mod.frame = frame_mod
    sys.modules["homeassistant.helpers"] = helpers_mod

    # homeassistant.components.frontend
    frontend_mod = types.ModuleType("homeassistant.components.frontend")
    frontend_mod.async_register_built_in_panel = MagicMock()
    frontend_mod.async_remove_panel = MagicMock()
    frontend_mod.add_extra_js_url = MagicMock() # Added this
    sys.modules["homeassistant.components.frontend"] = frontend_mod

    # homeassistant.components.lovelace.dashboard
    lovelace_dash_mod = types.ModuleType("homeassistant.components.lovelace.dashboard")
    lovelace_dash_mod.LovelaceYAML = MagicMock()
    sys.modules["homeassistant.components.lovelace.dashboard"] = lovelace_dash_mod

    lovelace_mod = types.ModuleType("homeassistant.components.lovelace")
    lovelace_mod.dashboard = lovelace_dash_mod
    sys.modules["homeassistant.components.lovelace"] = lovelace_mod

    # homeassistant.components.websocket_api
    ws_api_mod = types.ModuleType("homeassistant.components.websocket_api")
    ws_api_mod.async_register_command = MagicMock()
    ws_api_mod.websocket_command = lambda schema: (lambda func: func)
    ws_api_mod.async_response = lambda func: func
    ws_api_mod.ActiveConnection = MagicMock
    sys.modules["homeassistant.components.websocket_api"] = ws_api_mod

    # homeassistant.components.sensor
    sensor_mod = types.ModuleType("homeassistant.components.sensor")
    class SensorDeviceClass:
        TEMPERATURE = "temperature"
        POWER = "power"
        ENERGY = "energy"
        BATTERY = "battery"
        HUMIDITY = "humidity"
    class SensorStateClass:
        MEASUREMENT = "measurement"
        TOTAL = "total"
        TOTAL_INCREASING = "total_increasing"
    sensor_mod.SensorDeviceClass = SensorDeviceClass
    sensor_mod.SensorStateClass = SensorStateClass
    sensor_mod.SensorEntity = type("SensorEntity", (), {})
    sys.modules["homeassistant.components.sensor"] = sensor_mod
    # homeassistant.components
    comp_mod = types.ModuleType("homeassistant.components")
    comp_mod.frontend = frontend_mod
    comp_mod.lovelace = lovelace_mod
    comp_mod.websocket_api = ws_api_mod
    comp_mod.sensor = sensor_mod
    sys.modules["homeassistant.components"] = comp_mod

    # homeassistant.loader
    loader_mod = types.ModuleType("homeassistant.loader")
    loader_mod.async_get_integration = AsyncMock(
        return_value=MagicMock(version="6.0.0")
    )
    sys.modules["homeassistant.loader"] = loader_mod

    # homeassistant.util
    util_mod = types.ModuleType("homeassistant.util")
    util_mod.logging = MagicMock()
    util_mod.dt = MagicMock()
    sys.modules["homeassistant.util"] = util_mod
    sys.modules["homeassistant.util.logging"] = util_mod.logging
    sys.modules["homeassistant.util.dt"] = util_mod.dt

    # homeassistant.helpers.service
    service_mod = types.ModuleType("homeassistant.helpers.service")
    sys.modules["homeassistant.helpers.service"] = service_mod

    # homeassistant.helpers.config_validation
    cv_mod = types.ModuleType("homeassistant.helpers.config_validation")
    cv_mod.PLATFORM_SCHEMA = MagicMock()
    cv_mod.config_entry_only_config_schema = MagicMock(return_value=MagicMock())
    cv_mod.string = MagicMock()
    cv_mod.boolean = MagicMock()
    cv_mod.time = MagicMock()
    cv_mod.positive_int = MagicMock()
    cv_mod.enum = MagicMock()
    sys.modules["homeassistant.helpers.config_validation"] = cv_mod

    # homeassistant (root)
    ha_mod = types.ModuleType("homeassistant")
    ha_mod.core = core_mod
    ha_mod.exceptions = exc_mod
    ha_mod.const = const_mod
    ha_mod.helpers = helpers_mod
    ha_mod.components = comp_mod
    ha_mod.loader = loader_mod
    ha_mod.util = util_mod
    sys.modules["homeassistant"] = ha_mod

_install_ha_stubs()

# ──────────────────────────────────────────────────────────────────────────────
# 2.  pytest configuration
# ──────────────────────────────────────────────────────────────────────────────

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "asyncio: mark a test as an asyncio coroutine"
    )

# ──────────────────────────────────────────────────────────────────────────────
# 3.  Shared fixtures
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_hass(tmp_path):
    """Return a MagicMock that mimics homeassistant.core.HomeAssistant."""
    hass = MagicMock()
    hass.config.path = lambda *parts: str(tmp_path.joinpath(*parts))
    hass.is_running = True

    async def _exec(func, *args):
        return func(*args)

    hass.async_add_executor_job = _exec

    # States store
    hass.states.get = MagicMock(return_value=None)
    hass.states.async_all = MagicMock(return_value=[])

    # Config entries
    hass.config_entries.async_entries = MagicMock(return_value=[])
    
    def _update_entry(entry, **kwargs):
        if "data" in kwargs:
            entry.data = kwargs["data"]
        if "title" in kwargs:
            entry.title = kwargs["title"]
        return True
        
    hass.config_entries.async_update_entry = MagicMock(side_effect=_update_entry)
    hass.config_entries.async_remove = AsyncMock()
    hass.config_entries.flow.async_init = AsyncMock()
    hass.config_entries.async_forward_entry_setups = AsyncMock()
    hass.config_entries.async_unload_platforms = AsyncMock(return_value=True)

    # Services
    hass.services.async_call = AsyncMock()
    hass.services.async_remove = AsyncMock()
    hass.services.async_register = MagicMock()

    # hass.data
    hass.data = {}

    return hass

@pytest.fixture
def mock_entry():
    """Return a MagicMock config entry."""
    entry = MagicMock()
    entry.entry_id = "test_entry_id"
    entry.title = "Test Controller"
    entry.data = {
        "name": "Test Controller",
        "preset_type": "thermostat",
        "target_entity": "climate.test",
        "global_prefix": "cronostar_thermostat_test_",
        "logging_enabled": False,
    }
    entry.options = {}
    entry.runtime_data = None
    return entry

@pytest.fixture
def cronostar_data(hass):
    """Initialize hass.data[DOMAIN]."""
    hass.data[DOMAIN] = {
        "settings_manager": MagicMock(),
        "storage_manager": MagicMock(),
        "profile_service": MagicMock(),
    }
    return hass.data[DOMAIN]
