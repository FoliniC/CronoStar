"""
CronoStar Auto-Updater - Automatically saves profiles when input_numbers change.
Monitors state changes and triggers profile saves intelligently.
"""

import asyncio
import logging

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event

_LOGGER = logging.getLogger(__name__)


class AutoUpdater:
    """Monitors input_number changes and auto-saves profiles."""
    
    def __init__(self, hass: HomeAssistant, storage_manager, profile_service):
        """Initialize auto-updater.
        
        Args:
            hass: Home Assistant instance
            storage_manager: StorageManager instance
            profile_service: ProfileService instance
        """
        self.hass = hass
        self.storage = storage_manager
        self.profile_service = profile_service
        
        # Track pending changes per preset
        self._pending_changes: dict[str, set[str]] = {}
        self._save_tasks: dict[str, asyncio.Task] = {}
        self._last_save: dict[str, float] = {}
        
        # Configuration
        self.debounce_seconds = 3.0  # Wait 3s after last change
        self.min_save_interval = 5.0  # Min 5s between saves
        
        self._unsub = None
        _LOGGER.info("AutoUpdater initialized")
    
    def start_monitoring(self, prefixes: dict[str, str]):
        """Start monitoring input_number entities for changes.
        
        Args:
            prefixes: Dict mapping preset_type to global_prefix
        """
        if self._unsub:
            self._unsub()
        
        # Build list of entities to monitor
        entities_to_monitor = []
        for _preset_type, prefix in prefixes.items():
            for hour in range(24):
                entity_id = f"input_number.{prefix}{hour:02d}"
                entities_to_monitor.append(entity_id)
        
        # Subscribe to state changes
        self._unsub = async_track_state_change_event(self.hass, entities_to_monitor, self._on_state_change)
        
        _LOGGER.info("Monitoring %d entities for auto-save", len(entities_to_monitor))
    
    def stop_monitoring(self):
        """Stop monitoring state changes."""
        if self._unsub:
            self._unsub()
            self._unsub = None
        
        # Cancel pending save tasks
        for task in self._save_tasks.values():
            if not task.done():
                task.cancel()
        
        self._save_tasks.clear()
        self._pending_changes.clear()
        _LOGGER.info("AutoUpdater stopped")
    
    @callback
    def _on_state_change(self, event: Event):
        """Handle input_number state change."""
        entity_id = event.data.get("entity_id")
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")
        
        if not entity_id or not new_state:
            return
        
        # Skip if state hasn't actually changed
        if old_state and old_state.state == new_state.state:
            return
        
        # Skip unavailable/unknown states
        if new_state.state in ("unavailable", "unknown"):
            return
        
        # Determine preset type from entity_id
        preset_type = self._detect_preset_type(entity_id)
        if not preset_type:
            return
        
        _LOGGER.debug("State change detected: %s = %s (preset=%s)", entity_id, new_state.state, preset_type)
        
        # Track pending change
        if preset_type not in self._pending_changes:
            self._pending_changes[preset_type] = set()
        
        self._pending_changes[preset_type].add(entity_id)
        
        # Schedule debounced save
        self._schedule_save(preset_type)
    
    def _schedule_save(self, preset_type: str):
        """Schedule a debounced save for preset."""
        # Cancel existing task
        if preset_type in self._save_tasks:
            task = self._save_tasks[preset_type]
            if not task.done():
                task.cancel()
        
        # Create new delayed task
        self._save_tasks[preset_type] = asyncio.create_task(self._debounced_save(preset_type))
    
    async def _debounced_save(self, preset_type: str):
        """Wait for debounce period, then save."""
        try:
            # Wait for debounce period
            await asyncio.sleep(self.debounce_seconds)
            
            # Check minimum save interval
            last_save = self._last_save.get(preset_type, 0)
            time_since_save = asyncio.get_event_loop().time() - last_save
            
            if time_since_save < self.min_save_interval:
                wait_time = self.min_save_interval - time_since_save
                _LOGGER.debug("Waiting %.1fs before save (min interval)", wait_time)
                await asyncio.sleep(wait_time)
            
            # Get current profile for this preset
            profile_name = await self._get_active_profile(preset_type)
            
            if not profile_name:
                _LOGGER.warning("No active profile for %s, skipping auto-save", preset_type)
                return
            
            # Collect schedule from input_numbers
            schedule = await self._collect_schedule(preset_type)
            
            if not schedule:
                _LOGGER.warning("Failed to collect schedule for %s", preset_type)
                return
            
            # Save profile
            _LOGGER.info(
                "Auto-saving profile '%s' (preset=%s, changed=%d entities)",
                profile_name,
                preset_type,
                len(self._pending_changes.get(preset_type, [])),
            )
            
            from homeassistant.core import ServiceCall
            
            # Use ProfileService to save
            call = ServiceCall(
                domain="cronostar",
                service="save_profile",
                data={"profile_name": profile_name, "preset_type": preset_type, "schedule": schedule},
            )
            
            await self.profile_service.save_profile(call)
            
            # Update last save time
            self._last_save[preset_type] = asyncio.get_event_loop().time()
            
            # Clear pending changes
            self._pending_changes.pop(preset_type, None)
            
            _LOGGER.info("Auto-save completed for '%s'", profile_name)
            
        except asyncio.CancelledError:
            _LOGGER.debug("Save cancelled for %s", preset_type)
        except Exception as e:
            _LOGGER.error("Auto-save failed for %s: %s", preset_type, e)
    
    async def _get_active_profile(self, preset_type: str) -> str | None:
        """Get the currently active profile for a preset."""
        # Map preset to input_text entity
        profile_entities = {
            "thermostat": "input_text.cronostar_active_profile_thermostat",
            "ev_charging": "input_text.cronostar_active_profile_ev_charging",
            "generic_switch": "input_text.cronostar_active_profile_generic_switch",
            "generic_kwh": "input_text.cronostar_active_profile_generic_kwh",
            "generic_temperature": "input_text.cronostar_active_profile_generic_temperature",
        }
        
        entity_id = profile_entities.get(preset_type)
        if not entity_id:
            return None
        
        state = self.hass.states.get(entity_id)
        if not state or state.state in ("unknown", "unavailable", ""):
            return None
        
        return state.state
    
    async def _collect_schedule(self, preset_type: str) -> list | None:
        """Collect current schedule values from input_numbers."""
        # Get prefix for this preset
        from ..utils.prefix_normalizer import PRESETS_CONFIG
        
        config = PRESETS_CONFIG.get(preset_type, {})
        prefix = config.get("global_prefix", config.get("entity_prefix", "cronostar_"))
        
        schedule = []
        for hour in range(24):
            entity_id = f"input_number.{prefix}{hour:02d}"
            state = self.hass.states.get(entity_id)
            
            if not state or state.state in ("unknown", "unavailable"):
                _LOGGER.warning("Entity unavailable: %s", entity_id)
                return None
            
            try:
                value = float(state.state)
                schedule.append({"hour": hour, "value": value})
            except (ValueError, TypeError):
                _LOGGER.error("Invalid value for %s: %s", entity_id, state.state)
                return None
        
        return schedule
    
    def _detect_preset_type(self, entity_id: str) -> str | None:
        """Detect preset type from entity_id."""
        from ..utils.prefix_normalizer import PRESETS_CONFIG
        
        for preset_type, config in PRESETS_CONFIG.items():
            prefix = config.get("global_prefix", config.get("entity_prefix", ""))
            if entity_id.startswith(f"input_number.{prefix}"):
                return preset_type
        
        return None
    
    def force_save(self, preset_type: str):
        """Force immediate save for a preset (bypass debouncing)."""
        _LOGGER.info("Force save requested for %s", preset_type)
        
        # Cancel existing task
        if preset_type in self._save_tasks:
            task = self._save_tasks[preset_type]
            if not task.done():
                task.cancel()
        
        # Reset debounce timer
        self._last_save.pop(preset_type, None)
        
        # Trigger immediate save
        self._save_tasks[preset_type] = asyncio.create_task(self._debounced_save(preset_type))
