""" CronoStar custom component - Enhanced with auto-save."""
import logging
import os
import json
from pathlib import Path

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant import config_entries
from homeassistant.const import EVENT_HOMEASSISTANT_START, EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.typing import ConfigType
import homeassistant.helpers.config_validation as cv
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url

from .const import DOMAIN
from .services.file_service import FileService
from .storage.storage_manager import StorageManager
from .services.profile_service import ProfileService
from .services.automation_service import AutomationService
from .scheduler.smart_scheduler import SmartScheduler
from .utils.prefix_normalizer import PRESETS_CONFIG, normalize_preset_type
from .utils.filename_builder import build_profile_filename

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

async def _set_debug_logging(hass: HomeAssistant) -> None:
    """Force DEBUG logging on Home Assistant and this component at startup."""
    try:
        payload = {
            "homeassistant": "error",
            "homeassistant.core": "error",
            "custom_components.cronostar": "debug",
        }
        await hass.services.async_call("logger", "set_level", payload, blocking=False)
        _LOGGER.info("Logging levels set to DEBUG via logger.set_level")
    except Exception as e:
        _LOGGER.warning("Failed to set logger levels via service: %s. Falling back to setLevel.", e)
        try:
            logging.getLogger().setLevel(logging.DEBUG)
            logging.getLogger("custom_components.cronostar").setLevel(logging.DEBUG)
        except Exception:
            pass

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the CronoStar component from YAML."""
    if DOMAIN not in config:
        return True
    
    return await _async_setup_core(hass)

async def async_setup_entry(hass: HomeAssistant, entry: config_entries.ConfigEntry) -> bool:
    """Set up CronoStar from a config entry."""
    return await _async_setup_core(hass)

async def _async_setup_core(hass: HomeAssistant) -> bool:
    """Core setup logic shared by YAML and Config Entry."""
    _LOGGER.warning("[CRONOSTAR] async_setup_core ENTER")
    
    await _set_debug_logging(hass)
    
    component_version = "4.3.0"
    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = { "version": component_version }

    www_path = hass.config.path("custom_components/cronostar/www/cronostar_card")
    www_path = Path(www_path)
    profiles_dir = hass.config.path("cronostar/profiles")

    if www_path.exists() and www_path.is_dir():
        await hass.http.async_register_static_paths([StaticPathConfig(url_path="/cronostar_card", path=www_path)])
        add_extra_js_url(hass, "/cronostar_card/cronostar-card.js?v=5")
        _LOGGER.info("Frontend JS URL registered")

    file_service = FileService(hass)
    storage_manager = StorageManager(hass, profiles_dir)
    profile_service = ProfileService(hass, file_service, storage_manager)
    scheduler = SmartScheduler(hass, profile_service)
    automation_service = AutomationService(hass)

    hass.data[DOMAIN]["storage_manager"] = storage_manager
    hass.data[DOMAIN]["scheduler"] = scheduler
    hass.data[DOMAIN]["profile_service"] = profile_service

    try:
        from .deep_checks import register_check_setup_service
        register_check_setup_service(hass)
    except Exception as e:
        _LOGGER.warning("deep_checks module not available: %s", e)

    # Registration of services
    async def save_profile_wrapper(call: ServiceCall):
        await profile_service.save_profile(call)
        preset = call.data.get("preset_type")
        if preset:
            await scheduler.update_preset(preset)
    
    if not hass.services.has_service(DOMAIN, "save_profile"):
        hass.services.async_register(DOMAIN, "save_profile", save_profile_wrapper)

    async def load_profile_service(call: ServiceCall) -> ServiceResponse:
        return await profile_service.load_profile(call)
    
    if not hass.services.has_service(DOMAIN, "load_profile"):
        hass.services.async_register(DOMAIN, "load_profile", load_profile_service, supports_response=True)

    if not hass.services.has_service(DOMAIN, "add_profile"):
        hass.services.async_register(DOMAIN, "add_profile", profile_service.add_profile)

    if not hass.services.has_service(DOMAIN, "delete_profile"):
        hass.services.async_register(DOMAIN, "delete_profile", profile_service.delete_profile)

    async def apply_now_service(call: ServiceCall):
        """Apply current scheduled value and trigger scheduler update."""
        payload = getattr(call, "service_data", None) or getattr(call, "data", None) or {}
        preset_type = payload.get("preset_type")
        if preset_type:
            await scheduler.update_preset(preset_type)

    if not hass.services.has_service(DOMAIN, "apply_now"):
        hass.services.async_register(DOMAIN, "apply_now", apply_now_service)

    if not hass.services.has_service(DOMAIN, "create_yaml_file"):
        hass.services.async_register(DOMAIN, "create_yaml_file", file_service.create_yaml_file)

    async def register_card(call: ServiceCall) -> ServiceResponse:
        """Register a frontend card and return active profile."""
        card_id = call.data.get("card_id")
        preset = call.data.get("preset", "thermostat")
        global_prefix = call.data.get("global_prefix")
        
        _LOGGER.info("Lovelace Card Connected: ID=%s, Preset=%s", card_id, preset)
        _LOGGER.debug("[REGISTER] global_prefix=%s", global_prefix)
        
        response = {"success": True, "profile_data": None}
        
        # Logica semplificata per il recupero del profilo attivo con logging esteso
        state = None
        base = (global_prefix or "cronostar_").rstrip("_")
        dynamic_selector = f"input_select.{base}_profiles"
        _LOGGER.debug("[REGISTER] computed base=%s, dynamic_selector=%s", base, dynamic_selector)
        
        # Lettura dello stato dell'entity input_select
        state = hass.states.get(dynamic_selector)
        if not state:
            _LOGGER.warning("[REGISTER] profiles_select entity not found: %s", dynamic_selector)
        else:
            _LOGGER.debug("[REGISTER] profiles_select raw state: %s", state.state)
        
        if state and state.state not in ("unknown", "unavailable"):
            profile_to_load = state.state
            _LOGGER.info("[REGISTER] Active profile detected: '%s' via %s", profile_to_load, dynamic_selector)
            try:
                data = await profile_service.get_profile_data(profile_to_load, preset, global_prefix)
                if "error" not in data:
                    sched = data.get("schedule", [])
                    _LOGGER.info(
                        "✅ Profile resolved during register: name=%s, points=%d, first=%s, last=%s",
                        profile_to_load,
                        len(sched),
                        sched[0] if sched else None,
                        sched[-1] if sched else None,
                    )
                    response["profile_data"] = data
                else:
                    _LOGGER.warning(
                        "⚠️ get_profile_data returned error during register: %s",
                        data.get("error")
                    )
                    # Fallback: requested profile not found, try well-known or first available from container
                    try:
                        canonical_preset = normalize_preset_type(preset)
                        filename = build_profile_filename(profile_to_load, canonical_preset, global_prefix=global_prefix)
                        container = await storage_manager.load_profile_cached(filename)
                        if container and "profiles" in container:
                            available = list(container.get("profiles", {}).keys())
                            _LOGGER.debug("[REGISTER] Fallback (requested missing): container profiles=%s", available)
                            candidates = [p for p in ("Default", "Comfort") if p in available] or available
                            for candidate in candidates:
                                _LOGGER.info("[REGISTER] Trying fallback candidate '%s'", candidate)
                                alt = await profile_service.get_profile_data(candidate, preset, global_prefix)
                                if "error" not in alt:
                                    sched = alt.get("schedule", [])
                                    _LOGGER.info(
                                        "✅ Fallback profile loaded: name=%s, points=%d, first=%s, last=%s",
                                        candidate,
                                        len(sched),
                                        sched[0] if sched else None,
                                        sched[-1] if sched else None,
                                    )
                                    response["profile_data"] = alt
                                    break
                                else:
                                    _LOGGER.warning("[REGISTER] Fallback candidate '%s' failed: %s", candidate, alt.get("error"))
                        else:
                            _LOGGER.info("[REGISTER] No container found while attempting fallback for file=%s", filename)
                    except Exception as e:
                        _LOGGER.error("[REGISTER] Fallback error after missing profile: %s", e)
            except Exception as e:
                _LOGGER.error("❌ Exception while loading profile during register: %s", e)
        else:
            _LOGGER.info(
                "[REGISTER] No active profile: entity missing or state is unknown/unavailable (%s)",
                dynamic_selector
            )
            # Fallback: attempt to locate a profile from storage by prefix/preset
            try:
                canonical_preset = normalize_preset_type(preset)
                files = await storage_manager.list_profiles(preset_type=canonical_preset, prefix=base)
                _LOGGER.debug("[REGISTER] Fallback search: found %d files for prefix=%s, preset=%s", len(files), base, canonical_preset)
                for filename in files:
                    container = await storage_manager.load_profile_cached(filename)
                    if not container or "profiles" not in container:
                        _LOGGER.debug("[REGISTER] Skipping container without profiles: %s", filename)
                        continue
                    available = list(container.get("profiles", {}).keys())
                    _LOGGER.debug("[REGISTER] Container %s has profiles=%s", filename, available)
                    # Prefer well-known defaults, else first available
                    candidates = [p for p in ("Default", "Comfort") if p in available] or available
                    for candidate in candidates:
                        _LOGGER.info("[REGISTER] Fallback loading candidate profile '%s'", candidate)
                        data = await profile_service.get_profile_data(candidate, preset, global_prefix)
                        if "error" not in data:
                            sched = data.get("schedule", [])
                            _LOGGER.info(
                                "✅ Fallback profile loaded: name=%s, points=%d, first=%s, last=%s",
                                candidate,
                                len(sched),
                                sched[0] if sched else None,
                                sched[-1] if sched else None,
                            )
                            response["profile_data"] = data
                            break
                        else:
                            _LOGGER.warning("[REGISTER] Fallback candidate '%s' failed: %s", candidate, data.get("error"))
                    if response.get("profile_data"):
                        break
                if not response.get("profile_data"):
                    _LOGGER.info("[REGISTER] Fallback did not find a usable profile for prefix=%s", base)
            except Exception as e:
                _LOGGER.error("[REGISTER] Fallback search error: %s", e)
        
        _LOGGER.debug(
            "[REGISTER] Response summary: success=%s, has_profile=%s",
            response.get("success"), bool(response.get("profile_data"))
        )
        return response

    if not hass.services.has_service(DOMAIN, "register_card"):
        hass.services.async_register(DOMAIN, "register_card", register_card, supports_response=True)

    async def on_hass_start(event):
        _LOGGER.info("CronoStar: Home Assistant has started.")
        await profile_service.async_update_profile_selectors()
        await scheduler.async_initialize()

    async def on_hass_stop(event):
        scheduler.stop()
        storage_manager.clear_cache()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, on_hass_start)
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, on_hass_stop)
    
    return True
