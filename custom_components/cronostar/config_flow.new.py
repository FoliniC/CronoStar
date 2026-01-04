"""Config flow for CronoStar.

Provides two flows:
- Component installation (single instance) to set up global services and card resources.
- Controller setup flow to create entities managed by this integration.
"""

import logging

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_GLOBAL_PREFIX, CONF_LOGGING_ENABLED, CONF_NAME, CONF_PRESET, CONF_TARGET_ENTITY, DOMAIN

_LOGGER = logging.getLogger(__name__)


class CronoStarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for CronoStar component and controller entries."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Entry point: choose installation type or proceed with component install."""
        # If component not yet installed, offer install first
        if not any(e.data.get("component_installed") for e in self._async_current_entries()):
            return await self.async_step_install_component()
        # Otherwise start controller setup
        return await self.async_step_controller()

    async def async_step_install_component(self, user_input=None):
        """Install the global component (single instance)."""
        if any(e.data.get("component_installed") for e in self._async_current_entries()):
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="CronoStar", data={"component_installed": True})

        return self.async_show_form(
            step_id="install_component",
            data_schema=vol.Schema({}),
            description_placeholders={
                "info": (
                    "This will install the CronoStar component and register the Lovelace card.\n\n"
                    "After installation, use this flow again to add controllers and entities."
                )
            },
        )

    async def async_step_controller(self, user_input=None):
        """Create a controller entry with required fields."""
        schema = vol.Schema(
            {
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_PRESET, default="thermostat"): vol.In(
                    ["thermostat", "ev_charging", "generic_kwh", "generic_temperature", "generic_switch", "cover"]
                ),
                vol.Required(CONF_TARGET_ENTITY): str,
                vol.Optional(CONF_GLOBAL_PREFIX, default="cronostar_"): str,
                vol.Optional(CONF_LOGGING_ENABLED, default=False): bool,
            }
        )

        if user_input is not None:
            # Basic validation: ensure target entity looks like domain.object_id
            if "." not in user_input[CONF_TARGET_ENTITY]:
                return self.async_show_form(
                    step_id="controller",
                    data_schema=schema,
                    errors={CONF_TARGET_ENTITY: "invalid"},
                )

            title = f"CronoStar: {user_input.get(CONF_NAME)}"
            return self.async_create_entry(title=title, data=user_input)

        # Show selector for better UX where available (HA will render text if not supported)
        return self.async_show_form(step_id="controller", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """No options needed for component-level installation."""
        return CronoStarOptionsFlow(config_entry)


class CronoStarOptionsFlow(config_entries.OptionsFlow):
    """Handle options for CronoStar component."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage component options (currently none needed)."""
        if user_input is not None:
            return self.async_create_entry(title="", data={})

        # Placeholder for future global options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({}),
            description_placeholders={"info": "No global options available. Controller configuration is done via Lovelace cards."},
        )
