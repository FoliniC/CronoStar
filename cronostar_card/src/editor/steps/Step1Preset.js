import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const list = [
      { id: 'thermostat', icon: '🌡️', title: 'Thermostat', desc: 'Schedule hourly temperatures for heating/cooling' },
      { id: 'ev_charging', icon: '🔌', title: 'EV Charging', desc: 'Schedule EV charging power' },
      { id: 'generic_kwh', icon: '⚡', title: 'Generic kWh', desc: 'Schedule hourly energy limits (0-7 kWh)' },
      { id: 'generic_temperature', icon: '🌡️', title: 'Generic Temperature', desc: 'Schedule generic temperatures (0-40°C)' },
      { id: 'generic_switch', icon: '💡', title: 'Generic switch', desc: 'Schedule device on/off' },
    ];

    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(currentPrefix);
    const applyEntity = this.editor._config.target_entity || '';
    const minimalConfigComplete = prefixValid && !!applyEntity;

    const domains = this.getApplyIncludeDomains();
    const globalSelectorCtor = customElements.get('ha-selector');
    const canRenderSelector = !!globalSelectorCtor;

    const headerKey = this.editor._isEditing ? 'headers.step1_edit' : 'headers.step1';

    return html`
      <div class="step-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <div class="step-header" style="margin-bottom: 0;">${this.editor.i18n._t(headerKey)}</div>
          <mwc-button outlined @click=${() => this.editor.handleShowHelp()}>
            ℹ️ ${this.editor.i18n._t('actions.component_info')}
          </mwc-button>
        </div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step1')}</div>

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

        <div class="field-group">
          <label class="field-label">1. ${this.editor.i18n._t('fields.target_entity_label')}</label>
          <div class="field-description">${this.editor.i18n._t('fields.target_entity_desc')}</div>
          ${canRenderSelector ? html`
            <ha-selector
              .hass=${this.editor.hass}
              .selector=${{ entity: { domain: domains.length === 1 ? domains[0] : domains } }}
              .value=${applyEntity}
              .label=${"Target Entity"}
              @value-changed=${(e) => {
          const v = e?.detail?.value;
          this.editor._updateConfig('target_entity', v);
          this.editor._dispatchConfigChanged(true);
        }}
            ></ha-selector>
          ` : html`
            ${this.editor._renderTextInput('target_entity', applyEntity, 'entity_id (es. climate.salotto)')}
            <div style="margin-top:8px; color:#94a3b8; font-size:0.85rem;">
              ${this.editor.i18n._t('ui.entity_selector_unavailable')}
            </div>
          `}
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('ui.identification_prefix')}</label>
          <div class="field-description">
            ${this.editor.i18n._t('ui.prefix_description')}
          </div>
          <ha-textfield
            .label=${`sensor.${currentPrefix}...`}
            .value=${currentPrefix || ''}
            @input=${(e) => this._handlePrefixChange(e.target.value, e)}
            @change=${() => this.editor._dispatchConfigChanged(true)}
          ></ha-textfield>
          
          <div style="margin-top: 12px;">
            ${prefixValid
        ? html`<div style="color: #4ade80; font-weight: 500;">✅ ${this.editor.i18n._t('ui.prefix_ok')}</div>`
        : html`<div style="color: #ef4444; font-weight: 500;">❌ ${this.editor.i18n._t('ui.prefix_bad')}</div>`
      }
          </div>
        </div>

        ${minimalConfigComplete ? html`
          <div class="success-box">
            <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">✅ ${this.editor.i18n._t('ui.minimal_config_complete')}</div>
            <div style="color: #cbd5e1; margin-bottom: 20px;">${this.editor.i18n._t('ui.minimal_config_help')}</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <mwc-button raised @click=${() => this._handleSaveAndClose()}>
                💾 ${this.editor.i18n._t('actions.save_and_close')}
              </mwc-button>
              <mwc-button outlined @click=${() => this._handleAdvancedConfig()}>
                ⚙️ ${this.editor.i18n._t('actions.advanced_config')}
              </mwc-button>
            </div>
          </div>
        ` : html`
          <div class="info-box">
            <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">ℹ️ ${this.editor.i18n._t('ui.minimal_config_needed')}</div>
            <p>${this.editor.i18n._t('ui.minimal_config_help')}</p>
          </div>
        `}
      </div>
    `;
  }

  selectPresetWithPrefix(presetId) {
    this.editor._selectedPreset = presetId;
    const tags = {
      'thermostat': 'thermostat',
      'ev_charging': 'ev_charging',
      'generic_kwh': 'generic_kwh',
      'generic_temperature': 'generic_temperature',
      'generic_switch': 'generic_switch'
    };
    const tag = tags[presetId] || presetId;
    const newPrefix = `cronostar_${tag}_`;

    this.editor._updateConfig('preset_type', presetId);
    this.editor._updateConfig('global_prefix', newPrefix);

    const config = this.editor._config;
    // Standard checks for enabled and select entities
    // Improved isStandard to handle full entity IDs (e.g. switch.cronostar_..._enabled)
    const isStandard = (val, suffix) => {
      if (!val) return true;
      return val.includes('cronostar_') && (val.endsWith(suffix) || val.endsWith(suffix.replace('d', '')));
    };

    if (isStandard(config.enabled_entity, 'enabled')) {
      this.editor._updateConfig('enabled_entity', `switch.${newPrefix}enabled`);
    }
    if (isStandard(config.profiles_select_entity, 'current_profile') || isStandard(config.profiles_select_entity, 'profiles')) {
      this.editor._updateConfig('profiles_select_entity', `select.${newPrefix}current_profile`);
    }

    this.editor._dispatchConfigChanged(true);
    this.editor.requestUpdate();
  }

  _handlePrefixChange(value, event) {
    const editor = this.editor;
    const target = event.target;
    let start = target.selectionStart;
    let end = target.selectionEnd;
    
    // Normalize: lowercase and valid characters only. Don't force trailing underscore while typing.
    let normalizedValue = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    let newConfig = { ...editor._config, global_prefix: normalizedValue };
    const presetId = editor._selectedPreset || 'thermostat';
    const presetConfig = CARD_CONFIG_PRESETS[presetId];
    const baseTitle = presetConfig ? presetConfig.title : 'CronoStar Schedule';
    const tags = {
      'thermostat': 'thermostat',
      'ev_charging': 'ev_charging',
      'generic_kwh': 'generic_kwh',
      'generic_temperature': 'generic_temperature',
      'generic_switch': 'generic_switch'
    };
    const tag = tags[presetId] || presetId;
    // const basePrefix = `cronostar_${tag}_`; // Not used
    
    // Use the full prefix as title, replacing underscores with spaces
    let newTitle = normalizedValue.replace(/_/g, ' ').trim();
    if (!newTitle) newTitle = baseTitle;
    newConfig.title = newTitle;
    
    // Update enabled and select entities if they look like defaults
    const isStandard = (val, suffix) => {
      if (!val) return true;
      return val.includes('cronostar_') && (val.endsWith(suffix) || val.endsWith(suffix.replace('d', '')));
    };

    if (isStandard(newConfig.enabled_entity, 'enabled')) {
      newConfig.enabled_entity = `switch.${normalizedValue}enabled`;
    }
    if (isStandard(newConfig.profiles_select_entity, 'current_profile') || isStandard(newConfig.profiles_select_entity, 'profiles')) {
      newConfig.profiles_select_entity = `select.${normalizedValue}current_profile`;
    }

    editor._config = newConfig;
    target.value = normalizedValue;
    try {
      target.setSelectionRange(start, end);
    } catch (e) {}
    editor.requestUpdate();
  }

  async _handleSaveAndClose() {
    console.log('[Step1] Save & Close clicked');
    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    this.editor._updateConfig('global_prefix', currentPrefix, true);
    await this.editor.updateComplete;
    if (this.editor.hass) {
      try {
        console.log('[Step1] Triggering finish click');
        await this.editor._handleFinishClick({ force: true });
        console.log('[Step1] Finish click completed');
      } catch (e) {
        console.error("Save & Close failed:", e);
      }
    } else {
      console.warn('[Step1] Hass not available');
    }
  }

  async _handleAdvancedConfig() {
    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    this.editor._updateConfig('global_prefix', currentPrefix, true);
    await this.editor.updateComplete;
    if (this.editor.hass) {
      try {
        await this.editor._handleFinishClick({ force: true });
        this.editor._step = 2;
        this.editor.requestUpdate();
      } catch (e) {
        console.error("Advanced Config failed:", e);
        this.editor._step = 2;
        this.editor.requestUpdate();
      }
    }
  }

  getApplyIncludeDomains() {
    switch (this.editor._selectedPreset) {
      case 'thermostat': return ['climate'];
      case 'ev_charging': return ['number', 'input_number'];
      case 'generic_switch': return ['switch', 'input_boolean'];
      case 'generic_kwh': return ['number', 'input_number'];
      case 'generic_temperature': return ['number', 'input_number', 'sensor'];
      default: return [];
    }
  }
}
