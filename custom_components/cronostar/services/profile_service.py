# custom_components/cronostar/services/profile_service.py
"""
Profile service - simplified and modular
Handles profile CRUD operations
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse
from homeassistant.exceptions import HomeAssistantError

from ..utils.error_handler import log_operation
from ..utils.prefix_normalizer import get_effective_prefix, normalize_preset_type

_LOGGER = logging.getLogger(__name__)


class ProfileService:
    """Service for managing CronoStar profiles"""

    def __init__(self, hass: HomeAssistant, storage_manager, settings_manager):
        """
        Initialize ProfileService

        Args:
            hass: Home Assistant instance
            storage_manager: Storage manager instance
            settings_manager: Settings manager instance
        """
        self.hass = hass
        self.storage = storage_manager
        self.settings = settings_manager

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
        _LOGGER.debug("[SAVE_PROFILE] Service called with data: %s", call.data)
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

            # Validate schedule
            min_val = meta.get("min_value")
            max_val = meta.get("max_value")
            validated_schedule = self._validate_schedule(schedule, min_val, max_val)

            # Build profile data
            profile_data = {"schedule": validated_schedule, "updated_at": datetime.now().isoformat()}

            # Build metadata
            metadata = self._build_metadata(canonical_preset, effective_prefix, meta)

            _LOGGER.info("Saving profile: name=%s, preset=%s, prefix=%s, points=%d", profile_name, canonical_preset, effective_prefix, len(schedule))
            _LOGGER.debug("[SAVE_PROFILE] Data - Meta: %s, Profile: %s", metadata, profile_data)

            # 1. Save to storage FIRST so that if a controller is created, it finds the file
            await self.storage.save_profile(
                profile_name=profile_name, preset_type=canonical_preset, profile_data=profile_data, metadata=metadata, global_prefix=effective_prefix
            )

            # 2. Ensure controller entities exist
            await self._ensure_controller_exists(effective_prefix, canonical_preset, meta)

            # 3. Notify any existing coordinators to refresh their profiles
            for entry in self.hass.config_entries.async_entries("cronostar"):
                if entry.data.get("global_prefix") == effective_prefix:
                    if hasattr(entry, 'runtime_data') and entry.runtime_data:
                        _LOGGER.debug("Notifying coordinator for '%s' to refresh profiles", effective_prefix)
                        await entry.runtime_data.async_refresh_profiles()

            # 4. Update profile selectors (input_select entities)
            await self.async_update_profile_selectors()

            log_operation("Save profile", True, profile=profile_name, preset=canonical_preset, points=len(schedule))

        except Exception as e:
            log_operation("Save profile", False, profile=profile_name, error=str(e))
            _LOGGER.error("Error saving profile: %s", e)
            raise HomeAssistantError(f"Failed to save profile: {e}") from e

    async def _ensure_controller_exists(self, prefix: str, preset: str, meta: dict) -> None:
        """Verify that controller entities exist for this prefix, create if missing."""
        if not prefix:
            return

        # Check existing entries
        for entry in self.hass.config_entries.async_entries("cronostar"):
            if entry.data.get("global_prefix") == prefix:
                _LOGGER.info("Entities check: Controller already exists for prefix '%s' - All good.", prefix)
                return  # Controller already exists

        # Derive name from prefix
        # e.g. cronostar_thermostat_kitchen_ -> Kitchen
        name = prefix
        base_marker = f"cronostar_{preset}_"
        if name.startswith(base_marker):
            name = name[len(base_marker):]
        
        name = name.rstrip("_").replace("_", " ").strip().title()
        if not name:
            name = f"Controller {prefix}"

        target_entity = meta.get("target_entity", "")

        _LOGGER.info("Verifying entities... Creating controller for prefix '%s' (Name: '%s')", prefix, name)
        log_operation("Create controller", True, prefix=prefix, name=name, reason="missing_entities")
        
        # Create entry via flow
        await self.hass.config_entries.flow.async_init(
            "cronostar",
            context={"source": "create_controller"},
            data={
                "name": name,
                "preset": preset,
                "target_entity": target_entity,
                "global_prefix": prefix
            }
        )

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
        Get profile data without service call wrapper.
        Strict matching with detailed error reporting on failure.

        Args:
            profile_name: Profile name
            preset_type: Preset type
            global_prefix: Global prefix

        Returns:
            Profile data dictionary or error dictionary with diagnostics
        """
        canonical_preset = normalize_preset_type(preset_type)
        prefix_with_underscore = global_prefix if global_prefix.endswith("_") else f"{global_prefix}_"

        # Check if the prefix is a generic default
        is_generic_prefix = global_prefix in [
            "cronostar_thermostat_", "cronostar_ev_charging_", 
            "cronostar_generic_switch_", "cronostar_generic_kwh_",
            "cronostar_generic_temperature_", "cronostar_", "_", "", None
        ]

        # Use the specific prefix if provided and not generic, otherwise allow matching any container for this preset
        lookup_prefix = prefix_with_underscore if not is_generic_prefix else None

        _LOGGER.debug("[GET_PROFILE] Searching: name=%s, preset=%s, lookup_prefix=%s", profile_name, canonical_preset, lookup_prefix)

        # 1. Try exact cached lookup
        cached = await self.storage.get_cached_containers(
            preset_type=canonical_preset,
            global_prefix=lookup_prefix,
        )

        requested_lower = (profile_name or "").lower()

        # Phase 1: Search requested profile (case-insensitive)
        for _fname, container in cached:
            profiles = container.get("profiles", {})
            if not isinstance(profiles, dict) or not profiles:
                continue
            for key, content in profiles.items():
                if key.lower() == requested_lower:
                    meta = container.get("meta", {})
                    # Validate schedule on load to catch and correct out-of-range values
                    sched = content.get("schedule", [])
                    validated_sched = self._validate_schedule(
                        sched, 
                        min_val=meta.get("min_value"), 
                        max_val=meta.get("max_value")
                    )
                    
                    res = {
                        "profile_name": key,
                        "schedule": validated_sched,
                        "meta": meta,
                        "updated_at": content.get("updated_at"),
                    }
                    _LOGGER.info("[GET_PROFILE] Profile found, returning data to frontend: %s", key)
                    _LOGGER.debug("[GET_PROFILE] Found Data - Meta: %s, Profile: %s", res["meta"], res["schedule"])
                    return res

        # Phase 2: Fallback to well-known defaults within matched containers
        for _fname, container in cached:
            profiles = container.get("profiles", {})
            if not isinstance(profiles, dict) or not profiles:
                continue
            for candidate in ("Default", "default", "Comfort", "comfort"):
                if candidate in profiles:
                    content = profiles[candidate]
                    meta = container.get("meta", {})
                    # Validate on load
                    sched = content.get("schedule", [])
                    validated_sched = self._validate_schedule(
                        sched, 
                        min_val=meta.get("min_value"), 
                        max_val=meta.get("max_value")
                    )
                    
                    res = {
                        "profile_name": candidate,
                        "schedule": validated_sched,
                        "meta": meta,
                        "updated_at": content.get("updated_at"),
                    }
                    _LOGGER.info("[GET_PROFILE] Default/Comfort found, returning data to frontend: %s", candidate)
                    _LOGGER.debug("[GET_PROFILE] Found Data - Meta: %s, Profile: %s", res["meta"], res["schedule"])
                    return res

        # Match failed - prepare diagnostics
        diagnostics = {
            "error": "Profile not found",
            "searched": {
                "profile_name": profile_name,
                "preset_type": canonical_preset,
                "global_prefix": prefix_with_underscore,
                "is_generic_prefix": is_generic_prefix
            },
            "available_in_storage": []
        }

        # Collect what is actually in storage for this preset or all
        all_containers = await self.storage.get_cached_containers()
        for fname, container in all_containers:
            meta = container.get("meta", {})
            diagnostics["available_in_storage"].append({
                "filename": fname,
                "preset": meta.get("preset_type"),
                "prefix": meta.get("global_prefix"),
                "profiles": list(container.get("profiles", {}).keys())
            })

        _LOGGER.warning("[GET_PROFILE] Match failed. Diagnostics: %s", diagnostics)
        return diagnostics

    async def register_card(self, call: ServiceCall) -> ServiceResponse:
        """
        Register a frontend card and return active profile and entity states.
        Strict matching version with diagnostic info on failure.

        Expected data:
            - card_id: str
            - preset: str
            - global_prefix: str
            - selected_profile: str (optional)
        """
        card_id = call.data.get("card_id")
        preset = call.data.get("preset", "thermostat")
        global_prefix = call.data.get("global_prefix", "")
        requested_profile = call.data.get("selected_profile")

        _LOGGER.debug("[REGISTER] Lovelace Card Connected: ID=%s, Preset=%s, Prefix=%s", card_id, preset, global_prefix)

        # 1. Load global settings
        global_settings = await self.settings.load_settings()

        # 2. Load preset-specific defaults (Reference: User Request)
        # Location: /config/cronostar/presets/<preset>_defaults.json
        preset_defaults = {}
        try:
            presets_dir = Path(self.hass.config.path("cronostar/presets"))
            presets_dir.mkdir(parents=True, exist_ok=True)
            
            preset_file = presets_dir / f"{preset}_defaults.json"
            if preset_file.exists():
                content = await self.hass.async_add_executor_job(preset_file.read_text, "utf-8")
                preset_defaults = json.loads(content)
                _LOGGER.debug("[REGISTER] Loaded preset defaults for '%s': %s", preset, preset_defaults)
        except Exception as e:
            _LOGGER.warning("[REGISTER] Error loading preset defaults for '%s': %s", preset, e)

        response = {
            "success": True, 
            "profile_data": None, 
            "entity_states": {}, 
            "diagnostics": None,
            "settings": global_settings,
            "preset_defaults": preset_defaults
        }

        # Normalize prefix for state lookups
        prefix_with_underscore = global_prefix if global_prefix.endswith("_") else f"{global_prefix}_"
        base = prefix_with_underscore.rstrip("_")
        
        # 1. Determine active profile by checking various entity selectors
        profile_to_load = None
        
        # Priority 1: Native Select entity (select.{prefix}current_profile)
        native_selector = f"select.{prefix_with_underscore}current_profile"
        st = self.hass.states.get(native_selector)
        if st and st.state not in ("unknown", "unavailable"):
            profile_to_load = st.state
            _LOGGER.debug("[REGISTER] Found active profile '%s' via native select", profile_to_load)
        
        # Priority 2: Legacy input_select (input_select.{base}_profiles)
        if not profile_to_load:
            legacy_selector = f"input_select.{base}_profiles"
            st_legacy = self.hass.states.get(legacy_selector)
            if st_legacy and st_legacy.state not in ("unknown", "unavailable"):
                profile_to_load = st_legacy.state
                _LOGGER.debug("[REGISTER] Found active profile '%s' via legacy input_select", profile_to_load)
        
        # Priority 3: Frontend requested profile
        if not profile_to_load:
            profile_to_load = requested_profile
            _LOGGER.debug("[REGISTER] Fallback to requested profile: %s", profile_to_load)

        # 2. Fetch profile data (STRICT)
        try:
            data = await self.get_profile_data(profile_to_load or "Default", preset, global_prefix)
            
            if "error" not in data:
                response["profile_data"] = data
            else:
                # Store diagnostic info if strict match failed
                response["diagnostics"] = data
                _LOGGER.info("[REGISTER] No exact profile match found for prefix '%s'", global_prefix)
        except Exception as e:
            _LOGGER.error("[REGISTER] Critical error loading profile: %s", e)

        # 3. Populate entity states for card status indicators (even if profile data missing)
        try:
            # Target entity (try config meta first, then fallback to common pattern)
            target_ent = None
            if response["profile_data"] and "meta" in response["profile_data"]:
                target_ent = response["profile_data"]["meta"].get("target_entity")
            
            if target_ent:
                t_state = self.hass.states.get(target_ent)
                response["entity_states"]["target"] = t_state.state if t_state else "unknown"
            
            # Helper for current value (using sensor in new architecture)
            helper_ent = f"sensor.{prefix_with_underscore}current"
            h_state = self.hass.states.get(helper_ent)
            response["entity_states"]["current_helper"] = h_state.state if h_state else "unknown"
            
            # Active selector state
            sel_state = self.hass.states.get(native_selector) or self.hass.states.get(f"input_select.{base}_profiles")
            response["entity_states"]["selector"] = sel_state.state if sel_state else "unknown"
            
            # Pause switch (native switch.xxx_paused or legacy input_boolean.xxx_paused)
            pause_ent = f"switch.{prefix_with_underscore}paused"
            p_state = self.hass.states.get(pause_ent) or self.hass.states.get(f"input_boolean.{prefix_with_underscore}paused")
            response["entity_states"]["pause"] = p_state.state if p_state else "unknown"
            
        except Exception as e:
            _LOGGER.debug("[REGISTER] Failed to populate entity_states: %s", e)

        return response


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

    def _validate_schedule(self, schedule: list, min_val: float | None = None, max_val: float | None = None) -> list:
        """
        Validate and normalize schedule data.
        Ensures values are within [min_val, max_val] range.

        Args:
            schedule: Raw schedule list
            min_val: Minimum allowed value
            max_val: Maximum allowed value

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

            # Range validation
            if min_val is not None and numeric_value < float(min_val):
                _LOGGER.error(
                    "Value %.2f at %s is below minimum %.2f. Resetting to minimum.",
                    numeric_value, time_str, float(min_val)
                )
                numeric_value = float(min_val)
            elif max_val is not None and numeric_value > float(max_val):
                _LOGGER.error(
                    "Value %.2f at %s is above maximum %.2f. Resetting to minimum.",
                    numeric_value, time_str, float(max_val)
                )
                numeric_value = float(min_val) if min_val is not None else 0.0

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
        allowed_keys = ["title", "y_axis_label", "unit_of_measurement", "min_value", "max_value", "step_value", "allow_max_value", "target_entity", "language"]

        # Initialize metadata with allowed keys from user_meta
        metadata = {key: user_meta[key] for key in allowed_keys if key in user_meta}

        # Explicitly set/override core metadata fields
        metadata["preset_type"] = preset_type
        metadata["global_prefix"] = global_prefix
        metadata["updated_at"] = datetime.now().isoformat()

        # Explicitly remove redundant 'preset' key if it exists in user_meta (now in metadata)
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
