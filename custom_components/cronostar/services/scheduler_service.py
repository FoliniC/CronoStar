"""CronoStar Scheduler Service - Automatic value updates based on schedule."""

import logging
from datetime import datetime, timedelta

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

from ..utils.prefix_normalizer import PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)


class SchedulerService:
    """Manages automatic schedule updates for all presets."""

    def __init__(self, hass: HomeAssistant, profile_service):
        """Initialize the scheduler service."""
        self.hass = hass
        self.profile_service = profile_service
        self.active_timers: dict[str, callable] = {}
        self.cached_schedules: dict[str, dict] = {}
        self.check_interval = 60  # Default: check every minute

        _LOGGER.info("SchedulerService initialized. check_interval=%s", self.check_interval)
        _LOGGER.debug("SchedulerService: PRESETS_CONFIG keys: %s", list(PRESETS_CONFIG.keys()))

    async def async_start(self):
        """Start the scheduler for all presets."""
        _LOGGER.info("SchedulerService: async_start called")
        if not PRESETS_CONFIG:
            _LOGGER.warning("SchedulerService: PRESETS_CONFIG is empty, nothing to schedule")
            return

        for preset in PRESETS_CONFIG.keys():
            _LOGGER.info("SchedulerService: starting scheduler for preset=%s", preset)
            await self._start_preset_scheduler(preset)

    async def _start_preset_scheduler(self, preset: str):
        """Start scheduler for a specific preset."""
        _LOGGER.debug("_start_preset_scheduler called for preset=%s", preset)

        config = PRESETS_CONFIG.get(preset, {})
        _LOGGER.debug("Preset %s config: %s", preset, config)

        current_value_entity = config.get("current_value_entity")
        if not current_value_entity:
            _LOGGER.debug("No current_value_entity for preset %s, skipping", preset)
            return

        # Load active profile for this preset
        _LOGGER.info("Loading and applying schedule for preset=%s", preset)
        await self._load_and_apply_schedule(preset)

        # Schedule next update
        _LOGGER.info("Scheduling next update for preset=%s", preset)
        await self._schedule_next_update(preset)

    async def _load_and_apply_schedule(self, preset: str):
        """Load schedule from active profile and apply current value."""
        _LOGGER.debug("_load_and_apply_schedule called for preset=%s", preset)

        config = PRESETS_CONFIG.get(preset, {})
        profiles_select = config.get("profiles_select")
        if not profiles_select:
            _LOGGER.warning("No profiles_select configured for preset %s, skipping", preset)
            return

        # Get active profile name
        select_state = self.hass.states.get(profiles_select)
        if not select_state:
            _LOGGER.warning("profiles_select entity %s not found for preset %s", profiles_select, preset)
            return

        profile_name = select_state.state
        _LOGGER.info(
            "Preset %s using active profile '%s' from %s",
            preset,
            profile_name,
            profiles_select,
        )

        # Load profile data
        try:
            _LOGGER.debug("Loading profile data for preset=%s profile=%s", preset, profile_name)
            profile_data = await self.profile_service.load_profile_from_call(
                {
                    "profile_name": profile_name,
                    "preset_type": preset,
                }
            )

            _LOGGER.debug("Profile data loaded for preset=%s: keys=%s", preset, list(profile_data.keys()))

            if "error" in profile_data:
                _LOGGER.warning(
                    "Failed to load profile '%s' for preset '%s': %s",
                    profile_name,
                    preset,
                    profile_data.get("error"),
                )
                return

            # Cache the schedule
            self.cached_schedules[preset] = profile_data
            _LOGGER.info("Cached schedule for preset=%s", preset)

            # Apply current value
            await self._apply_current_value(preset, profile_data)

        except Exception as e:
            _LOGGER.error("Error loading schedule for %s: %s", preset, e)

    async def _apply_current_value(self, preset: str, profile_data: dict):
        """Apply the appropriate value for current time."""
        _LOGGER.debug("_apply_current_value called for preset=%s", preset)

        config = PRESETS_CONFIG.get(preset, {})
        current_value_entity = config.get("current_value_entity")
        if not current_value_entity:
            _LOGGER.warning("No current_value_entity configured for preset %s", preset)
            return

        # Get schedule and interval
        schedule = profile_data.get("schedule", [])
        interval_minutes = profile_data.get("interval_minutes", 60)
        _LOGGER.debug(
            "Preset %s: schedule length=%d, interval_minutes=%s",
            preset,
            len(schedule),
            interval_minutes,
        )

        # Find current value
        current_value = self._get_value_for_time(schedule, interval_minutes)
        _LOGGER.debug("Preset %s: current_value computed=%s", preset, current_value)

        if current_value is None:
            _LOGGER.info("No current value found for preset %s at this time", preset)
            return

            # Update input_number
            try:
                _LOGGER.info(
                    "Calling input_number.set_value for %s with value=%s (preset=%s)",
                    current_value_entity,
                    current_value,
                    preset,
                )
                await self.hass.services.async_call(
                    "input_number",
                    "set_value",
                    {
                        "entity_id": current_value_entity,
                        "value": current_value,
                    },
                    blocking=True,
                )

                _LOGGER.info(
                    "Updated %s to value %.2f for preset %s",
                    current_value_entity,
                    current_value,
                    preset,
                )

                # Also apply to target entity if configured
                await self._apply_to_target(preset, current_value)

            except Exception as e:
                _LOGGER.error("Error updating %s: %s", current_value_entity, e)

    def _get_value_for_time(
        self,
        schedule: list[dict],
        interval_minutes: int,
        target_time: datetime | None = None,
    ) -> float | None:
        """Get the scheduled value for a specific time."""
        if not schedule:
            _LOGGER.debug("_get_value_for_time: empty schedule")
            return None

        if target_time is None:
            target_time = dt_util.now()

        minutes_since_midnight = target_time.hour * 60 + target_time.minute
        _LOGGER.debug(
            "_get_value_for_time: target_time=%s, minutes_since_midnight=%d, interval_minutes=%d",
            target_time,
            minutes_since_midnight,
            interval_minutes,
        )

        # Find the appropriate schedule entry
        for entry in schedule:
            entry_minutes = entry.get("minutes_from_midnight", 0)
            value = entry.get("value")
            if entry_minutes <= minutes_since_midnight < entry_minutes + interval_minutes:
                _LOGGER.debug(
                    "_get_value_for_time: matched entry minutes=%d value=%s",
                    entry_minutes,
                    value,
                )
                return float(value)

        # If no match, use last entry (wrap around)
        if schedule:
            last_value = schedule[-1].get("value", 0)
            _LOGGER.debug(
                "_get_value_for_time: no match, using last entry value=%s",
                last_value,
            )
            return float(last_value)

        return None

    def _calculate_next_change(
        self,
        schedule: list[dict],
        interval_minutes: int,
    ) -> datetime | None:
        """Calculate when the next value change occurs."""
        if not schedule:
            _LOGGER.debug("_calculate_next_change: empty schedule")
            return None

        now = dt_util.now()
        current_minutes = now.hour * 60 + now.minute
        _LOGGER.debug(
            "_calculate_next_change: now=%s, current_minutes=%d",
            now,
            current_minutes,
        )

        # Find next schedule entry
        for entry in schedule:
            entry_minutes = entry.get("minutes_from_midnight", 0)
            if entry_minutes > current_minutes:
                target_time = now.replace(
                    hour=entry_minutes // 60,
                    minute=entry_minutes % 60,
                    second=0,
                    microsecond=0,
                )
                _LOGGER.debug(
                    "_calculate_next_change: next change today at %s (entry_minutes=%d)",
                    target_time,
                    entry_minutes,
                )
                return target_time

        # Next change is first entry tomorrow
        first_entry_minutes = schedule[0].get("minutes_from_midnight", 0)
        tomorrow = now + timedelta(days=1)
        target_time = tomorrow.replace(
            hour=first_entry_minutes // 60,
            minute=first_entry_minutes % 60,
            second=0,
            microsecond=0,
        )
        _LOGGER.debug(
            "_calculate_next_change: next change tomorrow at %s (first_entry_minutes=%d)",
            target_time,
            first_entry_minutes,
        )
        return target_time

    async def _schedule_next_update(self, preset: str):
        """Schedule the next automatic update."""
        _LOGGER.debug("_schedule_next_update called for preset=%s", preset)

        profile_data = self.cached_schedules.get(preset)
        if not profile_data:
            _LOGGER.warning(
                "No cached schedule for preset %s, using fallback interval %s seconds",
                preset,
                self.check_interval,
            )
            next_check = dt_util.now() + timedelta(seconds=self.check_interval)
        else:
            schedule = profile_data.get("schedule", [])
            interval_minutes = profile_data.get("interval_minutes", 60)
            _LOGGER.debug(
                "Scheduling next update for preset=%s, schedule_len=%d, interval_minutes=%s",
                preset,
                len(schedule),
                interval_minutes,
            )

            next_change = self._calculate_next_change(schedule, interval_minutes)
            if next_change:
                next_check = next_change
            else:
                _LOGGER.warning(
                    "Could not calculate next change for preset %s, using fallback interval %s seconds",
                    preset,
                    self.check_interval,
                )
                next_check = dt_util.now() + timedelta(seconds=self.check_interval)

        timer_key = f"{preset}_timer"

        # Cancel existing timer
        if timer_key in self.active_timers:
            _LOGGER.debug("Cancelling existing timer for preset=%s", preset)
            self.active_timers[timer_key]()
            del self.active_timers[timer_key]

        @callback
        async def update_callback(now):
            """Handle scheduled update."""
            _LOGGER.info("update_callback fired for preset=%s at %s", preset, now)
            await self._load_and_apply_schedule(preset)
            await self._schedule_next_update(preset)

        cancel = async_track_point_in_time(
            self.hass,
            update_callback,
            next_check,
        )

        self.active_timers[timer_key] = cancel
        _LOGGER.debug(
            "Scheduled next update for %s at %s",
            preset,
            next_check.strftime("%Y-%m-%d %H:%M:%S"),
        )

    async def _apply_to_target(self, preset: str, value: float):
        """Apply value to target entity if configured."""
        config = PRESETS_CONFIG.get(preset, {})
        # This would need target entity info - for now just log
        _LOGGER.debug(
            "_apply_to_target called: preset=%s, value=%.2f, config=%s",
            preset,
            value,
            config,
        )

    async def start_scheduler(self, call: ServiceCall):
        """Service call to start scheduler."""
        preset = call.data.get("preset")
        _LOGGER.info("Service start_scheduler called with preset=%s", preset)

        if preset:
            await self._start_preset_scheduler(preset)
        else:
            await self.async_start()

    async def stop_scheduler(self, call: ServiceCall):
        """Service call to stop scheduler."""
        preset = call.data.get("preset")
        _LOGGER.info("Service stop_scheduler called with preset=%s", preset)

        if preset:
            timer_key = f"{preset}_timer"
            if timer_key in self.active_timers:
                self.active_timers[timer_key]()
                del self.active_timers[timer_key]
                _LOGGER.info("Stopped scheduler for %s", preset)
            else:
                _LOGGER.warning("No active timer found for preset %s", preset)
        else:
            # Stop all
            for cancel in self.active_timers.values():
                cancel()
            self.active_timers.clear()
            _LOGGER.info("Stopped all schedulers")

    async def reload_schedule(self, call: ServiceCall):
        """Service call to reload schedule."""
        preset = call.data.get("preset")
        _LOGGER.info("Service reload_schedule called with preset=%s", preset)

        if preset:
            await self._load_and_apply_schedule(preset)
            _LOGGER.info("Reloaded schedule for %s", preset)
        else:
            for preset_name in PRESETS_CONFIG.keys():
                await self._load_and_apply_schedule(preset_name)
            _LOGGER.info("Reloaded all schedules")
