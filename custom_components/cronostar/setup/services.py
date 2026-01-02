# custom_components/cronostar/setup/services.py
"""
Service registration for CronoStar
Registers global services for profile management and schedule application
"""

import logging

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse

from ..const import DOMAIN
from ..services.profile_service import ProfileService

_LOGGER = logging.getLogger(__name__)


async def setup_services(hass: HomeAssistant, storage_manager) -> None:
    """
    Register all CronoStar global services.

    These services operate on profile data and are used by Lovelace cards
    and automations. They are registered once per HA instance.

    Args:
        hass: Home Assistant instance
        storage_manager: Global storage manager instance
    """
    _LOGGER.info("🔧 Registering CronoStar services...")

    # Initialize profile service (handles save/load/delete profiles)
    profile_service = ProfileService(hass, None, storage_manager)

    # Store reference for potential internal use
    hass.data[DOMAIN]["profile_service"] = profile_service

    # === Profile Management Services ===

    async def save_profile_handler(call: ServiceCall):
        """Handle save_profile service call.

        Called by Lovelace cards when user saves a schedule.
        """
        await profile_service.save_profile(call)
        _LOGGER.info("Profile saved: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "save_profile", save_profile_handler)

    async def load_profile_handler(call: ServiceCall) -> ServiceResponse:
        """Handle load_profile service call (returns data).

        Called by Lovelace cards to load schedule data.
        """
        return await profile_service.load_profile(call)

    hass.services.async_register(DOMAIN, "load_profile", load_profile_handler, supports_response=True)

    async def add_profile_handler(call: ServiceCall):
        """Handle add_profile service call.

        Creates a new empty profile.
        """
        await profile_service.add_profile(call)
        _LOGGER.info("Profile added: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "add_profile", add_profile_handler)

    async def delete_profile_handler(call: ServiceCall):
        """Handle delete_profile service call.

        Removes a profile from storage.
        """
        await profile_service.delete_profile(call)
        _LOGGER.info("Profile deleted: %s", call.data.get("profile_name"))

    hass.services.async_register(DOMAIN, "delete_profile", delete_profile_handler)

    # === Utility Services ===

    async def list_all_profiles_handler(call: ServiceCall) -> ServiceResponse:
        """List all profiles across all preset types.

        Used by dashboards and debugging.
        """
        storage = storage_manager
        try:
            force_reload = call.data.get("force_reload", False)
            files = await storage.list_profiles()

            profiles_by_preset = {}

            for filename in files:
                try:
                    data = await storage.load_profile_cached(filename, force_reload=force_reload)

                    if not data or "meta" not in data or "profiles" not in data:
                        continue

                    preset_type = data["meta"].get("preset_type", "unknown")
                    global_prefix = data["meta"].get("global_prefix", "")

                    if preset_type not in profiles_by_preset:
                        profiles_by_preset[preset_type] = {"files": []}

                    file_info = {"filename": filename, "global_prefix": global_prefix, "profiles": []}

                    for profile_name, profile_content in data["profiles"].items():
                        file_info["profiles"].append(
                            {
                                "name": profile_name,
                                "points": len(profile_content.get("schedule", [])),
                                "updated_at": profile_content.get("updated_at", "unknown"),
                            }
                        )

                    profiles_by_preset[preset_type]["files"].append(file_info)

                except Exception as e:
                    _LOGGER.warning("Error processing file %s: %s", filename, e)
                    continue

            return profiles_by_preset

        except Exception as e:
            _LOGGER.error("Error listing profiles: %s", e)
            return {"error": str(e)}

    hass.services.async_register(DOMAIN, "list_all_profiles", list_all_profiles_handler, supports_response=True)

    # === Schedule Application Service ===

    async def apply_now_handler(call: ServiceCall):
        """Apply current schedule value immediately.

        This service is called by automations or manually to force
        application of the current scheduled value to a target entity.

        Since controllers are managed by Lovelace cards (not coordinators),
        this service handles the interpolation and entity update directly.
        """
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
                return

            schedule = profile_data.get("schedule", [])

            if not schedule:
                _LOGGER.warning("apply_now: Empty schedule for %s", profile_name)
                return

            # Interpolate current value
            from datetime import datetime

            now = datetime.now()
            current_minutes = now.hour * 60 + now.minute

            # Simple interpolation logic (can be extracted to utility)
            value = None
            for item in schedule:
                time_str = item.get("time")
                item_value = item.get("value")

                if not time_str or item_value is None:
                    continue

                try:
                    hours, minutes = map(int, time_str.split(":"))
                    item_minutes = hours * 60 + minutes

                    if item_minutes <= current_minutes:
                        value = float(item_value)
                    else:
                        break
                except (ValueError, AttributeError):
                    continue

            if value is None and schedule:
                # Use last value if no match found
                value = float(schedule[-1].get("value", 0))

            if value is None:
                _LOGGER.warning("apply_now: Could not interpolate value")
                return

            # Apply to target entity
            domain = target_entity.split(".")[0]

            if domain == "climate":
                await hass.services.async_call("climate", "set_temperature", {"entity_id": target_entity, "temperature": value}, blocking=False)
            elif domain in ["switch", "light", "fan"]:
                service = "turn_on" if value > 0 else "turn_off"
                await hass.services.async_call(domain, service, {"entity_id": target_entity}, blocking=False)
            elif domain == "input_number":
                await hass.services.async_call("input_number", "set_value", {"entity_id": target_entity, "value": value}, blocking=False)
            elif domain == "cover":
                await hass.services.async_call("cover", "set_cover_position", {"entity_id": target_entity, "position": int(value)}, blocking=False)
            else:
                _LOGGER.warning("apply_now: Unsupported domain '%s'", domain)
                return

            _LOGGER.info("apply_now: Applied value %.2f to %s", value, target_entity)

        except Exception as e:
            _LOGGER.error("apply_now failed: %s", e)

    hass.services.async_register(DOMAIN, "apply_now", apply_now_handler)

    _LOGGER.info("✅ CronoStar services registered:")
    _LOGGER.info("   - save_profile")
    _LOGGER.info("   - load_profile")
    _LOGGER.info("   - add_profile")
    _LOGGER.info("   - delete_profile")
    _LOGGER.info("   - list_all_profiles")
    _LOGGER.info("   - apply_now")
