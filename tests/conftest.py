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

# Ensure the root of the repository is in sys.path
sys.path.append(str(Path(__file__).parent.parent))

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
    def _async_current_entries(self):
        return list(self.hass.config_entries._entries.values())
    def async_set_unique_id(self, unique_id, **kwargs): return unique_id
    def _abort_if_unique_id_configured(self, **kwargs): pass
    async def async_update_reload_and_abort(self, entry, **kwargs): return {"type": "abort"}

class OptionsFlow:
    def __init__(self, config_entry): self.config_entry = config_entry
    async def async_step_init(self, user_input=None): return {}
    def async_show_form(self, **kwargs): return {"type": "form", **kwargs}
    def async_create_entry(self, **kwargs): return {"type": "create_entry", **kwargs}
    def async_abort(self, **kwargs): return {"type": "abort", **kwargs}

class Entity:
    """Base class for HA entities."""
    _attr_unique_id = None
    _attr_name = None
    _attr_device_class = None
    _attr_native_unit_of_measurement = None
    _attr_device_info = None
    _attr_translation_key = None

    @property
    def unique_id(self): return self._attr_unique_id
    @property
    def name(self): return self._attr_name
    @property
    def device_class(self): return self._attr_device_class
    @property
    def native_unit_of_measurement(self): return self._attr_native_unit_of_measurement
    @property
    def device_info(self): return self._attr_device_info
    @property
    def translation_key(self): return self._attr_translation_key

class CoordinatorEntity(Entity):
    def __init__(self, coordinator, context=None):
        self.coordinator = coordinator
        self.hass = coordinator.hass

class SelectEntity(Entity): pass
class SensorEntity(Entity): pass
class SwitchEntity(Entity): pass
class SensorDeviceClass:
    TEMPERATURE = "temperature"
    ENERGY = "energy"
class SensorStateClass:
    MEASUREMENT = "measurement"
    TOTAL_INCREASING = "total_increasing"

class MockConfigEntry:
    """Mock config entry for tests."""
    def __init__(self, entry_id="test", domain="cronostar", title="Test", data=None, options=None, version=1):
        self.entry_id = entry_id
        self.domain = domain
        self.title = title
        self.data = data or {}
        self.options = options or {}
        self.version = version
        self.runtime_data = None
    
    def add_to_hass(self, hass):
        """Register the entry in the mock registry."""
        hass.config_entries._entries[self.entry_id] = self
        return self

