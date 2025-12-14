"""CronoStar custom component - Fixed profile naming."""
import logging
import os
from pathlib import Path  
from functools import partial

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.const import EVENT_HOMEASSISTANT_START
from homeassistant.helpers.typing import ConfigType
import homeassistant.helpers.config_validation as cv
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url

from .services.file_service import FileService # NEW
from .services.profile_service import ProfileService # NEW
from .services.automation_service import AutomationService # NEW

DOMAIN = "cronostar"
_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema("cronostar")

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the CronoStar component."""
    _LOGGER.info("CronoStar setup started.")
    
    hass.data[DOMAIN] = {"version": "1.2.8"}
    
    # Verifica path www (già funziona ?)
    www_path = hass.config.path("custom_components/cronostar/www/cronostar_card")
    www_path = Path(www_path)
    
    _LOGGER.info(f"Checking www path: {www_path}")
    
    if not www_path.exists():
        _LOGGER.error(f"? www directory MISSING: {www_path}")
    elif not www_path.is_dir():
        _LOGGER.error(f"? www path is NOT a directory: {www_path}")
    else:
        js_file = www_path / "cronostar-card.js"
        if js_file.exists():
            _LOGGER.info(f"? cronostar-card.js FOUND: {js_file} ({js_file.stat().st_size} bytes)")
        else:
            _LOGGER.warning(f"? cronostar-card.js MISSING in: {www_path}")
        
        # Registra ? SENZA must_be_authenticated
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                url_path="/cronostar_card",
                path=www_path  # ? Solo questi 2 parametri
            )
        ])
        _LOGGER.info("? Static paths registered for /cronostar_card")
        
        # Registra nel frontend
        add_extra_js_url(hass, "/cronostar_card/cronostar-card.js")
        _LOGGER.info("? Frontend JS URL registered")

    # Initialize services
    file_service = FileService(hass)
    profile_service = ProfileService(hass, file_service)
    automation_service = AutomationService(hass)

    # Register deep checks service if available
    try:
        from .deep_checks import register_check_setup_service
        register_check_setup_service(hass)
    except Exception as e:
        _LOGGER.warning("deep_checks module not available: %s", e)
    
    # Register services
    hass.services.async_register(DOMAIN, "save_profile", profile_service.save_profile)
    hass.services.async_register(
        DOMAIN,
        "load_profile",
        profile_service.load_profile,
        supports_response=SupportsResponse.ONLY
    )
    hass.services.async_register(DOMAIN, "add_profile", profile_service.add_profile)
    hass.services.async_register(DOMAIN, "delete_profile", profile_service.delete_profile)
    hass.services.async_register(DOMAIN, "apply_now", automation_service.apply_now)
    hass.services.async_register(DOMAIN, "create_yaml_file", file_service.create_yaml_file) # NEW

    # On Home Assistant startup, verify services and notify frontend
    async def on_hass_start(event):
        """Verify services and notify frontend that the backend is ready."""
        _LOGGER.info("CronoStar: Home Assistant has started. Verifying services.")
        
        component_version = hass.data.get(DOMAIN, {}).get("version", "unknown")

        # Verify that services are registered
        if not hass.services.has_service(DOMAIN, "apply_now"):
            _LOGGER.warning("Service 'apply_now' not found.")
        if not hass.services.has_service(DOMAIN, "check_setup"):
            _LOGGER.warning("Service 'check_setup' not found.")

        # Dynamically load profiles from disk
        try:
            _LOGGER.info("Attempting to dynamically load profiles from disk.")
            await profile_service.async_update_profile_selectors()
        except Exception as e:
            _LOGGER.error("An error occurred during dynamic profile loading: %s", e)

        # Notify frontend that the backend is ready
        _LOGGER.info("Firing 'cronostar_profiles_loaded' event to notify frontend.")
        hass.bus.async_fire(
            "cronostar_profiles_loaded", 
            {"source": "cronostar_backend", "version": component_version}
        )

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, on_hass_start)
    
    _LOGGER.info("CronoStar setup completed.")
    
    return True

