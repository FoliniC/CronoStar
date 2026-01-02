# custom_components/cronostar/setup/validators.py
"""
Environment validation for CronoStar
Checks requirements and dependencies
"""

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def validate_environment(hass: HomeAssistant) -> bool:
    """
    Validate CronoStar environment

    Args:
        hass: Home Assistant instance

    Returns:
        True if environment is valid
    """
    _LOGGER.info("Validating CronoStar environment")

    checks = [
        lambda: _check_config_directory(hass),
        lambda: _check_profiles_directory(hass),
        lambda: _check_required_components(hass),
    ]

    results = await hass.async_add_executor_job(lambda: [check() for check in checks])

    if all(results):
        _LOGGER.info("Environment validation passed")
        return True
    else:
        _LOGGER.error("Environment validation failed")
        return False


def _check_config_directory(hass: HomeAssistant) -> bool:
    """Check if config directory is accessible"""
    try:
        config_path = Path(hass.config.path())

        if not config_path.exists():
            _LOGGER.error("Config directory not found: %s", config_path)
            return False

        if not config_path.is_dir():
            _LOGGER.error("Config path is not a directory: %s", config_path)
            return False

        _LOGGER.debug("Config directory OK: %s", config_path)
        return True

    except Exception as e:
        _LOGGER.error("Error checking config directory: %s", e)
        return False


def _check_profiles_directory(hass: HomeAssistant) -> bool:
    """Check and create profiles directory if needed"""
    try:
        profiles_path = Path(hass.config.path("cronostar/profiles"))

        if not profiles_path.exists():
            _LOGGER.info("Creating profiles directory: %s", profiles_path)
            profiles_path.mkdir(parents=True, exist_ok=True)

        if not profiles_path.is_dir():
            _LOGGER.error("Profiles path is not a directory: %s", profiles_path)
            return False

        # Check write permissions
        test_file = profiles_path / ".write_test"
        try:
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            _LOGGER.error("Profiles directory not writable: %s", e)
            return False

        _LOGGER.debug("Profiles directory OK: %s", profiles_path)
        return True

    except Exception as e:
        _LOGGER.error("Error checking profiles directory: %s", e)
        return False


def _check_required_components(hass: HomeAssistant) -> bool:
    """Check if required HA components are available"""
    required = ["input_number", "input_select", "input_boolean", "input_text"]

    missing = []

    for component in required:
        if component not in hass.config.components:
            missing.append(component)

    if missing:
        _LOGGER.warning("Required components not loaded: %s. CronoStar may not function correctly.", ", ".join(missing))
        # Don't fail, just warn

    return True
