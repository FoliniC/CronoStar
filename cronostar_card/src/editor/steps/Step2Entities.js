import { html } from "lit";
import { getEffectivePrefix } from "../../utils/prefix_utils.js";

export class Step2Entities {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const effectivePrefix = getEffectivePrefix(this.editor._config);

    const hasEnabled = !!this.editor._config.enabled_entity;
    const enabledVal =
      this.editor._config.enabled_entity || `switch.${effectivePrefix}enabled`;

    const hasProfiles = !!this.editor._config.profiles_select_entity;
    const profilesVal =
      this.editor._config.profiles_select_entity ||
      `select.${effectivePrefix}current_profile`;

    return html`
      <div class="step-content">
        <div class="step-header">
          ${this.editor.i18n._t("headers.step2")} (Step 2)
        </div>
        <div class="step-description">
          ${this.editor.i18n._t("descriptions.step2")}
        </div>

        <div style="margin-bottom: 24px;">
          <div class="field-row">
            <div>
              <div class="field-row-label">${this.editor.i18n._t("fields.enable_pause_label")}</div>
              <div class="field-row-sub">
                <code>${enabledVal}</code>
              </div>
            </div>
            <ha-switch
              .checked=${hasEnabled}
              @change=${(e) =>
                this._toggleFeature(
                  "enabled_entity",
                  e.target.checked,
                  `switch.${effectivePrefix}enabled`,
                )}
            ></ha-switch>
          </div>

          ${hasEnabled
            ? html`
                <div class="field-group" style="margin-top: 12px;">
                  <label class="field-label">${this.editor.i18n._t("ui.custom_entity_id")}</label>
                  ${this.editor.renderEntityPicker(
                    "enabled_entity",
                    enabledVal,
                    "Enabled Entity",
                    ["switch", "input_boolean"],
                  )}
                </div>
              `
            : ""}

          <div class="field-row" style="margin-top: 16px;">
            <div>
              <div class="field-row-label">${this.editor.i18n._t("fields.enable_profiles_label")}</div>
              <div class="field-row-sub">
                <code>${profilesVal}</code>
              </div>
            </div>
            <ha-switch
              .checked=${hasProfiles}
              @change=${(e) =>
                this._toggleFeature(
                  "profiles_select_entity",
                  e.target.checked,
                  `select.${effectivePrefix}current_profile`,
                )}
            ></ha-switch>
          </div>

          ${hasProfiles
            ? html`
                <div class="field-group" style="margin-top: 12px;">
                  <label class="field-label">${this.editor.i18n._t("ui.custom_entity_id")}</label>
                  ${this.editor.renderEntityPicker(
                    "profiles_select_entity",
                    profilesVal,
                    "Current Profile",
                    ["select", "input_select"],
                  )}
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  _toggleFeature(configKey, isEnabled, defaultValue) {
    if (isEnabled) {
      // Use current config value if it exists, otherwise use provided default
      const current = this.editor._config[configKey];
      const val = current && current !== "" ? current : defaultValue;
      this.editor._updateConfig(configKey, val, true);
    } else {
      this.editor._updateConfig(configKey, "", true);
    }
  }

  getApplyIncludeDomains() {
    switch (this.editor._selectedPreset) {
      case "thermostat":
        return ["climate"];
      case "ev_charging":
        return ["number"];
      case "generic_switch":
        return ["switch"];
      case "generic_kwh":
        return ["number"];
      case "generic_temperature":
        return ["number"];
      default:
        return [];
    }
  }
}
