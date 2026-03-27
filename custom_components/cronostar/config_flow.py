"""Config flow for CronoStar.

Provides two flows:
- Component installation (single instance) to set up global services and card resources.
- Controller setup flow to create entities managed by this integration.
"""

import logging

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.selector import selector

from .const import (
    CONF_ALLOW_MAX_VALUE,
    CONF_FRONTEND_VERSION_CHECK,
    CONF_GLOBAL_PREFIX,
    CONF_LANGUAGE,
    CONF_LOGGING_ENABLED,
    CONF_MAX_VALUE,
    CONF_MIN_VALUE,
    CONF_NAME,
    CONF_PRESET,
    CONF_STEP_VALUE,
    CONF_TARGET_ENTITY,
    CONF_TITLE,
    CONF_UNIT_OF_MEASUREMENT,
    CONF_Y_AXIS_LABEL,
    DOMAIN,
)
from .utils.prefix_normalizer import PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)


class CronoStarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for CronoStar component and controller entries."""

    VERSION = 1

    def __init__(self):
        """Initialize the config flow."""
        self._controller_data = {}

    async def async_step_create_controller(self, user_input=None):
        """Step to create a controller programmatically (e.g. from service)."""
        if user_input is not None:
            # Check if entry already exists for this prefix
            prefix = user_input.get(CONF_GLOBAL_PREFIX)
            for entry in self._async_current_entries():
                if entry.data.get(CONF_GLOBAL_PREFIX) == prefix:
                    return self.async_abort(reason="already_configured")

            name = user_input.get(CONF_NAME, "New Controller")
            title = f"CronoStar: {name}"
            # Ensure it doesn't get version tag yet, __init__ will add it
            return self.async_create_entry(title=title, data=user_input)

        return self.async_abort(reason="unknown")

    async def async_step_reconfigure(self, user_input=None):
        """Handle reconfiguration of a controller entry."""
        entry_id = self.context.get("entry_id")
        entry = self.hass.config_entries.async_get_entry(entry_id)

        if user_input is not None:
            # Update the entry
            new_data = {**entry.data, **user_input}
            return self.async_update_reload_and_abort(entry, data=new_data)

        # Pre-fill with current values
        if entry.data.get("component_installed"):
            schema = vol.Schema({vol.Optional(CONF_LOGGING_ENABLED, default=entry.data.get(CONF_LOGGING_ENABLED, False)): bool})
        else:
            schema = self._get_controller_schema(entry.data)
            
        return self.async_show_form(step_id="reconfigure", data_schema=schema)

    async def async_step_user(self, user_input=None):
        """Entry point: choose installation type or proceed with component install."""
        # If component not yet installed, offer install first
        if not any(e.data.get("component_installed") for e in self._async_current_entries()):
            return await self.async_step_install_component()

        # Otherwise show menu for further actions
        return self.async_show_menu(step_id="user", menu_options=["controller"])

    async def async_step_install_component(self, user_input=None):
        """Install the global component (single instance)."""
        if any(e.data.get("component_installed") for e in self._async_current_entries()):
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            # Added version tag to label
            data = {"component_installed": True}
            data.update(user_input)
            return self.async_create_entry(title="CronoStar [v5.9.1]", data=data)

        return self.async_show_form(
            step_id="install_component",
            data_schema=vol.Schema({vol.Optional(CONF_LOGGING_ENABLED, default=False): bool}),
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
            # FORCE OPEN NEXT STEP
            return await self.async_step_card_config()

        return self.async_show_form(step_id="controller", data_schema=self._get_controller_schema())

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
            }
        )

    async def async_step_card_config(self, user_input=None):
        """Step 2: Configure CronoStar card parameters."""
        preset = self._controller_data.get(CONF_PRESET, "thermostat")
        defaults = PRESETS_CONFIG.get(preset, PRESETS_CONFIG["thermostat"])

        if user_input is not None:
            self._controller_data.update(user_input)
            # ✅ CORRECT TRANSITION: Move to dashboard selection step
            return await self.async_step_dashboard()

        # Pre-fill with preset defaults
        schema = vol.Schema(
            {
                vol.Optional(CONF_TITLE, default=defaults.get("title", "")): str,
                vol.Required(CONF_MIN_VALUE, default=float(defaults.get("min_value", 0))): vol.Coerce(float),
                vol.Required(CONF_MAX_VALUE, default=float(defaults.get("max_value", 100))): vol.Coerce(float),
                vol.Required(CONF_STEP_VALUE, default=float(defaults.get("step_value", 1))): vol.Coerce(float),
                vol.Optional(CONF_UNIT_OF_MEASUREMENT, default=defaults.get("unit", "")): str,
                vol.Optional(CONF_Y_AXIS_LABEL, default=defaults.get("y_axis_label", "")): str,
                vol.Optional(CONF_ALLOW_MAX_VALUE, default=defaults.get("allow_max_value", False)): bool,
                vol.Optional(CONF_LOGGING_ENABLED, default=self._controller_data.get(CONF_LOGGING_ENABLED, False)): bool,
                vol.Optional(CONF_LANGUAGE, default=self._controller_data.get(CONF_LANGUAGE, "default")): selector(
                    {
                        "select": {
                            "options": [
                                {"value": "default", "label": "System Default"},
                                {"value": "en", "label": "English"},
                                {"value": "it", "label": "Italiano"},
                            ],
                            "mode": "dropdown",
                        }
                    }
                ),
            }
        )

        return self.async_show_form(
            step_id="card_config",
            data_schema=schema,
            description_placeholders={
                "preset": preset,
                "tag": "[PRESET_CONFIG_ACTIVE]",  # Tag to confirm preset config is open
            },
        )

    async def async_step_dashboard(self, user_input=None):
        """Step 3: Choose dashboard to add the card."""
        if user_input is not None:
            if user_input.get("add_to_dashboard") and user_input.get("dashboard_path"):
                self._controller_data["dashboard_path"] = user_input["dashboard_path"]
                self._controller_data["dashboard_view"] = user_input.get("dashboard_view", 0)

            return await self.async_step_success()

        # Get list of dashboards
        dashboards = [{"value": "none", "label": "Main Dashboard (Overview)"}]
        try:
            # Import Lovelace constants to get the data key
            from homeassistant.components.lovelace.const import LOVELACE_DATA

            if LOVELACE_DATA in self.hass.data:
                lovelace_data = self.hass.data[LOVELACE_DATA]
                if hasattr(lovelace_data, "dashboards"):
                    for url_path, dash in lovelace_data.dashboards.items():
                        title = getattr(dash, "title", url_path)
                        dashboards.append({"value": url_path, "label": f"{title} ({url_path})"})
        except Exception as e:
            _LOGGER.warning("Error fetching dashboards: %s", e)

        schema = vol.Schema(
            {
                vol.Optional("add_to_dashboard", default=False): bool,
                vol.Optional("dashboard_path", default="none"): selector({"select": {"options": dashboards, "mode": "dropdown"}}),
                vol.Optional("dashboard_view", default=0): vol.Coerce(int),
            }
        )

        return self.async_show_form(
            step_id="dashboard", data_schema=schema, description_placeholders={"info": "Choose if and where to add the CronoStar card automatically."}
        )

    async def async_step_success(self, user_input=None):
        """Final Step: Success confirmation dialog."""
        if user_input is not None:
            title = f"CronoStar: {self._controller_data.get(CONF_NAME)} [v5.9.1]"

            # Handle dashboard addition
            if self._controller_data.get("dashboard_path"):
                await self._async_add_card_to_dashboard()

            return self.async_create_entry(title=title, data=self._controller_data)

        return self.async_show_form(
            step_id="success",
            data_schema=vol.Schema({}),
            description_placeholders={
                "name": self._controller_data.get(CONF_NAME),
                "confirm_tag": "[MODIFICA_ESEGUITA_SUCCESSO]",  # Tag for success confirmation
            },
        )

    async def _async_add_card_to_dashboard(self):
        """Helper to add card to selected dashboard."""
        try:
            path = self._controller_data.get("dashboard_path")
            if path == "none":
                path = None

            view_index = self._controller_data.get("dashboard_view", 0)

            # 1. Get Lovelace config
            from homeassistant.components.lovelace import async_get_config, async_save_config

            config = await async_get_config(self.hass, path)

            # 2. Build Card JSON
            card_json = {
                "type": "custom:cronostar-card",
                "target_entity": self._controller_data.get(CONF_TARGET_ENTITY),
                "global_prefix": self._controller_data.get(CONF_GLOBAL_PREFIX),
                "preset_type": self._controller_data.get(CONF_PRESET),
                "title": self._controller_data.get(CONF_TITLE, self._controller_data.get(CONF_NAME)),
                "min_value": self._controller_data.get(CONF_MIN_VALUE),
                "max_value": self._controller_data.get(CONF_MAX_VALUE),
                "step_value": self._controller_data.get(CONF_STEP_VALUE),
                "unit_of_measurement": self._controller_data.get(CONF_UNIT_OF_MEASUREMENT),
                "y_axis_label": self._controller_data.get(CONF_Y_AXIS_LABEL),
                "allow_max_value": self._controller_data.get(CONF_ALLOW_MAX_VALUE),
            }

            # 3. Add to view
            if "views" in config and len(config["views"]) > view_index:
                view = config["views"][view_index]
                if "cards" not in view:
                    view["cards"] = []
                view["cards"].append(card_json)

                # 4. Save
                await async_save_config(self.hass, path, config)
                _LOGGER.info("Successfully added CronoStar card to dashboard: %s", path)
        except Exception as e:
            _LOGGER.error("Failed to add card to dashboard: %s", e)

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
        """Step 1: Manage component basic options (Full Wizard Style)."""
        _LOGGER.debug("[OptionsFlow] async_step_init called. User input: %s", user_input)

        # 1. Global Component Options (Global Config Entry)
        if self._config_entry.data.get("component_installed"):
            if user_input is not None:
                # Update global options
                return self.async_create_entry(title="", data=user_input)

            # Load current global settings
            current_logging = self._config_entry.options.get(CONF_LOGGING_ENABLED, False)
            current_language = self._config_entry.options.get(CONF_LANGUAGE, "default")

            return self.async_show_form(
                step_id="init",
                data_schema=vol.Schema(
                    {
                        vol.Optional(CONF_LOGGING_ENABLED, default=current_logging): bool,
                        vol.Optional(CONF_LANGUAGE, default=current_language): selector(
                            {
                                "select": {
                                    "options": [
                                        {"value": "default", "label": "System Default"},
                                        {"value": "en", "label": "English"},
                                        {"value": "it", "label": "Italiano"},
                                    ],
                                    "mode": "dropdown",
                                }
                            }
                        ),
                    }
                ),
                description_placeholders={"info": "Configure global defaults for new CronoStar instances."},
            )

        # 2. Controller Options (Entity Config Entry)
        if user_input is not None:
            self._options_data.update(user_input)
            _LOGGER.debug("[OptionsFlow] init step submitted. Data so far: %s", self._options_data)
            # FORCE OPEN PRESET CONFIG
            return await self.async_step_card_config()

        # Schema with current values (Wizard Style Step 1)
        current_name = self._config_entry.data.get(CONF_NAME, self._config_entry.title)
        import re

        current_name = re.sub(r"\s*\[v\d+\.\d+\.\d+\]", "", current_name)
        if current_name.startswith("CronoStar: "):
            current_name = current_name[len("CronoStar: ") :]

        current_preset = self._config_entry.data.get(CONF_PRESET, "thermostat")
        current_target = self._config_entry.data.get(CONF_TARGET_ENTITY, "")
        current_prefix = self._config_entry.data.get(CONF_GLOBAL_PREFIX, "cronostar_")

        schema = vol.Schema(
            {
                vol.Required(CONF_NAME, default=current_name): str,
                vol.Required(CONF_PRESET, default=current_preset): vol.In(
                    ["thermostat", "ev_charging", "generic_kwh", "generic_temperature", "generic_switch", "cover"]
                ),
                vol.Required(CONF_TARGET_ENTITY, default=current_target): str,
                vol.Optional(CONF_GLOBAL_PREFIX, default=current_prefix): str,
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            description_placeholders={"info": f"Configure options for controller '{self._config_entry.title}'"},
        )

    async def async_step_card_config(self, user_input=None):
        """Step 2: Configure card parameters in options flow."""
        _LOGGER.debug("[OptionsFlow] async_step_card_config called. User input: %s", user_input)

        if user_input is not None:
            self._options_data.update(user_input)
            # Move to success confirmation
            return await self.async_step_success()

        # Use current values from entry or defaults from presets if entry has none
        preset = self._options_data.get(CONF_PRESET) or self._config_entry.data.get(CONF_PRESET, "thermostat")
        defaults = PRESETS_CONFIG.get(preset, PRESETS_CONFIG["thermostat"])

        current_title = self._config_entry.data.get(CONF_TITLE, defaults.get("title", ""))
        current_min = self._config_entry.data.get(CONF_MIN_VALUE, defaults.get("min_value", 0.0))
        current_max = self._config_entry.data.get(CONF_MAX_VALUE, defaults.get("max_value", 100.0))
        current_step = self._config_entry.data.get(CONF_STEP_VALUE, defaults.get("step_value", 1.0))
        current_unit = self._config_entry.data.get(CONF_UNIT_OF_MEASUREMENT, defaults.get("unit", ""))
        current_y_label = self._config_entry.data.get(CONF_Y_AXIS_LABEL, defaults.get("y_axis_label", ""))
        current_allow_max = self._config_entry.data.get(CONF_ALLOW_MAX_VALUE, defaults.get("allow_max_value", False))

        current_logging = self._config_entry.data.get(CONF_LOGGING_ENABLED, False)
        current_version_check = self._config_entry.data.get(CONF_FRONTEND_VERSION_CHECK, True)
        current_language = self._config_entry.data.get(CONF_LANGUAGE, "default")

        schema = vol.Schema(
            {
                vol.Optional(CONF_TITLE, default=current_title): str,
                vol.Required(CONF_MIN_VALUE, default=float(current_min)): vol.Coerce(float),
                vol.Required(CONF_MAX_VALUE, default=float(current_max)): vol.Coerce(float),
                vol.Required(CONF_STEP_VALUE, default=float(current_step)): vol.Coerce(float),
                vol.Optional(CONF_UNIT_OF_MEASUREMENT, default=current_unit): str,
                vol.Optional(CONF_Y_AXIS_LABEL, default=current_y_label): str,
                vol.Optional(CONF_ALLOW_MAX_VALUE, default=current_allow_max): bool,
                vol.Optional(CONF_LOGGING_ENABLED, default=current_logging): bool,
                vol.Optional(CONF_FRONTEND_VERSION_CHECK, default=current_version_check): bool,
                vol.Optional(CONF_LANGUAGE, default=current_language): selector(
                    {
                        "select": {
                            "options": [
                                {"value": "default", "label": "System Default"},
                                {"value": "en", "label": "English"},
                                {"value": "it", "label": "Italiano"},
                            ],
                            "mode": "dropdown",
                        }
                    }
                ),
            }
        )

        return self.async_show_form(
            step_id="card_config",
            data_schema=schema,
            description_placeholders={
                "preset": preset,
                "tag": "[PRESET_CONFIG_ACTIVE]",  # Tag to confirm preset config is open
            },
        )

    async def async_step_success(self, user_input=None):
        """Final Step: Success confirmation dialog in options flow."""
        _LOGGER.debug("[OptionsFlow] async_step_success called. User input: %s", user_input)

        if user_input is not None:
            # Merge into entry data and reload
            new_data = {**self._config_entry.data, **self._options_data}

            # Use name from options_data to build title
            new_name = self._options_data.get(CONF_NAME, self._config_entry.title)
            import re

            clean_name = re.sub(r"\s*\[v\d+\.\d+\.\d+\]", "", new_name)
            if clean_name.startswith("CronoStar: "):
                clean_name = clean_name[len("CronoStar: ") :]

            new_title = f"CronoStar: {clean_name} [v5.9.1]"

            _LOGGER.debug("[OptionsFlow] Updating entry. Title: %s, Data: %s", new_title, new_data)

            self.hass.config_entries.async_update_entry(self._config_entry, title=new_title, data=new_data)
            await self.hass.config_entries.async_reload(self._config_entry.entry_id)

            return self.async_create_entry(title="", data={})

        return self.async_show_form(step_id="success", data_schema=vol.Schema({}), description_placeholders={"confirm_tag": "[MODIFICA_ESEGUITA_SUCCESSO]"})
