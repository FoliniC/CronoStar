"""
CronoStar Smart Scheduler - Irregular Intervals Support
Calculates values from dynamic schedule with time-based points
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

from ..utils.prefix_normalizer import PRESETS_CONFIG, normalize_preset_type

_LOGGER = logging.getLogger(__name__)


class SmartScheduler:
    """Smart Scheduler for profiles with irregular intervals."""

    def __init__(self, hass: HomeAssistant, profile_service):
        self.hass = hass
        self.profile_service = profile_service
        self._timers: dict[str, Any] = {}
        self._profiles_cache: dict[str, dict] = {}

    async def async_initialize(self, files: list[str] | None = None):
        """Warm up cache and initialize schedulers for instances found in storage."""
        _LOGGER.info("Initializing Smart Scheduler (Warm-up phase)...")

        summary = {} # preset_type -> set(profile_names)
        instances_to_start = [] # list of (preset, prefix)

        try:
            if hasattr(self.profile_service, "storage"):
                if files is None:
                    files = await self.profile_service.storage.list_profiles()

                for fname in files:
                    try:
                        # Load using cache. If ProfileService already loaded them,
                        # this will be nearly instant and won't trigger [STORAGE] log.
                        data = await self.profile_service.storage.load_profile_cached(fname, force_reload=False)
                        if not data or "meta" not in data:
                            _LOGGER.warning("Malformed profile file found during warmup: %s", fname)
                            continue

                        meta = data["meta"]
                        preset_type = meta.get("preset_type", "unknown")
                        global_prefix = meta.get("global_prefix")
                        profiles = data.get("profiles", {})

                        if preset_type not in summary:
                            summary[preset_type] = set()

                        for p_name in profiles:
                            summary[preset_type].add(p_name)

                        if global_prefix:
                            instances_to_start.append((preset_type, global_prefix))

                    except Exception as e:
                        _LOGGER.error("Error during warmup of %s: %s", fname, e)

                # Log concise summary
                if summary:
                    log_msg = "[SCHEDULER] Warm-up complete. Registered instances:\n"
                    for pt, p_names in summary.items():
                        log_msg += f"  - {pt}: {', '.join(sorted(list(p_names)))}\n"
                    _LOGGER.info(log_msg.strip())
                else:
                    _LOGGER.info("[SCHEDULER] Warm-up complete. No profiles found in storage.")

                # Start the actual schedulers. We don't pass profile_data here
                # because the container is already in cache. update_preset will
                # correctly resolve the active profile via _get_active_profile_data.
                for pt, prefix in instances_to_start:
                    _LOGGER.debug("Starting scheduler instance: %s (%s)", pt, prefix)
                    await self.update_preset(pt, global_prefix=prefix)

            else:
                _LOGGER.warning("Profile storage not available during warmup.")

        except Exception as e:
            _LOGGER.error("Smart Scheduler initialization failed: %s", e)

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
            hours, minutes = map(int, time_str.split(":"))
            if not (0 <= hours < 24 and 0 <= minutes < 60):
                _LOGGER.warning("Invalid time value: %s", time_str)
                return 0
            return hours * 60 + minutes
        except (ValueError, AttributeError) as e:
            _LOGGER.error("Failed to parse time string '%s': %s", time_str, e)
            return 0

    @staticmethod
    def _deduce_interval_from_indices(indices: list[int]) -> int:
        """Deduce interval in minutes from a list of index-based points.
        Assumes indices are 0..N-1 evenly spaced. Falls back to 60 if unknown."""
        try:
            if not indices:
                return 60
            max_idx = max(indices)
            total = max_idx + 1
            if total <= 0:
                return 60
            interval = round(1440 / total)
            return max(1, min(1440, interval))
        except Exception:
            return 60

    def _normalize_schedule(self, schedule: list[dict]) -> list[dict]:
        """Normalize schedule to time-based format."""
        normalized = []
        indices: list[int] = []

        for point in schedule:
            if not isinstance(point, dict):
                continue

            # New format (already has "time")
            if "time" in point and "value" in point:
                normalized.append({"time": point["time"], "value": float(point["value"])})

            # Old format (has "index")
            elif "index" in point and "value" in point:
                try:
                    idx = int(point["index"])
                    indices.append(idx)
                except Exception:
                    continue

        # Convert index points after deducing interval
        if indices:
            interval_minutes = self._deduce_interval_from_indices(indices)
            for point in schedule:
                if isinstance(point, dict) and "index" in point and "value" in point:
                    try:
                        idx = int(point["index"])
                        minutes = (idx * interval_minutes) % 1440
                        hours = minutes // 60
                        mins = minutes % 60
                        normalized.append({"time": f"{hours:02d}:{mins:02d}", "value": float(point["value"])})
                    except Exception:
                        continue

        # Sort by time
        normalized.sort(key=lambda p: p["time"])
        return normalized

    def _get_value_at_time(self, schedule: list[dict], target_time: datetime) -> float | None:
        """Get interpolated value for a specific time."""
        if not schedule:
            return None

        # Normalize schedule
        normalized_schedule = self._normalize_schedule(schedule)
        if not normalized_schedule:
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
        if not after:
            after = normalized_schedule[0]

        # Exact match
        before_minutes = self._time_to_minutes(before["time"])
        after_minutes = self._time_to_minutes(after["time"])

        if before_minutes == target_minutes:
            return float(before["value"])
        if after_minutes == target_minutes:
            return float(after["value"])

        # Handle wrap-around for ratio calculation
        if after_minutes < before_minutes:
            after_minutes += 1440

        if target_minutes < before_minutes:
            target_minutes += 1440

        # Linear interpolation
        if after_minutes == before_minutes:
            return float(before["value"])

        ratio = (target_minutes - before_minutes) / (after_minutes - before_minutes)
        interpolated = before["value"] + ratio * (after["value"] - before["value"])
        return round(interpolated, 2)

    def _find_next_change(self, schedule: list[dict], now: datetime) -> datetime | None:
        """Find next value change in schedule."""
        if not schedule:
            return None

        normalized_schedule = self._normalize_schedule(schedule)
        if not normalized_schedule:
            return None

        current_minutes = now.hour * 60 + now.minute

        # Search next point after current time
        for point in normalized_schedule:
            point_minutes = self._time_to_minutes(point["time"])
            if point_minutes > current_minutes:
                hours = point_minutes // 60
                minutes = point_minutes % 60
                return now.replace(hour=hours, minute=minutes, second=0, microsecond=0)

        # No change today, use first point tomorrow
        if normalized_schedule:
            first_point = normalized_schedule[0]
            first_minutes = self._time_to_minutes(first_point["time"])
            tomorrow = now + timedelta(days=1)
            return tomorrow.replace(hour=first_minutes // 60, minute=first_minutes % 60, second=0, microsecond=0)

        return None

    async def update_preset(self, preset_type: str, profile_data: dict | None = None, global_prefix: str | None = None):
        """Update schedule for a preset."""
        try:
            timer_key = f"{preset_type}_{global_prefix}" if global_prefix else preset_type

            # Cancel existing timer
            if timer_key in self._timers:
                try:
                    self._timers[timer_key]()
                except Exception:
                    pass
                del self._timers[timer_key]

            # Load or use profile_data
            # Optimization: even if profile_data is provided (e.g. from apply_now),
            # we fetch the full profile if schedule is missing.
            if not profile_data or "schedule" not in profile_data:
                active_profile = await self._get_active_profile_data(preset_type, global_prefix=global_prefix)
                if active_profile:
                    # Merge existing profile_data (overrides) with active_profile
                    new_data = dict(active_profile)
                    if profile_data:
                        new_data.update(profile_data)
                    profile_data = new_data

            if not profile_data or "schedule" not in profile_data:
                _LOGGER.warning("No profile data for %s (prefix: %s)", preset_type, global_prefix)
                self._schedule_retry(preset_type, global_prefix=global_prefix)
                return

            # Ensure the profile data carries the correct prefix for this specific instance
            if global_prefix:
                profile_data["global_prefix"] = global_prefix

            self._profiles_cache[timer_key] = profile_data
            schedule = profile_data.get("schedule", [])

            if not schedule:
                _LOGGER.warning("Empty schedule for %s", timer_key)
                self._schedule_retry(preset_type, global_prefix=global_prefix)
                return

            # Calculate current value
            now = dt_util.now()
            current_value = self._get_value_at_time(schedule, now)

            if current_value is None:
                _LOGGER.warning("Cannot calculate value for %s", timer_key)
                self._schedule_retry(preset_type, global_prefix=global_prefix)
                return

            # Update entity and apply to target
            await self._update_current_value_entity(preset_type, current_value, timer_key=timer_key)
            try:
                await self._apply_target_entity(preset_type, profile_data, current_value)
            except Exception as e:
                _LOGGER.warning("Failed to apply target entity for %s: %s", timer_key, e)

            # Schedule next update
            next_change = self._find_next_change(schedule, now)
            if next_change:
                @callback
                def _update_callback(now):
                    self.hass.async_create_task(self.update_preset(preset_type, global_prefix=global_prefix))
                self._timers[timer_key] = async_track_point_in_time(self.hass, _update_callback, next_change)
                _LOGGER.info("Next update for %s at %s", timer_key, next_change.strftime("%Y-%m-%d %H:%M:%S"))

        except Exception as e:
            _LOGGER.error("Unexpected error in update_preset for %s: %s", preset_type, e, exc_info=True)
            self._schedule_retry(preset_type, global_prefix=global_prefix)

    async def _apply_target_entity(self, preset_type: str, profile_data: dict, value: float) -> None:
        """Apply the computed value to the configured target entity."""
        target_entity = profile_data.get("target_entity")
        if not target_entity:
            try:
                meta = profile_data.get("meta")
                if isinstance(meta, dict):
                    target_entity = meta.get("target_entity")
            except Exception:
                pass

        if not target_entity:
            cfg = PRESETS_CONFIG.get(preset_type, {})
            target_entity = cfg.get("target_entity")

        if not target_entity:
            _LOGGER.debug("_apply_target_entity: no target_entity configured for preset '%s'", preset_type)
            return

        domain = target_entity.split(".")[0]
        if domain == "climate":
            await self.hass.services.async_call("climate", "set_temperature", {"entity_id": target_entity, "temperature": float(value)}, blocking=False)
        elif domain == "number":
            await self.hass.services.async_call("number", "set_value", {"entity_id": target_entity, "value": float(value)}, blocking=False)
        elif domain == "switch":
            service = "turn_on" if int(value) == 1 else "turn_off"
            await self.hass.services.async_call("switch", service, {"entity_id": target_entity}, blocking=False)

    async def _update_current_value_entity(self, preset_type: str, current_value: float, profile_data: dict | None = None, timer_key: str | None = None):
        """Update the input_number entity with the calculated value."""
        if not profile_data:
            profile_data = self._profiles_cache.get(timer_key or preset_type)
        if not profile_data:
            return

        profile_prefix = profile_data.get("global_prefix")
        if not profile_prefix:
            return

        if not profile_prefix.endswith("_"):
            profile_prefix += "_"
        target_entity = f"input_number.{profile_prefix}current"

        if self.hass.states.get(target_entity):
            try:
                await self.hass.services.async_call("input_number", "set_value", {"entity_id": target_entity, "value": current_value})
                _LOGGER.info("Scheduler Update: %s = %s", target_entity, current_value)
            except Exception as e:
                _LOGGER.warning("Failed to update %s: %s", target_entity, e)

    def _schedule_retry(self, preset_type: str, global_prefix: str | None = None):
        """Schedule retry if loading failed (e.g. at startup)."""
        timer_key = f"{preset_type}_{global_prefix}" if global_prefix else preset_type
        next_retry = dt_util.now() + timedelta(minutes=10)
        _LOGGER.info("Scheduling retry for %s at %s", timer_key, next_retry.strftime("%H:%M:%S"))

        @callback
        def _retry_callback(now):
            self.hass.async_create_task(self.update_preset(preset_type, global_prefix=global_prefix))
        self._timers[timer_key] = async_track_point_in_time(self.hass, _retry_callback, next_retry)

    async def _get_active_profile_data(self, preset_type: str, global_prefix: str | None = None) -> dict | None:
        """Fetch JSON data for currently selected profile by constructing the filename directly."""
        if not global_prefix:
            _LOGGER.warning("No global_prefix provided for preset %s. Falling back to latest profile search.", preset_type)
            return await self._get_latest_profile_data_for_preset(preset_type)

        config = PRESETS_CONFIG.get(preset_type) or {}

        # 1. Determine active profile name from selector entity
        selector_entity = None
        prefix_base = global_prefix.rstrip("_")
        derived_selector = f"input_select.{prefix_base}_profiles"
        if self.hass.states.get(derived_selector):
            selector_entity = derived_selector

        if not selector_entity:
            selector_entity = config.get("profiles_select")

        profile_name = "Default" # Default fallback
        if selector_entity:
            state = self.hass.states.get(selector_entity)
            if state and state.state not in ("unknown", "unavailable"):
                profile_name = state.state

        # 2. Construct filename and load it directly
        from ..utils.filename_builder import build_profile_filename
        canonical = normalize_preset_type(preset_type)
        filename = build_profile_filename(profile_name, canonical, global_prefix=global_prefix)

        _LOGGER.debug("[SCHEDULER] Direct load for %s: %s (profile: %s)", preset_type, filename, profile_name)

        try:
            data = await self.profile_service.storage.load_profile_cached(filename)
            if not data or "profiles" not in data:
                _LOGGER.warning("Profile file not found or malformed: %s", filename)
                return None

            profiles = data["profiles"]

            # Case-insensitive lookup
            matched_profile = None
            for p_key in profiles:
                if p_key.lower() == profile_name.lower():
                    matched_profile = profiles[p_key]
                    break

            if matched_profile:
                profile_content = dict(matched_profile)
                profile_content["global_prefix"] = global_prefix
                profile_content["profile_name"] = profile_name
                profile_content["meta"] = data.get("meta", {})
                return profile_content
            elif "Default" in profiles or "default" in profiles:
                # Silent fallback to default within the correct file
                fallback_key = "Default" if "Default" in profiles else "default"
                profile_content = dict(profiles[fallback_key])
                profile_content["global_prefix"] = global_prefix
                profile_content["profile_name"] = fallback_key
                profile_content["meta"] = data.get("meta", {})
                return profile_content

        except Exception as e:
            _LOGGER.error("Error loading profile data for %s from %s: %s", preset_type, filename, e)

        return None

    async def _get_latest_profile_data_for_preset(self, preset_type: str) -> dict | None:
        """Fallback: pick the newest stored profile."""
        try:
            if not hasattr(self.profile_service, "storage"):
                return None
            canonical = normalize_preset_type(preset_type)
            files = await self.profile_service.storage.list_profiles()
            best_container = None
            best_container_key = ""

            for fname in files:
                try:
                    data = await self.profile_service.storage.load_profile_cached(fname)
                    if not data or data.get("meta", {}).get("preset_type") != canonical:
                        continue
                    key = str(data.get("meta", {}).get("updated_at") or "")
                    if not best_container or key > best_container_key:
                        best_container = data
                        best_container_key = key
                except Exception:
                    continue

            if not best_container:
                return None

            profiles = best_container.get("profiles", {})
            if not isinstance(profiles, dict) or not profiles:
                return None

            chosen = None
            chosen_key = ""
            chosen_name = ""
            for name, content in profiles.items():
                key = str(content.get("updated_at") or "")
                if not chosen or key > chosen_key:
                    chosen = content
                    chosen_key = key
                    chosen_name = name

            if not chosen:
                return None

            result = dict(chosen)
            result["global_prefix"] = best_container.get("meta", {}).get("global_prefix")
            result["profile_name"] = chosen_name
            result["_container_updated_at"] = best_container.get("meta", {}).get("updated_at", 0)
            result["meta"] = best_container.get("meta", {})
            return result
        except Exception:
            return None
