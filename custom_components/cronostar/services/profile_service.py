"""Profile management with BACKWARD COMPATIBILITY for old format."""

import json
import logging
import time
from collections import OrderedDict
from datetime import datetime

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse

from ..utils.filename_builder import build_profile_filename
from ..utils.prefix_normalizer import PRESETS_CONFIG, normalize_preset_type
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

        optimized = [schedule[0]]

        for i in range(1, len(schedule) - 1):
            prev_val = schedule[i - 1].get("value")
            curr_val = schedule[i].get("value")
            next_val = schedule[i + 1].get("value")

            if abs(curr_val - prev_val) > 0.01 or abs(curr_val - next_val) > 0.01:
                optimized.append(schedule[i])

        optimized.append(schedule[-1])

        removed = len(schedule) - len(optimized)
        if removed > 0:
            _LOGGER.info("Optimized schedule: removed %d redundant points", removed)

        return optimized

    def _time_to_minutes(self, t: str) -> int:
        """Convert HH:MM to minutes since midnight, clamp to [0, 1439]."""
        try:
            parts = str(t).strip().split(":")
            h = int(parts[0]) if parts and parts[0] != "" else 0
            m = int(parts[1]) if len(parts) > 1 and parts[1] != "" else 0
            total = max(0, min(23, h)) * 60 + max(0, min(59, m))
            return min(total, 1439)
        except Exception:
            return 0

    def _minutes_to_time(self, minutes: int) -> str:
        minutes = max(0, min(1439, int(minutes)))
        h = minutes // 60
        m = minutes % 60
        return f"{h:02d}:{m:02d}"

    def _normalize_schedule(self, schedule):
        """Ensure schedule is sorted and contains 00:00 and 23:59 boundary points."""
        if not isinstance(schedule, list):
            return []

        # Map minute -> value (last wins for duplicates)
        by_minute = {}
        for item in schedule:
            if not isinstance(item, dict):
                continue
            t = item.get("time")
            v = item.get("value")
            if t is None or v is None:
                continue
            minute = self._time_to_minutes(t)
            by_minute[minute] = v

        if not by_minute:
            return []

        # Ensure boundaries
        sorted_minutes = sorted(by_minute.keys())
        first_minute = sorted_minutes[0]
        last_minute = sorted_minutes[-1]
        first_value = by_minute[first_minute]
        last_value = by_minute[last_minute]

        if 0 not in by_minute:
            by_minute[0] = first_value
        if 1439 not in by_minute:
            by_minute[1439] = last_value

        # Build sorted list
        normalized = [{"time": self._minutes_to_time(m), "value": by_minute[m]} for m in sorted(by_minute.keys())]

        return normalized

    async def save_profile(self, call: ServiceCall):
        """Save a profile with ISO 8601 dates and new container format."""
        # Log inbound payload (best-effort, keep it compact).
        try:
            data = dict(getattr(call, "service_data", None) or getattr(call, "data", None) or {})
            # Avoid huge logs
            if isinstance(data.get("schedule"), list):
                data["schedule_len"] = len(data.get("schedule"))
                data.pop("schedule", None)
            if isinstance(data.get("meta"), dict):
                # Don't spam with whole config; only show key set
                data["meta_keys"] = sorted(list(data.get("meta").keys()))
                data.pop("meta", None)
            _LOGGER.info("[PROFILE] save_profile: inbound data=%s", json.dumps(data, ensure_ascii=False, default=str))
        except Exception:
            pass

        payload = getattr(call, "service_data", None) or getattr(call, "data", None) or {}

        profile_name = payload.get("profile_name")
        preset_type = payload.get("preset_type")
        schedule = payload.get("schedule")
        global_prefix = payload.get("global_prefix")

        # NOTE: schedule can legitimately be an empty list.
        # Also, some callers may persist meta-only updates.
        if not profile_name or not preset_type:
            missing = []
            if not profile_name:
                missing.append("profile_name")
            if not preset_type:
                missing.append("preset_type")
            _LOGGER.warning(
                "save_profile: Missing required parameters: %s (profile_name=%s preset_type=%s global_prefix=%s schedule_is_none=%s)",
                ",".join(missing) if missing else "<unknown>",
                profile_name,
                preset_type,
                global_prefix,
                schedule is None,
            )
            return

        canonical = normalize_preset_type(preset_type)

        if not global_prefix:
            _LOGGER.warning(
                "save_profile: Missing required parameter global_prefix (profile_name=%s preset_type=%s schedule_is_none=%s)",
                profile_name,
                preset_type,
                schedule is None,
            )
            return

        if schedule is None:
            schedule = []

        filename = build_profile_filename(profile_name, canonical, global_prefix=global_prefix)

        _LOGGER.info("=== SAVE PROFILE START === Profile: '%s', Preset: %s, File: %s", profile_name, canonical, filename)
        try:
            _LOGGER.info(
                "[PROFILE] Incoming schedule points: %d; first=%s; last=%s",
                len(schedule) if isinstance(schedule, list) else -1,
                schedule[0] if isinstance(schedule, list) and schedule else None,
                schedule[-1] if isinstance(schedule, list) and schedule else None,
            )
        except Exception:
            pass

        # Normalize and optimize schedule (ensure 00:00 and 23:59 bounds)
        normalized_schedule = self._normalize_schedule(schedule)
        optimized_schedule = self._optimize_schedule(normalized_schedule)
        try:
            _LOGGER.info(
                "[PROFILE] Normalized schedule points: %d; first=%s; last=%s",
                len(normalized_schedule),
                normalized_schedule[0] if normalized_schedule else None,
                normalized_schedule[-1] if normalized_schedule else None,
            )
            _LOGGER.info(
                "[PROFILE] Optimized schedule points: %d; first=%s; last=%s",
                len(optimized_schedule),
                optimized_schedule[0] if optimized_schedule else None,
                optimized_schedule[-1] if optimized_schedule else None,
            )
        except Exception:
            pass

        # Load existing data
        existing_data = await self.storage.load_profile_cached(filename) or {}

        # MIGRATE old format to new if needed
        if "meta" not in existing_data and "profile_name" in existing_data:
            _LOGGER.info("Migrating old format to new container format")
            old_profile_name = existing_data.get("profile_name", "Default")
            old_schedule = existing_data.get("schedule", [])

            existing_data = {
                "meta": {
                    "global_prefix": global_prefix,
                    "preset_type": canonical,
                    "created_at": self._to_iso8601(existing_data.get("saved_at", time.time())),
                    "updated_at": self._to_iso8601(),
                },
                "profiles": {
                    old_profile_name: {"schedule": old_schedule, "updated_at": self._to_iso8601(existing_data.get("saved_at", time.time()))}
                },
            }

        # Prepare NEW container structure
        new_data = OrderedDict()

        if "meta" in existing_data:
            new_data["meta"] = existing_data["meta"]
            new_data["meta"]["updated_at"] = self._to_iso8601()
        else:
            new_data["meta"] = {
                "global_prefix": global_prefix,
                "preset_type": canonical,
                "created_at": self._to_iso8601(),
                "updated_at": self._to_iso8601(),
            }

        # Always enforce canonical identifiers in meta (do not rely on previous files)
        try:
            new_data["meta"]["global_prefix"] = global_prefix
            new_data["meta"]["preset_type"] = canonical
        except Exception:
            pass

        # Persist wizard/card configuration in meta (best-effort).
        # This allows SmartScheduler to discover target_entity and other settings from JSON.
        wizard_meta = payload.get("meta")
        if isinstance(wizard_meta, dict) and wizard_meta:
            try:
                # Defensive: never persist deprecated keys
                wizard_meta.pop("entity_prefix", None)
                new_data["meta"].update(wizard_meta)
            except Exception:
                pass

        if "profiles" in existing_data:
            new_data["profiles"] = existing_data["profiles"]
            # Clean existing profiles from any polluted keys (best-effort)
            for p_name in new_data["profiles"]:
                p_entry = new_data["profiles"][p_name]
                if isinstance(p_entry, dict):
                    for key in ["meta", "container_meta", "target_entity", "global_prefix", "profile_name"]:
                        p_entry.pop(key, None)
        else:
            new_data["profiles"] = {}

        # Update specific profile
        new_data["profiles"][profile_name] = {"schedule": optimized_schedule, "updated_at": self._to_iso8601()}

        # Atomic save
        success = await self.storage.save_profile_atomic(filename, new_data, backup=True)

        if success:
            _LOGGER.info("✅ Profile saved successfully!")
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("❌ Failed to save profile container: %s", filename)

        _LOGGER.info("=== SAVE PROFILE END ===")

    async def get_profile_data(
        self, profile_name: str, preset_type: str, global_prefix: str | None = None, force_reload: bool = False
    ) -> dict:
        """Fetch profile data with BACKWARD COMPATIBILITY."""
        # Input validation with logging
        if not all((profile_name, preset_type)):
            _LOGGER.warning(
                "[PROFILE] get_profile_data called with missing parameters: profile_name=%s, preset_type=%s",
                profile_name,
                preset_type,
            )
            return {"error": "Missing parameters"}

        canonical = normalize_preset_type(preset_type)
        _LOGGER.debug("[PROFILE] normalized preset_type: '%s' -> '%s'", preset_type, canonical)

        if not global_prefix:
            _LOGGER.warning("[PROFILE] get_profile_data missing global_prefix for profile '%s'", profile_name)
            return {"error": "Missing global_prefix"}

        filenames_to_try = [build_profile_filename(profile_name, canonical, global_prefix=global_prefix)]
        _LOGGER.info(
            "[PROFILE] get_profile_data: name=%s, preset=%s, global_prefix=%s, filenames_to_try=%s, force_reload=%s",
            profile_name,
            canonical,
            global_prefix,
            filenames_to_try,
            force_reload,
        )

        for filename in filenames_to_try:
            _LOGGER.debug("[PROFILE] Attempting to load cached container: %s", filename)
            data = await self.storage.load_profile_cached(filename, force_reload=force_reload)

            if not data:
                _LOGGER.debug("[PROFILE] No data found for: %s", filename)
                continue
            else:
                meta = data.get("meta", {})
                keys = list(data.keys())
                _LOGGER.debug("[PROFILE] Container loaded: keys=%s, meta=%s", keys, meta)

            # NEW FORMAT: Container with meta + profiles
            if "profiles" in data:
                available_profiles = list(data.get("profiles", {}).keys())
                _LOGGER.debug("[PROFILE] Available profiles in container: %s", available_profiles)
                if profile_name in data["profiles"]:
                    # Create a deep-ish copy to avoid polluting the cached container object
                    profile_entry = data["profiles"][profile_name]
                    profile_content = dict(profile_entry)

                    # Propagate container-level metadata
                    container_meta = data.get("meta", {})

                    # Ensure essential fields are present in the response for the frontend
                    profile_content["global_prefix"] = container_meta.get("global_prefix")
                    profile_content["target_entity"] = container_meta.get("target_entity")
                    profile_content["profile_name"] = profile_name

                    # Provide metadata for frontend config synchronization
                    profile_content["meta"] = container_meta

                    sched = profile_content.get("schedule", [])
                    _LOGGER.info(
                        "[PROFILE] Profile '%s' extracted: points=%d, first=%s, last=%s (file=%s)",
                        profile_name,
                        len(sched),
                        sched[0] if sched else None,
                        sched[-1] if sched else None,
                        filename,
                    )
                    return profile_content
                else:
                    _LOGGER.warning(
                        "[PROFILE] Requested profile '%s' not present in container (available=%s). Falling back to 'Default' if available.",
                        profile_name,
                        available_profiles,
                    )
                    # If 'Default' exists and was not the one requested, try loading it
                    if "Default" in data["profiles"] and profile_name != "Default":
                        profile_entry = data["profiles"]["Default"]
                        profile_content = dict(profile_entry)
                        profile_content["profile_name"] = "Default"
                        profile_content["meta"] = data.get("meta", {})
                        profile_content["was_fallback"] = True
                        return profile_content
            else:
                _LOGGER.warning("[PROFILE] Unsupported container format (missing 'profiles') for %s", filename)

            # OLD FORMAT is not supported anymore

        _LOGGER.warning(
            "[PROFILE] Profile not found: name=%s, preset=%s, global_prefix=%s",
            profile_name,
            canonical,
            global_prefix,
        )
        return {"error": "Profile not found"}

    async def load_profile(self, call: ServiceCall) -> ServiceResponse:
        """Load a profile."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix")
        force_reload = call.data.get("force_reload", False)

        _LOGGER.info("=== LOAD PROFILE START === Profile: '%s', Preset: %s, force_reload=%s", profile_name, preset_type, force_reload)

        result = await self.get_profile_data(profile_name, preset_type, global_prefix, force_reload=force_reload)

        if "error" not in result:
            try:
                sched = result.get("schedule", [])
                _LOGGER.info(
                    "✅ Profile loaded: name=%s, points=%d, first=%s, last=%s",
                    profile_name,
                    len(sched),
                    sched[0] if sched else None,
                    sched[-1] if sched else None,
                )
            except Exception:
                _LOGGER.info("✅ Profile loaded successfully: %s", profile_name)
        else:
            _LOGGER.warning("⚠️ Profile load failed: %s", result.get("error"))

        _LOGGER.info("=== LOAD PROFILE END ===")
        return result

    async def add_profile(self, call: ServiceCall):
        """Create a new profile with default values."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix")

        if not all((profile_name, preset_type)):
            return

        canonical = normalize_preset_type(preset_type)

        # Get default value
        default_value = 20 if canonical == "thermostat" else 0
        # Minimal sparse default schedule with boundaries
        default_schedule = self._normalize_schedule(
            [
                {"time": "00:00", "value": default_value},
                {"time": "23:59", "value": default_value},
            ]
        )

        if not global_prefix:
            _LOGGER.warning("add_profile: Missing required parameter global_prefix")
            return

        filename = build_profile_filename(profile_name, canonical, global_prefix=global_prefix)

        # Load existing container if it exists
        existing_data = await self.storage.load_profile_cached(filename) or {}

        # Prepare data structure
        if "profiles" in existing_data:
            # Container already exists, just add/update the profile
            existing_data["profiles"][profile_name] = {"schedule": default_schedule, "updated_at": self._to_iso8601()}
            if "meta" in existing_data:
                existing_data["meta"]["updated_at"] = self._to_iso8601()

            save_data = existing_data
        else:
            # Create NEW format container
            save_data = {
                "meta": {
                    "global_prefix": global_prefix,
                    "preset_type": canonical,
                    "created_at": self._to_iso8601(),
                    "updated_at": self._to_iso8601(),
                },
                "profiles": {profile_name: {"schedule": default_schedule, "updated_at": self._to_iso8601()}},
            }

        _LOGGER.info("Adding/Creating profile '%s' in: %s", profile_name, filename)

        success = await self.storage.save_profile_atomic(filename, save_data, backup=True)

        if success:
            _LOGGER.info("✅ Profile added successfully: %s", profile_name)
            await self.async_update_profile_selectors()
        else:
            _LOGGER.error("❌ Failed to save profile container: %s", filename)

    async def delete_profile(self, call: ServiceCall):
        """Delete a profile."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix")

        if not all((profile_name, preset_type)):
            return

        canonical = normalize_preset_type(preset_type)

        if not global_prefix:
            _LOGGER.warning("delete_profile: Missing required parameter global_prefix")
            return

        filename = build_profile_filename(profile_name, canonical, global_prefix=global_prefix)

        # Load existing data
        existing_data = await self.storage.load_profile_cached(filename)

        if not existing_data:
            _LOGGER.warning("❌ No profile file found to delete: %s", profile_name)
            return

        # NEW container format handling
        if "profiles" in existing_data:
            if profile_name in existing_data["profiles"]:
                del existing_data["profiles"][profile_name]
                _LOGGER.info("✅ Profile '%s' removed from container %s", profile_name, filename)

                # If no profiles left, delete the entire file
                if not existing_data["profiles"]:
                    await self.storage.delete_profile(filename)
                    _LOGGER.info("✅ Container file %s deleted because it was empty", filename)
                else:
                    # Save updated container
                    if "meta" in existing_data:
                        existing_data["meta"]["updated_at"] = self._to_iso8601()
                    await self.storage.save_profile_atomic(filename, existing_data, backup=True)

                await self.async_update_profile_selectors()
            else:
                _LOGGER.warning("❌ Profile '%s' not found in container %s", profile_name, filename)

        # OLD format handling: entire file is the profile
        elif existing_data.get("profile_name") == profile_name:
            if await self.storage.delete_profile(filename):
                _LOGGER.info("✅ Old format profile file deleted: %s", filename)
                await self.async_update_profile_selectors()
        else:
            _LOGGER.warning("❌ Could not delete profile '%s': format mismatch or name not found in %s", profile_name, filename)

    def _generate_package_yaml(self, global_prefix, preset_type, profile_options, target_entity):
        """Generates the content for the package YAML file."""
        preset_name = preset_type.replace("_", " ").title()

        lines = []
        lines.append("input_number:")
        lines.append(f"  {global_prefix}current:")
        lines.append(f'    name: "CronoStar {preset_name} Current"')
        lines.append("    min: 0")  # Fallback defaults if meta not handy
        lines.append("    max: 100")
        lines.append("    step: 0.5")
        lines.append("    mode: box")
        lines.append("    icon: mdi:chart-timeline")
        lines.append("")

        lines.append("input_boolean:")
        lines.append(f"  {global_prefix}paused:")
        lines.append(f'    name: "CronoStar {preset_name} Paused"')
        lines.append("    icon: mdi:pause-circle")
        lines.append("")

        lines.append("input_select:")
        lines.append(f"  {global_prefix}profiles:")
        lines.append(f'    name: "CronoStar {preset_name} Profiles"')
        lines.append("    options:")
        for opt in sorted(list(set(profile_options))):
            lines.append(f'      - "{opt}"')
        lines.append('    initial: "Default"')
        lines.append("    icon: mdi:format-list-bulleted")
        lines.append("")

        if target_entity:
            lines.append("input_text:")
            lines.append(f"  {global_prefix}target_entity:")
            lines.append(f'    name: "CronoStar {preset_name} Target Entity"')
            lines.append(f'    initial: "{target_entity}"')
            lines.append("    icon: mdi:target")

        return "\n".join(lines)

    async def async_update_profile_selectors(self):
        """Scan profiles and update input_select entities."""
        _LOGGER.info("Updating profile selectors...")

        profiles_by_preset = {}
        all_files = await self.storage.list_profiles()

        for filename in all_files:
            try:
                container_data = await self.storage.load_profile_cached(filename)

                if not container_data:
                    continue

                # NEW format
                if "meta" in container_data:
                    preset_type = container_data["meta"].get("preset_type")
                    profiles_dict = container_data.get("profiles", {})

                    if preset_type and profiles_dict:
                        canonical_preset = normalize_preset_type(preset_type)

                        if canonical_preset not in profiles_by_preset:
                            profiles_by_preset[canonical_preset] = []

                        profiles_by_preset[canonical_preset].extend(profiles_dict.keys())

                # OLD format
                elif "profile_name" in container_data:
                    preset_type = container_data.get("preset_type", "thermostat")
                    profile_name = container_data.get("profile_name")

                    canonical_preset = normalize_preset_type(preset_type)

                    if canonical_preset not in profiles_by_preset:
                        profiles_by_preset[canonical_preset] = []

                    profiles_by_preset[canonical_preset].append(profile_name)

            except Exception as e:
                _LOGGER.warning("Could not read profile container %s: %s", filename, e)

        # Update input_select entities
        valid_selectors = set()
        for preset, config in PRESETS_CONFIG.items():
            selector_entity_id = config.get("profiles_select")

            if not selector_entity_id:
                continue

            valid_selectors.add(selector_entity_id)

            # Always ensure "Default" exists as an option
            preset_profiles = profiles_by_preset.get(preset, [])
            if "Default" not in preset_profiles:
                preset_profiles.append("Default")

            current_state = self.hass.states.get(selector_entity_id)
            current_options = current_state.attributes.get("options", []) if current_state else []

            new_options = sorted(list(set(preset_profiles)))

            if set(current_options) != set(new_options):
                _LOGGER.info("Updating %s with %d profiles", selector_entity_id, len(new_options))

                try:
                    await self.hass.services.async_call(
                        "input_select",
                        "set_options",
                        {"entity_id": selector_entity_id, "options": new_options},
                        blocking=True,
                    )

                    # Update YAML package file on disk if we have metadata
                    # We look for ANY container that matches this preset to get global_prefix and target_entity
                    for filename in all_files:
                        container = await self.storage.load_profile_cached(filename)
                        if container and "meta" in container and container["meta"].get("preset_type") == preset:
                            meta = container["meta"]
                            prefix = meta.get("global_prefix")
                            target = meta.get("target_entity")
                            if prefix:
                                package_path = f"packages/{prefix}package.yaml"
                                yaml_content = self._generate_package_yaml(prefix, preset, new_options, target)
                                # Update min/max/step if available in meta
                                if "min_value" in meta:
                                    yaml_content = yaml_content.replace("min: 0", f"min: {meta['min_value']}")
                                if "max_value" in meta:
                                    yaml_content = yaml_content.replace("max: 100", f"max: {meta['max_value']}")
                                if "step_value" in meta:
                                    yaml_content = yaml_content.replace("step: 0.5", f"step: {meta['step_value']}")

                                _LOGGER.info("Updating package file: %s", package_path)
                                await self.hass.services.async_call(
                                    "cronostar", "create_yaml_file", {"file_path": package_path, "content": yaml_content}, blocking=True
                                )
                                break
                except Exception as e:
                    _LOGGER.error("Failed to update %s or its package file: %s", selector_entity_id, e)

        # NEW: Check for stray cronostar_ input_select entities that aren't in PRESETS_CONFIG
        # or don't match any profile data on disk.
        all_input_selects = [sid for sid in self.hass.states.async_entity_ids("input_select") if sid.startswith("input_select.cronostar_")]
        for sid in all_input_selects:
            if sid in valid_selectors:
                continue

            # This is a cronostar_ select that is NOT in current PRESETS_CONFIG
            # Log as error suggesting deletion.
            state = self.hass.states.get(sid)
            options = state.attributes.get("options", []) if state else []
            _LOGGER.error(
                "[CONSISTENCY CHECK] Stray or invalid entity detected: %s (Options: %s). "
                "This entity does not correspond to any active CronoStar preset or profile file. "
                "Please delete it from your YAML configuration or Home Assistant entities list.",
                sid,
                options,
            )
