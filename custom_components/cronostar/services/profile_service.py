"""Profile management with optimized save and ISO 8601 dates."""
import logging
import time
from datetime import datetime
from collections import OrderedDict

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

    def _to_iso8601(self, timestamp=None):
        """Convert timestamp to ISO 8601 format."""
        if timestamp is None:
            timestamp = time.time()
        return datetime.fromtimestamp(timestamp).isoformat()

    def _optimize_schedule(self, schedule):
        """Remove redundant points where value doesn't change."""
        if not schedule or len(schedule) <= 2:
            return schedule
        
        optimized = [schedule[0]]  # Always keep first
        
        for i in range(1, len(schedule) - 1):
            prev_val = schedule[i - 1].get('value')
            curr_val = schedule[i].get('value')
            next_val = schedule[i + 1].get('value')
            
            # Keep if value changes
            if abs(curr_val - prev_val) > 0.01 or abs(curr_val - next_val) > 0.01:
                optimized.append(schedule[i])
        
        optimized.append(schedule[-1])  # Always keep last
        
        removed = len(schedule) - len(optimized)
        if removed > 0:
            _LOGGER.info("Optimized schedule: removed %d redundant points", removed)
        
        return optimized

    async def save_profile(self, call: ServiceCall):
        """Save a profile with ISO 8601 dates and optimized schedule."""
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
        
        _LOGGER.info(
            "=== SAVE PROFILE START === Profile: '%s', Preset: %s, File: %s",
            profile_name,
            canonical,
            filename
        )
        
        # Optimize schedule
        optimized_schedule = self._optimize_schedule(schedule)
        
        _LOGGER.info(
            "Schedule optimization: %d -> %d points",
            len(schedule),
            len(optimized_schedule)
        )
        
        # Load existing data
        existing_data = await self.storage.load_profile_cached(filename) or {}
        
        # Prepare structure with meta first
        new_data = OrderedDict()
        
        if "meta" in existing_data:
            new_data["meta"] = existing_data["meta"]
            new_data["meta"]["updated_at"] = self._to_iso8601()
        else:
            new_data["meta"] = {
                "entity_prefix": global_prefix or entity_prefix,
                "preset_type": canonical,
                "created_at": self._to_iso8601(),
                "updated_at": self._to_iso8601()
            }
        
        if "profiles" in existing_data:
            new_data["profiles"] = existing_data["profiles"]
        else:
            new_data["profiles"] = {}
        
        # Update specific profile
        new_data["profiles"][profile_name] = {
            "schedule": optimized_schedule,
            "updated_at": self._to_iso8601()
        }
        
        # Atomic save
        success = await self.storage.save_profile_atomic(filename, new_data, backup=True)
        
        if success:
            _LOGGER.info("✅ Profile saved successfully!")
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("❌ Failed to save profile container: %s", filename)
        
        _LOGGER.info("=== SAVE PROFILE END ===")
    
    async def get_profile_data(
        self,
        profile_name: str,
        preset_type: str,
        entity_prefix: str | None = None,
        global_prefix: str | None = None
    ) -> dict:
        """Fetch profile data."""
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
        
        for filename in filenames_to_try:
            data = await self.storage.load_profile_cached(filename)
            
            if data and "profiles" in data:
                if profile_name in data["profiles"]:
                    profile_content = data["profiles"][profile_name]
                    profile_content["entity_prefix"] = data.get("meta", {}).get("entity_prefix")
                    profile_content["profile_name"] = profile_name
                    
                    _LOGGER.debug("Profile '%s' extracted from %s", profile_name, filename)
                    return profile_content
        
        return {"error": "Profile not found"}

    async def load_profile(self, call: ServiceCall) -> ServiceResponse:
        """Load a profile."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        _LOGGER.info(
            "=== LOAD PROFILE START === Profile: '%s', Preset: %s",
            profile_name,
            preset_type
        )
        
        result = await self.get_profile_data(
            profile_name, 
            preset_type, 
            entity_prefix, 
            global_prefix
        )
        
        _LOGGER.info("✅ Profile loaded successfully: %s", profile_name)
        _LOGGER.info("=== LOAD PROFILE END ===")
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
        
        # Get default value
        default_value = 20 if canonical == "thermostat" else 0
        default_schedule = [
            {"time": f"{h:02d}:00", "value": default_value} 
            for h in range(24)
        ]
        
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
            "saved_at": self._to_iso8601()
        }
        
        _LOGGER.info("Creating new profile: %s", filename)
        
        success = await self.storage.save_profile_atomic(filename, profile_data, backup=False)
        
        if success:
            _LOGGER.info("✅ Profile created: %s", filename)
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("❌ Failed to create profile: %s", filename)
    
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
            if await self.storage.delete_profile(filename):
                deleted = True
                _LOGGER.info("✅ Profile deleted: %s", filename)
        
        if not deleted:
            _LOGGER.warning("❌ No profile file found to delete: %s", profile_name)
        else:
            await self.async_update_profile_selectors()
    
    async def async_update_profile_selectors(self):
        """Scan profiles and update input_select entities."""
        _LOGGER.info("Updating profile selectors...")
        
        profiles_by_preset = {}
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