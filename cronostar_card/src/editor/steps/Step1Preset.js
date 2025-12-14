import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const list = [
      { id: 'thermostat', ...this.editor.i18n._t('presets.thermostat') },
      { id: 'ev_charging', ...this.editor.i18n._t('presets.ev_charging') },
      { id: 'generic_kwh', ...this.editor.i18n._t('presets.generic_kwh') },
      { id: 'generic_temperature', ...this.editor.i18n._t('presets.generic_temperature') },
      { id: 'generic_switch', ...this.editor.i18n._t('presets.generic_switch') }
    ];
    
    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(currentPrefix);
    
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step1')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step1')}</div>
        <div class="field-group" style="margin-bottom: 24px;">
          <label class="field-label">${this.editor.i18n._t('ui.identification_prefix')}</label>
          <div class="field-description">
            ${this.editor.i18n._t('ui.prefix_description')}
          </div>
          ${this.editor._renderTextInput('global_prefix', currentPrefix, `input_number.${currentPrefix}...`)}
          <div class="hint">
            ${this.editor.i18n._t('ui.prefix_hint')}
            ${prefixValid
              ? html`<div class="success-box" style="margin-top:8px;">${this.editor.i18n._t('step2_msgs.prefix_ok')}</div>`
              : html`<div class="warning-box" style="margin-top:8px;">${this.editor.i18n._t('step2_msgs.prefix_bad')}</div>`}
          </div>
        </div>
        <div class="preset-cards">
          ${list.map(preset => html`
            <button
              type="button"
              class="preset-card ${this.editor._selectedPreset === preset.id ? 'selected' : ''}"
              aria-pressed="${this.editor._selectedPreset === preset.id ? 'true' : 'false'}"
              @click=${() => this.selectPresetWithPrefix(preset.id)}
            >
              <div class="preset-icon" aria-hidden="true">${preset.icon}</div>
              <div class="preset-title">${preset.title}</div>
              <div class="preset-description">${preset.desc}</div>
            </button>
          `)}
        </div>
      </div>
    `;
  }

  selectPresetWithPrefix(presetId) {
    this.editor._selectedPreset = presetId;
    const tags = {
      'thermostat': 'temp',
      'ev_charging': 'ev',
      'generic_kwh': 'kwh',
      'generic_temperature': 'gentemp',
      'generic_switch': 'switch'
    };
    const newPrefix = `cronostar_${tags[presetId] || 'temp'}_`;
    this.editor._updateConfig('preset', presetId);
    this.editor._updateConfig('global_prefix', newPrefix);
    
    const presetConfig = CARD_CONFIG_PRESETS[presetId];
    if (presetConfig) {
      Object.assign(this.editor._config, presetConfig);
      this.editor._config.entity_prefix = newPrefix;
    }
    
    this.editor._dispatchConfigChanged();
    this.editor.requestUpdate();
  }
}
