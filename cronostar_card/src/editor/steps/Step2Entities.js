import { html } from 'lit';
import { getEffectivePrefix } from '../../utils/prefix_utils.js';

export class Step2Entities {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const effectivePrefix = getEffectivePrefix(this.editor._config);

    const hasPause = !!this.editor._config.pause_entity;
    const pauseVal = this.editor._config.pause_entity || `input_boolean.${effectivePrefix}paused`;

    const hasProfiles = !!this.editor._config.profiles_select_entity;
    const profilesVal = this.editor._config.profiles_select_entity || `input_select.${effectivePrefix}profiles`;

    const isPickerDefined = !!customElements.get('ha-entity-picker');
    const canRenderPicker = isPickerDefined || this.editor._pickerLoaded;
    console.log(`[WIZARD-STEP2] Rendering check: pickerDefined=${isPickerDefined}, pickerLoaded=${this.editor._pickerLoaded}, hassAvailable=${!!this.editor.hass}`);

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step2')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step2')}</div>

        <div style="border-bottom: 1px solid var(--divider-color); padding-bottom: 20px; margin-bottom: 20px;">
          <div class="field-group" style="background: var(--secondary-background-color); padding: 10px; border-radius: 4px; margin-top: 12px;">
            <ha-formfield .label=${this.editor.i18n._t('fields.enable_pause_label')}>
              <ha-switch
                .checked=${hasPause}
                @change=${(e) => this._toggleFeature('pause_entity', e.target.checked, `input_boolean.${effectivePrefix}paused`)}
              ></ha-switch>
            </ha-formfield>
            ${hasPause ? html`
              <div style="margin-top: 8px;">
                ${canRenderPicker
          ? html`<ha-entity-picker
                      .hass=${this.editor.hass}
                      .value=${pauseVal}
                      .label=${"Pause Entity"}
                      .includeDomains=${['input_boolean', 'switch']}
                      allow-custom-entity
                      @value-changed=${(e) => this.editor._updateConfig('pause_entity', e.detail.value)}
                    ></ha-entity-picker>`
          : this.editor._renderTextInput('pause_entity', pauseVal, 'input_boolean.xxx')}
              </div>
            ` : ''}
          </div>

          <div class="field-group" style="background: var(--secondary-background-color); padding: 10px; border-radius: 4px; margin-top: 12px;">
            <ha-formfield .label=${this.editor.i18n._t('fields.enable_profiles_label')}>
              <ha-switch
                .checked=${hasProfiles}
                @change=${(e) => this._toggleFeature('profiles_select_entity', e.target.checked, `input_select.${effectivePrefix}profiles`)}
              ></ha-switch>
            </ha-formfield>
            ${hasProfiles ? html`
              <div style="margin-top: 8px;">
                ${canRenderPicker
          ? html`<ha-entity-picker
                      .hass=${this.editor.hass}
                      .value=${profilesVal}
                      .label=${"Profiles Entity"}
                      .includeDomains=${['input_select']}
                      allow-custom-entity
                      @value-changed=${(e) => this.editor._updateConfig('profiles_select_entity', e.detail.value)}
                    ></ha-entity-picker>`
          : this.editor._renderTextInput('profiles_select_entity', profilesVal, 'input_select.xxx')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  _toggleFeature(configKey, isEnabled, defaultValue) {
    if (isEnabled) {
      // Use current config value if it exists, otherwise use provided default
      const current = this.editor._config[configKey];
      const val = (current && current !== '') ? current : defaultValue;
      this.editor._updateConfig(configKey, val, true);
    } else {
      this.editor._updateConfig(configKey, '', true);
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
