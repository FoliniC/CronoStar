"""Coverage boost for CronoStar platforms: sensor, diagnostics, select."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from custom_components.cronostar.sensor import CronoStarCurrentSensor, async_setup_entry as async_setup_sensor
from custom_components.cronostar.select import CronoStarProfileSelect, async_setup_entry as async_setup_select
from custom_components.cronostar.diagnostics import async_get_config_entry_diagnostics
from custom_components.cronostar.const import (
    DOMAIN, CONF_TITLE, CONF_MIN_VALUE, CONF_MAX_VALUE, CONF_STEP_VALUE,
    CONF_UNIT_OF_MEASUREMENT, CONF_Y_AXIS_LABEL, CONF_ALLOW_MAX_VALUE
)

@pytest.fixture
def mock_coordinator(mock_hass, mock_entry):
    """Build a mock coordinator for platform tests."""
    mock_hass.data[DOMAIN] = {"version": "1.2.3", "_global_setup_done": True}
    
    coordinator = MagicMock()
    coordinator.hass = mock_hass
    coordinator.entry = mock_entry
    coordinator.prefix = "p1_"
    coordinator.name = "Test"
    coordinator.preset_type = "thermostat"
    coordinator.target_entity = "climate.target"
    coordinator.logging_enabled = True
    coordinator.data = {
        "current_value": 21.5,
        "selected_profile": "Summer",
        "is_enabled": True,
        "available_profiles": ["Summer", "Winter"],
        "card_config": {
            CONF_TITLE: "My Chart",
            CONF_MIN_VALUE: 15,
            CONF_MAX_VALUE: 30,
            CONF_STEP_VALUE: 0.5,
            CONF_UNIT_OF_MEASUREMENT: "°C",
            CONF_Y_AXIS_LABEL: "T",
            CONF_ALLOW_MAX_VALUE: True
        }
    }
    coordinator.set_profile = AsyncMock()
    
    # For diagnostics
    coordinator.preset = "thermostat"
    coordinator.current_value = 21.5
    coordinator.selected_profile = "Summer"
    coordinator.is_enabled = True
    coordinator.available_profiles = ["Summer", "Winter"]
    
    return coordinator

# --- SENSOR TESTS ---

@pytest.mark.anyio
async def test_sensor_full(mock_coordinator, mock_hass, mock_entry):
    """Test sensor properties and branches."""
    mock_entry.runtime_data = mock_coordinator
    async_add_entities = MagicMock()
    await async_setup_sensor(mock_hass, mock_entry, async_add_entities)
    sensor = async_add_entities.call_args[0][0][0]
    
    # Test preset: ev_charging
    mock_coordinator.preset_type = "ev_charging"
    sensor_ev = CronoStarCurrentSensor(mock_coordinator)
    assert sensor_ev._attr_translation_key == "current_value_power"
    assert sensor_ev._attr_native_unit_of_measurement == "kW"
    
    # Test preset: cover
    mock_coordinator.preset_type = "cover"
    sensor_cover = CronoStarCurrentSensor(mock_coordinator)
    assert sensor_cover._attr_translation_key == "current_value_cover"
    assert sensor_cover._attr_native_unit_of_measurement == "%"
    
    # Test preset: switch (else branch)
    mock_coordinator.preset_type = "switch"
    sensor_switch = CronoStarCurrentSensor(mock_coordinator)
    assert sensor_switch._attr_translation_key == "current_value"
    assert sensor_switch._attr_native_unit_of_measurement is None

    # model_name exception branch
    mock_coordinator.preset_type = 123 # Int has no .replace()
    sensor_err = CronoStarCurrentSensor(mock_coordinator)
    assert sensor_err._attr_device_info["model"] == "Controller"
    mock_coordinator.preset_type = "thermostat"

    # Test preset: None (else branch via getattr)
    del mock_coordinator.preset_type
    sensor_none = CronoStarCurrentSensor(mock_coordinator)
    assert sensor_none._attr_translation_key == "current_value_temp" # Defaults to thermostat
    
    # native_value
    mock_coordinator.data = {"current_value": 10.5}
    assert sensor.native_value == 10.5
    mock_coordinator.data = None
    assert sensor.native_value == 0.0
    
    # extra_state_attributes
    mock_coordinator.data = {
        "selected_profile": "P1",
        "is_enabled": False,
        "card_config": {CONF_TITLE: "T", CONF_MIN_VALUE: 10}
    }
    attrs = sensor.extra_state_attributes
    assert attrs["active_profile"] == "P1"
    assert attrs["is_enabled"] is False
    assert attrs[CONF_TITLE] == "T"
    
    mock_coordinator.data = None
    assert sensor.extra_state_attributes["active_profile"] == "Default"
    
    # availability
    mock_hass.states.get = MagicMock(return_value=MagicMock(state="heat"))
    assert sensor.available is True
    mock_hass.states.get = MagicMock(return_value=None)
    assert sensor.available is False

# --- SELECT TESTS ---

@pytest.mark.anyio
async def test_select_full(mock_coordinator, mock_hass, mock_entry):
    """Test select properties and branches."""
    mock_entry.runtime_data = mock_coordinator
    async_add_entities = MagicMock()
    await async_setup_select(mock_hass, mock_entry, async_add_entities)
    select = async_add_entities.call_args[0][0][0]
    
    # options / current
    assert "Summer" in select.options
    assert select.current_option == "Summer"
    
    mock_coordinator.data = None
    assert select.options == ["Default"]
    assert select.current_option == "Default"
    
    # select_option
    mock_coordinator.logging_enabled = True
    await select.async_select_option("Winter")
    mock_coordinator.set_profile.assert_called_with("Winter")
    
    # model_name exception branch
    mock_coordinator.preset_type = 123
    select_err = CronoStarProfileSelect(mock_coordinator)
    assert select_err._attr_device_info["model"] == "Controller"
    mock_coordinator.preset_type = "thermostat"

    mock_coordinator.logging_enabled = False
    await select.async_select_option("Summer")
    
    # availability
    mock_hass.states.get = MagicMock(return_value=MagicMock(state="heat"))
    assert select.available is True

# --- DIAGNOSTICS TESTS ---

@pytest.mark.anyio
async def test_diagnostics_full(mock_hass, mock_entry, mock_coordinator):
    """Test diagnostics output."""
    mock_entry.runtime_data = mock_coordinator
    diag = await async_get_config_entry_diagnostics(mock_hass, mock_entry)
    assert diag["entry"]["entry_id"] == mock_entry.entry_id
    assert diag["controller_state"]["name"] == "Test"
    
    # Case: no runtime_data
    mock_entry.runtime_data = None
    diag = await async_get_config_entry_diagnostics(mock_hass, mock_entry)
    assert "controller_state" not in diag
