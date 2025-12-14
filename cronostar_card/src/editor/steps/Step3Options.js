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
