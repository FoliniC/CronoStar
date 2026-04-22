import logging
from datetime import datetime

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant.exceptions import HomeAssistantError

from custom_components.cronostar.const import DOMAIN
from custom_components.cronostar.exceptions import ProfileNotFoundError, ScheduleApplicationError
from custom_components.cronostar.services.profile_service import ProfileService
from custom_components.cronostar.storage.settings_manager import SettingsManager
from custom_components.cronostar.storage.storage_manager import StorageManager
from custom_components.cronostar.utils.error_handler import log_operation, handle_service_errors

_LOGGER = logging.getLogger(__name__)


async def setup_services(hass: HomeAssistant, storage_manager: StorageManager) -> None:
    """
    Register all CronoStar global services.

    These services operate on profile data and are used by Lovelace cards
    and automations. They are registered once per HA instance.

    Args:
        hass: Home Assistant instance
        storage_manager: Global storage manager instance
    """
    _LOGGER.info("🔧 Registering CronoStar services...")

    # Get settings manager
    settings_manager: SettingsManager = hass.data[DOMAIN]["settings_manager"]

    # Initialize profile service (handles save/load/delete profiles)
    profile_service = ProfileService(hass, storage_manager, settings_manager)

    # Store reference for potential internal use
    hass.data[DOMAIN]["profile_service"] = profile_service

    # === Profile Management Services ===

    @handle_service_errors
    async def save_profile_handler(call: ServiceCall):
        """Handle save_profile service call."""
        await profile_service.save_profile(call)
        _LOGGER.info("Profile saved: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "save_profile", save_profile_handler)

    @handle_service_errors
    async def load_profile_handler(call: ServiceCall) -> ServiceResponse:
        """Handle load_profile service call."""
        return await profile_service.load_profile(call)

    hass.services.async_register(DOMAIN, "load_profile", load_profile_handler, supports_response=True)

    @handle_service_errors
    async def add_profile_handler(call: ServiceCall):
        """Handle add_profile service call."""
        await profile_service.add_profile(call)
        _LOGGER.info("Profile added: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "add_profile", add_profile_handler)

    @handle_service_errors
    async def delete_profile_handler(call: ServiceCall):
        """Handle delete_profile service call."""
        await profile_service.delete_profile(call)
        _LOGGER.info("Profile deleted: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "delete_profile", delete_profile_handler)

    @handle_service_errors
    async def delete_controller_handler(call: ServiceCall):
        """Handle delete_controller service call."""
        await profile_service.delete_controller(call)
        _LOGGER.info("Controller deleted: %s", call.data.get("global_prefix"))

    hass.services.async_register(DOMAIN, "delete_controller", delete_controller_handler)

    @handle_service_errors
    async def register_card_handler(call: ServiceCall) -> ServiceResponse:
        """Handle register_card service call."""
        return await profile_service.register_card(call)

    hass.services.async_register(DOMAIN, "register_card", register_card_handler, supports_response=True)

    # === Settings Services ===

    @handle_service_errors
    async def save_settings_handler(call: ServiceCall):
        """Handle save_settings service call."""
        settings = call.data.get("settings", {})
        if settings:
            await settings_manager.save_settings(settings)
            _LOGGER.info("Global settings saved")

    hass.services.async_register(DOMAIN, "save_settings", save_settings_handler)

    @handle_service_errors
    async def load_settings_handler(call: ServiceCall) -> ServiceResponse:
        """Handle load_settings service call."""
        return await settings_manager.load_settings()

    hass.services.async_register(DOMAIN, "load_settings", load_settings_handler, supports_response=True)

    # === Utility Services ===

    @handle_service_errors
    async def list_all_profiles_handler(call: ServiceCall) -> ServiceResponse:
        storage = storage_manager
        try:
            force_reload = call.data.get("force_reload", False)
            _LOGGER.info("[LIST_ALL] Request received (force_reload=%s)", force_reload)

            # Use force_reload to clear cache if requested
            files = await storage.list_profiles(force_reload=force_reload)
            _LOGGER.info("[LIST_ALL] Found %d profile files on disk: %s", len(files), files)

            profiles_by_preset = {}

            for filename in files:
                try:
                    _LOGGER.debug("[LIST_ALL] Processing file: %s", filename)
                    data = await storage.load_profile_cached(filename, force_reload=force_reload)

                    if not data or not isinstance(data, dict):
                        _LOGGER.error("[LIST_ALL] CRITICAL: File %s is empty or invalid JSON", filename)
                        continue

                    if "meta" not in data or "profiles" not in data:
                        _LOGGER.error("[LIST_ALL] ANOMALY: File %s missing 'meta' or 'profiles' section. Content keys: %s", filename, list(data.keys()))
                        if "meta" not in data: data["meta"] = {}
                        if "profiles" not in data: data["profiles"] = {}

                    # Primary Extraction (Direct from loaded JSON)
                    meta = data.get("meta", {})
                    preset_type = meta.get("preset_type", "unknown")
                    global_prefix = meta.get("global_prefix", "")
                    target_entity = meta.get("target_entity")

                    _LOGGER.debug("[LIST_ALL] File: %s, Meta Preset: %s, Meta Target: %s", filename, preset_type, target_entity)

                    # Fallback to ConfigEntry if JSON is missing critical data.
                    # Normalise trailing underscore before comparing so that
                    # "cronostar_ev_" matches an entry stored as "cronostar_ev_"
                    # regardless of whether one side has the underscore or not.
                    if not target_entity or preset_type == "unknown":
                        if global_prefix:
                            global_prefix_norm = global_prefix.rstrip("_")
                            for entry in hass.config_entries.async_entries("cronostar"):
                                entry_prefix_norm = entry.data.get("global_prefix", "").rstrip("_")
                                if entry_prefix_norm == global_prefix_norm:
                                    if not target_entity:
                                        target_entity = entry.data.get("target_entity")
                                        meta["target_entity"] = target_entity
                                        _LOGGER.info("[LIST_ALL] Synced target '%s' from ConfigEntry for prefix '%s'", target_entity, global_prefix)
                                    if preset_type == "unknown":
                                        preset_type = entry.data.get("preset_type", "unknown")
                                        meta["preset_type"] = preset_type
                                        _LOGGER.info("[LIST_ALL] Synced preset '%s' from ConfigEntry for prefix '%s'", preset_type, global_prefix)
                                    break

                    # Grouping for frontend
                    if not preset_type or preset_type == "unknown":
                        preset_type = "thermostat"

                    if preset_type not in profiles_by_preset:
                        profiles_by_preset[preset_type] = {"files": []}

                    file_info = {
                        "filename": filename,
                        "global_prefix": global_prefix,
                        "preset": preset_type,
                        "meta": meta,
                        "profiles": [],
                    }

                    # Validation
                    validation_errors = []
                    validation_warnings = []

                    if not global_prefix:
                        validation_errors.append("Missing global prefix")

                    if not target_entity:
                        validation_errors.append("Target entity not configured")
                    else:
                        entity_state = hass.states.get(target_entity)
                        if not entity_state:
                            if hass.is_running:
                                validation_warnings.append(f"Target entity '{target_entity}' not found in Home Assistant")
                            else:
                                validation_warnings.append(f"Target entity '{target_entity}' not yet available")
                        else:
                            # Coherence check
                            entity_unit = entity_state.attributes.get("unit_of_measurement")
                            if entity_unit:
                                is_thermal = any(u in entity_unit for u in ["°C", "°F", "K"])
                                is_power = any(u in entity_unit.upper() for u in ["W", "KW", "A"])
                                if preset_type == "ev_charging" and is_thermal:
                                    validation_errors.append(f"Preset is EV Charging but unit is '{entity_unit}'")
                                elif preset_type == "thermostat" and is_power:
                                    validation_errors.append(f"Preset is Thermostat but unit is '{entity_unit}'")

                    # Profile count
                    if not data.get("profiles"):
                        validation_warnings.append("No profiles defined in this file")

                    file_info["validation"] = {
                        "valid": len(validation_errors) == 0,
                        "errors": validation_errors,
                        "warnings": validation_warnings
                    }

                    for profile_name, profile_content in data.get("profiles", {}).items():
                        file_info["profiles"].append(
                            {
                                "name": profile_name,
                                "points": len(profile_content.get("schedule", [])),
                                "updated_at": profile_content.get("updated_at", "unknown"),
                            }
                        )

                    profiles_by_preset[preset_type]["files"].append(file_info)

                except Exception as e:
                    _LOGGER.error("[LIST_ALL] Error processing file %s: %s", filename, e, exc_info=True)
                    continue

            _LOGGER.info("[LIST_ALL] Completed. Presets found: %s", list(profiles_by_preset.keys()))
            return profiles_by_preset

        except Exception as e:
            _LOGGER.error("[LIST_ALL] Uncaught error: %s", e, exc_info=True)
            return {"error": str(e)}
    hass.services.async_register(DOMAIN, "list_all_profiles", list_all_profiles_handler, supports_response=True)

    # === Schedule Application Service ===

    @handle_service_errors
    async def apply_now_handler(call: ServiceCall):
        target_entity = call.data.get("target_entity")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix", "")
        profile_name = call.data.get("profile_name")

        if not target_entity:
            _LOGGER.warning("apply_now: missing target_entity")
            return

        if not profile_name:
            _LOGGER.warning("apply_now: missing profile_name")
            return

        try:
            # Load profile data
            profile_data = await profile_service.get_profile_data(profile_name, preset_type, global_prefix)

            if "error" in profile_data:
                _LOGGER.error("apply_now: Profile not found: %s", profile_data["error"])
                raise ProfileNotFoundError()

            schedule = profile_data.get("schedule", [])

            if not schedule:
                _LOGGER.warning("apply_now: Empty schedule for %s", profile_name)
                return

            # Interpolate current value

            now = datetime.now()
            current_minutes = now.hour * 60 + now.minute

            def _minutes_to_time(total: int) -> str:
                total %= 1440
                h = (total // 60) % 24
                m = total % 60
                return f"{h:02d}:{m:02d}"

            # Parse schedule into (minutes, value)
            points = []
            for item in schedule:
                try:
                    t = item.get("time")
                    v = item.get("value")
                    if not t or v is None:
                        continue
                    h, m = map(int, str(t).split(":"))
                    points.append((h * 60 + m, float(v)))
                except Exception:
                    continue

            points.sort(key=lambda x: x[0])

            # Simple stepped interpolation: pick last point at or before now
            value = None
            for minute, v in points:
                if minute <= current_minutes:
                    value = v
                else:
                    break

            if value is None and points:
                # Use last value if no match found
                value = points[-1][1]

            if value is None:
                _LOGGER.warning("apply_now: Could not interpolate value")
                return

            current_time_str = _minutes_to_time(current_minutes)

            # Compute next change time (next point with different value)
            next_time_str = None
            next_in_minutes = None
            if points:
                # Find next differing point ahead
                next_candidate = None
                for minute, v in points:
                    if minute > current_minutes and v != value:
                        next_candidate = (minute, v)
                        break
                # Wrap-around
                if next_candidate is None:
                    for minute, v in points:
                        if v != value:
                            next_candidate = (minute, v)
                            break
                if next_candidate:
                    nm, nv = next_candidate
                    next_time_str = _minutes_to_time(nm)
                    next_in_minutes = (nm - current_minutes) if nm > current_minutes else (1440 - current_minutes + nm)

            # Apply to target entity
            domain = target_entity.split(".")[0]
            service_called = "none"

            if domain == "climate":
                service_called = "climate.set_temperature"
                await hass.services.async_call("climate", "set_temperature", {"entity_id": target_entity, "temperature": value}, blocking=False)
            elif domain in ["switch", "light", "fan"]:
                service = "turn_on" if value > 0 else "turn_off"
                service_called = f"{domain}.{service}"
                await hass.services.async_call(domain, service, {"entity_id": target_entity}, blocking=False)
            elif domain == "input_number":
                service_called = "input_number.set_value"
                await hass.services.async_call("input_number", "set_value", {"entity_id": target_entity, "value": value}, blocking=False)
            elif domain == "input_select":
                 _LOGGER.warning("apply_now: input_select target not directly supported yet via interpolation")
                 return
            elif domain == "cover":
                service_called = "cover.set_cover_position"
                await hass.services.async_call("cover", "set_cover_position", {"entity_id": target_entity, "position": int(value)}, blocking=False)
            else:
                _LOGGER.warning("apply_now: Unsupported domain '%s'", domain)
                return

            # Highlighted info line for quick discovery
            if next_time_str is not None and next_in_minutes is not None:
                _LOGGER.info(
                    "🔷⏱️ Manual apply for profile '%s' on %s at %s (graph) → next change at %s (in %d min)",
                    profile_name,
                    target_entity,
                    current_time_str,
                    next_time_str,
                    next_in_minutes,
                )

            log_operation(
                "Manual apply value",
                True,
                entity=target_entity,
                value=value,
                service=service_called,
                profile=profile_name,
                graph_time=current_time_str,
                next_change=next_time_str if next_time_str is not None else "none",
                next_in_minutes=next_in_minutes if next_in_minutes is not None else -1,
            )

        except HomeAssistantError:
            raise
        except Exception as e:
            _LOGGER.error("apply_now failed: %s", e, exc_info=True)
            log_operation("Manual apply value", False, entity=target_entity, error=str(e), profile=profile_name)
            raise ScheduleApplicationError() from e

    hass.services.async_register(DOMAIN, "apply_now", apply_now_handler)

    _LOGGER.info("✅ CronoStar services registered:")
    _LOGGER.info("   - save_profile")
    _LOGGER.info("   - load_profile")
    _LOGGER.info("   - add_profile")
    _LOGGER.info("   - delete_profile")
    _LOGGER.info("   - register_card")
    _LOGGER.info("   - list_all_profiles")
    _LOGGER.info("   - apply_now")


async def async_unload_services(hass: HomeAssistant) -> None:
    """


    Unregister all CronoStar global services.


    """

    _LOGGER.info("🗑️ Unregistering CronoStar services...")

    await hass.services.async_remove(DOMAIN, "save_profile")

    await hass.services.async_remove(DOMAIN, "load_profile")

    await hass.services.async_remove(DOMAIN, "add_profile")

    await hass.services.async_remove(DOMAIN, "delete_profile")

    await hass.services.async_remove(DOMAIN, "register_card")

    await hass.services.async_remove(DOMAIN, "list_all_profiles")

    await hass.services.async_remove(DOMAIN, "apply_now")

    _LOGGER.info("✅ CronoStar services unregistered.")
