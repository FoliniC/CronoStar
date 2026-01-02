# custom_components/cronostar/services/profile_service.py
"""
Profile service - simplified and modular
Handles profile CRUD operations
"""

import logging
from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant.exceptions import HomeAssistantError

from ..utils.prefix_normalizer import get_effective_prefix, normalize_preset_type

_LOGGER = logging.getLogger(__name__)


class ProfileService:
    """Service for managing CronoStar profiles"""

    def __init__(self, hass: HomeAssistant, file_service, storage_manager):
        """
        Initialize ProfileService

        Args:
            hass: Home Assistant instance
            file_service: File operations service
            storage_manager: Storage manager instance
        """
        self.hass = hass
        self.file_service = file_service
        self.storage = storage_manager

    async def save_profile(self, call: ServiceCall) -> None:
        """
        Save a profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - schedule: list
            - global_prefix: str (optional)
            - meta: dict (optional)
        """
        try:
            # Extract parameters
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            schedule = call.data.get("schedule", [])
            global_prefix = call.data.get("global_prefix", "")
            meta = call.data.get("meta", {})

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            # Normalize
            canonical_preset = normalize_preset_type(preset_type)
            effective_prefix = get_effective_prefix(global_prefix, meta)

            _LOGGER.info("Saving profile: name=%s, preset=%s, prefix=%s, points=%d", profile_name, canonical_preset, effective_prefix, len(schedule))

            # Validate schedule
            validated_schedule = self._validate_schedule(schedule)

            # Build profile data
            profile_data = {"schedule": validated_schedule, "updated_at": datetime.now().isoformat()}

            # Build metadata
            metadata = self._build_metadata(canonical_preset, effective_prefix, meta)

            # Save to storage
            await self.storage.save_profile(
                profile_name=profile_name, preset_type=canonical_preset, profile_data=profile_data, metadata=metadata, global_prefix=effective_prefix
            )

            _LOGGER.info("Profile saved successfully: %s", profile_name)

        except Exception as e:
            _LOGGER.error("Error saving profile: %s", e)
            raise HomeAssistantError(f"Failed to save profile: {e}") from e

    async def load_profile(self, call: ServiceCall) -> ServiceResponse:
        """
        Load a profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - global_prefix: str (optional)

        Returns:
            Profile data with schedule and metadata
        """
        try:
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            global_prefix = call.data.get("global_prefix", "")

            if not profile_name:
                return {"error": "profile_name is required"}

            # Get profile data
            data = await self.get_profile_data(profile_name, preset_type, global_prefix)

            if "error" in data:
                _LOGGER.warning("Profile not found: name=%s, preset=%s", profile_name, preset_type)
            else:
                _LOGGER.info("Profile loaded: %s", profile_name)

            return data

        except Exception as e:
            _LOGGER.error("Error loading profile: %s", e)
            return {"error": str(e)}

    async def get_profile_data(self, profile_name: str, preset_type: str, global_prefix: str = "") -> dict[str, Any]:
        """
        Get profile data without service call wrapper

        Args:
            profile_name: Profile name
            preset_type: Preset type
            global_prefix: Global prefix

        Returns:
            Profile data dictionary
        """
        canonical_preset = normalize_preset_type(preset_type)
        prefix_with_underscore = global_prefix if global_prefix.endswith("_") else f"{global_prefix}_"

        # Only use cached JSON containers; do not rely on filenames
        # Be tolerant of legacy container meta where preset_type may be 'generic_switch'
        cached = await self.storage.get_cached_containers(
            preset_type=canonical_preset,
            global_prefix=prefix_with_underscore,
        )

        requested_lower = (profile_name or "").lower()

        # Search requested profile first (case-insensitive)
        for _fname, container in cached:
            profiles = container.get("profiles", {})
            if not isinstance(profiles, dict) or not profiles:
                continue
            for key, content in profiles.items():
                if key.lower() == requested_lower:
                    return {
                        "profile_name": key,
                        "schedule": content.get("schedule", []),
                        "meta": container.get("meta", {}),
                        "updated_at": content.get("updated_at"),
                    }

        # Fallback to Default/Comfort within cached containers
        for _fname, container in cached:
            profiles = container.get("profiles", {})
            if not isinstance(profiles, dict) or not profiles:
                continue
            for candidate in ("Default", "default", "Comfort"):
                if candidate in profiles:
                    content = profiles[candidate]
                    return {
                        "profile_name": candidate,
                        "schedule": content.get("schedule", []),
                        "meta": container.get("meta", {}),
                        "updated_at": content.get("updated_at"),
                    }

        return {"error": f"Profile '{profile_name}' not found in cache for preset '{canonical_preset}' and prefix '{prefix_with_underscore}'"}

    async def add_profile(self, call: ServiceCall) -> None:
        """
        Add a new empty profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - global_prefix: str (optional)
        """
        try:
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            global_prefix = call.data.get("global_prefix", "")

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            canonical_preset = normalize_preset_type(preset_type)
            effective_prefix = get_effective_prefix(global_prefix, {})

            _LOGGER.info("Adding new profile: name=%s, preset=%s", profile_name, canonical_preset)

            # Create default schedule (boundary points only)
            default_schedule = [{"time": "00:00", "value": 20.0}, {"time": "23:59", "value": 20.0}]

            # Save profile
            await self.storage.save_profile(
                profile_name=profile_name,
                preset_type=canonical_preset,
                profile_data={"schedule": default_schedule, "updated_at": datetime.now().isoformat()},
                metadata=self._build_metadata(canonical_preset, effective_prefix, {}),
                global_prefix=effective_prefix,
            )

            _LOGGER.info("Profile added successfully: %s", profile_name)

        except Exception as e:
            _LOGGER.error("Error adding profile: %s", e)
            raise HomeAssistantError(f"Failed to add profile: {e}") from e

    async def delete_profile(self, call: ServiceCall) -> None:
        """
        Delete a profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - global_prefix: str (optional)
        """
        try:
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            global_prefix = call.data.get("global_prefix", "")

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            canonical_preset = normalize_preset_type(preset_type)
            prefix_with_underscore = global_prefix if global_prefix.endswith("_") else f"{global_prefix}_"

            _LOGGER.info("Deleting profile: name=%s, preset=%s", profile_name, canonical_preset)

            # Delete from storage
            success = await self.storage.delete_profile(profile_name=profile_name, preset_type=canonical_preset, global_prefix=prefix_with_underscore)

            if success:
                _LOGGER.info("Profile deleted successfully: %s", profile_name)
                await self.async_update_profile_selectors()
            else:
                _LOGGER.warning("Profile not found for deletion: %s", profile_name)

        except Exception as e:
            _LOGGER.error("Error deleting profile: %s", e)
            raise HomeAssistantError(f"Failed to delete profile: {e}") from e

    async def async_update_profile_selectors(self, all_files: list[str] | None = None):
        """Scan profiles and update input_select entities."""
        _LOGGER.info("Updating profile selectors...")

        profiles_by_prefix = {}
        if all_files is None:
            all_files = await self.storage.list_profiles()

        for filename in all_files:
            try:
                container_data = await self.storage.load_profile_cached(filename)
                if not container_data:
                    continue

                if "meta" in container_data:
                    prefix = container_data["meta"].get("global_prefix")
                    profiles_dict = container_data.get("profiles", {})

                    if prefix and profiles_dict:
                        if prefix not in profiles_by_prefix:
                            profiles_by_prefix[prefix] = set()
                        profiles_by_prefix[prefix].update(profiles_dict.keys())
            except Exception as e:
                _LOGGER.warning("Could not read profile container %s: %s", filename, e)

        # Update input_select entities
        for state in self.hass.states.async_all("input_select"):
            if state.entity_id.endswith("_profiles"):
                # extract prefix
                parts = state.entity_id.replace("input_select.", "").rsplit("_profiles", 1)
                if parts:
                    prefix = parts[0] + "_"

                    # Get profiles found for this prefix, or empty list
                    found_options = profiles_by_prefix.get(prefix, set())
                    new_options = sorted(list(found_options))

                    if not new_options:
                        _LOGGER.debug("No profiles found on disk for %s, skipping update", state.entity_id)
                        continue

                    current_options = state.attributes.get("options", [])
                    if set(current_options) != set(new_options):
                        _LOGGER.info("Updating %s with %d profiles", state.entity_id, len(new_options))
                        try:
                            await self.hass.services.async_call(
                                "input_select",
                                "set_options",
                                {"entity_id": state.entity_id, "options": new_options},
                                blocking=True,
                            )
                        except Exception as e:
                            _LOGGER.error("Failed to update %s: %s", state.entity_id, e)
                    else:
                        _LOGGER.debug("Profiles for %s are already up to date", state.entity_id)

    def _validate_schedule(self, schedule: list) -> list:
        """
        Validate and normalize schedule data

        Args:
            schedule: Raw schedule list

        Returns:
            Validated schedule list
        """
        if not isinstance(schedule, list):
            _LOGGER.warning("Schedule is not a list, using empty schedule")
            return []

        validated = []

        for item in schedule:
            if not isinstance(item, dict):
                continue

            time_val = item.get("time")
            value = item.get("value")

            if not time_val or value is None:
                continue

            # Validate time format
            time_str = str(time_val)
            if not self._is_valid_time(time_str):
                _LOGGER.warning("Invalid time format: %s", time_str)
                continue

            # Validate value is numeric
            try:
                numeric_value = float(value)
            except (ValueError, TypeError):
                _LOGGER.warning("Invalid value: %s", value)
                continue

            validated.append({"time": time_str, "value": numeric_value})

        # Sort by time
        validated.sort(key=lambda x: self._time_to_minutes(x["time"]))

        return validated

    def _build_metadata(self, preset_type: str, global_prefix: str, user_meta: dict) -> dict:
        """
        Build metadata dictionary

        Args:
            preset_type: Canonical preset type
            global_prefix: Effective prefix
            user_meta: User-provided metadata

        Returns:
            Complete metadata
        """
        metadata = {"preset_type": preset_type, "global_prefix": global_prefix, "updated_at": datetime.now().isoformat()}

        # Merge user metadata (preserve card config)
        allowed_keys = ["title", "y_axis_label", "unit_of_measurement", "min_value", "max_value", "step_value", "allow_max_value", "target_entity"]

        for key in allowed_keys:
            if key in user_meta:
                metadata[key] = user_meta[key]

        # Explicitly remove redundant 'preset' key if it exists in user_meta
        if "preset" in metadata:
            del metadata["preset"]

        return metadata

    @staticmethod
    def _is_valid_time(time_str: str) -> bool:
        """Check if time string is valid HH:MM format"""
        import re

        return bool(re.match(r"^\d{2}:\d{2}$", time_str))

    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        """Convert HH:MM to minutes since midnight"""
        try:
            hours, minutes = map(int, time_str.split(":"))
            return hours * 60 + minutes
        except (ValueError, AttributeError):
            return 0
