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
      <style>
        .step-content {
          color: #f8fafc;
        }
        .field-group {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .field-label {
          color: #38bdf8;
          font-weight: 800;
        }
        ha-select,
        ha-textfield {
          --mdc-theme-primary: #38bdf8;
          --mdc-select-idle-line-color: rgba(255, 255, 255, 0.3);
          --mdc-select-hover-line-color: #38bdf8;
          --mdc-select-label-ink-color: rgba(255, 255, 255, 0.7);
          --mdc-select-ink-color: #ffffff;
          --mdc-select-dropdown-icon-color: #38bdf8;
          --mdc-theme-surface: #1e293b;
          --mdc-theme-text-primary-on-background: #ffffff;
        }
        mwc-list-item {
          --mdc-theme-text-primary-on-background: #ffffff;
          color: #ffffff !important;
        }
      </style>
      <div class="step-content">
        <div class="step-header">
          ${this.editor.i18n._t("headers.step3")} (Step 3)
        </div>
        <div class="step-description">
          ${this.editor.i18n._t("descriptions.step3")}
        </div>

        <div class="field-group">
          <label class="field-label"
            >${this.editor.i18n._t("fields.title_label")}</label
          >
          ${this.editor.renderTextInput("title", effectiveTitle)}
        </div>

        <div class="field-group">
          <ha-formfield
            .label=${this.editor.i18n._t("fields.enable_logging_label")}
          >
            <ha-switch
              .checked=${!!this.editor._config.logging_enabled}
              @change=${(e) =>
                this.editor._handleLocalUpdate(
                  "logging_enabled",
                  e.target.checked,
                )}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="field-group">
          <label class="field-label"
            >${this.editor.i18n._t("fields.language_label")} (Step 3)</label
          >
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
