import { html } from 'lit';
import { CARD_CONFIG_PRESETS } from '../../config.js';
import { getEffectivePrefix, isValidPrefix } from '../../utils/prefix_utils.js';

export class Step1Preset {
  constructor(editor) {
    this.editor = editor;
  }
  render() {
    const currentPrefix = this.editor._config.global_prefix || getEffectivePrefix(this.editor._config);
    const prefixValid = isValidPrefix(currentPrefix);
    const applyEntity = this.editor._config.apply_entity || '';
    const applyExists = !!(applyEntity && this.editor.hass?.states?.[applyEntity]);
    
    // Check if minimal config is complete
    const minimalConfigComplete = applyEntity && prefixValid;
    
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step1')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step1')}</div>
        
        <!-- 1. TARGET ENTITY (PRIMA) -->
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
            ? html`<div class="hint" style="color: var(--success-color);">✓ ${this.editor.i18n._t('step2_msgs.apply_ok')}</div>`
            : html`<div class="hint" style="color: var(--warning-color);">⚠️ ${this.editor.i18n._t('step2_msgs.missing_apply')}</div>`}
        </div>

        <!-- 2. PREFIX (SECONDA) -->
        <div class="field-group" style="margin-bottom: 24px;">
          <label class="field-label">2. ${this.editor.i18n._t('ui.identification_prefix')}</label>
          <div class="field-description">
            ${this.editor.i18n._t('ui.prefix_description_simple')}
          </div>
          ${this.editor._renderTextInput('global_prefix', currentPrefix, 'cronostar_')}
          <div class="hint">
            ${this.editor.i18n._t('ui.prefix_hint')}
            ${prefixValid
              ? html`<span style="color: var(--success-color); margin-left: 8px;">✓ ${this.editor.i18n._t('step2_msgs.prefix_ok')}</span>`
              : html`<span style="color: var(--error-color); margin-left: 8px;">⚠️ ${this.editor.i18n._t('step2_msgs.prefix_bad')}</span>`}
          </div>
        </div>

        <!-- INFO BOX: Minimal Configuration -->
        ${minimalConfigComplete ? html`
          <div class="success-box" style="margin: 20px 0;">
            <strong>✅ ${this.editor.i18n._t('ui.minimal_config_complete')}</strong>
            <div style="margin-top: 8px;">
              ${this.editor.i18n._t('ui.minimal_config_info', {
                '{entity}': `input_number.${currentPrefix}current`,
                '{package}': `${currentPrefix}package.yaml`
              })}
            </div>
            <div style="margin-top: 12px; display: flex; gap: 12px;">
              <mwc-button raised @click=${() => this._saveAndClose()}>
                ${this.editor.i18n._t('actions.save_and_close')}
              </mwc-button>
              <mwc-button outlined @click=${() => this.editor.wizard._nextStep()}>
                ${this.editor.i18n._t('actions.advanced_config')}
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

  _saveAndClose() {
    // Salva la configurazione e chiudi l'editor
    this.editor._dispatchConfigChanged();
    // Chiudi l'editor (trigger evento per Home Assistant)
    const closeEvent = new CustomEvent('closed', {
      bubbles: true,
      composed: true
    });
    this.editor.dispatchEvent(closeEvent);
  }
}