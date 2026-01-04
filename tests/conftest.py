import pytest
import os
import logging
import sys

_LOGGER = logging.getLogger(__name__)

# Ensure the root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

pytest_plugins = ["pytest_homeassistant_custom_component"]

@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integrations for all tests."""
    _LOGGER.info("CWD: %s", os.getcwd())
    if os.path.exists("custom_components"):
        _LOGGER.info("custom_components found: %s", os.listdir("custom_components"))
    yield
