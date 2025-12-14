import logging
import os
import time
from functools import partial

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse

from ..utils.filename_builder import build_profile_filename
from ..utils.prefix_normalizer import normalize_preset_type, PRESETS_CONFIG
from .file_service import FileService # Import FileService

_LOGGER = logging.getLogger(__name__)

class ProfileService:
    def __init__(self, hass: HomeAssistant, file_service: FileService):
        self.hass = hass
        self.file_service = file_service
        self.profiles_dir = file_service.profiles_dir # Use the profiles_dir from FileService

    async def save_profile(self, call: ServiceCall):
        """Save a profile to JSON file."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        schedule = call.data.get("schedule")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type, schedule)):
            _LOGGER.warning("save_profile: Missing required parameters")
            return
        
        canonical = normalize_preset_type(preset_type)
        
        filename = build_profile_filename(
            profile_name,
            canonical,
            entity_prefix=entity_prefix,
            global_prefix=global_prefix
        )
        
        file_path = os.path.join(self.profiles_dir, filename)
        
        profile_data = {
            "profile_name": profile_name,
            "preset_type": canonical,
            "entity_prefix": global_prefix or entity_prefix,
            "schedule": schedule,
            "saved_at": time.time()
        }
        
        _LOGGER.info(
            "Saving profile: %s (preset=%s, prefix=%s) to %s",
            profile_name,
            canonical,
            global_prefix or entity_prefix,
            filename
        )
        
        await self.hass.async_add_executor_job(
            partial(self.file_service.save_json, file_path, profile_data)
        )
    
    async def load_profile(self, call: ServiceCall) -> ServiceResponse:
        """Load a profile from JSON file."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type)):
            return {"error": "Missing parameters"}
        
        canonical = normalize_preset_type(preset_type)
        
        filenames_to_try = []
        
        if global_prefix or entity_prefix:
            filenames_to_try.append(
                build_profile_filename(
                    profile_name,
                    canonical,
                    entity_prefix=entity_prefix,
                    global_prefix=global_prefix
                )
            )
        
        filenames_to_try.append(
            build_profile_filename(profile_name, canonical)
        )
        
        for filename in filenames_to_try:
            file_path = os.path.join(self.profiles_dir, filename)
            
            if await self.hass.async_add_executor_job(os.path.exists, file_path):
                _LOGGER.info("Loading profile from: %s", filename)
                data = await self.hass.async_add_executor_job(self.file_service.load_json, file_path)
                
                if "error" not in data:
                    return data
        
        _LOGGER.warning(
            "Profile not found: %s (tried: %s)",
            profile_name,
            ", ".join(filenames_to_try)
        )
        
        return {"error": "Profile not found"}
    
    async def add_profile(self, call: ServiceCall):
        """Create a new profile with default values."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        
        default_value = 20 if canonical == "thermostat" else 0
        default_schedule = [{"hour": h, "value": default_value} for h in range(24)]
        
        filename = build_profile_filename(
            profile_name,
            canonical,
            entity_prefix=entity_prefix,
            global_prefix=global_prefix
        )
        
        file_path = os.path.join(self.profiles_dir, filename)
        
        profile_data = {
            "profile_name": profile_name,
            "preset_type": canonical,
            "entity_prefix": global_prefix or entity_prefix,
            "schedule": default_schedule,
            "saved_at": time.time()
        }
        
        _LOGGER.info("Creating new profile: %s", filename)
        
        await self.hass.async_add_executor_job(
            partial(self.file_service.save_json, file_path, profile_data)
        )
    
    async def delete_profile(self, call: ServiceCall):
        """Delete a profile."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        
        filenames_to_delete = []
        
        if global_prefix or entity_prefix:
            filenames_to_delete.append(
                build_profile_filename(
                    profile_name,
                    canonical,
                    entity_prefix=entity_prefix,
                    global_prefix=global_prefix
                )
            )
        
        filenames_to_delete.append(
            build_profile_filename(profile_name, canonical)
        )
        
        deleted = False
        for filename in filenames_to_delete:
            file_path = os.path.join(self.profiles_dir, filename)
            
            if await self.hass.async_add_executor_job(os.path.exists, file_path):
                _LOGGER.info("Deleting profile: %s", filename)
                await self.hass.async_add_executor_job(os.remove, file_path)
                deleted = True
        
        if not deleted:
            _LOGGER.warning("No profile file found to delete: %s", profile_name)

    async def async_update_profile_selectors(self):
        """Scan profile directory and update all profile input_selects."""
        _LOGGER.info("Scanning for profiles and updating selectors.")
        try:
            files = await self.hass.async_add_executor_job(os.listdir, self.profiles_dir)
        except OSError as e:
            _LOGGER.error("Could not list profiles directory %s: %s", self.profiles_dir, e)
            return

        profiles_by_preset = {}
        for filename in files:
            if not filename.endswith(".json"):
                continue

            file_path = os.path.join(self.profiles_dir, filename)
            try:
                # Use executor job for file I/O
                profile_data = await self.hass.async_add_executor_job(self.file_service.load_json, file_path)
                profile_name = profile_data.get("profile_name")
                preset_type = profile_data.get("preset_type")

                if profile_name and preset_type:
                    canonical_preset = normalize_preset_type(preset_type)
                    if canonical_preset not in profiles_by_preset:
                        profiles_by_preset[canonical_preset] = []
                    profiles_by_preset[canonical_preset].append(profile_name)

            except Exception as e:
                _LOGGER.warning("Could not read or parse profile %s: %s", filename, e)

        for preset, config in PRESETS_CONFIG.items():
            selector_entity_id = config.get("profiles_select")
            if selector_entity_id and preset in profiles_by_preset:
                # Get current options to see if an update is needed
                current_state = self.hass.states.get(selector_entity_id)
                current_options = current_state.attributes.get("options", []) if current_state else []
                
                # Use a set for efficient comparison and to handle duplicates
                new_options = sorted(list(set(profiles_by_preset[preset])))

                if set(current_options) != set(new_options):
                    _LOGGER.info("Updating %s with options: %s", selector_entity_id, new_options)
                    try:
                        await self.hass.services.async_call(
                            "input_select",
                            "set_options",
                            {"entity_id": selector_entity_id, "options": new_options},
                            blocking=True,
                        )
                    except Exception as e:
                        _LOGGER.error("Failed to set options for %s: %s", selector_entity_id, e)
                else:
                    _LOGGER.debug("Options for %s are already up to date.", selector_entity_id)
