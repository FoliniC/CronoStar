"""
CronoStar Smart Scheduler - Irregular Intervals Support
Calculates values from dynamic schedule with time-based points
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

from ..utils.prefix_normalizer import PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)

class SmartScheduler:
    """Smart Scheduler for profiles with irregular intervals."""
    
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
        for timer_key, cancel_func in list(self._timers.items()):
            if cancel_func:
                try:
                    cancel_func()
                except Exception as e:
                    _LOGGER.warning("Error cancelling timer for %s: %s", timer_key, e)
        self._timers.clear()
        _LOGGER.info("Smart Scheduler stopped.")

    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        """Convert HH:MM to minutes since midnight."""
        try:
            hours, minutes = map(int, time_str.split(':'))
            if not (0 <= hours < 24 and 0 <= minutes < 60):
                _LOGGER.warning("Invalid time value: %s", time_str)
                return 0
            return hours * 60 + minutes
        except (ValueError, AttributeError) as e:
            _LOGGER.error("Failed to parse time string '%s': %s", time_str, e)
            return 0

    @staticmethod
    def _index_to_minutes(index: int, interval_minutes: int = 60) -> int:
        """Convert index to minutes (for backward compatibility).
        
        Args:
            index: Point index (0-23 for hourly)
            interval_minutes: Interval between points
            
        Returns:
            Minutes since midnight
        """
        return (index * interval_minutes) % 1440

    def _normalize_schedule(self, schedule: List[Dict], interval_minutes: int = 60) -> List[Dict]:
        """Normalize schedule to time-based format.
        
        Automatically converts from old format (index) to new (time) if necessary.
        
        Args:
            schedule: Schedule in old or new format
            interval_minutes: Interval for index conversion
            
        Returns:
            Normalized schedule with "time" and "value" fields
        """
        normalized = []
        
        for point in schedule:
            if not isinstance(point, dict):
                continue
            
            # New format (already has "time")
            if "time" in point and "value" in point:
                normalized.append({
                    "time": point["time"],
                    "value": float(point["value"])
                })
            
            # Old format (has "index")
            elif "index" in point and "value" in point:
                minutes = self._index_to_minutes(point["index"], interval_minutes)
                hours = minutes // 60
                mins = minutes % 60
                normalized.append({
                    "time": f"{hours:02d}:{mins:02d}",
                    "value": float(point["value"])
                })
        
        # Sort by time
        normalized.sort(key=lambda p: p["time"])
        
        # Log warning if schedule is empty
        if not normalized:
            _LOGGER.warning("Empty schedule after normalization")
        
        return normalized

    def _get_value_at_time(
        self,
        schedule: List[Dict],
        target_time: datetime,
        interval_minutes: int = 60
    ) -> Optional[float]:
        """Get interpolated value for a specific time.
        
        Args:
            schedule: List of points with "time" and "value"
            target_time: Target time to calculate value for
            interval_minutes: Interval (used for backward compatibility)
            
        Returns:
            Interpolated value or None if schedule is empty
        """
        if not schedule:
            _LOGGER.debug("Empty schedule")
            return None
        
        # Normalize schedule (convert from index to time if needed)
        normalized_schedule = self._normalize_schedule(schedule, interval_minutes)
        
        if not normalized_schedule:
            _LOGGER.error("Cannot normalize schedule")
            return None
        
        target_minutes = target_time.hour * 60 + target_time.minute
        
        # Find points before and after
        before = None
        after = None
        
        for point in normalized_schedule:
            point_minutes = self._time_to_minutes(point["time"])
            
            if point_minutes <= target_minutes:
                before = point
            if point_minutes >= target_minutes and not after:
                after = point
        
        # Handle wrap-around midnight
        if not before:
            before = normalized_schedule[-1]
            _LOGGER.debug("Wrap-around: using last point %s", before["time"])
        if not after:
            after = normalized_schedule[0]
            _LOGGER.debug("Wrap-around: using first point %s", after["time"])
        
        # Exact match
        before_minutes = self._time_to_minutes(before["time"])
        after_minutes = self._time_to_minutes(after["time"])
        
        if before_minutes == target_minutes:
            _LOGGER.debug("Exact match at %s: %.2f", before["time"], before["value"])
            return float(before["value"])
        
        if after_minutes == target_minutes:
            _LOGGER.debug("Exact match at %s: %.2f", after["time"], after["value"])
            return float(after["value"])
        
        # Handle wrap-around for ratio calculation
        if after_minutes < before_minutes:
            after_minutes += 1440  # Add 24 hours
        
        if target_minutes < before_minutes:
            target_minutes += 1440
        
        # Avoid division by zero
        if after_minutes == before_minutes:
            _LOGGER.warning("Duplicate times: %s", before["time"])
            return float(before["value"])
        
        # Linear interpolation
        ratio = (target_minutes - before_minutes) / (after_minutes - before_minutes)
        interpolated = before["value"] + ratio * (after["value"] - before["value"])
        result = round(interpolated, 2)
        
        _LOGGER.debug(
            "Interpolation: %s (%.2f) -> %s (%.2f) at %s: ratio=%.3f, result=%.2f",
            before["time"], before["value"],
            after["time"], after["value"],
            target_time.strftime("%H:%M"),
            ratio, result
        )
        
        return result

    def _find_next_change(
        self,
        schedule: List[Dict],
        now: datetime,
        interval_minutes: int = 60
    ) -> Optional[datetime]:
        """Find next value change in schedule.
        
        Args:
            schedule: Normalized schedule
            now: Current time
            interval_minutes: Interval (for backward compatibility)
            
        Returns:
            DateTime of next change, or None if no changes found
        """
        if not schedule:
            return None
        
        # Normalize schedule
        normalized_schedule = self._normalize_schedule(schedule, interval_minutes)
        
        if not normalized_schedule:
            return None
        
        current_minutes = now.hour * 60 + now.minute
        
        # Search next point after current time
        for point in normalized_schedule:
            point_minutes = self._time_to_minutes(point["time"])
            
            if point_minutes > current_minutes:
                hours = point_minutes // 60
                minutes = point_minutes % 60
                
                next_time = now.replace(
                    hour=hours,
                    minute=minutes,
                    second=0,
                    microsecond=0
                )
                
                _LOGGER.debug("Next change today at %s", next_time.strftime("%H:%M"))
                return next_time
        
        # No change today, use first point tomorrow
        if normalized_schedule:
            first_point = normalized_schedule[0]
            first_minutes = self._time_to_minutes(first_point["time"])
            
            tomorrow = now + timedelta(days=1)
            next_time = tomorrow.replace(
                hour=first_minutes // 60,
                minute=first_minutes % 60,
                second=0,
                microsecond=0
            )
            
            _LOGGER.debug("Next change tomorrow at %s", next_time.strftime("%H:%M"))
            return next_time
        
        return None

    async def update_preset(self, preset_type: str, profile_data: Optional[Dict] = None):
        """Update schedule for a preset."""
        try:
            # Cancel existing timer
            if preset_type in self._timers:
                try:
                    self._timers[preset_type]()
                except Exception as e:
                    _LOGGER.debug("Error cancelling old timer for %s: %s", preset_type, e)
                del self._timers[preset_type]

            # Load or use profile_data
            if not profile_data:
                profile_data = await self._get_active_profile_data(preset_type)
            
            if not profile_data:
                _LOGGER.warning("No profile data for %s", preset_type)
                self._schedule_retry(preset_type)
                return

            # Cache profile
            self._profiles_cache[preset_type] = profile_data

            # Get schedule and interval
            schedule = profile_data.get("schedule", [])
            interval_minutes = profile_data.get("interval_minutes", 60)
            
            if not schedule:
                _LOGGER.warning("Empty schedule for %s", preset_type)
                self._schedule_retry(preset_type)
                return
            
            # Calculate current value
            now = dt_util.now()
            current_value = self._get_value_at_time(schedule, now, interval_minutes)
            
            if current_value is None:
                _LOGGER.warning("Cannot calculate value for %s", preset_type)
                self._schedule_retry(preset_type)
                return
            
            # Update entity
            await self._update_current_value_entity(preset_type, current_value)
            
            # Schedule next update
            next_change = self._find_next_change(schedule, now, interval_minutes)
            
            if next_change:
                @callback
                def _update_callback(now):
                    self.hass.async_create_task(self.update_preset(preset_type))
                
                self._timers[preset_type] = async_track_point_in_time(
                    self.hass,
                    _update_callback,
                    next_change
                )
                
                _LOGGER.info(
                    "Next update for %s at %s",
                    preset_type,
                    next_change.strftime("%Y-%m-%d %H:%M:%S")
                )
            
        except Exception as e:
            _LOGGER.error(
                "Unexpected error in update_preset for %s: %s", 
                preset_type, e, exc_info=True
            )
            # Schedule retry in case of error
            self._schedule_retry(preset_type)

    async def _update_current_value_entity(self, preset_type: str, current_value: float):
        """Update the input_number entity with the calculated value."""
        profile_data = self._profiles_cache.get(preset_type)
        if not profile_data:
            _LOGGER.warning("No profile data found in cache for %s during update", preset_type)
            return

        config = PRESETS_CONFIG.get(preset_type)
        if not config:
            _LOGGER.warning("No config found for %s", preset_type)
            return

        # Update entity
        profile_prefix = profile_data.get("entity_prefix")
        target_entity = None
        
        if profile_prefix:
            if not profile_prefix.endswith("_"):
                profile_prefix += "_"
            dynamic_entity = f"input_number.{profile_prefix}current"
            
            if self.hass.states.get(dynamic_entity):
                target_entity = dynamic_entity
            else:
                default_entity = config.get("current_value_entity")
                if default_entity:
                    _LOGGER.warning(
                        "Dynamic entity %s not found. Falling back to %s",
                        dynamic_entity, default_entity
                    )
                    target_entity = default_entity
        
        if not target_entity:
            target_entity = config.get("current_value_entity")

        if target_entity:
            try:
                await self.hass.services.async_call(
                    "input_number",
                    "set_value",
                    {"entity_id": target_entity, "value": current_value}
                )
                _LOGGER.info(
                    "Scheduler Update: %s = %s", 
                    target_entity, 
                    current_value
                )
            except Exception as e:
                _LOGGER.warning("Failed to update %s: %s", target_entity, e)
        else:
            _LOGGER.warning("No target entity found for preset type: %s", preset_type)

    def _schedule_retry(self, preset_type: str):
        """Schedule retry if loading failed."""
        next_retry = dt_util.now() + timedelta(minutes=1)
        _LOGGER.info("Scheduling retry for %s at %s", preset_type, next_retry)

        @callback
        def _retry_callback(now):
            _LOGGER.debug("Retry timer fired for %s", preset_type)
            self.hass.async_create_task(self.update_preset(preset_type))

        self._timers[preset_type] = async_track_point_in_time(
            self.hass,
            _retry_callback,
            next_retry
        )

    async def _get_active_profile_data(self, preset_type: str) -> Optional[Dict]:
        """Fetch JSON data for currently selected profile."""
        config = PRESETS_CONFIG.get(preset_type)
        if not config:
            _LOGGER.error("No config found for preset type: %s", preset_type)
            return None
            
        selector_entity = config.get("profiles_select")
        
        if not selector_entity:
            _LOGGER.error("No selector entity configured for preset type: %s", preset_type)
            return None
            
        state = self.hass.states.get(selector_entity)
        if not state:
            _LOGGER.error("Selector entity not found: %s", selector_entity)
            return None
            
        profile_name = state.state
        if not profile_name or profile_name in ("unknown", "unavailable"):
            _LOGGER.warning("Invalid profile state for %s: %s", selector_entity, profile_name)
            return None

        _LOGGER.debug(
            "Fetching profile data for preset %s, profile: %s", 
            preset_type, profile_name
        )

        from ..utils.prefix_normalizer import normalize_preset_type
        
        canonical = normalize_preset_type(preset_type)
        
        if hasattr(self.profile_service, "storage"):
            try:
                files = await self.profile_service.storage.list_profiles()
                matches = []
                
                for fname in files:
                    try:
                        data = await self.profile_service.storage.load_profile_cached(fname)
                        
                        if data and data.get("meta", {}).get("preset_type") == canonical:
                            if "profiles" in data and profile_name in data["profiles"]:
                                profile_content = data["profiles"][profile_name]
                                
                                # Validate profile data
                                if not isinstance(profile_content, dict):
                                    _LOGGER.warning(
                                        "Profile content is not a dict in %s/%s: %s",
                                        fname, profile_name, type(profile_content)
                                    )
                                    continue
                                
                                # Add metadata
                                profile_content["entity_prefix"] = data.get("meta", {}).get("entity_prefix")
                                profile_content["profile_name"] = profile_name
                                profile_content["_container_updated_at"] = data.get("meta", {}).get("updated_at", 0)
                                
                                # Validate schedule
                                if "schedule" in profile_content:
                                    schedule = profile_content["schedule"]
                                    if isinstance(schedule, list):
                                        # Remove invalid points (minimal check, full check in normalize)
                                        valid_schedule = []
                                        for point in schedule:
                                            if isinstance(point, dict):
                                                valid_schedule.append(point)
                                        
                                        profile_content["schedule"] = valid_schedule
                                    else:
                                        _LOGGER.warning(
                                            "Schedule is not a list in %s/%s: %s",
                                            fname, profile_name, type(schedule)
                                        )
                                        profile_content["schedule"] = []
                                
                                matches.append(profile_content)
                                _LOGGER.debug(
                                    "Found matching profile in %s, updated_at: %s",
                                    fname, profile_content.get("updated_at", "unknown")
                                )
                    except Exception as e:
                        _LOGGER.warning("Error loading profile %s: %s", fname, e)
                
                if matches:
                    matches.sort(
                        key=lambda p: (p.get("updated_at", 0), p.get("_container_updated_at", 0)), 
                        reverse=True
                    )
                    selected = matches[0]
                    _LOGGER.info(
                        "Selected profile '%s' for %s (updated_at: %s)",
                        selected.get("profile_name", "unknown"),
                        preset_type,
                        selected.get("updated_at", "unknown")
                    )
                    return selected
                else:
                    _LOGGER.warning(
                        "No matching profile found for %s with name '%s'",
                        preset_type, profile_name
                    )
                    
            except Exception as e:
                _LOGGER.error("Error fetching profile data for %s: %s", preset_type, e, exc_info=True)
        
        _LOGGER.warning("Could not retrieve profile data for %s", preset_type)
        return None
