"""
CronoStar Smart Scheduler
Calculates the current value based on the active profile JSON and schedules the next update
exactly when the value is due to change.
"""
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

from ..utils.prefix_normalizer import PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)

class SmartScheduler:
    def __init__(self, hass: HomeAssistant, profile_service):
        self.hass = hass
        self.profile_service = profile_service
        self._timers: Dict[str, Any] = {}
        self._profiles_cache: Dict[str, Dict] = {}

    async def async_initialize(self):
        """Initialize schedulers for all presets."""
        _LOGGER.info("Initializing Smart Scheduler...")
        for preset_type in PRESETS_CONFIG:
            await self.update_preset(preset_type)

    def stop(self):
        """Stop all timers."""
        for cancel_func in self._timers.values():
            if cancel_func:
                cancel_func()
        self._timers.clear()
        _LOGGER.info("Smart Scheduler stopped.")

    async def update_preset(self, preset_type: str, profile_data: Optional[Dict] = None):
        """
        Update the schedule for a specific preset.
        1. Determine active profile.
        2. Load data (if not provided).
        3. Calculate current value.
        4. Update input_number.
        5. Schedule next update.
        """
        # Cancel existing timer for this preset
        if preset_type in self._timers:
            self._timers[preset_type]()
            del self._timers[preset_type]

        config = PRESETS_CONFIG.get(preset_type)
        if not config:
            return

        # 1. Determine active profile
        if not profile_data:
            profile_data = await self._get_active_profile_data(preset_type)
        
        if not profile_data:
            _LOGGER.debug("No active profile data for %s, will retry in 1 minute", preset_type)
            self._schedule_retry(preset_type)
            return

        # Cache it
        self._profiles_cache[preset_type] = profile_data

        # 2. Calculate current state
        schedule = profile_data.get("schedule", [])
        
        _LOGGER.info(
            "Scheduler loaded profile '%s' (prefix=%s). Schedule len=%d",
            profile_data.get("profile_name", "unknown"),
            profile_data.get("entity_prefix", "unknown"),
            len(schedule)
        )

        # Assume schedule is sorted list of { "index": int, "value": float } or similar
        # If legacy format { "hour": int, "value": float }, convert logically.
        # We need to handle both 24 points (hourly) and 48+ points (sub-hourly).
        
        # Normalize schedule to 1440 minutes list for easier calculation
        minute_schedule = self._normalize_schedule(schedule)
        
        now = dt_util.now()
        current_minute_of_day = now.hour * 60 + now.minute
        
        current_value = minute_schedule[current_minute_of_day]
        
        # 3. Update Entity
        # Dynamic entity name based on profile prefix
        profile_prefix = profile_data.get("entity_prefix")
        target_entity = None
        
        if profile_prefix:
            if not profile_prefix.endswith("_"):
                profile_prefix += "_"
            dynamic_entity = f"input_number.{profile_prefix}current"
            
            # Check if dynamic entity exists
            if self.hass.states.get(dynamic_entity):
                target_entity = dynamic_entity
            else:
                default_entity = config.get("current_value_entity")
                if default_entity and default_entity != dynamic_entity:
                    _LOGGER.warning(
                        "Dynamic entity %s not found. Falling back to default %s. "
                        "Please create the helper entity to avoid conflicts.",
                        dynamic_entity, default_entity
                    )
                    target_entity = default_entity
        
        if not target_entity:
            # Fallback to static config if no prefix or dynamic failed checks above
            target_entity = config.get("current_value_entity")

        if target_entity:
            try:
                # Only update if changed to reduce log noise, or force?
                # Force is safer for restarts.
                await self.hass.services.async_call(
                    "input_number",
                    "set_value",
                    {"entity_id": target_entity, "value": current_value}
                )
                _LOGGER.info(
                    "Scheduler Update: input_number=%s, value=%s", 
                    target_entity, 
                    current_value
                )
            except Exception as e:
                _LOGGER.warning("Failed to update %s: %s", target_entity, e)

        # 4. Find next change
        minutes_until_change = 0
        for i in range(1, 1441): # Look ahead up to 24 hours
            check_min = (current_minute_of_day + i) % 1440
            if minute_schedule[check_min] != current_value:
                minutes_until_change = i
                break
        
        if minutes_until_change == 0:
            # Constant value all day? Check next day just in case, but essentially wait 24h
            minutes_until_change = 1440

        next_update_time = now + timedelta(minutes=minutes_until_change)
        # Set seconds to 0 to align with minute boundary
        next_update_time = next_update_time.replace(second=0, microsecond=0)

        # 5. Schedule
        _LOGGER.debug(
            "Next update for %s scheduled at %s (value change)", 
            preset_type, next_update_time
        )
        
        self._timers[preset_type] = async_track_point_in_time(
            self.hass,
            lambda time: asyncio.create_task(self.update_preset(preset_type)),
            next_update_time
        )

    def _schedule_retry(self, preset_type: str):
        """Schedule a retry if loading failed."""
        next_retry = dt_util.now() + timedelta(minutes=1)
        self._timers[preset_type] = async_track_point_in_time(
            self.hass,
            lambda time: asyncio.create_task(self.update_preset(preset_type)),
            next_retry
        )

    async def _get_active_profile_data(self, preset_type: str) -> Optional[Dict]:
        """Fetch the JSON data for the currently selected profile."""
        config = PRESETS_CONFIG.get(preset_type)
        selector_entity = config.get("profiles_select")
        
        state = self.hass.states.get(selector_entity)
        if not state:
            return None
            
        profile_name = state.state
        if not profile_name or profile_name in ("unknown", "unavailable"):
            return None

        # Use profile service to load data from the shared file
        from ..utils.prefix_normalizer import normalize_preset_type
        
        canonical = normalize_preset_type(preset_type)
        
        # We need the prefix to locate the file. SmartScheduler doesn't inherently know the user's custom prefix.
        # However, profile_service.get_profile_data() handles the search logic if we pass the profile name.
        # It will try the default prefix and any global prefix if we had it.
        # Since SmartScheduler runs in background, it might not know the custom prefix unless we stored it somewhere.
        # BUT, since we switched to a single-file architecture per prefix, and `get_profile_data` searches by filename...
        # Wait, `get_profile_data` needs a prefix to construct the filename to load.
        
        # Strategy: Iterate through all available profile containers for this preset type
        # Collect all matches and select the most recently updated one to resolve ambiguity.
        
        if hasattr(self.profile_service, "storage"):
             files = await self.profile_service.storage.list_profiles()
             matches = []
             
             for fname in files:
                 data = await self.profile_service.storage.load_profile_cached(fname)
                 # Check if this file belongs to the requested preset type
                 if data and data.get("meta", {}).get("preset_type") == canonical:
                     # Check if it contains the active profile
                     if "profiles" in data and profile_name in data["profiles"]:
                         profile_content = data["profiles"][profile_name]
                         # Inject meta info
                         profile_content["entity_prefix"] = data.get("meta", {}).get("entity_prefix")
                         profile_content["profile_name"] = profile_name
                         # Add container updated_at for sorting fallback
                         profile_content["_container_updated_at"] = data.get("meta", {}).get("updated_at", 0)
                         matches.append(profile_content)
             
             if matches:
                 # Sort by profile updated_at, then container updated_at, descending
                 matches.sort(
                     key=lambda p: (p.get("updated_at", 0), p.get("_container_updated_at", 0)), 
                     reverse=True
                 )
                 # Return the most recent one
                 return matches[0]
                     
        return None

    def _normalize_schedule(self, schedule_data: list) -> list:
        """
        Convert sparse or hourly schedule to 1440-minute array.
        Handles:
        - [{hour: 0, value: 20}, ...]
        - [{index: 0, value: 20}, ...] (where index depends on interval)
        - Array of values
        """
        minutes = [0.0] * 1440
        
        if not schedule_data:
            return minutes

        # Check format
        first = schedule_data[0]
        
        if isinstance(first, (int, float)):
            # Direct array. Assume it covers 24h evenly.
            count = len(schedule_data)
            interval = 1440 // count
            for i in range(1440):
                idx = i // interval
                if idx < count:
                    minutes[i] = float(schedule_data[idx])
            return minutes

        if isinstance(first, dict):
            # Object array
            # If "hour" is present, assume 60m interval
            if "hour" in first:
                for entry in schedule_data:
                    h = int(entry["hour"])
                    v = float(entry["value"])
                    start_min = h * 60
                    for m in range(start_min, start_min + 60):
                        if m < 1440: minutes[m] = v
                return minutes
            
            # If "index" is present, we need to infer interval or assume it fills 24h
            if "index" in first:
                count = len(schedule_data)
                # Heuristic: 24 -> 60m, 48 -> 30m, 96 -> 15m
                interval = 1440 // count
                for entry in schedule_data:
                    idx = int(entry["index"])
                    v = float(entry["value"])
                    start_min = idx * interval
                    for m in range(start_min, start_min + interval):
                        if m < 1440: minutes[m] = v
                return minutes

        return minutes
