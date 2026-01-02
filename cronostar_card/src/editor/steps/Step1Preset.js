import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
    this._debugLoggedOnce = false;
  }

  render() {
    // Note: use CARD_CONFIG_PRESETS for titles and keep icons local to this step.
    // EditorI18n currently doesn't provide a `presets.*` structure.
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
    const applyExists = !!(applyEntity && this.editor.hass?.states?.[applyEntity]);
    const minimalConfigComplete = prefixValid && !!applyEntity;

    const domains = this.getApplyIncludeDomains();
    // Prefer ha-selector (HA core) instead of ha-entity-picker (often not registered globally in scoped contexts)
    const localRegistry = this.editor.renderRoot?.customElements;
    const localHasGet = !!(localRegistry && typeof localRegistry.get === 'function');
    const localSelectorCtor = localHasGet ? localRegistry.get('ha-selector') : undefined;
    const globalSelectorCtor = customElements.get('ha-selector');
    const canRenderSelector = !!(localSelectorCtor || globalSelectorCtor);

    // LOG diagnostici (una volta per apertura step)
    if (!this._debugLoggedOnce) {
      this._debugLoggedOnce = true;
      try {
        console.log('[WIZARD-STEP1] target_entity UI debug', {
          hass: !!this.editor.hass,
          hassStatesCount: this.editor.hass?.states ? Object.keys(this.editor.hass.states).length : 0,
          preset: this.editor._selectedPreset,
          includeDomains: domains,
          applyEntity,
          applyExists,
          minimalConfigComplete,
          // registry / element availability
          hasRenderRoot: !!this.editor.renderRoot,
          hasLocalRegistry: !!localRegistry,
          localHasGet,
          localSelectorDefined: !!localSelectorCtor,
          globalSelectorDefined: !!globalSelectorCtor,
          canRenderSelector,
          // DOM context hints
          editorTag: this.editor.tagName,
        });
      } catch (e) {
        console.log('[WIZARD-STEP1] target_entity UI debug (failed to serialize)', e);
      }
    }
    if (!canRenderSelector && customElements.whenDefined) {
      // Pianifica un aggiornamento quando il selector sarà definito globalmente
      customElements.whenDefined('ha-selector').then(() => {
        try { this.editor.requestUpdate(); } catch (_) { /* ignore */ }
      });
    }

    const headerKey = this.editor._isEditing ? 'headers.step1_edit' : 'headers.step1';

    return html`
      <div class="step-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
          <div class="step-header" style="margin-bottom: 0;">${this.editor.i18n._t(headerKey)}</div>
          <mwc-button outlined @click=${() => this.editor.handleShowHelp()} style="--mdc-theme-primary: #0ea5e9;">
            ℹ️ ${this.editor.i18n._t('actions.component_info')}
          </mwc-button>
        </div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step1')}</div>

        <div class="preset-cards" style="margin-bottom: 24px;">
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

        <div class="field-group" style="margin-bottom: 24px;">
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
            <div style="margin-top:8px; color:#a0a8c0; font-size:0.85rem;">
              ${this.editor.i18n._t('ui.entity_selector_unavailable')}
            </div>
          `}
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
        ? html`<div style="color: #cbd3e8; font-size: 1rem; margin-bottom: 8px;">${this.editor.i18n._t('ui.prefix_ok')}</div>`
        : html`<div style="color: var(--error-color); font-size: 1rem; margin-bottom: 8px;">${this.editor.i18n._t('ui.prefix_bad')}</div>`
      }
        </div>

        ${minimalConfigComplete ? html`
          <div class="success-box" style="margin: 20px 0; border: 1px solid var(--success-color); padding: 16px; border-radius: 8px; background: rgba(0, 255, 0, 0.05);">
            <strong>✅ ${this.editor.i18n._t('ui.minimal_config_complete')}</strong>
            <div style="margin-top: 8px;">
              ${this.editor.i18n._t('ui.minimal_config_info_no_package', {
        '{entity}': `input_number.${currentPrefix}current`
      })}
            </div>
            <div style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
              <mwc-button raised @click=${() => this._handleSaveAndContinue()}>
                💾 ${this.editor.i18n._t('actions.save')} & ${this.editor.i18n._t('actions.next')}
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
      'thermostat': 'thermostat',
      'ev_charging': 'ev_charging',
      'generic_kwh': 'generic_kwh',
      'generic_temperature': 'generic_temperature',
      'generic_switch': 'generic_switch'
    };
    const newPrefix = `cronostar_${tags[presetId] || presetId}_`;

    this.editor._updateConfig('preset_type', presetId);
    this.editor._updateConfig('global_prefix', newPrefix);

    const presetConfig = CARD_CONFIG_PRESETS[presetId];
    if (presetConfig) {
      Object.assign(this.editor._config, presetConfig);
    }

    this.editor._dispatchConfigChanged(true);
    this.editor.requestUpdate();
  }

  async _handleSaveAndContinue() {
    this.editor._dispatchConfigChanged(true);
    if (this.editor.hass) {
      try {
        // Save files on server
        await this.editor._handleFinishClick({ force: true });
        // Move to Step 2
        this.editor.wizard._nextStep();
      } catch (e) {
        console.error("Save & Continue failed:", e);
        this.editor.wizard._nextStep();
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