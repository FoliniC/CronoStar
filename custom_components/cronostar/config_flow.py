"""Config flow for CronoStar.

Provides:
- Component installation (single instance) to set up global services and card resources.
- Global configuration (Logging).
"""

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    CONF_LOGGING_ENABLED,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class CronoStarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for CronoStar component."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Entry point: choose installation type or proceed with component install."""
        # Check if the global component is already installed
        # We only allow one instance of the global component (CronoStar Backend)
        # But we must allow creating controllers via specific flow or if invoked programmatically
        # The check here prevents USER from adding global component twice via UI.
        
        # Check if existing entries are GLOBAL components
        globals = [e for e in self._async_current_entries() if e.data.get("component_installed")]
        if globals:
            return self.async_abort(reason="single_instance_allowed")

        return await self.async_step_install_component(user_input)

    async def async_step_create_controller(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Programmatic entry point to create a controller."""
        if user_input is None:
            return self.async_abort(reason="no_input")

        # Validate unique ID based on prefix if provided, or name
        uid = user_input.get("global_prefix") or f"cronostar_controller_{user_input['name']}"
        await self.async_set_unique_id(uid)
        self._abort_if_unique_id_configured()

        return self.async_create_entry(
            title=user_input["name"],
            data=user_input,
        )

    async def async_step_install_component(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Install the global component (single instance)."""
        
        if user_input is not None:
            # Add marker that this is the global component
            data = {
                "component_installed": True,
                CONF_LOGGING_ENABLED: user_input.get(CONF_LOGGING_ENABLED, False)
            }
            return self.async_create_entry(title="CronoStar", data=data)

        return self.async_show_form(
            step_id="install_component",
            data_schema=vol.Schema({
                vol.Optional(CONF_LOGGING_ENABLED, default=False): bool
            }),
            description_placeholders={
                "info": (
                    "This will install the CronoStar integration.\n\n"
                    "Configuration of controllers and schedules is done via the CronoStar Lovelace Card."
                )
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return CronoStarOptionsFlow(config_entry)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Handle reconfiguration of the integration."""
        entry = self.hass.config_entries.async_get_entry(self.context["entry_id"])

        # If it's the global component, delegate to options or just show info
        if entry.data.get("component_installed"):
             # Global component usually only has options, but reconfigure could act as options shortcut
             # For now, just show the logging option again as "reconfigure"
             if user_input is not None:
                return self.async_update_reload_and_abort(
                    entry, data={**entry.data, **user_input}
                )
             
             return self.async_show_form(
                step_id="reconfigure",
                data_schema=vol.Schema({
                    vol.Optional(CONF_LOGGING_ENABLED, default=entry.data.get(CONF_LOGGING_ENABLED, False)): bool
                }),
                description_placeholders={"info": "Reconfigure Global Settings"},
            )

        # For Controllers
        from .const import CONF_TARGET_ENTITY, CONF_NAME
        
        if user_input is not None:
            # Update entry
            new_data = {**entry.data, **user_input}
            return self.async_update_reload_and_abort(entry, data=new_data)

        # Show form with current values
        schema = vol.Schema({
            vol.Required(CONF_NAME, default=entry.data.get(CONF_NAME, entry.title)): str,
            vol.Required(CONF_TARGET_ENTITY, default=entry.data.get(CONF_TARGET_ENTITY)): str,
        })

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=schema,
            description_placeholders={"info": f"Reconfigure {entry.title}"},
        )


class CronoStarOptionsFlow(config_entries.OptionsFlow):
    """Handle options for CronoStar component."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage component options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # Get current logging state (check options first, then data)
        current_logging = self.config_entry.options.get(
            CONF_LOGGING_ENABLED, 
            self.config_entry.data.get(CONF_LOGGING_ENABLED, False)
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(CONF_LOGGING_ENABLED, default=current_logging): bool
            }),
        )