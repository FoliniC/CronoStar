import pytest
import os
import sys

pytest_plugins = ["pytest_homeassistant_custom_component"]

def pytest_configure(config):
    """Add project root to python path."""
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, project_root)
    # Also add custom_components directory specifically
    sys.path.insert(0, os.path.join(project_root, "custom_components"))

@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integrations for all tests."""
    yield