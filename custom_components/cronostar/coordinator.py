"""DataUpdateCoordinator for CronoStar."""

import logging
from datetime import datetime, timedelta

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import CONF_LOGGING_ENABLED, CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY, DOMAIN
from .storage.storage_manager import StorageManager

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

        # Get logging preference
        self.logging_enabled = entry.data.get(CONF_LOGGING_ENABLED, False)

        if self.logging_enabled:
            _LOGGER.info("CronoStarCoordinator initialized for '%s' (entry_id: %s)", entry.title, entry.entry_id)

        # Controller configuration from entry
        self.name = entry.data.get(CONF_NAME, entry.title)
        self.preset = entry.data[CONF_PRESET]
        self.target_entity = entry.data[CONF_TARGET_ENTITY]

        # Controller state
        self.selected_profile = "Comfort"
        self.is_paused = False
        self.current_value = 0.0
        self.available_profiles = ["Comfort", "Default"]

        # Storage manager (use global instance)
        if DOMAIN in hass.data and "storage_manager" in hass.data[DOMAIN]:
            self.storage_manager = hass.data[DOMAIN]["storage_manager"]
        else:
            # Fallback: create local instance (shouldn't happen if setup is correct)
            _LOGGER.warning("Storage manager not found in hass.data, creating fallback instance")
            profiles_dir = hass.config.path("cronostar/profiles")
            self.storage_manager = StorageManager(hass, profiles_dir)

        # Build prefix for this controller instance
        # Format: cronostar_{preset}_{sanitized_name}_
        sanitized_name = self.name.lower().replace(" ", "_").replace("-", "_")
        self.prefix = f"cronostar_{self.preset}_{sanitized_name}_"

        if self.logging_enabled:
            _LOGGER.debug("Controller config: name=%s, preset=%s, target=%s, prefix=%s", self.name, self.preset, self.target_entity, self.prefix)

    async def _async_update_data(self):
        """Fetch data and apply schedule - called every update_interval."""
        # Mark entities unavailable if target entity missing/unavailable
        # Quick check: if target entity not in state machine, skip apply and keep last value
        if self.target_entity not in self.hass.states:
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
        if self.logging_enabled:
            _LOGGER.info("Initializing controller '%s'", self.name)

        try:
            # List profile files matching this controller's prefix/preset
            files = await self.storage_manager.list_profiles(preset_type=self.preset, prefix=self.prefix)

            if files:
                if self.logging_enabled:
                    _LOGGER.debug("Found %d profile file(s) for '%s'", len(files), self.name)

                # Load first matching container
                container = await self.storage_manager.load_profile_cached(files[0])

                if container and "profiles" in container:
                    self.available_profiles = list(container["profiles"].keys())

                    if self.logging_enabled:
                        _LOGGER.info("Loaded %d profiles for '%s': %s", len(self.available_profiles), self.name, self.available_profiles)

                    # Set initial profile selection
                    if self.selected_profile not in self.available_profiles:
                        # Prefer "Comfort", then "Default", then first available
                        if "Comfort" in self.available_profiles:
                            self.selected_profile = "Comfort"
                        elif "Default" in self.available_profiles:
                            self.selected_profile = "Default"
                        elif self.available_profiles:
                            self.selected_profile = self.available_profiles[0]

                        if self.logging_enabled:
                            _LOGGER.info("Initial profile set to '%s' for '%s'", self.selected_profile, self.name)
            else:
                if self.logging_enabled:
                    _LOGGER.info("No profile files found for '%s', using defaults", self.name)

        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Error initializing controller '%s': %s", self.name, e)

        # Apply initial schedule
        await self.apply_schedule()

    async def async_refresh_profiles(self):
        """Refresh available profiles list (called after profile changes)."""
        if self.logging_enabled:
            _LOGGER.debug("Refreshing profiles for '%s'", self.name)

        try:
            files = await self.storage_manager.list_profiles(preset_type=self.preset, prefix=self.prefix)

            if files:
                # Force reload from disk
                container = await self.storage_manager.load_profile_cached(files[0], force_reload=True)

                if container and "profiles" in container:
                    self.available_profiles = list(container["profiles"].keys())

                    # Ensure selected profile still exists
                    if self.selected_profile not in self.available_profiles:
                        if "Comfort" in self.available_profiles:
                            self.selected_profile = "Comfort"
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
            files = await self.storage_manager.list_profiles(preset_type=self.preset, prefix=self.prefix)

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

            if self.logging_enabled:
                _LOGGER.debug("Applying value %.2f to '%s' (%s)", value, self.name, self.target_entity)

            await self._update_target_entity(value)
        else:
            if self.logging_enabled:
                _LOGGER.debug("No value interpolated for '%s', schedule may be empty", self.name)

    async def _update_target_entity(self, value: float):
        """Update the target entity with the scheduled value."""
        entity_id = self.target_entity
        domain = entity_id.split(".")[0]

        try:
            if domain == "climate":
                await self.hass.services.async_call("climate", "set_temperature", {"entity_id": entity_id, "temperature": value}, blocking=False)
            elif domain in ["switch", "light", "fan"]:
                service = "turn_on" if value > 0 else "turn_off"
                await self.hass.services.async_call(domain, service, {"entity_id": entity_id}, blocking=False)
            elif domain == "input_number":
                await self.hass.services.async_call("input_number", "set_value", {"entity_id": entity_id, "value": value}, blocking=False)
            elif domain == "cover":
                # For covers: value = position (0-100)
                await self.hass.services.async_call("cover", "set_cover_position", {"entity_id": entity_id, "position": int(value)}, blocking=False)
            else:
                if self.logging_enabled:
                    _LOGGER.warning("Unsupported domain '%s' for target entity '%s'", domain, entity_id)

        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Failed to update target entity '%s': %s", entity_id, e)

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

        # Linear interpolation
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
