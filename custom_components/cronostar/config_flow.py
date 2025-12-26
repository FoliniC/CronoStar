"Config flow for CronoStar."

import logging
import os
import re
import shutil
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class CronoStarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for CronoStar."""

    VERSION = 1

    def __init__(self):
        """Initialize flow."""
        self._config_path = None
        self._packages_enabled = False
        self._automations_setup = "unknown"
        self._intro_notified = False
        self._automation_notice_sent = False

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        """Initial step: inform changes and ask confirmation, then proceed."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        # First show intro and ask to continue
        if user_input is None:
            # Analyze configuration so we can tailor the note
            self._config_path = self.hass.config.path("configuration.yaml")
            await self.hass.async_add_executor_job(self._analyze_configuration)

            automation_note = ""
            if self._automations_setup == "other":
                automation_note = (
                    "Note: If your automations are inline in configuration.yaml or included as a single file (e.g. 'automation: !include automations.yaml'), "
                    "CronoStar will not modify configuration.yaml. It will create the 'automations/' folder, but you must either switch to "
                    "'automation: !include_dir_merge_list automations' or manually merge CronoStar automation entries into your existing setup."
                )

            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema({vol.Required("confirm", default=True): bool}),
                description_placeholders={"automation_note": automation_note},
            )

        # User responded
        if not user_input.get("confirm"):
            return self.async_abort(reason="aborted_by_user")

        # Proceed with analysis and subsequent steps
        self._config_path = self.hass.config.path("configuration.yaml")
        await self.hass.async_add_executor_job(self._analyze_configuration)

        if not self._packages_enabled:
            return await self.async_step_enable_packages()

        return await self.async_step_confirm_setup()

    def _analyze_configuration(self):
        """Analyze configuration.yaml for packages and automations."""
        if not os.path.exists(self._config_path):
            return

        with open(self._config_path, encoding="utf-8") as f:
            content = f.read()

        # Verifica packages
        # Cerca 'packages: !include_dir_named packages' o simili
        self._packages_enabled = bool(re.search(r"packages:\s*!include_dir_named", content))

        # Verifica automazioni
        if "automation: !include_dir_merge_list automations" in content:
            self._automations_setup = "ok"
        elif "automation:" not in content:
            self._automations_setup = "missing"
        else:
            self._automations_setup = "other"

    async def async_step_enable_packages(self, user_input=None):
        """Step to ask user to enable packages."""
        errors = {}
        if user_input is not None:
            if user_input.get("confirm"):
                await self.hass.async_add_executor_job(self._enable_packages_in_yaml)
                await self.hass.async_add_executor_job(self._analyze_configuration)
                return await self.async_step_confirm_setup()
            else:
                errors["base"] = "packages_required"

        return self.async_show_form(
            step_id="enable_packages",
            data_schema=vol.Schema(
                {
                    vol.Required("confirm", default=True): bool,
                }
            ),
            errors=errors,
        )

    def _enable_packages_in_yaml(self):
        """Modify configuration.yaml to enable packages."""
        with open(self._config_path, encoding="utf-8") as f:
            lines = f.readlines()

        new_lines = []
        ha_section_found = False
        packages_added = False

        for line in lines:
            new_lines.append(line)
            if line.strip().startswith("homeassistant:"):
                ha_section_found = True
                # Aggiungiamo i package subito sotto homeassistant:
                new_lines.append("  packages: !include_dir_named packages\n")
                packages_added = True

        if not ha_section_found:
            new_lines.extend(
                [
                "\nhomeassistant:\n",
                "  packages: !include_dir_named packages\n",
                ]
            )
        elif not packages_added:
            # Se homeassistant: esiste ma non abbiamo trovato il punto giusto, lo aggiungiamo in fondo
            new_lines.append("  packages: !include_dir_named packages\n")

        with open(self._config_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

    async def async_step_confirm_setup(self, user_input=None):
        """Final confirmation and file operations."""
        if user_input is not None:
            await self.hass.async_add_executor_job(self._perform_file_operations)
            # Inform the user how to add the Lovelace card after setup
            try:
                await self.hass.services.async_call(
                    "persistent_notification",
                    "create",
                    {
                        "title": "CronoStar",
                        "message": (
                            "Created configuration for CronoStar. "
                            "Add the 'cronostar' card to a dashboard (Lovelace) in the usual Home Assistant way."
                        ),
                        "notification_id": "cronostar_setup_info",
                    },
                    blocking=False,
                )
            except Exception:  # best-effort; continue even if notification fails
                pass
            return self.async_create_entry(title="CronoStar", data={})

        # If automations are configured in a different style, proactively inform the user
        if self._automations_setup == "other" and not self._automation_notice_sent:
            try:
                await self.hass.services.async_call(
                    "persistent_notification",
                    "create",
                    {
                        "title": "CronoStar",
                        "message": (
                            "Detected automations configured inline or via a single include. "
                            "CronoStar will not change configuration.yaml. It created the 'automations/' folder for its files, "
                            "but you must either switch to 'automation: !include_dir_merge_list automations' or manually merge CronoStar "
                            "automation entries into your existing setup."
                        ),
                        "notification_id": "cronostar_automation_notice",
                    },
                    blocking=False,
                )
            except Exception:
                pass
            self._automation_notice_sent = True

        return self.async_show_form(step_id="confirm_setup", description_placeholders={"automation_status": self._automations_setup})

    def _perform_file_operations(self):
        """Create folders and copy initial package."""
        # 1. Cartella packages e cronostar_package.yaml
        pkg_dir = self.hass.config.path("packages")
        os.makedirs(pkg_dir, exist_ok=True)

        src_pkg = self.hass.config.path("custom_components/cronostar/packages/cronostar_package.yaml")
        # Se non lo trova nel componente (magari installato via HACS), prova nel root del progetto
        if not os.path.exists(src_pkg):
            src_pkg = self.hass.config.path("packages/cronostar_package.yaml")

        if os.path.exists(src_pkg):
            shutil.copy(src_pkg, os.path.join(pkg_dir, "cronostar_package.yaml"))

        # 2. Gestione Automazioni
        auto_dir = self.hass.config.path("automations")
        if self._automations_setup == "missing":
            os.makedirs(auto_dir, exist_ok=True)
            with open(self._config_path, "a", encoding="utf-8") as f:
                f.write("\nautomation: !include_dir_merge_list automations\n")
        elif self._automations_setup == "other":
            # Caso in cui esiste già un'altra direttiva (es. !include automations.yaml)
            # Creiamo comunque la cartella per i file di CronoStar se non esiste
            os.makedirs(auto_dir, exist_ok=True)
            _LOGGER.warning(
                "CronoStar: automation folder created but configuration.yaml uses a different include style. Manual check required."
            )

        # 3. Cartella profili
        os.makedirs(self.hass.config.path("cronostar/profiles"), exist_ok=True)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        # Return options flow with the config entry for maximum compatibility across HA versions.
        _ = config_entry
        return CronoStarOptionsFlow(config_entry)


class CronoStarOptionsFlow(config_entries.OptionsFlow):
    """Handle options."""

    def __init__(self, config_entry: object | None = None) -> None:
        """Accept optional config_entry for compatibility across HA versions."""
        # Do not assign to self.config_entry directly; some HA versions expose it as read-only.
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        "logging_enabled",
                        default=(
                            (getattr(self, "config_entry", None) or self._config_entry).options.get("logging_enabled", True)
                            if (getattr(self, "config_entry", None) or self._config_entry)
                            else True
                        ),
                    ): bool,
                }
            ),
        )
