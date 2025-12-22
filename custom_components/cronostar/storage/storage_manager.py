"""
CronoStar Storage Manager - Centralizes all profile storage operations.
Handles atomic saves, concurrent access, and profile versioning.
"""
import logging
import os
import json
import time
from datetime import datetime, timezone
import asyncio
from typing import Dict, List, Optional, Any
from functools import partial
from pathlib import Path

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

class StorageManager:
    """Centralized storage management for CronoStar profiles."""
    
    def __init__(self, hass: HomeAssistant, profiles_dir: str):
        """Initialize storage manager.
        
        Args:
            hass: Home Assistant instance
            profiles_dir: Directory for profile storage
        """
        self.hass = hass
        self.profiles_dir = Path(profiles_dir)
        self._locks: Dict[str, asyncio.Lock] = {}
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timeout = 30  # seconds
        
        # Ensure directory exists
        self.profiles_dir.mkdir(parents=True, exist_ok=True)
        _LOGGER.info("StorageManager initialized: %s", self.profiles_dir)
    
    def _get_lock(self, filename: str) -> asyncio.Lock:
        """Get or create a lock for a specific file."""
        if filename not in self._locks:
            self._locks[filename] = asyncio.Lock()
        return self._locks[filename]
    
    async def save_profile_atomic(
        self,
        filename: str,
        profile_data: Dict[str, Any],
        backup: bool = True
    ) -> bool:
        """Save profile with atomic write and optional backup.
        
        Args:
            filename: Profile filename
            profile_data: Profile data to save
            backup: Whether to create backup of existing file
            
        Returns:
            True if save successful, False otherwise
        """
        file_path = self.profiles_dir / filename
        lock = self._get_lock(filename)
        
        async with lock:
            try:
                # Add metadata
                # Save both epoch (backward-compatible) and ISO 8601 UTC timestamp
                now_ts = time.time()
                profile_data["saved_at"] = now_ts
                profile_data["saved_at_iso"] = datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                profile_data["version"] = 2  # Storage format version
                
                # Create backup if file exists and backup is requested
                if backup and file_path.exists():
                    backup_path = file_path.with_suffix(f".{int(time.time())}.bak")
                    await self.hass.async_add_executor_job(
                        self._copy_file, file_path, backup_path
                    )
                    _LOGGER.debug("Backup created: %s", backup_path.name)
                
                # Atomic write: write to temp file, then rename
                temp_path = file_path.with_suffix(".tmp")
                await self.hass.async_add_executor_job(
                    self._write_json, temp_path, profile_data
                )
                await self.hass.async_add_executor_job(
                    self._rename_file, temp_path, file_path
                )
                
                # Update cache
                self._cache[filename] = {
                    "data": profile_data,
                    "timestamp": time.time()
                }
                
                # Log a concise summary of what was written
                try:
                    profiles = profile_data.get("profiles", {}) if isinstance(profile_data, dict) else {}
                    profile_names = list(profiles.keys())
                    first_name = profile_names[0] if profile_names else None
                    sched = profiles.get(first_name, {}).get("schedule", []) if first_name else []
                    _LOGGER.info(
                        "[STORAGE] Saved profile container: file=%s, profiles=%d, first_profile=%s, schedule_points=%d",
                        filename,
                        len(profile_names),
                        first_name,
                        len(sched),
                    )
                except Exception:
                    _LOGGER.info("Profile saved atomically: %s", filename)
                return True
                
            except Exception as e:
                _LOGGER.error("Failed to save profile %s: %s", filename, e)
                return False
    
    async def load_profile_cached(
        self,
        filename: str,
        force_reload: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Load profile with caching support.
        
        Args:
            filename: Profile filename
            force_reload: Force reload from disk, bypassing cache
            
        Returns:
            Profile data or None if not found
        """
        # Check cache first
        if not force_reload and filename in self._cache:
            cache_entry = self._cache[filename]
            age = time.time() - cache_entry["timestamp"]
            
            if age < self._cache_timeout:
                _LOGGER.debug("Cache hit for %s (age: %.1fs)", filename, age)
                return cache_entry["data"]
        
        # Load from disk
        file_path = self.profiles_dir / filename
        
        if not file_path.exists():
            _LOGGER.info("[STORAGE] Profile file not found: %s", file_path)
            return None
        
        try:
            data = await self.hass.async_add_executor_job(
                self._read_json, file_path
            )
            
            # Update cache
            self._cache[filename] = {
                "data": data,
                "timestamp": time.time()
            }
            
            # Log a concise summary of what was read
            try:
                if isinstance(data, dict):
                    if "profiles" in data:
                        profiles = data.get("profiles", {})
                        names = list(profiles.keys())
                        first_name = names[0] if names else None
                        sched = profiles.get(first_name, {}).get("schedule", []) if first_name else []
                        _LOGGER.info(
                            "[STORAGE] Loaded container: file=%s, profiles=%d, first_profile=%s, schedule_points=%d",
                            file_path,
                            len(names),
                            first_name,
                            len(sched),
                        )
                    elif "profile_name" in data:
                        name = data.get("profile_name")
                        sched = data.get("schedule", [])
                        _LOGGER.info(
                            "[STORAGE] Loaded legacy profile: file=%s, profile=%s, schedule_points=%d",
                            file_path,
                            name,
                            len(sched),
                        )
                    else:
                        _LOGGER.info("[STORAGE] Loaded JSON file: %s", file_path)
                else:
                    _LOGGER.info("[STORAGE] Loaded non-dict JSON from: %s", file_path)
            except Exception:
                _LOGGER.debug("Profile loaded from disk: %s", filename)
            return data
            
        except Exception as e:
            _LOGGER.error("Failed to load profile %s: %s", filename, e)
            return None
    
    async def delete_profile(self, filename: str) -> bool:
        """Delete a profile file.
        
        Args:
            filename: Profile filename to delete
            
        Returns:
            True if deleted successfully
        """
        file_path = self.profiles_dir / filename
        lock = self._get_lock(filename)
        
        async with lock:
            try:
                if file_path.exists():
                    await self.hass.async_add_executor_job(file_path.unlink)
                    
                    # Clear cache
                    self._cache.pop(filename, None)
                    
                    _LOGGER.info("Profile deleted: %s", filename)
                    return True
                else:
                    _LOGGER.warning("Profile not found for deletion: %s", filename)
                    return False
                    
            except Exception as e:
                _LOGGER.error("Failed to delete profile %s: %s", filename, e)
                return False
    
    async def list_profiles(
        self,
        preset_type: Optional[str] = None,
        prefix: Optional[str] = None
    ) -> List[str]:
        """List all profile files, optionally filtered.
        
        Args:
            preset_type: Filter by preset type
            prefix: Filter by prefix
            
        Returns:
            List of profile filenames
        """
        try:
            files = await self.hass.async_add_executor_job(
                lambda: [f.name for f in self.profiles_dir.glob("*.json")]
            )
            
            # Apply filters
            if prefix:
                files = [f for f in files if f.startswith(prefix)]
            
            if preset_type:
                # Load each file to check preset_type
                filtered = []
                for filename in files:
                    data = await self.load_profile_cached(filename)
                    if data and data.get("preset_type") == preset_type:
                        filtered.append(filename)
                files = filtered
            
            _LOGGER.debug("Listed %d profiles (preset=%s, prefix=%s)", 
                         len(files), preset_type, prefix)
            return sorted(files)
            
        except Exception as e:
            _LOGGER.error("Failed to list profiles: %s", e)
            return []
    
    async def cleanup_old_backups(self, days: int = 7) -> int:
        """Remove backup files older than specified days.
        
        Args:
            days: Maximum age of backups to keep
            
        Returns:
            Number of backups deleted
        """
        try:
            cutoff = time.time() - (days * 86400)
            backups = await self.hass.async_add_executor_job(
                lambda: list(self.profiles_dir.glob("*.bak"))
            )
            
            deleted = 0
            for backup_file in backups:
                if backup_file.stat().st_mtime < cutoff:
                    await self.hass.async_add_executor_job(backup_file.unlink)
                    deleted += 1
            
            if deleted > 0:
                _LOGGER.info("Cleaned up %d old backup files", deleted)
            
            return deleted
            
        except Exception as e:
            _LOGGER.error("Failed to cleanup backups: %s", e)
            return 0
    
    def clear_cache(self, filename: Optional[str] = None):
        """Clear profile cache.
        
        Args:
            filename: Specific file to clear, or None for all
        """
        if filename:
            self._cache.pop(filename, None)
            _LOGGER.debug("Cache cleared for: %s", filename)
        else:
            self._cache.clear()
            _LOGGER.debug("All cache cleared")
    
    # Synchronous helper methods (run in executor)
    
    @staticmethod
    def _write_json(path: Path, data: Dict[str, Any]):
        """Write JSON data to file."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        """Read JSON data from file."""
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    @staticmethod
    def _copy_file(src: Path, dst: Path):
        """Copy file."""
        import shutil
        shutil.copy2(src, dst)
    
    @staticmethod
    def _rename_file(src: Path, dst: Path):
        """Rename/move file (atomic on POSIX)."""
        src.replace(dst)