import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    // Note: use CARD_CONFIG_PRESETS for titles and keep icons local to this step.
    // EditorI18n currently doesn't provide a `presets.*` structure.
    const list = [
      { id: 'thermostat', icon: '🌡️', title: 'Thermostat', desc: 'Schedule hourly temperatures for heating/cooling' },
      { id: 'ev_charging', icon: '🔌', title: 'EV Charging', desc: 'Schedule EV charging power' },
      { id: 'generic_kwh', icon: '⚡', title: 'Generic kWh', desc: 'Schedule hourly energy limits (0-7 kWh)' },
      { id: 'generic_temperature', icon: '🌡️', title: 'Generic Temperature', desc: 'Schedule generic temperatures (0-40°C)' },
      { id: 'generic_switch', icon: '💡', title: 'Switch', desc: 'Schedule device on/off' },
    ];

    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(currentPrefix);
    const applyEntity = this.editor._config.apply_entity || '';
    const applyExists = !!(applyEntity && this.editor.hass?.states?.[applyEntity]);
    const minimalConfigComplete = prefixValid && !!applyEntity;

    return html`
      <div class="step-content">
        <div class="field-group" style="margin-bottom: 24px;">
          <label class="field-label">1. ${this.editor.i18n._t('fields.apply_entity_label')}</label>
          <div class="field-description">${this.editor.i18n._t('fields.apply_entity_desc')}</div>
          ${this.editor._isElDefined('ha-entity-picker')
        ? html`<ha-entity-picker
                .hass=${this.editor.hass}
                .value=${applyEntity}
                allow-custom-entity
                @value-changed=${(e) => this.editor._updateConfig('apply_entity', e.detail.value)}
              ></ha-entity-picker>`
        : this.editor._renderTextInput('apply_entity', applyEntity, 'Entity ID')}
          ${applyExists
        ? html`<div class="hint" style="color: var(--success-color);">✓ Entity found</div>`
        : html``}
        </div>

        <div class="field-group" style="margin-bottom: 24px;">
          <label class="field-label">${this.editor.i18n._t('ui.identification_prefix')}</label>
          <div class="field-description">
            ${this.editor.i18n._t('ui.prefix_description')}
          </div>
          ${this.editor._renderTextInput('global_prefix', currentPrefix, `input_number.${currentPrefix}...`)}
        </div>

        <div style="margin-bottom: 12px;">
            ${prefixValid
                ? html`<div style="color: #cbd3e8; font-size: 1rem; margin-bottom: 8px;">${this.editor.i18n._t('step2_msgs.prefix_ok')}</div>`
                : html`<div style="color: var(--error-color); font-size: 1rem; margin-bottom: 8px;">${this.editor.i18n._t('step2_msgs.prefix_bad')}</div>`
            }
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

        ${minimalConfigComplete ? html`
          <div class="success-box" style="margin: 20px 0; border: 1px solid var(--success-color); padding: 16px; border-radius: 8px; background: rgba(0, 255, 0, 0.05);">
            <strong>✅ ${this.editor.i18n._t('ui.minimal_config_complete')}</strong>
            <div style="margin-top: 8px;">
              ${this.editor.i18n._t('ui.minimal_config_info', {
          '{entity}': `input_number.${currentPrefix}current`,
          '{package}': `${currentPrefix}package.yaml`
        })}
            </div>
            <div style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
              <mwc-button raised @click=${() => this._handleEarlySave()}>
                💾 ${this.editor.i18n._t('actions.save_and_create')}
              </mwc-button>
              <mwc-button outlined @click=${() => this.editor.wizard._nextStep()}>
                ⚙️ ${this.editor.i18n._t('actions.advanced_config')}
              </mwc-button>
            </div>
          </div>
        ` : html`
          <div class="info-box">
            <strong>ℹ️ ${this.editor.i18n._t('ui.minimal_config_needed')}</strong>
            <p>${this.editor.i18n._t('ui.minimal_config_help')}</p>
          </div>
        `}
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
    }

    this.editor._dispatchConfigChanged();
    this.editor.requestUpdate();
  }

  async _handleEarlySave() {
    this.editor._dispatchConfigChanged();
    if (this.editor.hass) {
      try {
        await this.editor._handleFinishClick({ force: true });
      } catch (e) {
        console.error("Early save failed:", e);
      }
    }
  }
}