def _install_ha_stubs():
    STATE_UNAVAILABLE = "unavailable"
    STATE_UNKNOWN = "unknown"
    STATE_ON = "on"
    STATE_OFF = "off"

    # Mock pytest_homeassistant_custom_component.common
    mock_common = types.ModuleType("pytest_homeassistant_custom_component.common")
    mock_common.MockConfigEntry = MockConfigEntry
    sys.modules["pytest_homeassistant_custom_component"] = types.ModuleType("pytest_homeassistant_custom_component")
    sys.modules["pytest_homeassistant_custom_component.common"] = mock_common

    # Mock voluptuous
    vol_mod = types.ModuleType("voluptuous")
    class Schema:
        def __init__(self, schema, extra=0):
            self.schema = schema
        def __call__(self, data):
            if not isinstance(data, dict): return data
            for k, v in self.schema.items():
                # Extract key from Required/Optional
                key = k.schema if hasattr(k, 'schema') else k
                if hasattr(k, 'required') and k.required and key not in data:
                    import voluptuous
                    raise voluptuous.error.RequiredFieldInvalid(f"required key not provided @ data['{key}']")
            return data
        def extend(self, *args, **kwargs): return self

    class Marker:
        def __init__(self, schema, msg=None, default=None):
            self.schema = schema
            self.msg = msg
            self.default = default
    class Required(Marker): required = True
    class Optional(Marker): required = False

    vol_mod.Schema = Schema
    vol_mod.Required = Required
    vol_mod.Optional = Optional
    vol_mod.In = lambda x: x
    vol_mod.Any = lambda *x: x
    vol_mod.All = lambda *x: x
    vol_mod.Coerce = lambda x: x
    vol_mod.Range = lambda min=None, max=None: lambda x: x
    
    class VolError(Exception): pass
    class Invalid(VolError): pass
    class RequiredFieldInvalid(Invalid): pass
    
    error_mod = types.ModuleType("voluptuous.error")
    error_mod.Error = VolError
    error_mod.Invalid = Invalid
    error_mod.RequiredFieldInvalid = RequiredFieldInvalid
    vol_mod.error = error_mod
    vol_mod.Invalid = Invalid
    
    sys.modules["voluptuous"] = vol_mod
    sys.modules["voluptuous.error"] = error_mod

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

    # homeassistant.helpers.entity
    ent_mod = types.ModuleType("homeassistant.helpers.entity")
    class EntityCategory:
        CONFIG = "config"
        DIAGNOSTIC = "diagnostic"
    ent_mod.EntityCategory = EntityCategory
    sys.modules["homeassistant.helpers.entity"] = ent_mod

    # homeassistant.helpers
    helpers_mod = types.ModuleType("homeassistant.helpers")
    helpers_mod.__path__ = [] # Mark as package
    helpers_mod.entity_registry = er_mod
    helpers_mod.update_coordinator = coord_mod
    helpers_mod.frame = frame_mod
    sys.modules["homeassistant.helpers"] = helpers_mod

    # homeassistant.helpers.selector
    sel_mod = types.ModuleType("homeassistant.helpers.selector")
    sel_mod.selector = lambda x: x
    sys.modules["homeassistant.helpers.selector"] = sel_mod

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
    lovelace_mod.__path__ = []
    lovelace_mod.dashboard = lovelace_dash_mod
    lovelace_mod.async_get_config = AsyncMock()
    lovelace_mod.async_save_config = AsyncMock()
    sys.modules["homeassistant.components.lovelace"] = lovelace_mod

    lovelace_const_mod = types.ModuleType("homeassistant.components.lovelace.const")
    lovelace_const_mod.LOVELACE_DATA = "lovelace"
    sys.modules["homeassistant.components.lovelace.const"] = lovelace_const_mod
    lovelace_mod.const = lovelace_const_mod

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
    sensor_mod.SensorEntity = SensorEntity
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

    # homeassistant.data_entry_flow
    def_mod = types.ModuleType("homeassistant.data_entry_flow")
    class FlowResultType:
        FORM = "form"
        CREATE_ENTRY = "create_entry"
        ABORT = "abort"
        MENU = "menu"
        EXTERNAL_STEP = "external_step"
    def_mod.FlowResultType = FlowResultType
    sys.modules["homeassistant.data_entry_flow"] = def_mod

    # homeassistant (root)
    ha_mod = types.ModuleType("homeassistant")
    ha_mod.__path__ = [] # Mark as package
    ha_mod.core = core_mod
    ha_mod.exceptions = exc_mod
    ha_mod.const = const_mod
    ha_mod.helpers = helpers_mod
    ha_mod.components = comp_mod
    ha_mod.loader = loader_mod
    ha_mod.util = util_mod
    ha_mod.data_entry_flow = def_mod
    sys.modules["homeassistant"] = ha_mod

    # Assicura che HomeAssistantError sia la stessa classe ovunque (Structural Fix)
    import homeassistant.exceptions
    try:
        import custom_components.cronostar.services.profile_service as _ps
        _ps.HomeAssistantError = homeassistant.exceptions.HomeAssistantError
    except ImportError:
        pass
    try:
        import custom_components.cronostar.storage.storage_manager as _sm
        _sm.HomeAssistantError = homeassistant.exceptions.HomeAssistantError
    except ImportError:
        pass

_install_ha_stubs()

import asyncio

@pytest.fixture(autouse=True)
def _loop_patch():
    """Assicura che esista un event loop per evitare RuntimeError in Python 3.10+."""
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

@pytest.fixture(autouse=True)
def verify_cleanup():
    """Override verify_cleanup per evitare RuntimeError su versioni recenti di Python."""
    yield

