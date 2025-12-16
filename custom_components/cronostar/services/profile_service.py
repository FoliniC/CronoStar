"""Profile management using StorageManager for robust saves."""
import logging
import os
import time

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse

from ..utils.filename_builder import build_profile_filename
from ..utils.prefix_normalizer import normalize_preset_type, PRESETS_CONFIG
from .file_service import FileService

_LOGGER = logging.getLogger(__name__)

class ProfileService:
    def __init__(self, hass: HomeAssistant, file_service: FileService, storage_manager):
        self.hass = hass
        self.file_service = file_service
        self.storage = storage_manager

    async def save_profile(self, call: ServiceCall):
        """Save a profile using StorageManager (atomic, with backup) into a single JSON file."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        schedule = call.data.get("schedule")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type, schedule)):
            _LOGGER.warning("save_profile: Missing required parameters")
            return
        
        canonical = normalize_preset_type(preset_type)
        
        # Determine filename (now shared for all profiles with this prefix)
        filename = build_profile_filename(
            profile_name,
            canonical,
            entity_prefix=entity_prefix,
            global_prefix=global_prefix
        )
        
        # 1. Load existing data
        existing_data = await self.storage.load_profile_cached(filename) or {}
        
        # 2. Prepare structure
        if "profiles" not in existing_data:
            existing_data["profiles"] = {}
        if "meta" not in existing_data:
            existing_data["meta"] = {
                "entity_prefix": global_prefix or entity_prefix,
                "preset_type": canonical,
                "created_at": time.time()
            }
            
        # 3. Update specific profile
        existing_data["profiles"][profile_name] = {
            "schedule": schedule,
            "updated_at": time.time()
        }
        
        # Update meta timestamp
        existing_data["meta"]["updated_at"] = time.time()
        
        _LOGGER.info(
            "Saving profile '%s' to container %s",
            profile_name,
            filename
        )
        
        # Log payload details for debugging
        if isinstance(schedule, list):
            sample = schedule[:3] if len(schedule) > 3 else schedule
            _LOGGER.info(
                "Received schedule data (len=%d). Sample: %s", 
                len(schedule), 
                sample
            )
        else:
            _LOGGER.warning("Received schedule data is not a list: %s", type(schedule))
        
        # 4. Atomic Save
        success = await self.storage.save_profile_atomic(filename, existing_data, backup=True)
        
        if success:
            _LOGGER.info("? Profile container saved: %s", filename)
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("? Failed to save profile container: %s", filename)
    
    async def get_profile_data(
        self,
        profile_name: str,
        preset_type: str,
        entity_prefix: str | None = None,
        global_prefix: str | None = None
    ) -> dict:
        """Fetch profile data directly (internal helper)."""
        if not all((profile_name, preset_type)):
            return {"error": "Missing parameters"}
        
        canonical = normalize_preset_type(preset_type)
        
        # Try multiple filename patterns
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
        
        # Try each filename
        for filename in filenames_to_try:
            data = await self.storage.load_profile_cached(filename)
            
            if data and "profiles" in data:
                # Check if specific profile exists in container
                if profile_name in data["profiles"]:
                    profile_content = data["profiles"][profile_name]
                    # Inject meta info for consumer
                    profile_content["entity_prefix"] = data.get("meta", {}).get("entity_prefix")
                    profile_content["profile_name"] = profile_name
                    
                    _LOGGER.debug("Profile '%s' extracted from %s", profile_name, filename)
                    return profile_content
        
        return {"error": "Profile not found"}

    async def load_profile(self, call: ServiceCall) -> ServiceResponse:
        """Load a profile using StorageManager (with caching)."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        result = await self.get_profile_data(
            profile_name, 
            preset_type, 
            entity_prefix, 
            global_prefix
        )
        
        if "error" not in result:
            _LOGGER.info("? Profile loaded: %s", profile_name)
        else:
            _LOGGER.warning(
                "? Profile not found: %s", profile_name
            )
            
        return result
    
    async def add_profile(self, call: ServiceCall):
        """Create a new profile with default values."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        
        # Get default value from preset config
        default_value = 20 if canonical == "thermostat" else 0
        default_schedule = [{"hour": h, "value": default_value} for h in range(24)]
        
        filename = build_profile_filename(
            profile_name,
            canonical,
            entity_prefix=entity_prefix,
            global_prefix=global_prefix
        )
        
        profile_data = {
            "profile_name": profile_name,
            "preset_type": canonical,
            "entity_prefix": global_prefix or entity_prefix,
            "schedule": default_schedule,
            "saved_at": time.time()
        }
        
        _LOGGER.info("Creating new profile: %s", filename)
        
        success = await self.storage.save_profile_atomic(filename, profile_data, backup=False)
        
        if success:
            _LOGGER.info("? Profile created: %s", filename)
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("? Failed to create profile: %s", filename)
    
    async def delete_profile(self, call: ServiceCall):
        """Delete a profile using StorageManager."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((profile_name, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        
        # Try multiple filename patterns
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
            if await self.storage.delete_profile(filename):
                deleted = True
                _LOGGER.info("? Profile deleted: %s", filename)
        
        if not deleted:
            _LOGGER.warning("? No profile file found to delete: %s", profile_name)
        else:
            await self.async_update_profile_selectors()
    
    async def async_update_profile_selectors(self):
        """Scan profiles and update input_select entities."""
        _LOGGER.info("Updating profile selectors...")
        
        profiles_by_preset = {}
        
        # List all data files
        all_files = await self.storage.list_profiles()
        
        for filename in all_files:
            try:
                container_data = await self.storage.load_profile_cached(filename)
                
                if not container_data or "meta" not in container_data:
                    continue
                
                preset_type = container_data["meta"].get("preset_type")
                profiles_dict = container_data.get("profiles", {})
                
                if preset_type and profiles_dict:
                    canonical_preset = normalize_preset_type(preset_type)
                    
                    if canonical_preset not in profiles_by_preset:
                        profiles_by_preset[canonical_preset] = []
                    
                    # Add all profile names found in this container
                    profiles_by_preset[canonical_preset].extend(profiles_dict.keys())
            
            except Exception as e:
                _LOGGER.warning("Could not read profile container %s: %s", filename, e)
        
        # Update input_select entities
        for preset, config in PRESETS_CONFIG.items():
            selector_entity_id = config.get("profiles_select")
            
            if not selector_entity_id or preset not in profiles_by_preset:
                continue
            
            current_state = self.hass.states.get(selector_entity_id)
            current_options = current_state.attributes.get("options", []) if current_state else []
            
            new_options = sorted(list(set(profiles_by_preset[preset])))
            
            if set(current_options) != set(new_options):
                _LOGGER.info("Updating %s with %d profiles", selector_entity_id, len(new_options))
                
                try:
                    await self.hass.services.async_call(
                        "input_select",
                        "set_options",
                        {"entity_id": selector_entity_id, "options": new_options},
                        blocking=True,
                    )
                except Exception as e:
                    _LOGGER.error("Failed to update %s: %s", selector_entity_id, e)
            else:
                _LOGGER.debug("Profiles for %s are up to date", selector_entity_id)