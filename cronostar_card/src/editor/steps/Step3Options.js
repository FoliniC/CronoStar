import { html } from "lit";
import { CARD_CONFIG_PRESETS } from "../../config.js";
import { EditorI18n } from "../EditorI18n.js";

export class Step3Options {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const presetConfig =
      CARD_CONFIG_PRESETS[this.editor._config.preset_type || "thermostat"] ||
      {};
    const effectiveTitle =
      this.editor._config.title || presetConfig.title || "CronoStar Schedule";
    return html`
      <div class="step-content">
        <div class="step-header">
          ${this.editor.i18n._t("headers.step3")} (Step 3)
        </div>
        <div class="step-description">
          ${this.editor.i18n._t("descriptions.step3")}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t("fields.title_label")}</label>
          <div style="margin-top: 8px;">
            ${this.editor.renderTextInput("title", effectiveTitle)}
          </div>
        </div>

        <div class="field-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label class="field-label">${this.editor.i18n._t("fields.min_label")}</label>
            ${this.editor.renderTextInput("min_value", this.editor._config.min_value ?? 0)}
          </div>
          <div>
            <label class="field-label">${this.editor.i18n._t("fields.max_label")}</label>
            ${this.editor.renderTextInput("max_value", this.editor._config.max_value ?? 30)}
          </div>
        </div>

        <div class="field-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <label class="field-label">${this.editor.i18n._t("fields.step_label")}</label>
            ${this.editor.renderTextInput("step_value", this.editor._config.step_value ?? 0.5)}
          </div>
          <div>
             <label class="field-label">${this.editor.i18n._t("fields.unit_label")}</label>
             ${this.editor.renderTextInput("unit_of_measurement", this.editor._config.unit_of_measurement || "")}
          </div>
        </div>

        <div class="field-group">
            <label class="field-label">${this.editor.i18n._t("fields.y_axis_label")}</label>
            ${this.editor.renderTextInput("y_axis_label", this.editor._config.y_axis_label || "")}
        </div>

        <div class="field-row">
          <div class="field-row-label">
            ${this.editor.i18n._t("fields.enable_logging_label")}
          </div>
          <ha-switch
            .checked=${!!this.editor._config.logging_enabled}
            @change=${(e) =>
              this.editor._handleLocalUpdate(
                "logging_enabled",
                e.target.checked,
              )}
          ></ha-switch>
        </div>


        <div class="field-group" style="margin-top: 16px;">
          <label class="field-label">${this.editor.i18n._t("fields.language_label")}</label>
          <div class="field-description">
            ${this.editor.i18n._t("fields.language_desc")}
          </div>
          <ha-select
            .label=${this.editor.i18n._t("fields.language_label")}
            .value=${this.editor._language}
            @selected=${(e) => {
              const val = e.target.value || e.detail?.value;
              if (val && val !== this.editor._language) {
                this.editor._language = val;
                if (!this.editor._config.meta) this.editor._config.meta = {};
                this.editor._config.meta.language = val;
                this.editor.i18n = new EditorI18n(this.editor);
                this.editor.requestUpdate();
                this.editor._dispatchConfigChanged(true);
              }
            }}
            @closed=${(e) => e.stopPropagation()}
            naturalMenuWidth
          >
            <mwc-list-item
              value="en"
              ?selected=${this.editor._language === "en"}
              @click=${(e) => {
                // Redundant click handler
                const val = "en";
                if (val !== this.editor._language) {
                  this.editor._language = val;
                  if (!this.editor._config.meta) this.editor._config.meta = {};
                  this.editor._config.meta.language = val;
                  this.editor.i18n = new EditorI18n(this.editor);
                  this.editor.requestUpdate();
                  this.editor._dispatchConfigChanged(true);
                }
                // Aggressive close
                const selectEl = e.target.closest("ha-select");
                if (selectEl) {
                  selectEl.open = false;
                  if (selectEl.menuOpen !== undefined)
                    selectEl.menuOpen = false;
                  selectEl.blur();
                  document.body.focus();
                }
              }}
              >English</mwc-list-item
            >
            <mwc-list-item
              value="it"
              ?selected=${this.editor._language === "it"}
              @click=${(e) => {
                // Redundant click handler
                const val = "it";
                if (val !== this.editor._language) {
                  this.editor._language = val;
                  if (!this.editor._config.meta) this.editor._config.meta = {};
                  this.editor._config.meta.language = val;
                  this.editor.i18n = new EditorI18n(this.editor);
                  this.editor.requestUpdate();
                  this.editor._dispatchConfigChanged(true);
                }
                // Aggressive close
                const selectEl = e.target.closest("ha-select");
                if (selectEl) {
                  selectEl.open = false;
                  if (selectEl.menuOpen !== undefined)
                    selectEl.menuOpen = false;
                  selectEl.blur();
                  document.body.focus();
                }
              }}
              >Italiano</mwc-list-item
            >
          </ha-select>
        </div>
      </div>
    `;
  }
}
