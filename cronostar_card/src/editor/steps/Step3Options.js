import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { EditorI18n } from '../EditorI18n.js';

export class Step3Options {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const presetConfig = CARD_CONFIG_PRESETS[this.editor._config.preset_type || this.editor._config.preset || 'thermostat'] || {};

    const effectiveTitle = this.editor._config.title || (this.editor._config.global_prefix ? this.editor._config.global_prefix.replace(/_/g, ' ').trim() : '') || presetConfig.title || 'CronoStar Schedule';

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step3')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step3')}</div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.title_label')}</label>
          ${this.editor.renderTextInput('title', effectiveTitle)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.y_axis_label')}</label>
          ${this.editor.renderTextInput('y_axis_label', this.editor._config.y_axis_label || presetConfig.y_axis_label)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.unit_label')}</label>
          ${this.editor.renderTextInput('unit_of_measurement', this.editor._config.unit_of_measurement || presetConfig.unit_of_measurement)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.min_label')}</label>
          <div class="field-description">Chart min value.</div>
          ${this.editor.renderTextInput('min_value', this.editor._config.min_value !== undefined ? this.editor._config.min_value : presetConfig.min_value)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.max_label')}</label>
          <div class="field-description">Chart max value.</div>
          ${this.editor.renderTextInput('max_value', this.editor._config.max_value !== undefined ? this.editor._config.max_value : presetConfig.max_value)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.step_label')}</label>
          ${this.editor.renderTextInput('step_value', this.editor._config.step_value !== undefined ? this.editor._config.step_value : presetConfig.step_value)}
        </div>

        <div class="field-group">
          <ha-formfield .label=${this.editor.i18n._t('fields.allow_max_label')}>
            <ha-switch .checked=${!!this.editor._config.allow_max_value} @change=${(e) => this.editor._updateConfig('allow_max_value', e.target.checked)}></ha-switch>
          </ha-formfield>
        </div>

        <div class="field-group">
          <ha-formfield .label=${this.editor.i18n._t('fields.enable_logging_label')}>
            <span slot="secondary">${this.editor.i18n._t('fields.enable_logging_desc')}</span>
            <ha-switch
              .checked=${!!this.editor._config.logging_enabled}
              @change=${(e) => this.editor._handleLocalUpdate('logging_enabled', e.target.checked)}
            ></ha-switch>
          </ha-formfield>
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.language_label')}</label>
          <div class="field-description">${this.editor.i18n._t('fields.language_desc')}</div>
          <ha-select
            .label=${this.editor.i18n._t('fields.language_label')}
            .value=${this.editor._config.meta?.language || this.editor._language}
            @selected=${(e) => {
              // Ensure meta object exists
              if (!this.editor._config.meta) {
                this.editor._config.meta = {};
              }
              this.editor._config.meta.language = e.target.value;
              this.editor._language = e.target.value; // Update editor's active language immediately
              this.editor.i18n = new EditorI18n(this.editor); // Re-initialize i18n with new language
              this.editor.requestUpdate(); // Force editor to re-render with new language
              this.editor._dispatchConfigChanged(true); // Save config
            }}
            fixedMenuPosition
          >
            <mwc-list-item value="en" .activated=${(this.editor._config.meta?.language || this.editor._language) === 'en'}>English</mwc-list-item>
            <mwc-list-item value="it" .activated=${(this.editor._config.meta?.language || this.editor._language) === 'it'}>Italiano</mwc-list-item>
          </ha-select>
        </div>

        <!-- Keyboard Modifiers Section -->
        <div class="field-group" style="border-top: 1px solid var(--divider-color); margin-top: 32px; padding-top: 24px;">
          <h3 style="margin-top: 0; color: var(--primary-color);">${this.editor.i18n._t('fields.keyboard_modifiers_title')}</h3>
          <p class="field-description">${this.editor.i18n._t('fields.keyboard_modifiers_desc')}</p>
          
          ${this._renderKeyboardModifierSection()}
          
          <div style="margin-top: 24px;">
            <mwc-button raised @click=${() => this._saveGlobalSettings()}>
              💾 ${this.editor._language === 'it' ? 'Salva Impostazioni Globali' : 'Save Global Settings'}
            </mwc-button>
          </div>
        </div>
      </div>
    `;
  }

  _renderKeyboardModifierSection() {
    const config = this.editor._config;
    const settings = {
      def: { 
        horizontal: config.kb_def_h !== undefined ? config.kb_def_h : 5, 
        vertical: config.kb_def_v !== undefined ? config.kb_def_v : 0.5 
      },
      ctrl: { 
        horizontal: config.kb_ctrl_h !== undefined ? config.kb_ctrl_h : 1, 
        vertical: config.kb_ctrl_v !== undefined ? config.kb_ctrl_v : 0.1 
      },
      shift: { 
        horizontal: config.kb_shift_h !== undefined ? config.kb_shift_h : 30, 
        vertical: config.kb_shift_v !== undefined ? config.kb_shift_v : 1.0 
      },
      alt: { 
        horizontal: config.kb_alt_h !== undefined ? config.kb_alt_h : 60, 
        vertical: config.kb_alt_v !== undefined ? config.kb_alt_v : 5.0 
      }
    };

    const modifiers = ['def', 'ctrl', 'shift', 'alt'];
    
    return html`
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${modifiers.map(mod => html`
          <div style="background: rgba(0,0,0,0.1); padding: 16px; border-radius: 8px;">
            <div style="font-weight: bold; margin-bottom: 12px; color: var(--primary-text-color);">
              ${this.editor.i18n._t(`fields.${mod}_label`)}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <ha-textfield
                  label="${this.editor.i18n._t('fields.horizontal_step')}"
                  type="number"
                  .value=${settings[mod].horizontal}
                  @change=${(e) => this._updateKeyboardConfig(mod, 'h', e.target.value)}
                  style="width: 100%;"
                ></ha-textfield>
              </div>
              <div>
                <ha-textfield
                  label="${this.editor.i18n._t('fields.vertical_step')}"
                  type="number"
                  step="0.1"
                  .value=${settings[mod].vertical}
                  @change=${(e) => this._updateKeyboardConfig(mod, 'v', e.target.value)}
                  style="width: 100%;"
                ></ha-textfield>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  _updateKeyboardConfig(mod, axis, value) {
    const key = `kb_${mod}_${axis}`;
    this.editor._updateConfig(key, parseFloat(value));
  }

  async _saveGlobalSettings() {
    const cardEl = this.editor.getRootNode().host;
    if (cardEl && cardEl.globalSettings) {
      await this.editor.serviceHandlers.saveGlobalSettings(cardEl.globalSettings);
    }
  }
}