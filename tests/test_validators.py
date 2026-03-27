"""Test Validators."""
from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from pathlib import Path
from custom_components.cronostar.setup.validators import (
    validate_environment,
    _check_config_directory,
    _check_profiles_directory,
    _check_required_components,
)

@pytest.fixture
def mock_hass(tmp_path):
    hass = MagicMock()
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    
    def mock_path(x=None):
        if x is None:
            return str(config_dir)
        return str(config_dir / x)
        
    hass.config.path = MagicMock(side_effect=mock_path)
    async def mock_executor(target, *args, **kwargs):
        if hasattr(target, "__call__"):
            return target(*args, **kwargs)
        return target
    hass.async_add_executor_job = AsyncMock(side_effect=mock_executor)
    hass.config.components = ["input_number", "input_select", "input_boolean"]
    return hass

@pytest.mark.anyio
async def test_validate_environment_success(mock_hass):
    """Test full environment validation success."""
    res = await validate_environment(mock_hass)
    assert res is True

@pytest.mark.anyio
async def test_validate_environment_failure(mock_hass):
    """Test environment validation failure."""
    with patch("custom_components.cronostar.setup.validators._check_config_directory", return_value=False):
        res = await validate_environment(mock_hass)
        assert res is False

def test_check_config_directory_not_found(mock_hass):
    """Test config directory not found."""
    with patch("pathlib.Path.exists", return_value=False):
        assert _check_config_directory(mock_hass) is False

def test_check_config_directory_not_dir(mock_hass):
    """Test config path is not a directory."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=False):
        assert _check_config_directory(mock_hass) is False

def test_check_config_directory_exception(mock_hass):
    """Test config check exception."""
    mock_hass.config.path.side_effect = Exception("Crash")
    assert _check_config_directory(mock_hass) is False

def test_check_profiles_directory_not_dir(mock_hass):
    """Test profiles path is not a directory."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=False):
        assert _check_profiles_directory(mock_hass) is False

def test_check_profiles_directory_not_writable(mock_hass):
    """Test profiles directory not writable."""
    with patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.is_dir", return_value=True), \
         patch("pathlib.Path.touch", side_effect=OSError("ReadOnly")):
        assert _check_profiles_directory(mock_hass) is False

def test_check_profiles_directory_exception(mock_hass):
    """Test profiles check exception."""
    mock_hass.config.path.side_effect = Exception("Crash")
    assert _check_profiles_directory(mock_hass) is False

def test_check_required_components_missing(mock_hass):
    """Test warning when components are missing."""
    mock_hass.config.components = []
    assert _check_required_components(mock_hass) is True  # Returns True but warns
