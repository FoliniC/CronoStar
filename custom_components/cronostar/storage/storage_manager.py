# custom_components/cronostar/storage/storage_manager.py
"""
Storage Manager - handles profile persistence
Manages JSON files with caching and backup support
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..utils.filename_builder import build_profile_filename

_LOGGER = logging.getLogger(__name__)


class StorageManager:
    """Manages profile storage with caching and backups"""

    def __init__(self, hass: HomeAssistant, profiles_dir: str | Path, enable_backups: bool = False):
        """
        Initialize StorageManager

        Args:
            hass: Home Assistant instance
            profiles_dir: Directory for profile files
            enable_backups: Enable automatic backups
        """
        self.hass = hass
        self.profiles_dir = Path(profiles_dir)
        self.enable_backups = enable_backups

        # Cache for loaded profiles
        self._cache = {}
        self._cache_timestamps = {}
        self._cache_lock = asyncio.Lock()

        # Ensure directory exists
        self.profiles_dir.mkdir(parents=True, exist_ok=True)

        _LOGGER.info(
            "StorageManager initialized: %s (backups: %s)",
            self.profiles_dir.as_posix().replace(self.hass.config.path(), "/config"),
            "enabled" if enable_backups else "disabled",
        )

    async def save_profile(self, profile_name: str, preset_type: str, profile_data: dict, metadata: dict, global_prefix: str = "") -> bool:
        """
        Save a profile to storage

        Args:
            profile_name: Profile name
            preset_type: Preset type
            profile_data: Profile data (schedule, etc.)
            metadata: Metadata dictionary
            global_prefix: Global prefix for filename

        Returns:
            True if successful
        """
        try:
            filename = build_profile_filename(preset_type, global_prefix)
            filepath = self.profiles_dir / filename

            # Load existing container or create new
            container = await self._load_container(filepath)

            # Update metadata
            container["meta"] = {
                **container.get("meta", {}),
                **metadata,
                "preset_type": preset_type,
                "global_prefix": global_prefix,
                "updated_at": datetime.now().isoformat(),
            }

            # Add entity info to profile data as requested
            profile_entry = {**profile_data, "updated_at": datetime.now().isoformat()}
            if "enabled_entity" in metadata:
                profile_entry["enabled_entity"] = metadata["enabled_entity"]
            if "profiles_select_entity" in metadata:
                profile_entry["profiles_select_entity"] = metadata["profiles_select_entity"]
            if "target_entity" in metadata:
                profile_entry["target_entity"] = metadata["target_entity"]
            
            # Consolidated entities list for easy discovery
            profile_entry["entities"] = [
                metadata.get("target_entity"),
                metadata.get("enabled_entity"),
                metadata.get("profiles_select_entity")
            ]
            # Filter out None values
            profile_entry["entities"] = [e for e in profile_entry["entities"] if e]

            container["profiles"][profile_name] = profile_entry

            # Backup if enabled
            if self.enable_backups and filepath.exists():
                await self._create_backup(filepath)

            # Write to disk
            await self._write_json(filepath, container)

            # Update cache
            async with self._cache_lock:
                self._cache[filename] = container
                self._cache_timestamps[filename] = datetime.now()

            _LOGGER.info("Profile saved: %s/%s (%d points)", filename, profile_name, len(profile_data.get("schedule", [])))

            return True

        except Exception as e:
            _LOGGER.error("Error saving profile %s: %s", profile_name, e, exc_info=True)
            return False

    async def load_profile_cached(self, filename: str, force_reload: bool = False) -> dict | None:
        """
        Load profile container with caching

        Args:
            filename: Profile filename
            force_reload: Bypass cache

        Returns:
            Profile container or None
        """
        async with self._cache_lock:
            # Check cache
            if not force_reload and filename in self._cache:
                cache_age = (datetime.now() - self._cache_timestamps[filename]).seconds

                # Cache valid for 60 seconds
                if cache_age < 60:
                    return self._cache[filename]

            # Load from disk
            filepath = self.profiles_dir / filename
            container = await self._load_container(filepath)

            if container:
                self._cache[filename] = container
                self._cache_timestamps[filename] = datetime.now()

            return container

    async def delete_profile(self, profile_name: str, preset_type: str, global_prefix: str = "") -> bool:
        """
        Delete a profile from storage

        Args:
            profile_name: Profile name
            preset_type: Preset type
            global_prefix: Global prefix

        Returns:
            True if successful
        """
        try:
            filename = build_profile_filename(preset_type, global_prefix)
            filepath = self.profiles_dir / filename

            # Load container
            container = await self._load_container(filepath)

            if not container or "profiles" not in container:
                _LOGGER.warning("Profile container not found: %s", filename)
                return False

            # Remove profile
            if profile_name not in container["profiles"]:
                _LOGGER.warning("Profile not found: %s in %s", profile_name, filename)
                return False

            del container["profiles"][profile_name]

            # If empty, delete file
            if not container["profiles"]:
                filepath.unlink(missing_ok=True)
                _LOGGER.info("Deleted empty container: %s", filename)

                # Clear cache
                async with self._cache_lock:
                    self._cache.pop(filename, None)
                    self._cache_timestamps.pop(filename, None)
            else:
                # Update file
                await self._write_json(filepath, container)

                # Update cache
                async with self._cache_lock:
                    self._cache[filename] = container
                    self._cache_timestamps[filename] = datetime.now()

            _LOGGER.info("Profile deleted: %s from %s", profile_name, filename)
            return True

        except Exception as e:
            _LOGGER.error("Error deleting profile %s: %s", profile_name, e, exc_info=True)
            return False

    async def list_profiles(self, preset_type: str | None = None, prefix: str | None = None) -> list[str]:
        """
        List profile files

        Args:
            preset_type: Filter by preset type
            prefix: Filter by prefix

        Returns:
            List of filenames
        """
        try:
            matches: list[str] = []

            # Normalize optional prefix once (ensure trailing underscore when comparing to meta)
            norm_prefix_meta = None
            if prefix:
                norm_prefix_meta = prefix if prefix.endswith("_") else f"{prefix}_"

            for filepath in self.profiles_dir.glob("cronostar_*.json"):
                filename = filepath.name

                # If no filters, include quickly
                if not preset_type and not norm_prefix_meta:
                    matches.append(filename)
                    continue

                # Load container to reliably filter by meta
                data = await self.load_profile_cached(filename)
                if not data:
                    continue

                meta = data.get("meta", {}) if isinstance(data, dict) else {}

                # Check preset filter (prefer meta.preset_type; fall back to root key if needed)
                if preset_type:
                    # Normalize preset types via utility so only 'generic_switch' remains canonical for switch family
                    file_preset = meta.get("preset_type") or data.get("preset_type")
                    try:
                        from ..utils.prefix_normalizer import normalize_preset_type

                        normalized_file_preset = normalize_preset_type(str(file_preset or ""))
                        normalized_requested = normalize_preset_type(str(preset_type))
                    except Exception:
                        normalized_file_preset = str(file_preset or "")
                        normalized_requested = str(preset_type)
                    if normalized_file_preset != normalized_requested:
                        continue

                # Check prefix filter (prefer meta.global_prefix)
                if norm_prefix_meta:
                    file_prefix = meta.get("global_prefix")
                    if file_prefix != norm_prefix_meta:
                        # Fallback to filename-based match only if meta missing
                        if not file_prefix:
                            base_noext = filename[:-5] if filename.endswith(".json") else filename
                            if base_noext.startswith("cronostar_"):
                                rest = base_noext[len("cronostar_") :]
                                base_part, sep, _suffix = rest.rpartition("_")
                                wanted_base = norm_prefix_meta.rstrip("_")
                                if base_part != wanted_base:
                                    continue
                            else:
                                continue
                        else:
                            continue

                matches.append(filename)

            matches.sort()
            return matches

        except Exception as e:
            _LOGGER.error("Error listing profiles: %s", e, exc_info=True)
            return []

    async def get_profile_list(self, preset_type: str, global_prefix: str = "") -> list[str]:
        """
        Get list of profile names in a container

        Args:
            preset_type: Preset type
            global_prefix: Global prefix

        Returns:
            List of profile names
        """
        try:
            filename = build_profile_filename(preset_type, global_prefix)
            container = await self.load_profile_cached(filename)

            if not container or "profiles" not in container:
                return []

            return list(container["profiles"].keys())

        except Exception as e:
            _LOGGER.error("Error getting profile list: %s", e, exc_info=True)
            return []

    async def clear_cache(self) -> None:
        """Clear profile cache"""
        async with self._cache_lock:
            self._cache.clear()
            self._cache_timestamps.clear()
            _LOGGER.info("Profile cache cleared")

    async def get_cached_containers(
        self,
        preset_type: str | None = None,
        global_prefix: str | None = None,
    ) -> list[tuple[str, dict]]:
        """Return cached profile containers filtered by meta.

        Args:
            preset_type: Optional preset type to match exactly against meta.preset_type
            global_prefix: Optional global prefix to match exactly against meta.global_prefix

        Returns:
            List of (filename, container) tuples from cache matching the filters.
        """
        norm_prefix = None
        if global_prefix:
            norm_prefix = global_prefix if global_prefix.endswith("_") else f"{global_prefix}_"

        async with self._cache_lock:
            results: list[tuple[str, dict]] = []
            for fname, container in self._cache.items():
                if not isinstance(container, dict):
                    continue
                meta = container.get("meta", {}) if isinstance(container, dict) else {}
                if preset_type and meta.get("preset_type") != preset_type:
                    continue
                if norm_prefix and meta.get("global_prefix") != norm_prefix:
                    continue
                results.append((fname, container))

            return results

    async def _load_container(self, filepath: Path) -> dict:
        """
        Load profile container from disk

        Args:
            filepath: File path

        Returns:
            Profile container or empty dict
        """
        if not filepath.exists():
            return {}

        try:
            content = await self.hass.async_add_executor_job(filepath.read_text, "utf-8")
            data = json.loads(content)

            # Validate structure
            if not isinstance(data, dict):
                _LOGGER.warning("Invalid container format in %s", filepath.name)
                return {}

            return data

        except json.JSONDecodeError as e:
            _LOGGER.error("JSON decode error in %s: %s", filepath.name, e)
            return {}
        except Exception as e:
            _LOGGER.error("Error loading %s: %s", filepath.name, e, exc_info=True)
            return {}

    async def _write_json(self, filepath: Path, data: dict) -> None:
        """
        Write JSON data to disk

        Args:
            filepath: File path
            data: Data to write
        """
        try:
            json_str = json.dumps(data, indent=2, ensure_ascii=False)
            await self.hass.async_add_executor_job(filepath.write_text, json_str, "utf-8")
        except Exception as e:
            _LOGGER.error("Error writing %s: %s", filepath.name, e, exc_info=True)
            raise

    async def _create_backup(self, filepath: Path) -> None:
        """
        Create backup of existing file

        Args:
            filepath: File to backup
        """
        try:
            timestamp = dt_util.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{filepath.stem}_backup_{timestamp}{filepath.suffix}"
            backup_path = filepath.parent / "backups" / backup_name

            backup_path.parent.mkdir(exist_ok=True)

            await self.hass.async_add_executor_job(lambda: backup_path.write_bytes(filepath.read_bytes()))

            _LOGGER.debug("Backup created: %s", backup_name)

            # Clean old backups (keep last 10)
            await self._cleanup_old_backups(filepath.stem)

        except Exception as e:
            _LOGGER.warning("Backup creation failed: %s", e, exc_info=True)

    async def _cleanup_old_backups(self, stem: str) -> None:
        """
        Remove old backup files

        Args:
            stem: File stem to match
        """
        try:
            backup_dir = self.profiles_dir / "backups"

            if not backup_dir.exists():
                return

            # Find matching backups
            backups = list(backup_dir.glob(f"{stem}_backup_*.json"))
            backups.sort(key=lambda p: p.stat().st_mtime, reverse=True)

            # Keep only last 10
            for old_backup in backups[10:]:
                await self.hass.async_add_executor_job(old_backup.unlink, True)
                _LOGGER.debug("Removed old backup: %s", old_backup.name)

        except Exception as e:
            _LOGGER.warning("Backup cleanup failed: %s", e, exc_info=True)

    async def load_all_profiles(self) -> dict[str, dict]:
        """

        Load all profiles from the profiles directory and perform data quality checks.



        Returns:

            A dictionary where keys are filenames and values are the loaded profile data,

            including a 'validation_results' key with the outcome of the FileChecker.

        """

        _LOGGER.info("Loading all profiles from %s", self.profiles_dir)

        from ..deep_checks.file_checker import FileChecker

        file_checker = FileChecker(self.hass)

        all_profiles_data: dict[str, dict] = {}

        try:
            # List all cronostar profile JSON files

            for filepath in self.profiles_dir.glob("cronostar_*.json"):
                filename = filepath.name

                # Load the container data

                container_data = await self._load_container(filepath)

                # Perform data quality check for the file

                # Note: FileChecker.check_files expects global_prefix and preset_type.

                # We need to extract these from the filename or the loaded meta data.

                # For now, let's just use _validate_profile_file directly as it's more generic.

                validation_results = await file_checker._validate_profile_file(filepath)

                if container_data:
                    container_data["validation_results"] = validation_results

                    all_profiles_data[filename] = container_data

                    _LOGGER.debug("Loaded profile file: %s (valid: %s)", filename, validation_results.get("valid"))

                else:
                    _LOGGER.warning("Failed to load profile file: %s", filename)

                    all_profiles_data[filename] = {"validation_results": validation_results}  # Store validation even if load failed

        except Exception as e:
            _LOGGER.error("Error loading all profiles: %s", e, exc_info=True)

        _LOGGER.info("Finished loading all profiles. Found %d files.", len(all_profiles_data))

        return all_profiles_data
