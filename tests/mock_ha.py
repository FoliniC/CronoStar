from unittest.mock import MagicMock, AsyncMock
import sys
import types
from enum import StrEnum

# Helper to create a mock module
def mock_module(name):
    m = types.ModuleType(name)
    m.__path__ = []
    return m

# Mock Base Classes
class MockEntity:
    def __init__(self):
        self.hass = None
        self.platform = None
        self.entity_id = None
        self._attr_unique_id = None
        self._attr_name = None
        self._attr_has_entity_name = False
        self._attr_device_info = None
        self._attr_state_class = None
        self._attr_native_unit_of_measurement = None
        self._attr_device_class = None
        self._attr_translation_key = None
        self.registry_entry = None
        self._attr_device_class = None
        self._attr_native_unit_of_measurement = None

    @property
    def unique_id(self):
        return self._attr_unique_id

    @property
    def name(self):
        return self._attr_name
        
    @property
    def device_info(self):
        return self._attr_device_info
        
    @property
    def extra_state_attributes(self):
        return {}
        
    @property
    def device_class(self):
        return self._attr_device_class
        
    @property
    def native_unit_of_measurement(self):
        return self._attr_native_unit_of_measurement

class MockCoordinatorEntity(MockEntity):
    def __init__(self, coordinator):
        super().__init__()
        self.coordinator = coordinator

class MockDataUpdateCoordinator(MagicMock):
    def __init__(self, hass, logger, name, update_interval=None, **kwargs):
        super().__init__(**kwargs)
        self.hass = hass
        self.logger = logger
        self.name = name
        self.update_interval = update_interval
        self.data = {}
    
    async def async_refresh(self):
        pass
        
    async def async_config_entry_first_refresh(self):
        pass

class MockConfigFlow:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__()
    
    def __init__(self):
        self.hass = None
    
    async def async_set_unique_id(self, *args, **kwargs):
        return MagicMock()
    
    def _abort_if_unique_id_configured(self, *args, **kwargs):
        pass
        
    def async_abort(self, **kwargs):
        return {"type": "abort", **kwargs}
        
    def async_create_entry(self, **kwargs):
        return {"type": "create_entry", **kwargs}
        
    def async_show_form(self, **kwargs):
        return {"type": "form", **kwargs}

class MockOptionsFlow:
    def __init__(self, config_entry):
        self.config_entry = config_entry
        self.hass = None

    def async_create_entry(self, **kwargs):
        return {"type": "create_entry", **kwargs}
        
    def async_show_form(self, **kwargs):
        return {"type": "form", **kwargs}

# Mock Platform enum
class Platform(StrEnum):
    SENSOR = "sensor"
    SWITCH = "switch"
    SELECT = "select"
    NUMBER = "number"
    CLIMATE = "climate"
    COVER = "cover"

class FlowResultType(StrEnum):
    FORM = "form"
    CREATE_ENTRY = "create_entry"
    ABORT = "abort"
    EXTERNAL_STEP = "external_step"
    SHOW_PROGRESS = "show_progress"

# Create mock modules
ha = mock_module("homeassistant")
ha.const = mock_module("homeassistant.const")
ha.const.STATE_UNAVAILABLE = "unavailable"
ha.const.STATE_UNKNOWN = "unknown"
ha.const.STATE_ON = "on"
ha.const.STATE_OFF = "off"
ha.const.CONF_NAME = "name"
ha.const.Platform = Platform
ha.const.EVENT_HOMEASSISTANT_START = "homeassistant_start"
ha.const.EVENT_HOMEASSISTANT_STOP = "homeassistant_stop"

ha.core = mock_module("homeassistant.core")
ha.core.HomeAssistant = MagicMock
ha.core.ServiceCall = MagicMock
ha.core.ServiceResponse = MagicMock
ha.core.CoreState = MagicMock()
ha.core.Event = MagicMock
ha.core.callback = lambda x: x

ha.config_entries = mock_module("homeassistant.config_entries")
ha.config_entries.ConfigEntry = MagicMock
ha.config_entries.ConfigFlow = MockConfigFlow
ha.config_entries.OptionsFlow = MockOptionsFlow

ha.data_entry_flow = mock_module("homeassistant.data_entry_flow")
ha.data_entry_flow.FlowResultType = FlowResultType

ha.helpers = mock_module("homeassistant.helpers")
ha.helpers.config_validation = mock_module("homeassistant.helpers.config_validation")
ha.helpers.config_validation.config_entry_only_config_schema = MagicMock(return_value=MagicMock())

ha.helpers.update_coordinator = mock_module("homeassistant.helpers.update_coordinator")
ha.helpers.update_coordinator.DataUpdateCoordinator = MockDataUpdateCoordinator
ha.helpers.update_coordinator.CoordinatorEntity = MockCoordinatorEntity

ha.helpers.entity = mock_module("homeassistant.helpers.entity")
ha.helpers.entity.EntityCategory = MagicMock()

ha.components = mock_module("homeassistant.components")
ha.components.sensor = mock_module("homeassistant.components.sensor")
ha.components.sensor.SensorEntity = MockEntity
ha.components.sensor.SensorDeviceClass = MagicMock()
ha.components.sensor.SensorStateClass = MagicMock()

ha.components.select = mock_module("homeassistant.components.select")
ha.components.select.SelectEntity = MockEntity

ha.components.switch = mock_module("homeassistant.components.switch")
ha.components.switch.SwitchEntity = MockEntity

ha.components.frontend = mock_module("homeassistant.components.frontend")
ha.components.frontend.add_extra_js_url = MagicMock()

ha.components.http = mock_module("homeassistant.components.http")
ha.components.http.StaticPathConfig = MagicMock
ha.components.http.start_http_server_and_save_config = MagicMock

ha.loader = mock_module("homeassistant.loader")
ha.loader.async_get_integration = AsyncMock()

ha.exceptions = mock_module("homeassistant.exceptions")
ha.exceptions.HomeAssistantError = Exception

ha.util = mock_module("homeassistant.util")
ha.util.dt = MagicMock()

# Mock voluptuous
vol = mock_module("voluptuous")
vol.Schema = MagicMock
vol.Optional = MagicMock
vol.Required = MagicMock
vol.All = MagicMock
vol.Coerce = MagicMock
vol.In = MagicMock

# Inject into sys.modules
sys.modules["homeassistant"] = ha
sys.modules["homeassistant.const"] = ha.const
sys.modules["homeassistant.core"] = ha.core
sys.modules["homeassistant.config_entries"] = ha.config_entries
sys.modules["homeassistant.data_entry_flow"] = ha.data_entry_flow
sys.modules["homeassistant.helpers"] = ha.helpers
sys.modules["homeassistant.helpers.config_validation"] = ha.helpers.config_validation
sys.modules["homeassistant.helpers.update_coordinator"] = ha.helpers.update_coordinator
sys.modules["homeassistant.helpers.entity"] = ha.helpers.entity
sys.modules["homeassistant.components"] = ha.components
sys.modules["homeassistant.components.sensor"] = ha.components.sensor
sys.modules["homeassistant.components.select"] = ha.components.select
sys.modules["homeassistant.components.switch"] = ha.components.switch
sys.modules["homeassistant.components.frontend"] = ha.components.frontend
sys.modules["homeassistant.components.http"] = ha.components.http
sys.modules["homeassistant.loader"] = ha.loader
sys.modules["homeassistant.exceptions"] = ha.exceptions
sys.modules["homeassistant.util"] = ha.util
sys.modules["voluptuous"] = vol
