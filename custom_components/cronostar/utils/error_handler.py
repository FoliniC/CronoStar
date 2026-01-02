# custom_components/cronostar/utils/error_handler.py
"""
Standardized error handling for CronoStar
Provides consistent error responses and logging
"""

import logging
from functools import wraps
from typing import Any

from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)


class CronoStarError(HomeAssistantError):
    """Base exception for CronoStar"""

    pass


class ProfileNotFoundError(CronoStarError):
    """Profile not found in storage"""

    pass


class InvalidScheduleError(CronoStarError):
    """Invalid schedule data"""

    pass


class StorageError(CronoStarError):
    """Storage operation failed"""

    pass


class ValidationError(CronoStarError):
    """Data validation failed"""

    pass


def handle_service_errors(func):
    """
    Decorator to handle service call errors consistently

    Usage:
        @handle_service_errors
        async def my_service(call: ServiceCall):
            # service logic
    """

    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except CronoStarError as e:
            _LOGGER.warning("CronoStar error in %s: %s", func.__name__, e)
            raise
        except Exception as e:
            _LOGGER.error("Unexpected error in %s: %s", func.__name__, e, exc_info=True)
            raise HomeAssistantError(f"Service failed: {e}") from e

    return wrapper


def safe_get(data: dict, *keys, default: Any = None) -> Any:
    """
    Safely get nested dictionary values

    Args:
        data: Dictionary to query
        *keys: Keys to traverse
        default: Default value if not found

    Returns:
        Value or default

    Examples:
        >>> safe_get({"a": {"b": 1}}, "a", "b")
        1
        >>> safe_get({"a": {}}, "a", "b", default=0)
        0
    """
    current = data

    for key in keys:
        if not isinstance(current, dict):
            return default

        current = current.get(key)

        if current is None:
            return default

    return current


def build_error_response(error: Exception, context: str | None = None, include_details: bool = False) -> dict:
    """
    Build standardized error response

    Args:
        error: Exception that occurred
        context: Additional context string
        include_details: Include full error details

    Returns:
        Error response dictionary
    """
    response = {"success": False, "error": str(error), "error_type": type(error).__name__}

    if context:
        response["context"] = context

    if include_details:
        import traceback

        response["details"] = traceback.format_exc()

    return response


def validate_required_fields(data: dict, *fields) -> None:
    """
    Validate required fields exist in data

    Args:
        data: Data dictionary
        *fields: Required field names

    Raises:
        ValidationError: If any required field is missing

    Examples:
        >>> validate_required_fields({"name": "test"}, "name")
        >>> validate_required_fields({}, "name")  # raises ValidationError
    """
    missing = []

    for field in fields:
        if field not in data or data[field] is None:
            missing.append(field)

    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")


def validate_data_type(value: Any, expected_type: type, field_name: str) -> None:
    """
    Validate data type

    Args:
        value: Value to check
        expected_type: Expected type
        field_name: Field name for error message

    Raises:
        ValidationError: If type doesn't match
    """
    if not isinstance(value, expected_type):
        raise ValidationError(f"Invalid type for {field_name}: expected {expected_type.__name__}, got {type(value).__name__}")


def log_operation(operation: str, success: bool, **kwargs):
    """
    Log operation result consistently

    Args:
        operation: Operation name
        success: Whether operation succeeded
        **kwargs: Additional context to log
    """
    level = logging.INFO if success else logging.WARNING
    status = "✓" if success else "✗"

    context = " ".join(f"{k}={v}" for k, v in kwargs.items())
    message = f"{status} {operation}"

    if context:
        message += f" ({context})"

    _LOGGER.log(level, message)
