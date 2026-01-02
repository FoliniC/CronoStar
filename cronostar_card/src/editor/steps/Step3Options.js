import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';

export class Step3Options {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const presetConfig = CARD_CONFIG_PRESETS[this.editor._config.preset || 'thermostat'] || {};

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step3')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step3')}</div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.titlelabel')}</label>
          ${this.editor.renderTextInput('title', this.editor._config.title || presetConfig.title || 'CronoStar Schedule')}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.yaxislabel')}</label>
          ${this.editor.renderTextInput('y_axis_label', this.editor._config.y_axis_label || presetConfig.yaxislabel)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.unitlabel')}</label>
          ${this.editor.renderTextInput('unit_of_measurement', this.editor._config.unit_of_measurement || presetConfig.unitofmeasurement)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.minlabel')}</label>
          <div class="field-description">Chart min value.</div>
          ${this.editor.renderTextInput('min_value', this.editor._config.min_value !== undefined ? this.editor._config.min_value : presetConfig.minvalue)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.maxlabel')}</label>
          <div class="field-description">Chart max value.</div>
          ${this.editor.renderTextInput('max_value', this.editor._config.max_value !== undefined ? this.editor._config.max_value : presetConfig.maxvalue)}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.steplabel')}</label>
          ${this.editor.renderTextInput('step_value', this.editor._config.step_value !== undefined ? this.editor._config.step_value : presetConfig.stepvalue)}
        </div>

        <div class="field-group">
          <ha-formfield .label=${this.editor.i18n._t('fields.allowmaxlabel')}>
            <ha-switch .checked=${!!this.editor._config.allow_max_value} @change=${(e) => this.editor._updateConfig('allow_max_value', e.target.checked)}></ha-switch>
          </ha-formfield>
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.intervallabel')}</label>
          <ha-select
            .value=${this.editor._config.interval_minutes || 60}
            @value-changed=${(e) => {
        const v = e?.detail?.value ?? e?.target?.value;
        if (v === undefined || v === null || v === '') return;
        const n = parseInt(v);
        if (Number.isFinite(n)) this.editor._updateConfig('interval_minutes', n);
      }}
            label="Interval">
            <mwc-list-item value="60">1 hour (24 points)</mwc-list-item>
            <mwc-list-item value="30">30 min (48)</mwc-list-item>
            <mwc-list-item value="15">15 min (96)</mwc-list-item>
          </ha-select>
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
      </div>
    `;
  }
}
