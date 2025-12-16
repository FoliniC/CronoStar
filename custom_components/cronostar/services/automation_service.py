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
        allow_max = call.data.get("allow_max_value", False)
        entity_prefix = call.data.get("entity_prefix")
        global_prefix = call.data.get("global_prefix")
        
        if not all((target_entity, preset_type)):
            return
        
        canonical = normalize_preset_type(preset_type)
        
        # New Logic: Read from the single current_value_entity
        config = PRESETS_CONFIG.get(canonical, {})
        
        # Determine which prefix to use
        used_prefix = normalize_prefix(
            global_prefix or entity_prefix or 
            config.get("entity_prefix", "cronostar_")
        )
        
        # Construct dynamic entity ID
        current_value_entity = f"input_number.{used_prefix}current"
        
        if not current_value_entity:
            _LOGGER.warning("Could not determine current_value_entity for preset %s", canonical)
            return
            
        state = self.hass.states.get(current_value_entity)
        # Fallback to static config if dynamic one missing (backward compat)
        if not state:
             static_entity = config.get("current_value_entity")
             if static_entity and static_entity != current_value_entity:
                 _LOGGER.warning(
                     "Dynamic entity %s not found. Falling back to default %s. "
                     "Check if you reloaded YAML after creating helpers.", 
                     current_value_entity, static_entity
                 )
                 state = self.hass.states.get(static_entity)
                 if state:
                     current_value_entity = static_entity

        if not state or state.state in ("unknown", "unavailable"):
            _LOGGER.warning("Current value entity not available: %s", current_value_entity)
            # Optional: Force a recalculation via scheduler here if needed?
            # For now, just warn.
            return
        
        try:
            target_value = float(state.state)
            max_value = state.attributes.get("max")
        except (ValueError, TypeError):
            _LOGGER.warning("Invalid state value for %s", current_value_entity)
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
            current_value_entity,
            target_entity
        )
