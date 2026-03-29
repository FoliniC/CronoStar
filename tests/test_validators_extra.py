"""Extra coverage for setup/validators.py."""
from unittest.mock import MagicMock, patch
import pytest
from pathlib import Path
from custom_components.cronostar.setup.validators import (
    _check_config_directory,
    _check_profiles_directory,
    validate_environment
)

@pytest.mark.anyio
async def test_validate_environment_failure(mock_hass):
    """Test validate_environment when one check fails."""
    # Mocking _check_config_directory to fail
    with patch("custom_components.cronostar.setup.validators._check_config_directory", return_value=False):
        assert await validate_environment(mock_hass) is False

@pytest.mark.anyio
async def test_check_config_directory_not_exists(mock_hass, tmp_path):
    """Test _check_config_directory when path doesn't exist."""
    non_existent = tmp_path / "not_here"
    mock_hass.config.path = MagicMock(return_value=str(non_existent))
    assert _check_config_directory(mock_hass) is False

@pytest.mark.anyio
async def test_check_config_directory_is_not_dir(mock_hass, tmp_path):
    """Test _check_config_directory when path is a file."""
    a_file = tmp_path / "a_file"
    a_file.touch()
    mock_hass.config.path = MagicMock(return_value=str(a_file))
    assert _check_config_directory(mock_hass) is False

@pytest.mark.anyio
async def test_check_config_directory_exception(mock_hass):
    """Test _check_config_directory exception handling."""
    mock_hass.config.path = MagicMock(side_effect=Exception("Path error"))
    assert _check_config_directory(mock_hass) is False

@pytest.mark.anyio
async def test_check_profiles_directory_not_dir(mock_hass, tmp_path):
    """Test _check_profiles_directory when path is a file."""
    profiles_file = tmp_path / "cronostar" / "profiles"
    profiles_file.parent.mkdir()
    profiles_file.touch()
    mock_hass.config.path = MagicMock(return_value=str(profiles_file))
    assert _check_profiles_directory(mock_hass) is False

@pytest.mark.anyio
async def test_check_profiles_directory_not_writable(mock_hass, tmp_path):
    """Test _check_profiles_directory when not writable."""
    profiles_path = tmp_path / "cronostar" / "profiles"
    profiles_path.mkdir(parents=True)
    
    mock_hass.config.path = MagicMock(return_value=str(profiles_path))
    
    # Use patch to make touch fail
    with patch("pathlib.Path.touch", side_effect=PermissionError("ReadOnly")):
        assert _check_profiles_directory(mock_hass) is False

@pytest.mark.anyio
async def test_check_profiles_directory_exception(mock_hass):
    """Test _check_profiles_directory exception handling."""
    mock_hass.config.path = MagicMock(side_effect=Exception("Path error"))
    assert _check_profiles_directory(mock_hass) is False
