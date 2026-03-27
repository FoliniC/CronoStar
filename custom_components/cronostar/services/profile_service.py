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
from homeassistant.helpers import entity_registry as er_helper

from ..const import (
    CONF_ALLOW_MAX_VALUE,
    CONF_FRONTEND_VERSION_CHECK,
    CONF_MAX_VALUE,
    CONF_MIN_VALUE,
    CONF_STEP_VALUE,
    CONF_TITLE,
    CONF_UNIT_OF_MEASUREMENT,
    CONF_Y_AXIS_LABEL,
    DOMAIN,
)
from ..utils.error_handler import log_operation
from ..utils.filename_builder import build_profile_filename
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

    async def add_profile(self, call: ServiceCall) -> None:
        """
        Add a new profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - global_prefix: str (optional)
        """
        _LOGGER.debug("[ADD_PROFILE] Service called with data: %s", call.data)
        try:
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            global_prefix = call.data.get("global_prefix", "")

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            canonical_preset = normalize_preset_type(preset_type)
            effective_prefix = get_effective_prefix(global_prefix, {})

            # Create default empty schedule (boundaries only)
            schedule = [{"time": "00:00", "value": 0}, {"time": "23:59", "value": 0}]

            profile_data = {"schedule": schedule, "updated_at": datetime.now().isoformat()}

            # Save to storage (merges with existing container metadata)
            await self.storage.save_profile(
                profile_name=profile_name, preset_type=canonical_preset, profile_data=profile_data, metadata={}, global_prefix=effective_prefix
            )

            # Notify coordinators to refresh available_profiles
            for entry in self.hass.config_entries.async_entries("cronostar"):
                if entry.data.get("global_prefix") == effective_prefix:
                    if hasattr(entry, "runtime_data") and entry.runtime_data:
                        await entry.runtime_data.async_refresh_profiles()

            log_operation("Add profile", True, profile=profile_name, preset=canonical_preset)

        except Exception as e:
            log_operation("Add profile", False, profile=profile_name, error=str(e))
            _LOGGER.error("Error adding profile: %s", e)
            raise HomeAssistantError(f"Failed to add profile: {e}") from e

    async def save_profile(self, call: ServiceCall) -> None:
        """
        Save a profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - schedule: list (optional)
            - global_prefix: str (optional)
            - meta: dict (optional)
        """
        _LOGGER.debug("[SAVE_PROFILE] Service called with data: %s", call.data)
        try:
            # Extract parameters
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            schedule = call.data.get("schedule")
            global_prefix = call.data.get("global_prefix", "")
            meta = call.data.get("meta", {})

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            # Normalize
            canonical_preset = normalize_preset_type(preset_type)
            effective_prefix = get_effective_prefix(global_prefix, meta)

            # Build metadata
            metadata = self._build_metadata(canonical_preset, effective_prefix, meta)

            # 1. Prepare profile data
            if schedule is not None:
                # Validate schedule
                min_val = meta.get("min_value")
                max_val = meta.get("max_value")
                validated_schedule = self._validate_schedule(schedule, min_val, max_val)
                profile_data = {"schedule": validated_schedule, "updated_at": datetime.now().isoformat()}
            else:
                # Metadata update only: fetch existing profile data to preserve schedule
                existing = await self.get_profile_data(profile_name, canonical_preset, effective_prefix)
                if "error" in existing:
                    _LOGGER.info("Metadata update for new/missing profile '%s', using empty schedule", profile_name)
                    profile_data = {"schedule": [], "updated_at": datetime.now().isoformat()}
                else:
                    _LOGGER.debug("Metadata update for existing profile '%s', preserving schedule", profile_name)
                    profile_data = {"schedule": existing.get("schedule", []), "updated_at": datetime.now().isoformat()}

            _LOGGER.info(
                "Saving profile: name=%s, preset=%s, prefix=%s, points=%d",
                profile_name,
                canonical_preset,
                effective_prefix,
                len(profile_data.get("schedule", [])),
            )

            # 2. Save to storage
            await self.storage.save_profile(
                profile_name=profile_name, preset_type=canonical_preset, profile_data=profile_data, metadata=metadata, global_prefix=effective_prefix
            )

            # 2. Ensure controller entities exist
            await self._ensure_controller_exists(effective_prefix, canonical_preset, meta)

            # 3. Update existing Config Entry if metadata has changed (e.g. target_entity)
            for entry in self.hass.config_entries.async_entries("cronostar"):
                if entry.data.get("global_prefix") == effective_prefix:
                    # Update entry data if important fields changed
                    new_data = {**entry.data}
                    changed = False

                    if "target_entity" in meta and entry.data.get("target_entity") != meta["target_entity"]:
                        new_data["target_entity"] = meta["target_entity"]
                        changed = True

                    if "preset_type" in meta and entry.data.get("preset_type") != meta["preset_type"]:
                        new_data["preset_type"] = meta["preset_type"]
                        changed = True

                    # Update card configuration fields if present in meta
                    for field in [
                        CONF_TITLE,
                        CONF_MIN_VALUE,
                        CONF_MAX_VALUE,
                        CONF_STEP_VALUE,
                        CONF_UNIT_OF_MEASUREMENT,
                        CONF_Y_AXIS_LABEL,
                        CONF_ALLOW_MAX_VALUE,
                    ]:
                        if field in meta and entry.data.get(field) != meta[field]:
                            new_data[field] = meta[field]
                            changed = True

                    if changed:
                        _LOGGER.info("Updating Config Entry for '%s' with new metadata", effective_prefix)
                        self.hass.config_entries.async_update_entry(entry, data=new_data)

                    # Notify coordinator to refresh
                    if hasattr(entry, "runtime_data") and entry.runtime_data:
                        _LOGGER.debug("Notifying coordinator for '%s' to refresh profiles", effective_prefix)
                        await entry.runtime_data.async_refresh_profiles()

            # 4. Update profile selectors (input_select entities)
            await self.async_update_profile_selectors()

            log_operation("Save profile", True, profile=profile_name, preset=canonical_preset, points=len(schedule) if schedule is not None else 0)

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
            name = name[len(base_marker) :]

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
            data={"name": name, "preset_type": preset, "target_entity": target_entity, "global_prefix": prefix},
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
            "cronostar_thermostat_",
            "cronostar_ev_charging_",
            "cronostar_generic_switch_",
            "cronostar_generic_kwh_",
            "cronostar_generic_temperature_",
            "cronostar_",
            "_",
            "",
            None,
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
                    validated_sched = self._validate_schedule(sched, min_val=meta.get("min_value"), max_val=meta.get("max_value"))

                    # Merge per-profile entity overrides into meta for frontend restoration
                    res_meta = {**meta}
                    if "enabled_entity" in content:
                        res_meta["enabled_entity"] = content["enabled_entity"]
                    if "profiles_select_entity" in content:
                        res_meta["profiles_select_entity"] = content["profiles_select_entity"]

                    res = {
                        "profile_name": key,
                        "schedule": validated_sched,
                        "meta": res_meta,
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
                    validated_sched = self._validate_schedule(sched, min_val=meta.get("min_value"), max_val=meta.get("max_value"))

                    # Merge per-profile entity overrides into meta for frontend restoration
                    res_meta = {**meta}
                    if "enabled_entity" in content:
                        res_meta["enabled_entity"] = content["enabled_entity"]
                    if "profiles_select_entity" in content:
                        res_meta["profiles_select_entity"] = content["profiles_select_entity"]

                    res = {
                        "profile_name": candidate,
                        "schedule": validated_sched,
                        "meta": res_meta,
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
                "is_generic_prefix": is_generic_prefix,
            },
            "available_in_storage": [],
        }

        # Collect what is actually in storage for this preset or all
        all_containers = await self.storage.get_cached_containers()
        for fname, container in all_containers:
            meta = container.get("meta", {})
            diagnostics["available_in_storage"].append(
                {
                    "filename": fname,
                    "preset": meta.get("preset_type"),
                    "prefix": meta.get("global_prefix"),
                    "profiles": list(container.get("profiles", {}).keys()),
                }
            )

        _LOGGER.warning("[GET_PROFILE] Match failed. Diagnostics: %s", diagnostics)
        return diagnostics

    async def delete_profile(self, call: ServiceCall) -> None:
        """
        Delete a profile

        Expected data:
            - profile_name: str
            - preset_type: str
            - global_prefix: str
        """
        _LOGGER.debug("[DELETE_PROFILE] Service called with data: %s", call.data)
        try:
            profile_name = call.data.get("profile_name")
            preset_type = call.data.get("preset_type", "thermostat")
            global_prefix = call.data.get("global_prefix", "")

            if not profile_name:
                raise HomeAssistantError("profile_name is required")

            canonical_preset = normalize_preset_type(preset_type)
            effective_prefix = get_effective_prefix(global_prefix, {})

            # Delete from storage
            success = await self.storage.delete_profile(profile_name=profile_name, preset_type=canonical_preset, global_prefix=effective_prefix)

            if success:
                # Notify coordinators to refresh available_profiles
                for entry in self.hass.config_entries.async_entries("cronostar"):
                    if entry.data.get("global_prefix") == effective_prefix:
                        if hasattr(entry, "runtime_data") and entry.runtime_data:
                            await entry.runtime_data.async_refresh_profiles()

                log_operation("Delete profile", True, profile=profile_name, preset=canonical_preset)
            else:
                log_operation("Delete profile", False, profile=profile_name, error="Not found or storage error")

        except Exception as e:
            log_operation("Delete profile", False, profile=profile_name, error=str(e))
            _LOGGER.error("Error deleting profile: %s", e)
            raise HomeAssistantError(f"Failed to delete profile: {e}") from e

    async def delete_controller(self, call: ServiceCall) -> None:
        """
        Delete a controller (all profiles + config entry)

        Expected data:
            - global_prefix: str
            - preset_type: str (optional)
        """
        _LOGGER.info("🚀 [DELETE_CONTROLLER] STARTING for prefix: %s", call.data.get("global_prefix"))
        try:
            global_prefix = call.data.get("global_prefix")
            preset_type = call.data.get("preset_type")

            if not global_prefix:
                _LOGGER.error("❌ [DELETE_CONTROLLER] Missing global_prefix in service call data")
                raise HomeAssistantError("global_prefix is required")

            _LOGGER.debug("[DELETE_CONTROLLER] Processing prefix: %s (preset: %s)", global_prefix, preset_type)

            # 1. Remove Config Entry (and associated entities)
            found_entry = None
            _LOGGER.debug("[DELETE_CONTROLLER] Searching config entries for prefix: %s", global_prefix)
            for entry in self.hass.config_entries.async_entries("cronostar"):
                _LOGGER.debug("  Checking entry: %s, data prefix: %s", entry.title, entry.data.get("global_prefix"))
                if entry.data.get("global_prefix") == global_prefix:
                    found_entry = entry
                    break

            if found_entry:
                _LOGGER.info(
                    "♻️ [DELETE_CONTROLLER] Removing Config Entry '%s' (entry_id=%s, prefix=%s)", found_entry.title, found_entry.entry_id, global_prefix
                )
                await self.hass.config_entries.async_remove(found_entry.entry_id)
                _LOGGER.info("✅ [DELETE_CONTROLLER] Config Entry removed successfully")
            else:
                _LOGGER.warning("⚠️ [DELETE_CONTROLLER] Config Entry not found for prefix '%s'", global_prefix)

            # 2. Delete JSON file(s) (all profiles) via Storage Manager
            _LOGGER.info("[DELETE_CONTROLLER] Attempting to delete storage file(s) via StorageManager")
            await self.storage.delete_controller_files(global_prefix, preset_type)

            # 3. Update Dashboard YAML to reflect changes immediately
            try:
                from ..setup.dashboard import DASHBOARD_YAML_FILENAME, write_dashboard_yaml

                _LOGGER.info("[DELETE_CONTROLLER] Updating dashboard YAML...")
                await write_dashboard_yaml(self.hass, DASHBOARD_YAML_FILENAME)
            except Exception as e:
                _LOGGER.error("[DELETE_CONTROLLER] Failed to update dashboard YAML: %s", e)

            log_operation("Delete controller", True, prefix=global_prefix)
            _LOGGER.info("🏁 [DELETE_CONTROLLER] COMPLETED for prefix: %s", global_prefix)

        except Exception as e:
            log_operation("Delete controller", False, prefix=global_prefix, error=str(e))
            _LOGGER.error("❌ [DELETE_CONTROLLER] CRITICAL ERROR deleting controller: %s", e, exc_info=True)
            raise HomeAssistantError(f"Failed to delete controller: {e}") from e

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

        # Integration version and global preferences
        integration_version = self.hass.data.get(DOMAIN, {}).get("version", "unknown")
        version_check_enabled = self.hass.data.get(DOMAIN, {}).get("global_config", {}).get(CONF_FRONTEND_VERSION_CHECK, True)
        _LOGGER.debug("[REGISTER] Version Info: %s (Check: %s)", integration_version, version_check_enabled)

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
            "preset_defaults": preset_defaults,
            "integration_version": integration_version,
            "version_check_enabled": version_check_enabled,
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
            # Auto-create controller entities if missing
            await self._ensure_controller_exists(global_prefix, preset, {})

            # Find the config entry for this prefix to merge its settings
            entry_data = {}
            for entry in self.hass.config_entries.async_entries("cronostar"):
                if entry.data.get("global_prefix") == global_prefix:
                    entry_data = entry.data
                    break

            data = await self.get_profile_data(profile_to_load or "Default", preset, global_prefix)

            if "error" not in data:
                # Merge config entry data into profile metadata
                # This ensures the card gets the latest backend-configured values
                if "meta" in data:
                    # Get preset defaults to check if entry_data just contains defaults
                    from ..utils.prefix_normalizer import PRESETS_CONFIG

                    presets_defaults = PRESETS_CONFIG.get(preset, {})

                    for key in [CONF_TITLE, CONF_MIN_VALUE, CONF_MAX_VALUE, CONF_STEP_VALUE, CONF_UNIT_OF_MEASUREMENT, CONF_Y_AXIS_LABEL, CONF_ALLOW_MAX_VALUE]:
                        val = entry_data.get(key)
                        if val is not None:
                            # 1. Skip if it's an empty string and we have a value in profile
                            if isinstance(val, str) and val.strip() == "" and data["meta"].get(key):
                                continue

                            # 2. Skip 'Suspicious Defaults' from ConfigEntry that likely haven't been intentionally set
                            # (They override valid profile data because they differ from preset defaults, but they are generic junk)

                            # Case A: max_value is 100.0 (generic config_flow default)
                            if key == CONF_MAX_VALUE and val == 100.0 and presets_defaults.get(CONF_MAX_VALUE) != 100.0:
                                continue

                            # Case A2: min_value is 0.0 (common generic default)
                            if key == CONF_MIN_VALUE and val == 0.0 and presets_defaults.get(CONF_MIN_VALUE) != 0.0:
                                if data["meta"].get(key) is not None and data["meta"].get(key) != 0.0:
                                    continue

                            # Case B: allow_max_value is False but preset default is True (common for EV Charging)
                            if key == CONF_ALLOW_MAX_VALUE and val is False and presets_defaults.get(CONF_ALLOW_MAX_VALUE) is True:
                                # Only skip if profile ALSO says True (meaning it's definitely an unwanted override)
                                if data["meta"].get(key) is True:
                                    continue

                            # Case C: step_value is 1.0 (common generic default) but preset default is different (e.g. 0.5)
                            if key == CONF_STEP_VALUE and val == 1.0 and presets_defaults.get(CONF_STEP_VALUE) != 1.0:
                                if data["meta"].get(key) is not None and data["meta"].get(key) != 1.0:
                                    continue

                            # 3. Skip if it matches the preset default (already handled by preset_defaults in frontend)
                            # to avoid overwriting profile-specific values with preset-defaults
                            preset_def = presets_defaults.get(key if key != CONF_UNIT_OF_MEASUREMENT else "unit")
                            if val == preset_def and data["meta"].get(key) is not None:
                                if val != data["meta"].get(key):
                                    continue

                            data["meta"][key] = val

                response["profile_data"] = data
            else:
                # Store diagnostic info if strict match failed
                response["success"] = False
                response["diagnostics"] = data
                _LOGGER.info("[REGISTER] No exact profile match found for prefix '%s'", global_prefix)
        except Exception as e:
            _LOGGER.error("[REGISTER] Critical error loading profile: %s", e)

        # 4. Perform dynamic validation for the card
        validation_errors = []
        if not call.data.get("preset"):
            validation_errors.append("Preset type is required")
        if not global_prefix:
            validation_errors.append("Missing global prefix")

        target_ent_check = None
        if response.get("profile_data") and "meta" in response["profile_data"]:
            target_ent_check = response["profile_data"]["meta"].get("target_entity")

        if not target_ent_check:
            validation_errors.append("Target entity not configured")
        elif not self.hass.states.get(target_ent_check):
            if self.hass.is_running:
                validation_errors.append(f"Target entity '{target_ent_check}' not found")

        response["validation"] = {"valid": len(validation_errors) == 0, "errors": validation_errors}

        # 5. Populate entity states using Entity Registry for accurate lookups
        try:
            er = er_helper.async_get(self.hass)

            # Helper: Get state by unique ID
            def get_state_by_uid(uid):
                # Priority 1: Registry lookup (most reliable for modern HA)
                entity_id = (
                    er.async_get_entity_id("switch", "cronostar", uid)
                    or er.async_get_entity_id("sensor", "cronostar", uid)
                    or er.async_get_entity_id("select", "cronostar", uid)
                )

                if entity_id:
                    _LOGGER.info("[REGISTER] Resolved UID '%s' via Registry -> %s", uid, entity_id)

                # Priority 2: Direct lookup if registry failed (handles some legacy cases)
                if not entity_id:
                    # Robust check across domains for this object_id
                    # Also check for truncated versions (HA often truncates 'enabled' or 'current_profile' if redundant)
                    search_bases = [uid.rstrip("_")]
                    if uid.endswith("_enabled"):
                        search_bases.append(uid.rsplit("_enabled", 1)[0])
                    if uid.endswith("_current_profile"):
                        search_bases.append(uid.rsplit("_current_profile", 1)[0])

                    for base in search_bases:
                        for domain in ["switch", "sensor", "select", "input_number", "input_select"]:
                            possible_id = f"{domain}.{base}"
                            if self.hass.states.get(possible_id):
                                entity_id = possible_id
                                _LOGGER.info("[REGISTER] Resolved UID '%s' via State Search (base: %s) -> %s", uid, base, entity_id)
                                break
                        if entity_id:
                            break

                # Priority 3: Last-resort suffix guess (deprecated, only for very early bootstrap)
                if not entity_id:
                    if uid.endswith("enabled"):
                        entity_id = f"switch.{uid}"
                    elif uid.endswith("current"):
                        entity_id = f"sensor.{uid}"
                    elif uid.endswith("current_profile"):
                        entity_id = f"select.{uid}"
                    if entity_id:
                        _LOGGER.info("[REGISTER] Resolved UID '%s' via Suffix Guess -> %s", uid, entity_id)

                state_obj = self.hass.states.get(entity_id) if entity_id else None
                # Log if we found an ID but it has no state yet (common during startup/reloads)
                if entity_id and not state_obj:
                    _LOGGER.debug("[REGISTER] Entity ID '%s' found but has no state in HASS (yet)", entity_id)

                return state_obj, entity_id

            # Target entity (try config meta first, then fallback)
            target_ent = None
            if response["profile_data"] and "meta" in response["profile_data"]:
                target_ent = response["profile_data"]["meta"].get("target_entity")

            if target_ent:
                t_state = self.hass.states.get(target_ent)
                response["entity_states"]["target"] = t_state.state if t_state else "unknown"

            # Helper for current value (sensor)
            # UID: {prefix}current
            h_state, h_id = get_state_by_uid(f"{prefix_with_underscore}current")
            response["entity_states"]["current_helper"] = h_state.state if h_state else "unknown"

            # Active selector (select)
            # UID: {prefix}current_profile
            sel_state, sel_id = get_state_by_uid(f"{prefix_with_underscore}current_profile")
            response["entity_states"]["selector"] = sel_state.state if sel_state else "unknown"

            # Enabled switch
            # UID: {prefix}enabled
            e_state, e_id = get_state_by_uid(f"{prefix_with_underscore}enabled")
            response["entity_states"]["enabled"] = e_state.state if e_state else "unknown"

            # CRITICAL: Update profile metadata with ACTUAL entity IDs if found
            # This ensures the frontend config is updated with the correct IDs even if stored meta is stale
            if response.get("profile_data") and "meta" in response["profile_data"]:
                meta = response["profile_data"]["meta"]

                # Propagate IDs to frontend even if state is missing (registry match is sufficient)
                if e_id:
                    _LOGGER.info("[REGISTER] Updating frontend meta: enabled_entity = %s", e_id)
                    meta["enabled_entity"] = e_id
                else:
                    _LOGGER.debug("[REGISTER] Could not resolve enabled_entity for prefix '%s'", global_prefix)

                if sel_id:
                    _LOGGER.info("[REGISTER] Updating frontend meta: profiles_select_entity = %s", sel_id)
                    meta["profiles_select_entity"] = sel_id
                else:
                    _LOGGER.debug("[REGISTER] Could not resolve profiles_select_entity for prefix '%s'", global_prefix)

        except Exception as e:
            _LOGGER.debug("[REGISTER] Failed to populate entity_states: %s", e)

        _LOGGER.debug("[REGISTER] Sending response to frontend: %s", response)
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

        validated_map = {}

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
                import math

                if math.isnan(numeric_value):
                    _LOGGER.warning("Invalid value (NaN): %s", value)
                    continue
            except (ValueError, TypeError):
                _LOGGER.warning("Invalid value: %s", value)
                continue

            # Range validation
            if min_val is not None and numeric_value < float(min_val):
                _LOGGER.error("Value %.2f at %s is below minimum %.2f. Resetting to minimum.", numeric_value, time_str, float(min_val))
                numeric_value = float(min_val)
            elif max_val is not None and numeric_value > float(max_val):
                _LOGGER.error("Value %.2f at %s is above maximum %.2f. Resetting to minimum.", numeric_value, time_str, float(max_val))
                numeric_value = float(min_val) if min_val is not None else 0.0

            # Store in map to deduplicate (last one wins)
            validated_map[time_str] = numeric_value

        # Convert back to list and sort by time
        validated = [{"time": t, "value": v} for t, v in validated_map.items()]
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
        allowed_keys = [
            "title",
            "y_axis_label",
            "unit_of_measurement",
            "min_value",
            "max_value",
            "step_value",
            "allow_max_value",
            "target_entity",
            "language",
            "enabled_entity",
            "profiles_select_entity",
            "entities",
        ]

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

        if not re.match(r"^\d{2}:\d{2}$", time_str):
            return False

        try:
            h, m = map(int, time_str.split(":"))
            return 0 <= h < 24 and 0 <= m < 60
        except ValueError:
            return False

    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        """Convert HH:MM to minutes since midnight"""
        try:
            hours, minutes = map(int, time_str.split(":"))
            return hours * 60 + minutes
        except (ValueError, AttributeError):
            return 0
