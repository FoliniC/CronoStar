import { html } from 'lit';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step2Entities {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const effectivePrefix = getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(effectivePrefix);

    // Gestione Pausa
    const hasPause = !!this.editor._config.pause_entity;
    const pauseVal = this.editor._config.pause_entity || `input_boolean.${effectivePrefix}paused`;

    // Gestione Profili
    const hasProfiles = !!this.editor._config.profiles_select_entity;
    const profilesVal = this.editor._config.profiles_select_entity || `input_select.${effectivePrefix}profiles`;

    const helpersDisplayPath = `/config/packages/${effectivePrefix}package.yaml`;

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step2')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step2')}</div>

        <!-- SEZIONE: Entità Automatiche -->
        <div style="border-bottom: 1px solid var(--divider-color); padding-bottom: 20px; margin-bottom: 20px;">
            
            <div class="info-box">
              <strong>ℹ️ ${this.editor.i18n._t('ui.automatic_entities_title')}</strong>
              <p>${this.editor.i18n._t('ui.automatic_entities_desc', {
                '{entity}': `input_number.${effectivePrefix}current`,
                '{package}': `${effectivePrefix}package.yaml`
              })}</p>
            </div>

            <!-- Opzione Pausa -->
            <div class="field-group" style="background: var(--secondary-background-color); padding: 10px; border-radius: 4px; margin-top: 12px;">
                <ha-formfield .label=${this.editor.i18n._t('fields.enable_pause_label')}>
                    <ha-switch
                        .checked=${hasPause}
                        @change=${(e) => this._toggleFeature('pause_entity', e.target.checked, `input_boolean.${effectivePrefix}paused`)}
                    ></ha-switch>
                </ha-formfield>
                ${hasPause ? html`
                    <div style="margin-top: 8px;">
                        ${this.editor._renderTextInput('pause_entity', pauseVal, 'input_boolean.xxx')}
                    </div>
                ` : ''}
            </div>

            <!-- Opzione Profili -->
            <div class="field-group" style="background: var(--secondary-background-color); padding: 10px; border-radius: 4px; margin-top: 12px;">
                <ha-formfield .label=${this.editor.i18n._t('fields.enable_profiles_label')}>
                    <ha-switch
                        .checked=${hasProfiles}
                        @change=${(e) => this._toggleFeature('profiles_select_entity', e.target.checked, `input_select.${effectivePrefix}profiles`)}
                    ></ha-switch>
                </ha-formfield>
                ${hasProfiles ? html`
                    <div style="margin-top: 8px;">
                        ${this.editor._renderTextInput('profiles_select_entity', profilesVal, 'input_select.xxx')}
                    </div>
                ` : ''}
            </div>

        </div>

        <!-- SEZIONE: Generazione Package -->
        ${this.editor._deepCheckInProgress 
          ? html`<div class="info-box" style="text-align: center; padding: 16px;">${this.editor.i18n._t('ui.loading_deep_check_results')}</div>` 
          : html`
              <div>
                <div class="field-group">
                  <label class="field-label">${this.editor.i18n._t('fields.package_label')}</label>
                  <div class="field-description">${this.editor.i18n._t('fields.package_desc', {
                    '{path}': helpersDisplayPath
                  })}</div>
                  
                  <div class="action-buttons">
                    ${this.editor._renderButton({ 
                      label: this.editor.i18n._t('actions.copy_package_yaml'), 
                      click: () => this.editor.serviceHandlers.copyToClipboard(
                        this.editor._helpersYaml, 
                        this.editor.i18n._t('messages.package_yaml_copied'), 
                        this.editor.i18n._t('messages.package_yaml_error')
                      ) 
                    })}
                    ${this.editor._renderButton({ 
                      label: this.editor.i18n._t('actions.download_package_file'), 
                      click: () => this.editor.serviceHandlers.downloadFile(
                        `${effectivePrefix}package.yaml`, 
                        this.editor._helpersYaml, 
                        this.editor.i18n._t('messages.package_yaml_downloaded'), 
                        this.editor.i18n._t('messages.file_download_error')
                      ) 
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
        }
      </div>
    `;
  }
  _toggleFeature(configKey, isEnabled, defaultValue) {
      if (isEnabled) {
          // Abilita e imposta default se vuoto
          const current = this.editor._config[configKey];
          if (!current) {
              this.editor._updateConfig(configKey, defaultValue);
          }
      } else {
          // Disabilita (setta a null)
          this.editor._updateConfig(configKey, null);
      }
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
