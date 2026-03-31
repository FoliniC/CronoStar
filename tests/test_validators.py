"""Test Validators."""
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from pathlib import Path
from custom_components.cronostar.setup.validators import (
    validate_environment,
    _check_config_directory,
    _check_profiles_directory,
    _check_required_components,
)

def run(coro):
    return asyncio.run(coro)

def test_validate_environment_success(hass):
    """Test full environment validation success."""
    res = run(validate_environment(hass))
    assert res is True

def test_validate_environment_failure(hass):
    """Test environment validation failure."""
    with patch("custom_components.cronostar.setup.validators._check_config_directory", return_value=False):
        res = run(validate_environment(hass))
        assert res is False

def test_check_config_directory_not_found(hass):
    """Test config directory not found."""
    with patch("pathlib.Path.exists", return_value=False):
        assert _check_config_directory(hass) is False

def test_check_config_directory_not_dir(hass):
    """Test config path is not a directory."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=False):
        assert _check_config_directory(hass) is False

def test_check_config_directory_exception(hass):
    """Test config check exception."""
    with patch("custom_components.cronostar.setup.validators.Path", side_effect=Exception("Crash")):
        assert _check_config_directory(hass) is False

def test_check_profiles_directory_not_dir(hass):
    """Test profiles path is not a directory."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=False):
        assert _check_profiles_directory(hass) is False

def test_check_profiles_directory_not_writable(hass):
    """Test profiles directory not writable."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=True), \
         patch("pathlib.Path.touch", side_effect=OSError("ReadOnly")):
        assert _check_profiles_directory(hass) is False

def test_check_profiles_directory_exception(hass):
    """Test profiles check exception."""
    with patch("custom_components.cronostar.setup.validators.Path", side_effect=Exception("Crash")):
        assert _check_profiles_directory(hass) is False

def test_check_required_components_missing(hass):
    """Test warning when components are missing."""
    hass.config.components = []
    assert _check_required_components(hass) is True  # Returns True but warns
