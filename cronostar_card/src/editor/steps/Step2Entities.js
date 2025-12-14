import { html } from 'lit';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step2Entities {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const effectivePrefix = getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(effectivePrefix);
    const applyVal = this.editor._config.apply_entity || '';
    const applyExists = !!(applyVal && this.editor.hass?.states?.[applyVal]);

    const inum = this.editor._deepReport?.input_number;
    const missingHelpers = inum?.runtime_missing || [];
    const helpersOk = this.editor._deepReport && missingHelpers.length === 0;
    const helpersDisplayPath = (inum?.full_path || '') + '/' + this.editor._calculatedHelpersFilename;

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step2')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step2')}</div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.entity_prefix_label')}</label>
          <div class="field-description">${this.editor.i18n._t('fields.entity_prefix_desc')}</div>
          ${this.editor._renderTextInput('global_prefix', effectivePrefix, `input_number.${effectivePrefix}...`)}
          <div class="hint">
            ${this.editor.i18n._t('fields.entity_prefix_hint')}
            ${prefixValid
              ? html`<div class="success-box" style="margin-top:8px;">${this.editor.i18n._t('step2_msgs.prefix_ok')}</div>`
              : html`<div class="warning-box" style="margin-top:8px;">${this.editor.i18n._t('step2_msgs.prefix_bad')}</div>`}
          </div>
        </div>

        ${this.editor._deepCheckInProgress 
          ? html`<div class="info-box" style="text-align: center; padding: 16px;">${this.editor.i18n._t('ui.loading_deep_check_results')}</div>` 
          : this.editor._deepReport 
            ? html`
              <div>
                <div class="field-group">
                  <label class="field-label">${this.editor.i18n._t('checks.deep_report_label')}</label>
                  <textarea
                    readonly
                    style="width: 100%; height: 200px; font-family: monospace; resize: vertical; background-color: var(--code-editor-background-color, #1e1e1e); color: var(--code-editor-color, #d4d4d4); border: 1px solid var(--divider-color); border-radius: 4px; margin-top: 8px;"
                  >${this.editor._deepReport.formatted_message}</textarea>
                </div>

                <div class="${helpersOk ? 'success-box' : 'warning-box'}" style="margin: 16px 0;">
                  <strong>${helpersOk ? '✅' : '⚠️'} ${this.editor.i18n._t('ui.helpers_check')}</strong>
                  <div style="margin-top: 8px;">
                    ${helpersOk
                      ? html`${this.editor.i18n._t('ui.all_required_helpers_present')}`
                      : html`
                          ${this.editor.i18n._t('ui.missing_helpers_count', { '{count}': missingHelpers.length })}
                        `}
                  </div>
                </div>

                <div class="field-group">
                  <label class="field-label">${this.editor.i18n._t('fields.helpers_label')}</label>
                  <div class="field-description">${this.editor.i18n._t('fields.helpers_desc')}</div>
                  <div class="action-buttons">
                    ${this.editor._renderButton({ label: this.editor.i18n._t('actions.copy_helpers_yaml'), click: () => this.editor.serviceHandlers.copyToClipboard(this.editor._helpersYaml, this.editor.i18n._t('messages.helpers_yaml_copied'), this.editor.i18n._t('messages.helpers_yaml_error')) })}
                    ${this.editor._renderButton({ label: this.editor.i18n._t('actions.download_helpers_file'), click: () => this.editor.serviceHandlers.downloadFile(this.editor._calculatedHelpersFilename, this.editor._helpersYaml, this.editor.i18n._t('messages.helpers_yaml_downloaded'), this.editor.i18n._t('messages.file_download_error')) })}
                    ${this.editor._renderButton({
                      label: `${this.editor.i18n._t('ui.create_file_on_ha')} (${helpersDisplayPath})`,
                      primary: true,
                      icon: '✏️',
                      click: () => this.editor.serviceHandlers.handleCreateHelpersYaml(this.editor.hass, this.editor._config, this.editor._deepReport, this.editor._lang)
                    })}
                  </div>
                  <div class="field-group" style="margin-top: 12px;">
                    <ha-formfield .label=${this.editor.i18n._t('actions.show_preview')}>
                      <ha-switch
                        .checked=${this.editor._showHelpersPreview}
                        @change=${(e) => { this.editor._showHelpersPreview = e.target.checked; this.editor.requestUpdate(); }}
                      ></ha-switch>
                    </ha-formfield>
                  </div>
                  ${this.editor._showHelpersPreview ? html`
                    <div class="automation-preview">
                      <pre>${this.editor._helpersYaml}</pre>
                    </div>
                  ` : ''}
                </div>
              </div>`
            : ''
        }

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('fields.apply_entity_label')}</label>
          <div class="field-description">${this.editor.i18n._t('fields.apply_entity_desc')}</div>
          ${this.editor._isElDefined('ha-entity-picker')
            ? html`<ha-entity-picker
                .hass=${this.editor.hass}
                .value=${applyVal}
                .includeDomains=${this.getApplyIncludeDomains()}
                allow-custom-entity
                @value-changed=${(e) => this.editor._updateConfig('apply_entity', e.detail.value)}
              ></ha-entity-picker>`
            : this.editor._renderTextInput('apply_entity', applyVal, 'Entity ID')}
        </div>

        ${applyExists
          ? html`<div class="success-box"><strong>✔</strong> ${this.editor.i18n._t('step2_msgs.apply_ok')}</div>`
          : html`<div class="warning-box"><strong>⚠️</strong> ${this.editor.i18n._t('step2_msgs.missing_apply')}</div>`}
      </div>
    `;
  }

  getApplyIncludeDomains() {
    switch (this.editor._selectedPreset) {
      case 'thermostat': return ['climate'];
      case 'ev_charging': return ['number'];
      case 'generic_switch': return ['switch'];
      case 'generic_kwh': return ['number'];
      case 'generic_temperature': return ['number'];
      default: return [];
    }
  }
}
