import logging

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.util import dt as dt_util

from ..utils.prefix_normalizer import normalize_preset_type, normalize_prefix, PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)

class AutomationService:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass

    async def apply_now(self, call: ServiceCall):
        """Apply current hour's scheduled value immediately."""
        target_entity = call.data.get("entity_id")
        preset_type = call.data.get("preset_type")
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        allow_max = call.data.get("allow_max_value", False)
        
        if not all((target_entity, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        current_hour = dt_util.now().hour
        
        # Determine which prefix to use
        used_prefix = normalize_prefix(
            global_prefix or entity_prefix or 
            PRESETS_CONFIG.get(canonical, {}).get("entity_prefix", "cronostar_")
        )
        
        # Build schedule entity ID
        hour_str = f"{current_hour:02d}"
        schedule_entity = f"input_number.{used_prefix}{hour_str}"
        
        state = self.hass.states.get(schedule_entity)
        if not state or state.state in ("unknown", "unavailable"):
            _LOGGER.warning("Schedule entity not available: %s", schedule_entity)
            return
        
        try:
            target_value = float(state.state)
            max_value = state.attributes.get("max")
        except (ValueError, TypeError):
            _LOGGER.warning("Invalid state value for %s", schedule_entity)
            return
        
        # Check for Max value
        if allow_max and max_value is not None and target_value >= max_value:
            _LOGGER.info(
                "apply_now: Max value detected for %s, deferring",
                target_entity
            )
            return
        
        # Apply value based on target entity domain
        domain = target_entity.split('.')[0]
        
        if domain == "climate":
            await self.hass.services.async_call(
                "climate",
                "set_temperature",
                {"entity_id": target_entity, "temperature": target_value}
            )
        elif domain == "number":
            await self.hass.services.async_call(
                "number",
                "set_value",
                {"entity_id": target_entity, "value": target_value}
            )
        elif domain == "switch":
            service = "turn_on" if int(target_value) == 1 else "turn_off"
            await self.hass.services.async_call(
                "switch",
                service,
                {"entity_id": target_entity}
            )
        
        _LOGGER.info(
            "Applied value %.2f from %s to %s",
            target_value,
            schedule_entity,
            target_entity
        )
