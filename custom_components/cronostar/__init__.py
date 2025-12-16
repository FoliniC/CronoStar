"""CronoStar custom component - Enhanced with auto-save."""
import logging
import os
from pathlib import Path

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant.const import EVENT_HOMEASSISTANT_START, EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.typing import ConfigType
import homeassistant.helpers.config_validation as cv
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url

from .services.file_service import FileService
from .storage.storage_manager import StorageManager
from .services.profile_service import ProfileService
from .services.automation_service import AutomationService
from .scheduler.smart_scheduler import SmartScheduler
from .utils.prefix_normalizer import PRESETS_CONFIG

DOMAIN = "cronostar"
_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema("cronostar")

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the CronoStar component."""
    _LOGGER.info("CronoStar setup started.")
    
    component_version = "4.2.0"
    
    hass.data[DOMAIN] = {
        "version": component_version,
    }
    
    # Setup paths
    www_path = Path(hass.config.path("custom_components/cronostar/www/cronostar_card"))
    profiles_dir = hass.config.path("cronostar/profiles")
    
    # ... (existing WWW check code omitted for brevity if unchanged, but keeping structure) ...
    # Register static paths and frontend
    if www_path.exists() and www_path.is_dir():
        js_file = www_path / "cronostar-card.js"
        if js_file.exists():
            await hass.http.async_register_static_paths([
                StaticPathConfig(
                    url_path="/cronostar_card",
                    path=str(www_path)
                )
            ])
            add_extra_js_url(hass, "/cronostar_card/cronostar-card.js")
    
    # Initialize services
    file_service = FileService(hass)
    storage_manager = StorageManager(hass, profiles_dir)
    profile_service = ProfileService(hass, file_service, storage_manager)
    
    # Initialize Smart Scheduler
    scheduler = SmartScheduler(hass, profile_service)
    
    # Automation service now uses scheduler data or just applies current value
    automation_service = AutomationService(hass)
    
    # Store references
    hass.data[DOMAIN]["storage_manager"] = storage_manager
    hass.data[DOMAIN]["scheduler"] = scheduler
    hass.data[DOMAIN]["profile_service"] = profile_service
    
    # Register deep checks service if available
    try:
        from .deep_checks import register_check_setup_service
        register_check_setup_service(hass)
    except Exception as e:
        _LOGGER.warning("deep_checks module not available: %s", e)
    
    # Hook scheduler into profile service to trigger updates on save
    # We monkey-patch or use a callback mechanism. 
    # Ideally ProfileService should emit an event, but direct call is faster.
    original_save = profile_service.save_profile
    
    async def save_profile_wrapper(call: ServiceCall):
        await original_save(call)
        # Trigger scheduler update for this preset
        preset = call.data.get("preset_type")
        if preset:
            # We pass the schedule data directly to avoid reloading from disk immediately
            schedule = call.data.get("schedule")
            # But the scheduler expects full profile data structure. 
            # It's safer to just signal it to reload.
            await scheduler.update_preset(preset)
            
    hass.services.async_register(DOMAIN, "save_profile", save_profile_wrapper)
    _LOGGER.info("Registered service %s.save_profile", DOMAIN)
    
    hass.services.async_register(
        DOMAIN,
        "load_profile",
        profile_service.load_profile,
        supports_response=True
    )
    _LOGGER.info("Registered service %s.load_profile", DOMAIN)
    
    hass.services.async_register(DOMAIN, "add_profile", profile_service.add_profile)
    _LOGGER.info("Registered service %s.add_profile", DOMAIN)
    
    hass.services.async_register(DOMAIN, "delete_profile", profile_service.delete_profile)
    _LOGGER.info("Registered service %s.delete_profile", DOMAIN)
    
    hass.services.async_register(DOMAIN, "apply_now", automation_service.apply_now)
    _LOGGER.info("Registered service %s.apply_now", DOMAIN)
    
    hass.services.async_register(DOMAIN, "create_yaml_file", file_service.create_yaml_file)
    _LOGGER.info("Registered service %s.create_yaml_file", DOMAIN)
    
    # Register auto-save control services (kept for compatibility)
    async def enable_auto_save(call: ServiceCall):
        """Enable auto-save functionality."""
        hass.data[DOMAIN]["auto_save_enabled"] = True
        _LOGGER.info("Auto-save enabled")
    
    async def disable_auto_save(call: ServiceCall):
        """Disable auto-save functionality."""
        hass.data[DOMAIN]["auto_save_enabled"] = False
        _LOGGER.info("Auto-save disabled")
    
    async def force_save_profile(call: ServiceCall):
        """Force immediate profile save."""
        # This is now handled by save_profile directly, but we keep the service valid
        preset_type = call.data.get("preset_type")
        if preset_type:
            await scheduler.update_preset(preset_type)
            _LOGGER.info("Force save triggered update for %s", preset_type)

    async def register_card(call: ServiceCall) -> ServiceResponse:
        """Register a frontend card instance and return active profile data."""
        card_id = call.data.get("card_id")
        version = call.data.get("version")
        preset = call.data.get("preset", "thermostat")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        _LOGGER.info(
            "Lovelace Card Connected: ID=%s, Version=%s, Preset=%s, Prefix=%s",
            card_id,
            version,
            preset,
            global_prefix or entity_prefix or "default"
        )
        
        # Attempt to load active profile for this preset
        response = {"success": True, "profile_data": None}
        
        config = PRESETS_CONFIG.get(preset)
        if config:
            profiles_select = config.get("profiles_select")
            if profiles_select:
                state = hass.states.get(profiles_select)
                if state and state.state not in ("unknown", "unavailable"):
                    profile_name = state.state
                    
                    data = await profile_service.get_profile_data(
                        profile_name=profile_name,
                        preset_type=preset,
                        entity_prefix=entity_prefix,
                        global_prefix=global_prefix
                    )
                    
                    if "error" not in data:
                        response["profile_data"] = data
                        _LOGGER.info("Returning active profile '%s' to card %s", profile_name, card_id)
        
        return response

    hass.services.async_register(DOMAIN, "enable_auto_save", enable_auto_save)
    hass.services.async_register(DOMAIN, "disable_auto_save", disable_auto_save)
    hass.services.async_register(DOMAIN, "force_save", force_save_profile)
    hass.services.async_register(
        DOMAIN, 
        "register_card", 
        register_card,
        supports_response=True
    )
    
    # On Home Assistant startup
    async def on_hass_start(event):
        """Initialize scheduler and notify frontend."""
        _LOGGER.info("CronoStar: Home Assistant has started.")
        
        # 1. Log Versions (Backend + Frontend attempt)
        import re
        frontend_version = "unknown"
        if www_path.exists():
            js_path = www_path / "cronostar-card.js"
            if js_path.exists():
                try:
                    # Read file content in executor to avoid blocking loop
                    def read_js_file():
                        with open(js_path, "r", encoding="utf-8") as f:
                            return f.read()
                    
                    content = await hass.async_add_executor_job(read_js_file)
                    
                    # Look for common version patterns in the bundled file
                    # Matches "4.3.0" or v4.3.0 inside quotes
                    match = re.search(r'["\']v?(\d+\.\d+\.\d+)["\']', content)
                    if match:
                        frontend_version = match.group(1)
                except Exception:
                    pass
        
        _LOGGER.info("Versions -> Backend: %s | Frontend (detected): %s", 
                     component_version, frontend_version)
        
        # Load profiles dynamically
        try:
            _LOGGER.info("Loading profiles from disk...")
            await profile_service.async_update_profile_selectors()
            
            # Log available profiles
            profiles = await storage_manager.list_profiles()
            if profiles:
                profile_names = []
                for p in profiles:
                    # Strip .json for cleaner log
                    profile_names.append(p.replace(".json", ""))
                _LOGGER.info("Found %d profiles: %s", len(profiles), ", ".join(profile_names))
            else:
                _LOGGER.info("No profiles found (fresh install).")
                
        except Exception as e:
            _LOGGER.error("Error during profile loading: %s", e)
            
        # Start Scheduler
        await scheduler.async_initialize()
        
        # Cleanup old backups
        try:
            await storage_manager.cleanup_old_backups(days=7)
        except Exception as e:
            _LOGGER.warning("Backup cleanup failed: %s", e)
        
        # Notify frontend
        hass.bus.async_fire(
            "cronostar_profiles_loaded",
            {
                "source": "cronostar_backend",
                "version": component_version
            }
        )
    
    # On Home Assistant stop
    async def on_hass_stop(event):
        """Clean shutdown."""
        scheduler.stop()
        storage_manager.clear_cache()
    
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, on_hass_start)
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, on_hass_stop)
    
    return True