import { html } from "lit";
import {
  getEffectivePrefix,
  isValidPrefix,
  normalizePrefix,
} from "../../utils/prefix_utils.js";
import { CARD_CONFIG_PRESETS } from "../../config.js";

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const list = Object.entries(CARD_CONFIG_PRESETS).map(([id, cfg]) => ({
      id,
      ...cfg,
    }));
    const currentPrefix =
      this.editor._config.global_prefix ||
      getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(currentPrefix);
    const applyEntity = this.editor._config.target_entity || "";
    const minimalConfigComplete = prefixValid && !!applyEntity;

    const domains = this.getApplyIncludeDomains();
    const hasStates = !!this.editor.hass?.states;
    const matchingEntities = hasStates
      ? Object.keys(this.editor.hass.states).filter((eid) =>
          domains.some((d) => eid.startsWith(`${d}.`)),
        )
      : [];
    const noEntitiesFound = hasStates && matchingEntities.length === 0;

    const headerKey = this.editor._isEditing
      ? "headers.step1_edit"
      : "headers.step1";

    return html`
      <div class="step-content">
        <div
          style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;"
        >
          <div class="step-header" style="margin-bottom: 0;">
            ${this.editor.i18n._t(headerKey)} (Step 1)
          </div>
          <mwc-button outlined @click=${() => this.editor.handleShowHelp()}>
            ℹ️ ${this.editor.i18n._t("actions.component_info")}
          </mwc-button>
        </div>
        <div class="step-description">
          ${this.editor.i18n._t("descriptions.step1")}
        </div>

        <div class="preset-cards">
          ${list.map(
            (preset) => html`
              <button
                type="button"
                class="preset-card ${this.editor._selectedPreset === preset.id
                  ? "selected"
                  : ""}"
                aria-pressed="${this.editor._selectedPreset === preset.id
                  ? "true"
                  : "false"}"
                @click=${() => this.selectPresetWithPrefix(preset.id)}
              >
                <div class="preset-icon" aria-hidden="true">${preset.icon}</div>
                <div class="preset-title">${preset.title}</div>
                <div class="preset-hint">${preset.desc}</div>
              </button>
            `,
          )}
        </div>

        <div class="field-group">
          <label class="field-label"
            >1. ${this.editor.i18n._t("fields.target_entity_label")}</label
          >
          <div class="field-description">
            ${this.editor.i18n._t("fields.target_entity_desc")}
          </div>
          ${this.editor.renderEntityPicker(
            "target_entity",
            applyEntity,
            this.editor.i18n._t("fields.target_entity_label"),
            domains,
          )}
          ${noEntitiesFound
            ? html`
                <div
                  style="color: #ef4444; font-size: 0.85rem; margin-top: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);"
                >
                  <ha-icon
                    icon="mdi:alert-circle"
                    style="--mdc-icon-size: 20px; flex-shrink: 0;"
                  ></ha-icon>
                  <span
                    >${this.editor.i18n._t("ui.no_matching_entities", {
                      "{domains}": domains.join(", "),
                    })}</span
                  >
                </div>
              `
            : ""}
        </div>

        <div class="field-group">
          <label class="field-label"
            >${this.editor.i18n._t("ui.identification_prefix")}</label
          >
          <div class="field-description">
            ${this.editor.i18n._t("ui.prefix_description")}
          </div>
          <ha-textfield
            .label=${`sensor.${currentPrefix}...`}
            .value=${currentPrefix || ""}
            @input=${(e) => this._handlePrefixChange(e.target.value, e)}
            @change=${() => this.editor._dispatchConfigChanged(true)}
          ></ha-textfield>
        </div>

        ${minimalConfigComplete
          ? html`
              <div class="info-box success" style="margin-top: 24px;">
                <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">
                  ✅ ${this.editor.i18n._t("ui.minimal_config_ok")}
                </div>
                <div style="margin-bottom: 16px;">
                  ${this.editor.i18n._t("ui.minimal_config_next")}
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                  <mwc-button raised @click=${(e) => {
                    e.stopPropagation();
                    this._handleSaveAndClose();
                  }}>
                    💾 ${this.editor.i18n._t("actions.save_and_close")}
                  </mwc-button>
                  <mwc-button
                    outlined
                    @click=${(e) => {
                      e.stopPropagation();
                      this._handleAdvancedConfig();
                    }}
                  >
                    ⚙️ ${this.editor.i18n._t("actions.advanced_config")}
                  </mwc-button>
                </div>
              </div>
            `
          : html`
              <div class="info-box">
                <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">
                  ℹ️ ${this.editor.i18n._t("ui.minimal_config_needed")}
                </div>
                <p>${this.editor.i18n._t("ui.minimal_config_help")}</p>
              </div>
            `}
      </div>
    `;
  }

  selectPresetWithPrefix(presetId) {
    this.editor._selectedPreset = presetId;
    const config = this.editor._config;
    const tags = {
      thermostat: "thermostat",
      ev_charging: "ev_charging",
      generic_kwh: "generic_kwh",
      generic_temperature: "generic_temperature",
      generic_switch: "generic_switch",
    };

    const tag = tags[presetId] || presetId;
    const newPrefix = `cronostar_${tag}_`;

    this.editor._updateConfig("preset_type", presetId);

    // Update prefix and entities if they are standard/default
    const currentPrefix =
      config.global_prefix || getEffectivePrefix(config) || "";

    if (!currentPrefix || currentPrefix.startsWith("cronostar_")) {
      this.editor._updateConfig("global_prefix", newPrefix);
    }

    const isStandard = (val, suffix) => {
      if (!val) return true;
      return (
        val.includes("cronostar_") &&
        (val.endsWith(suffix) || val.endsWith(suffix.replace("d", "")))
      );
    };

    if (
      !config.enabled_entity ||
      isStandard(config.enabled_entity, "enabled")
    ) {
      this.editor._updateConfig(
        "enabled_entity",
        `switch.${newPrefix || "cronostar_"}enabled`,
      );
    }
    if (
      !config.profiles_select_entity ||
      isStandard(config.profiles_select_entity, "current_profile") ||
      isStandard(config.profiles_select_entity, "profiles")
    ) {
      this.editor._updateConfig(
        "profiles_select_entity",
        `select.${newPrefix || "cronostar_"}current_profile`,
      );
    }

    if (presetId === "generic_switch") {
      this.editor._updateConfig("is_switch_preset", true);
      this.editor._updateConfig("y_axis_label", "State");
    } else if (presetId === "generic_temperature" || presetId === "thermostat") {
      this.editor._updateConfig("is_switch_preset", false);
      this.editor._updateConfig("y_axis_label", "Temperature");
    }

    // Update title based on prefix if it's new
    let titleBase = (newPrefix || "").replace(/_+$/, "").replace(/_/g, " ").trim();
    if (titleBase) {
      this.editor._updateConfig(
        "title",
        titleBase.charAt(0).toUpperCase() + titleBase.slice(1),
      );
    }

    this.editor._dispatchConfigChanged(true);
    this.editor.requestUpdate();
  }

  _handlePrefixChange(value, event) {
    const editor = this.editor;
    const target = event.target;
    // For ha-textfield, we might need to access the underlying input for selection
    const input = target.shadowRoot?.querySelector("input") || target;
    const cursor = input.selectionStart;
    const oldPrefix = editor._config.global_prefix || "";
    const isDeleting = value.length < oldPrefix.length;

    // 1. Pulizia: solo minuscole, numeri e underscore
    let clean = value.toLowerCase().replace(/[^a-z0-9_]/g, "");

    let normalized = clean;
    let targetCursor = cursor;
    let addedUnderscore = false;

    // 2. Logica Real-time: aggiunta underscore finale se mancante
    // Solo se NON stiamo cancellando e se il cursore è alla fine
    if (!isDeleting && clean.length > 0 && !clean.endsWith("_")) {
      normalized = clean + "_";
      if (cursor >= clean.length) {
        targetCursor = normalized.length - 1;
        addedUnderscore = true;
      }
    }

    // Aggiornamento config
    let newConfig = { ...editor._config, global_prefix: normalized };

    const presetId = editor._selectedPreset || "thermostat";
    const presetConfig = CARD_CONFIG_PRESETS[presetId];

    let titleBase = normalized.replace(/_+$/, "").replace(/_/g, " ").trim();
    if (titleBase) {
      newConfig.title = titleBase.charAt(0).toUpperCase() + titleBase.slice(1);
    }

    const isStandard = (val, suffix) => {
      if (!val) return true;
      return (
        val.includes("cronostar_") &&
        (val.endsWith(suffix) || val.endsWith(suffix.replace("d", "")))
      );
    };
    if (isStandard(newConfig.enabled_entity, "enabled"))
      newConfig.enabled_entity = `switch.${normalized}enabled`;
    if (isStandard(newConfig.profiles_select_entity, "current_profile"))
      newConfig.profiles_select_entity = `select.${normalized}current_profile`;

    editor._config = newConfig;
    target.value = normalized;

    // Ripristino cursore differito per evitare interferenze con il ciclo di rendering di Lit
    setTimeout(() => {
      try {
        input.setSelectionRange(targetCursor, targetCursor);
        if (addedUnderscore) input.focus();
      } catch (e) {
        // Ignore selection range errors
      }
    }, 0);

    editor.requestUpdate();
  }

  async _handleSaveAndClose() {
    const currentPrefix = normalizePrefix(
      this.editor._config.global_prefix ||
        getEffectivePrefix(this.editor._config),
    );
    this.editor._updateConfig("global_prefix", currentPrefix, true);
    await this.editor.updateComplete;
    if (this.editor.hass) {
      try {
        await this.editor._handleFinishClick({ force: true });
      } catch (e) {
        console.error("Save & Close failed:", e);
      }
    }
  }

  async _handleAdvancedConfig() {
    const currentPrefix = normalizePrefix(
      this.editor._config.global_prefix ||
        getEffectivePrefix(this.editor._config),
    );
    this.editor._updateConfig("global_prefix", currentPrefix, true);
    await this.editor.updateComplete; // Ensure config is updated before proceeding

    // Do NOT call _handleFinishClick as it tries to finish the entire wizard.
    // Instead, just move to the next step.
    this.editor._step = 2;
    this.editor.requestUpdate();
  }

  getApplyIncludeDomains() {
    const preset =
      this.editor._selectedPreset ||
      this.editor._config?.preset_type ||
      "thermostat";
    switch (preset) {
      case "thermostat":
        return ["climate"];
      case "ev_charging":
        return ["number", "input_number"];
      case "generic_switch":
        return ["switch", "input_boolean"];
      case "generic_kwh":
        return ["number", "input_number"];
      case "generic_temperature":
        return ["number", "input_number", "sensor"];
      default:
        return [
          "climate",
          "number",
          "input_number",
          "switch",
          "input_boolean",
          "sensor",
        ];
    }
  }
}
