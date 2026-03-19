"""Config flow for CronoStar.

Provides two flows:
- Component installation (single instance) to set up global services and card resources.
- Controller setup flow to create entities managed by this integration.
"""

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback, HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.selector import selector

from .const import (
    CONF_GLOBAL_PREFIX,
    CONF_LANGUAGE,
    CONF_LOGGING_ENABLED,
    CONF_NAME,
    CONF_PRESET,
    CONF_TARGET_ENTITY,
    DOMAIN,
    CONF_TITLE,
    CONF_MIN_VALUE,
    CONF_MAX_VALUE,
    CONF_STEP_VALUE,
    CONF_UNIT_OF_MEASUREMENT,
    CONF_Y_AXIS_LABEL,
    CONF_ALLOW_MAX_VALUE,
)
from .utils.prefix_normalizer import PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)


class CronoStarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for CronoStar component and controller entries."""

    VERSION = 1

    def __init__(self):
        """Initialize the config flow."""
        self._controller_data = {}

    async def async_step_user(self, user_input=None):
        """Entry point: choose installation type or proceed with component install."""
        # If component not yet installed, offer install first
        if not any(e.data.get("component_installed") for e in self._async_current_entries()):
            return await self.async_step_install_component()

        # Otherwise show menu for further actions
        return self.async_show_menu(
            step_id="user",
            menu_options=["controller"]
        )

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
        """Step 1: Create a controller entry with basic fields."""
        if user_input is not None:
            # Basic validation: ensure target entity looks like domain.object_id
            if "." not in user_input[CONF_TARGET_ENTITY]:
                return self.async_show_form(
                    step_id="controller",
                    data_schema=self._get_controller_schema(user_input),
                    errors={CONF_TARGET_ENTITY: "invalid"},
                )

            self._controller_data.update(user_input)
            return await self.async_step_card_config()

        return self.async_show_form(
            step_id="controller", 
            data_schema=self._get_controller_schema()
        )

    def _get_controller_schema(self, defaults=None):
        """Return schema for controller basic info."""
        if defaults is None:
            defaults = {}
        
        return vol.Schema(
            {
                vol.Required(CONF_NAME, default=defaults.get(CONF_NAME)): str,
                vol.Required(CONF_PRESET, default=defaults.get(CONF_PRESET, "thermostat")): vol.In(
                    ["thermostat", "ev_charging", "generic_kwh", "generic_temperature", "generic_switch", "cover"]
                ),
                vol.Required(CONF_TARGET_ENTITY, default=defaults.get(CONF_TARGET_ENTITY)): str,
                vol.Optional(CONF_GLOBAL_PREFIX, default=defaults.get(CONF_GLOBAL_PREFIX, "cronostar_")): str,
                vol.Optional(CONF_LOGGING_ENABLED, default=defaults.get(CONF_LOGGING_ENABLED, False)): bool,
            }
        )

    async def async_step_card_config(self, user_input=None):
        """Step 2: Configure CronoStar card parameters."""
        preset = self._controller_data.get(CONF_PRESET, "thermostat")
        defaults = PRESETS_CONFIG.get(preset, PRESETS_CONFIG["thermostat"])

        if user_input is not None:
            self._controller_data.update(user_input)
            title = f"CronoStar: {self._controller_data.get(CONF_NAME)}"
            return self.async_create_entry(title=title, data=self._controller_data)

        # Pre-fill with preset defaults
        schema = vol.Schema({
            vol.Optional(CONF_TITLE, default=defaults.get("title", "")): str,
            vol.Required(CONF_MIN_VALUE, default=float(defaults.get("min_value", 0))): vol.Coerce(float),
            vol.Required(CONF_MAX_VALUE, default=float(defaults.get("max_value", 100))): vol.Coerce(float),
            vol.Required(CONF_STEP_VALUE, default=float(defaults.get("step_value", 1))): vol.Coerce(float),
            vol.Optional(CONF_UNIT_OF_MEASUREMENT, default=defaults.get("unit", "")): str,
            vol.Optional(CONF_Y_AXIS_LABEL, default=defaults.get("y_axis_label", "")): str,
            vol.Optional(CONF_ALLOW_MAX_VALUE, default=defaults.get("allow_max_value", False)): bool,
        })

        return self.async_show_form(
            step_id="card_config",
            data_schema=schema,
            description_placeholders={
                "preset": preset
            }
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return CronoStarOptionsFlow(config_entry)


class CronoStarOptionsFlow(config_entries.OptionsFlow):
    """Handle options for CronoStar component."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self._config_entry = config_entry
        self._options_data = {}

    async def async_step_init(self, user_input=None):
        """Step 1: Manage component basic options."""
        # Check if this is the main component entry (no options currently)
        if self._config_entry.data.get("component_installed"):
            return self.async_show_form(
                step_id="init",
                data_schema=vol.Schema({}),
                description_placeholders={"info": "Global component options are not yet available."},
            )

        # It's a controller entry
        if user_input is not None:
            self._options_data.update(user_input)
            return await self.async_step_card_config()

        # Schema with current values
        current_target = self._config_entry.data.get(CONF_TARGET_ENTITY, "")
        current_logging = self._config_entry.data.get(CONF_LOGGING_ENABLED, False)
        current_language = self._config_entry.data.get(CONF_LANGUAGE, "default")

        schema = vol.Schema(
            {
                vol.Required(CONF_TARGET_ENTITY, default=current_target): str,
                vol.Optional(CONF_LOGGING_ENABLED, default=current_logging): bool,
                vol.Optional(CONF_LANGUAGE, default=current_language): selector({
                    "select": {
                        "options": [
                            {"value": "default", "label": "System Default"},
                            {"value": "en", "label": "English"},
                            {"value": "it", "label": "Italiano"},
                        ],
                        "mode": "dropdown"
                    }
                }),
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            description_placeholders={
                "info": f"Configure basic options for controller '{self._config_entry.title}'"
            },
        )

    async def async_step_card_config(self, user_input=None):
        """Step 2: Configure card parameters in options flow."""
        if user_input is not None:
            self._options_data.update(user_input)
            
            # Merge into entry data and reload
            new_data = {**self._config_entry.data, **self._options_data}
            self.hass.config_entries.async_update_entry(self._config_entry, data=new_data)
            await self.hass.config_entries.async_reload(self._config_entry.entry_id)
            
            return self.async_create_entry(title="", data={})

        preset = self._config_entry.data.get(CONF_PRESET, "thermostat")
        current_title = self._config_entry.data.get(CONF_TITLE, "")
        current_min = self._config_entry.data.get(CONF_MIN_VALUE, 0.0)
        current_max = self._config_entry.data.get(CONF_MAX_VALUE, 100.0)
        current_step = self._config_entry.data.get(CONF_STEP_VALUE, 1.0)
        current_unit = self._config_entry.data.get(CONF_UNIT_OF_MEASUREMENT, "")
        current_y_label = self._config_entry.data.get(CONF_Y_AXIS_LABEL, "")
        current_allow_max = self._config_entry.data.get(CONF_ALLOW_MAX_VALUE, False)

        schema = vol.Schema(
            {
                vol.Optional(CONF_TITLE, default=current_title): str,
                vol.Required(CONF_MIN_VALUE, default=float(current_min)): vol.Coerce(float),
                vol.Required(CONF_MAX_VALUE, default=float(current_max)): vol.Coerce(float),
                vol.Required(CONF_STEP_VALUE, default=float(current_step)): vol.Coerce(float),
                vol.Optional(CONF_UNIT_OF_MEASUREMENT, default=current_unit): str,
                vol.Optional(CONF_Y_AXIS_LABEL, default=current_y_label): str,
                vol.Optional(CONF_ALLOW_MAX_VALUE, default=current_allow_max): bool,
            }
        )

        return self.async_show_form(
            step_id="card_config",
            data_schema=schema,
            description_placeholders={
                "preset": preset
            }
        )
