import { html } from 'lit';

export class Step3Options {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step3')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step3')}</div>
        
        <div class="field-group">
          ${this.editor._renderTextInput('title', this.editor._config.title, this.editor.i18n._t('fields.title_label'))}
        </div>

        <div class="field-group">
          ${this.editor._renderTextInput('y_axis_label', this.editor._config.y_axis_label, this.editor.i18n._t('fields.y_axis_label'))}
        </div>

        <div class="field-group">
          <ha-select
            label="${this.editor.i18n._t('fields.interval_label') || 'Interval'}"
            .value=${String(this.editor._config.interval_minutes || 60)}
            @selected=${(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0 && val !== this.editor._config.interval_minutes) {
                this.editor._updateConfig('interval_minutes', val);
              }
            }}
            @closed=${(e) => e.stopPropagation()}
            style="width: 100%;"
          >
            <mwc-list-item value="60">1 hour (24 points)</mwc-list-item>
            <mwc-list-item value="30">30 minutes (48 points)</mwc-list-item>
            <mwc-list-item value="15">15 minutes (96 points)</mwc-list-item>
            <mwc-list-item value="10">10 minutes (144 points)</mwc-list-item>
          </ha-select>
          <div class="hint" style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
            ${this.editor.i18n._t('fields.interval_desc') || 'Select the time resolution. Lower values create more points but require more entities.'}
          </div>
        </div>

        <div class="field-group">
          ${this.editor._renderTextInput('unit_of_measurement', this.editor._config.unit_of_measurement, this.editor.i18n._t('fields.unit_label'))}
        </div>

        <div style="display: flex; gap: 16px;">
          <ha-textfield style="flex: 1" type="number" .label=${this.editor.i18n._t('fields.min_label')} .value=${this.editor._config.min_value} @input=${(e) => this.editor._updateNumber('min_value', e.target.value)}></ha-textfield>
          <ha-textfield style="flex: 1" type="number" .label=${this.editor.i18n._t('fields.max_label')} .value=${this.editor._config.max_value} @input=${(e) => this.editor._updateNumber('max_value', e.target.value)}></ha-textfield>
          <ha-textfield style="flex: 1" type="number" .label=${this.editor.i18n._t('fields.step_label')} .value=${this.editor._config.step_value} @input=${(e) => this.editor._updateNumber('step_value', e.target.value)}></ha-textfield>
        </div>

        <div class="field-group">
          <ha-formfield .label=${this.editor.i18n._t('fields.allow_max_label')}>
            <ha-switch .checked=${!!this.editor._config.allow_max_value} @change=${(e) => this.editor._updateConfig('allow_max_value', e.target.checked)}></ha-switch>
          </ha-formfield>
        </div>
        <div class="field-group">
          <ha-formfield .label=${this.editor.i18n._t('fields.logging_label')}>
            <ha-switch .checked=${this.editor._config.logging_enabled !== false} @change=${(e) => this.editor._updateConfig('logging_enabled', e.target.checked)}></ha-switch>
          </ha-formfield>
        </div>
      </div>
    `;
  }
}
