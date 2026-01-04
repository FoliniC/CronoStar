"""DataUpdateCoordinator for CronoStar."""

import logging
from datetime import datetime, timedelta

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import CONF_LOGGING_ENABLED, CONF_NAME, CONF_PRESET_TYPE, CONF_TARGET_ENTITY, DOMAIN
from .storage.storage_manager import StorageManager
from .utils.error_handler import log_operation

_LOGGER = logging.getLogger(__name__)


class CronoStarCoordinator(DataUpdateCoordinator):
    """Coordinator to manage fetching data and applying schedule for a CronoStar controller."""

    def __init__(self, hass: HomeAssistant, entry):
        """Initialize CronoStar coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=timedelta(minutes=1),
        )
        self.entry = entry

        # Get logging preference (Global setting overrides/defaults, fallback to entry for legacy)
        global_logging = hass.data.get(DOMAIN, {}).get("logging_enabled", False)
        self.logging_enabled = global_logging or entry.data.get(CONF_LOGGING_ENABLED, False)

        if self.logging_enabled:
            _LOGGER.info("CronoStarCoordinator initialized for '%s' (entry_id: %s)", entry.title, entry.entry_id)

        # Controller configuration from entry
        self.name = entry.data.get(CONF_NAME, entry.title)
        self.preset_type = entry.data.get(CONF_PRESET_TYPE, entry.data.get("preset", "thermostat"))
        self.target_entity = entry.data[CONF_TARGET_ENTITY]

        # Controller state
        self.selected_profile = "Default"
        self.is_paused = False
        self.current_value = 0.0
        self.available_profiles = ["Default"]

        # Storage manager (use global instance)
        if DOMAIN in hass.data and "storage_manager" in hass.data[DOMAIN]:
            self.storage_manager = hass.data[DOMAIN]["storage_manager"]
        else:
            # Fallback: create local instance (shouldn't happen if setup is correct)
            _LOGGER.warning("Storage manager not found in hass.data, creating fallback instance")
            profiles_dir = hass.config.path("cronostar/profiles")
            self.storage_manager = StorageManager(hass, profiles_dir)

        # Build prefix for this controller instance
        # Format: cronostar_{preset_type}_{sanitized_name}_
        if "global_prefix" in entry.data:
            self.prefix = entry.data["global_prefix"]
        else:
            sanitized_name = self.name.lower().replace(" ", "_").replace("-", "_")
            self.prefix = f"cronostar_{self.preset_type}_{sanitized_name}_"

        if self.logging_enabled:
            _LOGGER.debug("Controller config: name=%s, preset_type=%s, target=%s, prefix=%s", self.name, self.preset_type, self.target_entity, self.prefix)

    async def _async_update_data(self):
        """Fetch data and apply schedule - called every update_interval."""
        # Mark entities unavailable if target entity missing/unavailable
        # Quick check: if target entity not in state machine, skip apply and keep last value
        if self.hass.states.get(self.target_entity) is None:
            if self.logging_enabled:
                _LOGGER.debug("Target entity '%s' not found in states; skipping update", self.target_entity)
            return {
                "selected_profile": self.selected_profile,
                "is_paused": self.is_paused,
                "current_value": self.current_value,
                "available_profiles": self.available_profiles,
            }
        if self.logging_enabled:
            _LOGGER.debug("Update cycle for '%s'", self.name)

        # Apply current schedule value
        await self.apply_schedule()

        # Return current state for entities
        return {
            "selected_profile": self.selected_profile,
            "is_paused": self.is_paused,
            "current_value": self.current_value,
            "available_profiles": self.available_profiles,
        }

    async def async_initialize(self):
        """Initialize controller - load profiles and set initial state."""
        try:
            # List profile files matching this controller's prefix/preset_type
            files = await self.storage_manager.list_profiles(preset_type=self.preset_type, prefix=self.prefix)

            if files:
                # Load first matching container
                container = await self.storage_manager.load_profile_cached(files[0])

                if container and "profiles" in container:
                    self.available_profiles = list(container["profiles"].keys())

                    # Set initial profile selection
                    if self.selected_profile not in self.available_profiles:
                        # Prefer "Default", then first available
                        if "Default" in self.available_profiles:
                            self.selected_profile = "Default"
                        elif self.available_profiles:
                            self.selected_profile = self.available_profiles[0]

                    if self.logging_enabled:
                        _LOGGER.info("[COORDINATOR] '%s' initialized with %d profiles (active: %s)", self.name, len(self.available_profiles), self.selected_profile)
            else:
                if self.logging_enabled:
                    _LOGGER.info("[COORDINATOR] '%s' initialized (no profiles found)", self.name)

        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Error initializing controller '%s': %s", self.name, e)

        # Apply initial schedule
        await self.apply_schedule()

    async def async_refresh_profiles(self):
        """Refresh available profiles list (called after profile changes)."""
        if self.logging_enabled:
            _LOGGER.debug("Refreshing profiles for '%s'", self.name)

        try:
            files = await self.storage_manager.list_profiles(preset_type=self.preset_type, prefix=self.prefix)

            if files:
                # Force reload from disk
                container = await self.storage_manager.load_profile_cached(files[0], force_reload=True)

                if container and "profiles" in container:
                    self.available_profiles = list(container["profiles"].keys())

                    # Ensure selected profile still exists
                    if self.selected_profile not in self.available_profiles:
                        if "Default" in self.available_profiles:
                            self.selected_profile = "Default"
                        elif self.available_profiles:
                            self.selected_profile = self.available_profiles[0]

                    if self.logging_enabled:
                        _LOGGER.info("Refreshed profiles for '%s': %s", self.name, self.available_profiles)

        except Exception as e:  # noqa: BLE001
            _LOGGER.warning("Error refreshing profiles for '%s': %s", self.name, e)

        # Trigger entity updates
        await self.async_refresh()

    async def set_profile(self, profile_name: str):
        """Set the active profile and apply immediately."""
        if self.logging_enabled:
            _LOGGER.info("Setting profile '%s' for '%s'", profile_name, self.name)

        if profile_name not in self.available_profiles:
            _LOGGER.warning("Profile '%s' not found in available profiles for '%s'", profile_name, self.name)
            return

        self.selected_profile = profile_name
        await self.async_refresh()

    async def set_paused(self, paused: bool):
        """Set paused state."""
        if self.logging_enabled:
            _LOGGER.info("Setting paused=%s for '%s'", paused, self.name)

        self.is_paused = paused
        await self.async_refresh()

    async def apply_schedule(self):
        """Calculate and apply the current scheduled value to target entity."""
        if self.is_paused:
            if self.logging_enabled:
                _LOGGER.debug("Controller '%s' is paused, skipping schedule application", self.name)
            return

        # If target entity is unknown/unavailable, do not try to call services
        state = self.hass.states.get(self.target_entity)
        if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            if self.logging_enabled:
                _LOGGER.debug("Target entity '%s' is %s; skipping service call", self.target_entity, state and state.state)
            return

        # Load current profile's schedule
        schedule = []
        try:
            files = await self.storage_manager.list_profiles(preset_type=self.preset_type, prefix=self.prefix)

            if files:
                container = await self.storage_manager.load_profile_cached(files[0])

                if container and "profiles" in container:
                    profile_data = container["profiles"].get(self.selected_profile)

                    if profile_data:
                        schedule = profile_data.get("schedule", [])

                        if self.logging_enabled:
                            _LOGGER.debug("Loaded schedule for '%s' / '%s': %d points", self.name, self.selected_profile, len(schedule))
                    else:
                        if self.logging_enabled:
                            _LOGGER.warning("Profile '%s' not found in container for '%s'", self.selected_profile, self.name)
        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Error loading schedule for '%s': %s", self.name, e)
            return

        # Interpolate current value
        value = self._interpolate_schedule(schedule)

        if value is not None:
            self.current_value = value

            # Compute next change time based on current schedule and value
            next_change = self._get_next_change(schedule, value)

            if self.logging_enabled:
                _LOGGER.info("Applying scheduled value %.2f to '%s' (%s)", value, self.name, self.target_entity)

            await self._update_target_entity(value, next_change)
        else:
            if self.logging_enabled:
                _LOGGER.debug("No value interpolated for '%s', schedule may be empty", self.name)

    async def _update_target_entity(self, value: float, next_change: tuple[str, int] | None = None):
        """Update the target entity with the scheduled value."""
        entity_id = self.target_entity
        domain = entity_id.split(".")[0]
        success = False
        service_called = "none"

        try:
            if domain == "climate":
                service_called = "climate.set_temperature"
                await self.hass.services.async_call("climate", "set_temperature", {"entity_id": entity_id, "temperature": value}, blocking=False)
                success = True
            elif domain in ["switch", "light", "fan"]:
                service = "turn_on" if value > 0 else "turn_off"
                service_called = f"{domain}.{service}"
                await self.hass.services.async_call(domain, service, {"entity_id": entity_id}, blocking=False)
                success = True
            elif domain == "input_number":
                service_called = "input_number.set_value"
                await self.hass.services.async_call("input_number", "set_value", {"entity_id": entity_id, "value": value}, blocking=False)
                success = True
            elif domain == "cover":
                service_called = "cover.set_cover_position"
                await self.hass.services.async_call("cover", "set_cover_position", {"entity_id": entity_id, "position": int(value)}, blocking=False)
                success = True
            else:
                if self.logging_enabled:
                    _LOGGER.warning("Unsupported domain '%s' for target entity '%s'", domain, entity_id)

            if success and self.logging_enabled:
                _LOGGER.info(
                    "[COORDINATOR] '%s' applied value %.2f to '%s' (Profile: %s, Service: %s)",
                    self.name, value, entity_id, self.selected_profile, service_called
                )
                # Highlighted log line with profile and next scheduled change
                if next_change:
                    next_time_str, minutes_until = next_change
                    _LOGGER.info(
                        "🔶⏱️ Next scheduled change for profile '%s' on %s at %s (in %d min)",
                        self.selected_profile, entity_id, next_time_str, minutes_until
                    )
                log_operation("Apply scheduled value", True, name=self.name, entity=entity_id, value=value, service=service_called)

        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Failed to update target entity '%s': %s", entity_id, e)
            if self.logging_enabled:
                log_operation("Apply scheduled value", False, name=self.name, entity=entity_id, error=str(e))

    def _interpolate_schedule(self, schedule: list) -> float | None:
        """Interpolate schedule value for current time."""
        if not schedule:
            return None

        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute

        # Parse schedule into (minutes, value) tuples
        points = []
        for item in schedule:
            time_str = item.get("time")
            value = item.get("value")

            if not time_str or value is None:
                continue

            try:
                hours, minutes = map(int, time_str.split(":"))
                total_minutes = hours * 60 + minutes
                points.append((total_minutes, float(value)))
            except (ValueError, AttributeError) as e:
                if self.logging_enabled:
                    _LOGGER.warning("Invalid schedule point in '%s': %s - %s", self.name, item, e)
                continue

        if not points:
            return None

        # Sort by time
        points.sort(key=lambda x: x[0])

        # Find surrounding points for interpolation
        prev_point = None
        next_point = None

        for minute, value in points:
            if minute <= current_minutes:
                prev_point = (minute, value)
            if minute > current_minutes and next_point is None:
                next_point = (minute, value)

        # Handle midnight wrap-around
        if prev_point is None:
            prev_point = points[-1]  # Last point of previous day

        if next_point is None:
            next_point = points[0]  # First point of next day

        # Exact match
        if prev_point[0] == current_minutes:
            return prev_point[1]
        if next_point[0] == current_minutes:
            return next_point[1]

        # For generic_switch presets, use stepped value (no interpolation)
        if str(self.preset_type).lower() == "generic_switch":
            return prev_point[1]

        # Linear interpolation for continuous presets
        t1, v1 = prev_point
        t2, v2 = next_point

        # Adjust for midnight crossing
        if t2 < t1:
            t2 += 1440  # Add 24 hours
            if current_minutes < t1:
                current_minutes += 1440

        if t2 == t1:
            return v1

        # Interpolate
        ratio = (current_minutes - t1) / (t2 - t1)
        interpolated_value = v1 + (v2 - v1) * ratio

        return round(interpolated_value, 2)

    def _minutes_to_time(self, total_minutes: int) -> str:
        """Convert minutes since midnight to HH:MM string."""
        total_minutes = total_minutes % 1440
        hours = (total_minutes // 60) % 24
        minutes = total_minutes % 60
        return f"{hours:02d}:{minutes:02d}"

    def _get_next_change(self, schedule: list, current_value: float) -> tuple[str, int] | None:
        """Return next change time (HH:MM) and minutes until it occurs, or None if no change.

        A change is defined as the next schedule point whose value differs from the current interpolated value.
        """
        try:
            now = datetime.now()
            current_minutes = now.hour * 60 + now.minute

            # Parse and sort points
            points: list[tuple[int, float]] = []
            for item in schedule:
                time_str = item.get("time")
                value = item.get("value")
                if not time_str or value is None:
                    continue
                try:
                    hours, minutes = map(int, time_str.split(":"))
                    total = hours * 60 + minutes
                    points.append((total, float(value)))
                except Exception:  # noqa: BLE001
                    continue

            if not points:
                return None

            points.sort(key=lambda x: x[0])

            # Search forward for next differing value
            for m, v in points:
                if m > current_minutes and v != current_value:
                    return (self._minutes_to_time(m), m - current_minutes)

            # Wrap-around to next day
            for m, v in points:
                if v != current_value:
                    delta = (1440 - current_minutes) + m
                    return (self._minutes_to_time(m), delta)

            # No differing value found; no change expected
            return None
        except Exception:  # noqa: BLE001
            return None
