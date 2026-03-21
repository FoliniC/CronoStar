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
    const headerKey = this.editor._isEditing ? 'headers.step1_edit' : 'headers.step1';

    const isPickerDefined = !!customElements.get('ha-entity-picker');
    const canRenderPicker = isPickerDefined || this.editor._pickerLoaded;

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
          ${canRenderPicker 
            ? html`<ha-entity-picker
                .hass=${this.editor.hass}
                .value=${applyEntity}
                .includeDomains=${domains}
                .label=${this.editor.i18n._t('fields.target_entity_label')}
                allow-custom-entity
                @value-changed=${(e) => {
                  const v = e?.detail?.value;
                  this.editor._updateConfig('target_entity', v);
                  this.editor._dispatchConfigChanged(true);
                }}
              ></ha-entity-picker>`
            : this.editor._renderTextInput('target_entity', applyEntity, 'domain.entity_id')
          }
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
    const cursor = target.selectionStart;
    
    if (!this._logCounter) this._logCounter = 0;
    this._logCounter++;
    const cid = this._logCounter;

    // 1. Pulizia caratteri ammessi
    let clean = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Identifichiamo il prefisso di default (es. cronostar_thermostat_)
    const presetId = editor._selectedPreset || 'thermostat';
    const tags = { 'thermostat': 'thermostat', 'ev_charging': 'ev_charging', 'generic_kwh': 'generic_kwh', 'generic_temperature': 'generic_temperature', 'generic_switch': 'generic_switch' };
    const defaultPrefix = `cronostar_${tags[presetId] || presetId}_`;
    const oldPrefix = editor._config.global_prefix || '';

    // Automazione SOLO se il cursore è alla fine della stringa e stiamo aggiungendo
    const isAtEnd = cursor >= value.length;
    let normalizedValue = clean;
    let opName = "NONE";

    if (isAtEnd && clean.length > oldPrefix.length) {
      const lastChar = clean.slice(-1);
      if (lastChar !== '_') {
        if (oldPrefix === defaultPrefix) {
          // Caso: base_ + a -> base_a_ (Preserva underscore base)
          normalizedValue = clean + '_';
          opName = "FIRST_CHAR_KEEP_BASE";
        } else if (oldPrefix.endsWith('_')) {
          // Caso: ...a_ + b -> ...ab_ (Collassa underscore auto precedente)
          normalizedValue = oldPrefix.slice(0, -1) + lastChar + '_';
          opName = "SUBSEQUENT_CHAR_COLLAPSE";
        } else {
          normalizedValue = clean + '_';
          opName = "ADD_TRAILING";
        }
      }
    }

    console.log(`[PREFIX-LOG] #${cid} - OP: ${opName} | OLD: "${oldPrefix}" | INPUT: "${value}" | RES: "${normalizedValue}" | CURSOR: ${cursor}`);

    // Aggiornamento config
    let newConfig = { ...editor._config, global_prefix: normalizedValue };
    const presetConfig = CARD_CONFIG_PRESETS[presetId];
    const baseTitle = presetConfig ? presetConfig.title : 'CronoStar Schedule';
    
    let titleBase = normalizedValue.replace(/_+$/, '').replace(/_/g, ' ').trim();
    newConfig.title = (titleBase || baseTitle).charAt(0).toUpperCase() + (titleBase || baseTitle).slice(1);
    
    const isStandard = (val, suffix) => {
      if (!val) return true;
      return val.includes('cronostar_') && (val.endsWith(suffix) || val.endsWith(suffix.replace('d', '')));
    };
    if (isStandard(newConfig.enabled_entity, 'enabled')) newConfig.enabled_entity = `switch.${normalizedValue}enabled`;
    if (isStandard(newConfig.profiles_select_entity, 'current_profile')) newConfig.profiles_select_entity = `select.${normalizedValue}current_profile`;

    editor._config = newConfig;
    target.value = normalizedValue;
    
    // Ripristino Cursore prima dell'ultimo underscore
    try {
      if (isAtEnd && normalizedValue.length > 0) {
        const pos = normalizedValue.length - 1;
        target.setSelectionRange(pos, pos);
      } else {
        target.setSelectionRange(cursor, cursor);
      }
    } catch (e) {}
    
    editor.requestUpdate();
  }

  async _handleSaveAndClose() {
    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    this.editor._updateConfig('global_prefix', currentPrefix, true);
    await this.editor.updateComplete;
    if (this.editor.hass) {
      try {
        await this.editor._handleFinishClick({ force: true });
      } catch (e) {
        console.error("Save & Close failed:", e);
      }
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
    const preset = this.editor._selectedPreset || this.editor._config?.preset_type || 'thermostat';
    switch (preset) {
      case 'thermostat': return ['climate'];
      case 'ev_charging': return ['number', 'input_number'];
      case 'generic_switch': return ['switch', 'input_boolean'];
      case 'generic_kwh': return ['number', 'input_number'];
      case 'generic_temperature': return ['number', 'input_number', 'sensor'];
      default: return ['climate', 'number', 'input_number', 'switch', 'input_boolean', 'sensor'];
    }
  }
}
