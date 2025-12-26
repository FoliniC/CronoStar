"""CronoStar custom component - Enhanced with auto-save and dashboard support."""

import logging
from pathlib import Path

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import EVENT_HOMEASSISTANT_START, EVENT_HOMEASSISTANT_STOP
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .scheduler.smart_scheduler import SmartScheduler
from .services.file_service import FileService
from .services.profile_service import ProfileService
from .storage.storage_manager import StorageManager
from .utils.prefix_normalizer import normalize_preset_type

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional("enable_backups", default=False): cv.boolean,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


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

    conf = config[DOMAIN]
    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = {}

    hass.data[DOMAIN]["enable_backups"] = conf.get("enable_backups", False)

    return await _async_setup_core(hass)


async def async_setup_entry(hass: HomeAssistant, entry: config_entries.ConfigEntry) -> bool:
    """Set up CronoStar from a config entry."""
    return await _async_setup_core(hass)


async def _async_setup_core(hass: HomeAssistant) -> bool:
    """Core setup logic shared by YAML and Config Entry."""
    _LOGGER.warning("[CRONOSTAR] async_setup_core ENTER")

    await _set_debug_logging(hass)

    component_version = "5.2.0"
    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = {"version": component_version}

    www_path = hass.config.path("custom_components/cronostar/www/cronostar_card")
    www_path = Path(www_path)
    profiles_dir = hass.config.path("cronostar/profiles")

    if www_path.exists() and www_path.is_dir():
        await hass.http.async_register_static_paths([StaticPathConfig(url_path="/cronostar_card", path=www_path)])
        add_extra_js_url(hass, "/cronostar_card/cronostar-card.js?v=5")
        _LOGGER.info("Frontend JS URL registered")

    file_service = FileService(hass)

    # NUOVO: Leggi configurazione backups (default: False)
    enable_backups = hass.data.get(DOMAIN, {}).get("enable_backups", False)
    storage_manager = StorageManager(hass, profiles_dir, enable_backups=enable_backups)

    profile_service = ProfileService(hass, file_service, storage_manager)
    scheduler = SmartScheduler(hass, profile_service)

    hass.data[DOMAIN]["storage_manager"] = storage_manager
    hass.data[DOMAIN]["scheduler"] = scheduler
    hass.data[DOMAIN]["profile_service"] = profile_service

    try:
        from .deep_checks import register_check_setup_service

        register_check_setup_service(hass)
    except Exception as e:
        _LOGGER.warning("deep_checks module not available: %s", e)

    # ========================================
    # SERVICE: save_profile
    # ========================================
    async def save_profile_wrapper(call: ServiceCall):
        await profile_service.save_profile(call)
        preset = call.data.get("preset_type")
        if preset:
            await scheduler.update_preset(preset)

    if not hass.services.has_service(DOMAIN, "save_profile"):
        hass.services.async_register(DOMAIN, "save_profile", save_profile_wrapper)

    # ========================================
    # SERVICE: load_profile
    # ========================================
    async def load_profile_service(call: ServiceCall) -> ServiceResponse:
        return await profile_service.load_profile(call)

    if not hass.services.has_service(DOMAIN, "load_profile"):
        hass.services.async_register(DOMAIN, "load_profile", load_profile_service, supports_response=True)

    # ========================================
    # SERVICE: add_profile
    # ========================================
    if not hass.services.has_service(DOMAIN, "add_profile"):
        hass.services.async_register(DOMAIN, "add_profile", profile_service.add_profile)

    # ========================================
    # SERVICE: delete_profile
    # ========================================
    if not hass.services.has_service(DOMAIN, "delete_profile"):
        hass.services.async_register(DOMAIN, "delete_profile", profile_service.delete_profile)

    # ========================================
    # SERVICE: apply_now
    # ========================================
    async def apply_now_service(call: ServiceCall):
        """Apply current scheduled value and trigger scheduler update."""
        payload = getattr(call, "service_data", None) or getattr(call, "data", None) or {}
        preset_type = payload.get("preset_type")
        if preset_type:
            await scheduler.update_preset(preset_type)

    if not hass.services.has_service(DOMAIN, "apply_now"):
        hass.services.async_register(DOMAIN, "apply_now", apply_now_service)

    # ========================================
    # SERVICE: create_yaml_file
    # ========================================
    if not hass.services.has_service(DOMAIN, "create_yaml_file"):
        hass.services.async_register(DOMAIN, "create_yaml_file", file_service.create_yaml_file)

    # ========================================
    # SERVICE: register_card
    # ========================================
    async def register_card(call: ServiceCall) -> ServiceResponse:
        """Register a frontend card and return active profile."""
        card_id = call.data.get("card_id")
        preset = call.data.get("preset", "thermostat")
        global_prefix = call.data.get("global_prefix")
        requested_profile = call.data.get("selected_profile")

        _LOGGER.info("Lovelace Card Connected: ID=%s, Preset=%s, RequestedProfile=%s", card_id, preset, requested_profile)
        _LOGGER.debug("[REGISTER] global_prefix=%s", global_prefix)

        response = {"success": True, "profile_data": None}

        # Logica semplificata per il recupero del profilo attivo con logging esteso
        state = None
        # Prefix MUST end with underscore for StorageManager filtering
        prefix_with_underscore = global_prefix or "cronostar_"
        if not prefix_with_underscore.endswith("_"):
            prefix_with_underscore += "_"

        base = prefix_with_underscore.rstrip("_")
        dynamic_selector = f"input_select.{base}_profiles"
        _LOGGER.debug("[REGISTER] computed base=%s, dynamic_selector=%s", base, dynamic_selector)

        # Lettura dello stato dell'entity input_select
        state = hass.states.get(dynamic_selector)

        profile_to_load = None
        if state and state.state not in ("unknown", "unavailable"):
            profile_to_load = state.state
            _LOGGER.info("[REGISTER] Active profile detected: '%s' via %s", profile_to_load, dynamic_selector)
        elif requested_profile:
            # Se l'entity manca o non ha uno stato valido, usiamo quello richiesto dalla card (presentation)
            profile_to_load = requested_profile
            _LOGGER.info("[REGISTER] Fallback to requested profile: '%s' (entity %s missing/unknown)", profile_to_load, dynamic_selector)
        else:
            _LOGGER.info("[REGISTER] No active profile via entity: entity missing (%s) and no requested profile", dynamic_selector)

        if profile_to_load:
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
                    _LOGGER.warning("⚠️ get_profile_data returned error during register for '%s': %s", profile_to_load, data.get("error"))
            except Exception as e:
                _LOGGER.error("❌ Exception while loading profile '%s' during register: %s", profile_to_load, e)

        if not response.get("profile_data"):
            # Fallback: attempt to locate ANY profile from storage by prefix/preset
            try:
                canonical_preset = normalize_preset_type(preset)
                # Use full prefix with underscore to match StorageManager startswith
                files = await storage_manager.list_profiles(preset_type=canonical_preset, prefix=prefix_with_underscore)
                _LOGGER.debug(
                    "[REGISTER] Fallback search: found %d files for prefix=%s, preset=%s",
                    len(files),
                    prefix_with_underscore,
                    canonical_preset,
                )

                # If no files found with underscore, try stripping it (for loose files)
                if not files:
                    files = await storage_manager.list_profiles(preset_type=canonical_preset, prefix=base)
                    _LOGGER.debug("[REGISTER] Fallback search (retry): found %d files for prefix=%s", len(files), base)

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
                    _LOGGER.info("[REGISTER] Fallback did not find a usable profile for prefix=%s", prefix_with_underscore)
            except Exception as e:
                _LOGGER.error("[REGISTER] Fallback search error: %s", e)

        # Recupero stati correnti per l'help
        entity_states = {}

        def get_formatted_state(entity_id):
            if not entity_id:
                return "Not configured"
            st = hass.states.get(entity_id)
            if not st:
                return "Not found"
            val = st.state
            if entity_id.startswith("switch.") or entity_id.startswith("input_boolean."):
                return "On" if val == "on" else "Off"
            # Add unit if available
            unit = st.attributes.get("unit_of_measurement")
            if unit:
                return f"{val} {unit}"
            return val

        # Identifichiamo le entità per il report
        target_ent_for_states = None
        if state and state.attributes.get("target_entity"):
            target_ent_for_states = state.attributes.get("target_entity")
        if not target_ent_for_states and response.get("profile_data") and "meta" in response["profile_data"]:
            target_ent_for_states = response["profile_data"]["meta"].get("target_entity")

        entity_states["target"] = get_formatted_state(target_ent_for_states)
        entity_states["current_helper"] = get_formatted_state(f"input_number.{prefix_with_underscore}current")
        entity_states["selector"] = get_formatted_state(dynamic_selector)
        entity_states["pause"] = get_formatted_state(f"input_boolean.{prefix_with_underscore}paused")

        response["entity_states"] = entity_states

        _LOGGER.debug(
            "[REGISTER] Response summary: success=%s, has_profile=%s, states=%s",
            response.get("success"),
            bool(response.get("profile_data")),
            entity_states,
        )
        return response

    if not hass.services.has_service(DOMAIN, "register_card"):
        hass.services.async_register(DOMAIN, "register_card", register_card, supports_response=True)

    # ========================================
    # SERVICE: list_all_profiles (NUOVO)
    # ========================================
    async def list_all_profiles_service(call: ServiceCall) -> ServiceResponse:
        """List all profiles grouped by preset type for dashboard."""
        try:
            if not hasattr(profile_service, "storage"):
                return {"error": "Storage not available"}

            force_reload = call.data.get("force_reload", False)
            files = await profile_service.storage.list_profiles()
            profiles_by_preset = {}

            for filename in files:
                try:
                    data = await profile_service.storage.load_profile_cached(filename, force_reload=force_reload)
                    if not data:
                        continue

                    # Container format
                    if "meta" in data and "profiles" in data:
                        preset_type = data["meta"].get("preset_type", "unknown")
                        global_prefix = data["meta"].get("global_prefix", "")

                        if preset_type not in profiles_by_preset:
                            profiles_by_preset[preset_type] = {"global_prefix": global_prefix, "profiles": []}

                        for profile_name, profile_content in data["profiles"].items():
                            schedule = profile_content.get("schedule", [])
                            profiles_by_preset[preset_type]["profiles"].append(
                                {"name": profile_name, "points": len(schedule), "updated_at": profile_content.get("updated_at", "unknown")}
                            )

                    # Legacy format
                    elif "profile_name" in data:
                        preset_type = data.get("preset_type", "unknown")
                        global_prefix = data.get("global_prefix", "")

                        if preset_type not in profiles_by_preset:
                            profiles_by_preset[preset_type] = {"global_prefix": global_prefix, "profiles": []}

                        schedule = data.get("schedule", [])
                        profiles_by_preset[preset_type]["profiles"].append(
                            {
                                "name": data.get("profile_name", "Unknown"),
                                "points": len(schedule),
                                "updated_at": data.get("updated_at", "unknown"),
                            }
                        )

                except Exception as e:
                    _LOGGER.warning("Error reading profile file %s: %s", filename, e)
                    continue

            _LOGGER.info("[LIST_ALL_PROFILES] Found %d presets with profiles", len(profiles_by_preset))
            return profiles_by_preset

        except Exception as e:
            _LOGGER.error("Error listing profiles: %s", e)
            return {"error": str(e)}

    if not hass.services.has_service(DOMAIN, "list_all_profiles"):
        hass.services.async_register(DOMAIN, "list_all_profiles", list_all_profiles_service, supports_response=True)

    # ========================================
    # EVENT HANDLERS
    # ========================================
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
