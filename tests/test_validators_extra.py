"""Extra coverage for setup/validators.py."""
import asyncio
from unittest.mock import MagicMock, patch
import pytest
from pathlib import Path
from custom_components.cronostar.setup.validators import (
    _check_config_directory,
    _check_profiles_directory,
    validate_environment
)

def run(coro):
    return asyncio.run(coro)

def test_validate_environment_failure(hass):
    """Test validate_environment when one check fails."""
    # Mocking _check_config_directory to fail
    with patch("custom_components.cronostar.setup.validators._check_config_directory", return_value=False):
        assert run(validate_environment(hass)) is False

def test_check_config_directory_not_exists(hass, tmp_path):
    """Test _check_config_directory when path doesn't exist."""
    non_existent = tmp_path / "not_here"
    hass.config.path = MagicMock(return_value=str(non_existent))
    assert _check_config_directory(hass) is False

def test_check_config_directory_is_not_dir(hass, tmp_path):
    """Test _check_config_directory when path is a file."""
    a_file = tmp_path / "a_file"
    a_file.touch()
    hass.config.path = MagicMock(return_value=str(a_file))
    assert _check_config_directory(hass) is False

def test_check_config_directory_exception(hass):
    """Test _check_config_directory exception handling."""
    hass.config.path = MagicMock(side_effect=Exception("Path error"))
    assert _check_config_directory(hass) is False

def test_check_profiles_directory_not_dir(hass, tmp_path):
    """Test _check_profiles_directory when path is a file."""
    profiles_file = tmp_path / "cronostar" / "profiles"
    profiles_file.parent.mkdir()
    profiles_file.touch()
    hass.config.path = MagicMock(return_value=str(profiles_file))
    assert _check_profiles_directory(hass) is False

def test_check_profiles_directory_not_writable(hass, tmp_path):
    """Test _check_profiles_directory when not writable."""
    profiles_path = tmp_path / "cronostar" / "profiles"
    profiles_path.mkdir(parents=True)
    
    hass.config.path = MagicMock(return_value=str(profiles_path))
    
    # Use patch to make touch fail
    with patch("pathlib.Path.touch", side_effect=PermissionError("ReadOnly")):
        assert _check_profiles_directory(hass) is False

def test_check_profiles_directory_exception(hass):
    """Test _check_profiles_directory exception handling."""
    hass.config.path = MagicMock(side_effect=Exception("Path error"))
    assert _check_profiles_directory(hass) is False
