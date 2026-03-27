"""Extended tests for CronoStar utilities."""
import logging
import pytest
from custom_components.cronostar.utils.error_handler import (
    handle_service_errors,
    safe_get,
    build_error_response,
    validate_required_fields,
    validate_data_type,
    log_operation,
    CronoStarError,
    ValidationError
)
from custom_components.cronostar.utils.prefix_normalizer import (
    normalize_preset_type,
    get_effective_prefix,
    normalize_prefix,
    extract_prefix_from_entity,
    build_entity_id,
    validate_prefix_format
)
from homeassistant.exceptions import HomeAssistantError

# --- Error Handler Tests ---

@pytest.mark.anyio
async def test_handle_service_errors_decorator():
    """Test handle_service_errors decorator."""
    @handle_service_errors
    async def success_func():
        return "ok"

    @handle_service_errors
    async def crono_error_func():
        raise CronoStarError("Crono Error")

    @handle_service_errors
    async def generic_error_func():
        raise ValueError("Generic Error")

    assert await success_func() == "ok"
    
    with pytest.raises(CronoStarError):
        await crono_error_func()
        
    with pytest.raises(HomeAssistantError):
        await generic_error_func()

def test_safe_get():
    """Test safe_get utility."""
    data = {"a": {"b": 1}, "c": None}
    assert safe_get(data, "a", "b") == 1
    assert safe_get(data, "a", "z", default=0) == 0
    assert safe_get(data, "c", "d", default="miss") == "miss"
    assert safe_get(None, "a") is None

def test_build_error_response():
    """Test build_error_response utility."""
    err = ValueError("test")
    resp = build_error_response(err, context="ctx", include_details=True)
    assert resp["success"] is False
    assert resp["error"] == "test"
    assert resp["context"] == "ctx"
    assert "details" in resp

def test_validate_required_fields():
    """Test validate_required_fields utility."""
    data = {"name": "test", "val": 0}
    validate_required_fields(data, "name", "val") # No raise
    
    with pytest.raises(ValidationError):
        validate_required_fields(data, "missing")
    
    with pytest.raises(ValidationError):
        validate_required_fields({"a": None}, "a")

def test_validate_data_type():
    """Test validate_data_type utility."""
    validate_data_type(10, int, "field") # No raise
    
    with pytest.raises(ValidationError):
        validate_data_type("10", int, "field")

def test_log_operation(caplog):
    """Test log_operation utility."""
    with caplog.at_level(logging.INFO):
        log_operation("test_op", True, key="val")
        assert "✓ test_op (key=val)" in caplog.text
        
    with caplog.at_level(logging.WARNING):
        log_operation("test_fail", False)
        assert "✗ test_fail" in caplog.text

# --- Prefix Normalizer Tests ---

def test_normalize_preset_type():
    """Test normalize_preset_type utility."""
    assert normalize_preset_type("heating") == "thermostat"
    assert normalize_preset_type("light") == "generic_switch"
    assert normalize_preset_type("unknown_preset") == "thermostat"
    assert normalize_preset_type(None) == "thermostat"

def test_get_effective_prefix():
    """Test get_effective_prefix utility."""
    assert get_effective_prefix("p1") == "p1_"
    assert get_effective_prefix(None, {"global_prefix": "p2"}) == "p2_"
    assert get_effective_prefix(None, {"entity_prefix": "p3"}) == "p3_"
    assert get_effective_prefix(None, None) == ""

def test_normalize_prefix():
    """Test normalize_prefix utility."""
    assert normalize_prefix("test") == "test_"
    assert normalize_prefix("test_") == "test_"
    assert normalize_prefix("") == ""
    assert normalize_prefix(None) == ""
    assert normalize_prefix("  ") == ""

def test_extract_prefix_from_entity():
    """Test extract_prefix_from_entity utility."""
    assert extract_prefix_from_entity("sensor.living_room_current") == "living_room_"
    assert extract_prefix_from_entity("input_select.bedroom_profiles") == "bedroom_"
    assert extract_prefix_from_entity("invalid") is None
    assert extract_prefix_from_entity("domain.no_suffix") is None

def test_build_entity_id():
    """Test build_entity_id utility."""
    assert build_entity_id("sensor", "cr", "val") == "sensor.cr_val"
    assert build_entity_id("switch", None, "state") == "switch.state"

def test_validate_prefix_format():
    """Test validate_prefix_format utility."""
    assert validate_prefix_format("valid_123")[0] is True
    assert validate_prefix_format("Invalid Space")[0] is False
    assert validate_prefix_format("1start_with_number")[0] is False
    assert validate_prefix_format("a" * 60)[0] is False
    assert validate_prefix_format("")[0] is True
