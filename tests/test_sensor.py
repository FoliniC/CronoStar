"""Test CronoStar Sensor."""
import asyncio
from unittest.mock import MagicMock
import pytest
from homeassistant.components.sensor import SensorDeviceClass
from custom_components.cronostar.sensor import CronoStarCurrentSensor
from custom_components.cronostar.const import DOMAIN

def run(coro):
    return asyncio.run(coro)

def test_sensor_entity(hass, mock_coordinator):
    """Test sensor entity properties."""
    mock_coordinator.last_update_success = True
    mock_coordinator.data = {
        "current_value": 21.5,
        "selected_profile": "Default",
        "is_enabled": True
    }
    mock_coordinator.preset_type = "thermostat"
    mock_coordinator.last_update_success = True
    mock_coordinator.prefix = "cronostar_thermostat_test_"
    mock_coordinator.target_entity = "climate.test_thermostat"

    sensor = CronoStarCurrentSensor(mock_coordinator)

    assert sensor.unique_id == "cronostar_thermostat_test_current"
    assert sensor.native_value == 21.5
    assert sensor.device_class == SensorDeviceClass.TEMPERATURE
    assert sensor.native_unit_of_measurement == "°C"

    extra = sensor.extra_state_attributes
    assert extra["active_profile"] == "Default"
    assert extra["is_enabled"] is True
    assert extra["target_entity"] == "climate.test_thermostat"

def test_sensor_availability(hass, mock_coordinator):
    """Test sensor availability."""
    mock_coordinator.target_entity = "climate.test_thermostat"
    sensor = CronoStarCurrentSensor(mock_coordinator)

    # Target exists
    hass.states.async_set("climate.test_thermostat", "20")
    assert sensor.available is True

    # Target missing
    hass.states.get.side_effect = lambda eid: None
    mock_coordinator.last_update_success = False
    assert sensor.available is False

def test_sensor_types(hass, mock_coordinator):
    """Test sensor properties for different presets."""
    mock_coordinator.preset_type = "ev_charging"
    sensor = CronoStarCurrentSensor(mock_coordinator)
    assert sensor.device_class == SensorDeviceClass.POWER
    assert sensor.native_unit_of_measurement == "kW"

    mock_coordinator.preset_type = "cover"
    sensor = CronoStarCurrentSensor(mock_coordinator)
    assert sensor.native_unit_of_measurement == "%"