@pytest.fixture(autouse=True)
def enable_event_loop_debug():
    """Override enable_event_loop_debug per evitare RuntimeError su versioni recenti di Python."""
    pass

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
def hass(tmp_path):
    """Return a MagicMock that mimics homeassistant.core.HomeAssistant."""
    hass = MagicMock()
    hass.config.path = lambda *parts: str(tmp_path.joinpath(*parts))
    hass.is_running = True

    async def _exec(func, *args):
        return func(*args)

    hass.async_add_executor_job = _exec

    # Config entries storage
    hass.config_entries._entries = {}

    # States store
    _states = {}
    def _get_state(entity_id):
        return _states.get(entity_id)
    
    def _set_state(entity_id, state, attributes=None):
        mock_state = MagicMock()
        mock_state.state = state
        mock_state.attributes = attributes or {}
        mock_state.entity_id = entity_id
        _states[entity_id] = mock_state
        return mock_state

    hass.states.get = MagicMock(side_effect=_get_state)
    hass.states.async_set = MagicMock(side_effect=_set_state)
    hass.states.async_all = MagicMock(side_effect=lambda domain=None: list(_states.values()) if domain is None else [s for s in _states.values() if s.entity_id.startswith(domain + ".")])

    # Config entries
    hass.config_entries.async_entries = MagicMock(side_effect=lambda *args, **kwargs: list(hass.config_entries._entries.values()))
    hass.config_entries._async_current_entries = MagicMock(side_effect=lambda *args, **kwargs: list(hass.config_entries._entries.values()))
    
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
    hass.config_entries.async_reload = AsyncMock()

    # Services
    _services = {}
    def _register_service(domain, service, handler, schema=None, **kwargs):
        _services[(domain, service)] = handler

    async def _call_service(domain, service, service_data=None, blocking=False, context=None, limit=None, target=None):
        if (domain, service) in _services:
            handler = _services[(domain, service)]
            call = MagicMock()
            call.domain = domain
            call.service = service
            call.data = service_data or {}
            # Check if it is a coroutine
            import inspect
            if inspect.iscoroutinefunction(handler):
                return await handler(call)
            return handler(call)
        return None

    hass.services.async_call = AsyncMock(side_effect=_call_service)
    hass.services.async_remove = AsyncMock()
    hass.services.async_register = MagicMock(side_effect=_register_service)

    # hass.data
    hass.data = {}

    return hass

@pytest.fixture
def mock_entry():
    """Return a MockConfigEntry."""
    return MockConfigEntry(
        entry_id="test_entry_id",
        title="Test Controller",
        data={
            "name": "Test Controller",
            "preset_type": "thermostat",
            "target_entity": "climate.test",
            "global_prefix": "cronostar_thermostat_test_",
            "logging_enabled": False,
        }
    )

@pytest.fixture
def cronostar_data(hass):
    """Initialize hass.data[DOMAIN]."""
    from custom_components.cronostar.const import DOMAIN
    hass.data[DOMAIN] = {
        "settings_manager": MagicMock(),
        "storage_manager": MagicMock(),
        "profile_service": MagicMock(),
    }
    return hass.data[DOMAIN]


@pytest.fixture
def mock_storage_manager():
    """Shared storage manager mock with all async methods as AsyncMock."""
    sm = MagicMock()
    sm.list_profiles = AsyncMock(return_value=[])
    sm.load_profile_cached = AsyncMock(return_value=None)
    sm.update_active_profile = AsyncMock(return_value=True)
    sm.get_cached_containers = AsyncMock(return_value=[])
    sm.save_profile = AsyncMock(return_value=True)
    sm.delete_profile = AsyncMock(return_value=True)
    sm.delete_controller = AsyncMock(return_value=True)
    sm.load_profile = AsyncMock(return_value=None)
    return sm


@pytest.fixture
def mock_coordinator(hass, mock_entry, mock_storage_manager):
    """Build a ready-to-use CronoStarCoordinator with real dict data."""
    from custom_components.cronostar.coordinator import CronoStarCoordinator
    from custom_components.cronostar.const import DOMAIN

    mock_entry.data = {
        "target_entity": "climate.test_entity",
        "name": "Test",
        "preset_type": "thermostat",
        "preset": "thermostat",
        "logging_enabled": False,
    }
    mock_entry.options = {}

    hass.data = {
        DOMAIN: {
            "storage_manager": mock_storage_manager,
            "version": "6.0.0",
            "global_config": {},
        }
    }

    coord = CronoStarCoordinator(hass, mock_entry)
    coord.storage_manager = mock_storage_manager
    # Pre-imposta uno stato valido per i test che non lo fanno esplicitamente
    hass.states.async_set("climate.test_entity", "heat")
    return coord


@pytest.fixture
def profile_service(hass, mock_storage_manager):
    """Ready-to-use ProfileService."""
    from custom_components.cronostar.services.profile_service import ProfileService
    from custom_components.cronostar.const import DOMAIN
    
    settings = MagicMock()
    settings.load_settings = AsyncMock(return_value={})

    ps = ProfileService(hass, mock_storage_manager, settings)
    
    # Ensure DOMAIN data exists
    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = {}
    hass.data[DOMAIN]["profile_service"] = ps
    hass.data[DOMAIN]["storage_manager"] = mock_storage_manager
    hass.data[DOMAIN]["settings_manager"] = settings
    
    return ps
