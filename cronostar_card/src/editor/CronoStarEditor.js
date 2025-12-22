// editor/CronoStarEditor.js
import { LitElement, html, css } from 'lit';
import { CARD_CONFIG_PRESETS, DEFAULT_CONFIG, COLORS, validateConfig } from '../config.js';
import { normalizePrefix, getEffectivePrefix, isValidPrefix } from '../utils/prefix_utils.js';
import { buildHelpersFilename, buildAutomationFilename } from '../utils/filename_utils.js';
import { EditorI18n } from './EditorI18n.js';
import { EditorWizard } from './EditorWizard.js';
import { Step1Preset } from './steps/Step1Preset.js';
import { Step2Entities } from './steps/Step2Entities.js';
import { Step3Options } from './steps/Step3Options.js';
import { Step4Automation } from './steps/Step4Automation.js';
import { Step5Summary } from './steps/Step5Summary.js';
import {
  copyToClipboard,
  downloadFile,
  handleCreateHelpersYaml,
  handleCreateAutomationYaml,
  handleCreateAndReloadAutomation,
  runDeepChecks,
  handleInitializeData,
  handleSaveAll
} from './services/service_handlers.js';
import { buildAutomationYaml, buildInputNumbersYaml } from './yaml/yaml_generators.js';

export class CronoStarEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
      _step: { type: Number },
      _selectedPreset: { type: String },
      _automationYaml: { type: String },
      _showAutomationPreview: { type: Boolean },
      _helpersYaml: { type: String },
      _showHelpersPreview: { type: Boolean },
      _language: { type: String },
      _quickCheck: { type: Object },
      _deepReport: { type: Object },
      _deepCheckRanForStep1: { type: Boolean },
      _deepCheckSubscribed: { type: Boolean },
      _calculatedHelpersFilename: { type: String },
      _calculatedAutomationFilename: { type: String },
      _creatingAutomation: { type: Boolean },
      _deepCheckInProgress: { type: Boolean },
      _showStepError: { type: Boolean }
    };
  }

  static get styles() {
    return css`
      .editor-container { 
        padding: 24px;
        background: linear-gradient(135deg, 
          #1a1f2e 0%,
          #252b3d 100%
        );
        border-radius: 12px;
        color: #e8eaf0;
      }
      
      .wizard-steps { 
        display: flex; 
        justify-content: space-between; 
        margin-bottom: 32px;
        padding: 20px;
        background: linear-gradient(135deg, 
          rgba(42, 48, 66, 0.95) 0%,
          rgba(32, 38, 56, 0.95) 100%
        );
        backdrop-filter: blur(10px);
        border-radius: 16px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      
      .step-badge {
        width: 52px; 
        height: 52px; 
        border-radius: 50%;
        background: linear-gradient(145deg, 
          #3a4158,
          #2a3042
        );
        color: #a0a8c0; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        font-weight: 700;
        font-size: 1.3rem;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
          0 8px 20px rgba(0, 0, 0, 0.5),
          inset 0 -2px 4px rgba(0, 0, 0, 0.4),
          inset 0 2px 4px rgba(255, 255, 255, 0.1);
        position: relative;
        border: 2px solid rgba(255, 255, 255, 0.05);
      }
      
      .step-badge::before {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        right: 3px;
        height: 45%;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.15), transparent);
        border-radius: 50%;
        pointer-events: none;
      }
      
      .step-badge:hover {
        transform: translateY(-3px) scale(1.08);
        box-shadow: 
          0 12px 28px rgba(0, 0, 0, 0.6),
          inset 0 -2px 4px rgba(0, 0, 0, 0.4),
          inset 0 2px 4px rgba(255, 255, 255, 0.15);
        color: #cbd3e8;
        border-color: rgba(255, 255, 255, 0.1);
      }
      
      .step-badge:active {
        transform: translateY(0px) scale(0.96);
        box-shadow: 
          0 4px 12px rgba(0, 0, 0, 0.5),
          inset 0 2px 6px rgba(0, 0, 0, 0.5);
      }
      
      .step-badge.active { 
        background: linear-gradient(145deg, 
          #0ea5e9,
          #0284c7
        );
        color: #ffffff;
        box-shadow: 
          0 12px 32px rgba(14, 165, 233, 0.5),
          0 0 40px rgba(14, 165, 233, 0.3),
          inset 0 -2px 4px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(255, 255, 255, 0.3);
        border-color: rgba(255, 255, 255, 0.2);
        animation: pulse 2.5s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { 
          box-shadow: 
            0 12px 32px rgba(14, 165, 233, 0.5),
            0 0 40px rgba(14, 165, 233, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3),
            inset 0 2px 4px rgba(255, 255, 255, 0.3);
        }
        50% { 
          box-shadow: 
            0 12px 40px rgba(14, 165, 233, 0.7),
            0 0 60px rgba(14, 165, 233, 0.5),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3),
            inset 0 2px 4px rgba(255, 255, 255, 0.4);
        }
      }
      
      .step-content { 
        min-height: 300px;
        padding: 28px;
        background: linear-gradient(135deg, 
          rgba(42, 48, 66, 0.9) 0%,
          rgba(32, 38, 56, 0.9) 100%
        );
        backdrop-filter: blur(10px);
        border-radius: 12px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      
      .wizard-actions { 
        display: flex; 
        justify-content: space-between; 
        margin-top: 24px;
        padding: 20px;
        background: linear-gradient(135deg, 
          rgba(42, 48, 66, 0.95) 0%,
          rgba(32, 38, 56, 0.95) 100%
        );
        backdrop-filter: blur(10px);
        border-radius: 12px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      
      mwc-button {
        --mdc-theme-primary: #0ea5e9;
        position: relative;
        overflow: visible;
      }
      
      mwc-button[raised] {
        background: linear-gradient(145deg, 
          #0ea5e9,
          #0284c7
        ) !important;
        box-shadow: 
          0 8px 20px rgba(14, 165, 233, 0.4),
          0 0 30px rgba(14, 165, 233, 0.2),
          inset 0 -2px 4px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(255, 255, 255, 0.2) !important;
        border: 2px solid rgba(255, 255, 255, 0.1) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        color: #ffffff !important;
      }
      
      mwc-button[raised]::before {
        content: '';
        position: absolute;
        top: 2px;
        left: 8px;
        right: 8px;
        height: 40%;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent);
        border-radius: 4px;
        pointer-events: none;
      }
      
      mwc-button[raised]:hover {
        transform: translateY(-3px);
        box-shadow: 
          0 12px 28px rgba(14, 165, 233, 0.5),
          0 0 40px rgba(14, 165, 233, 0.3),
          inset 0 -2px 4px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(255, 255, 255, 0.3) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
      }
      
      mwc-button[raised]:active {
        transform: translateY(0px);
        box-shadow: 
          0 4px 12px rgba(14, 165, 233, 0.4),
          inset 0 2px 6px rgba(0, 0, 0, 0.4) !important;
      }
      
      mwc-button[outlined] {
        border: 2px solid #0ea5e9 !important;
        background: linear-gradient(145deg, 
          rgba(48, 55, 75, 0.95),
          rgba(38, 44, 62, 0.95)
        ) !important;
        color: #60d5ff !important;
        box-shadow: 
          0 6px 16px rgba(0, 0, 0, 0.3),
          inset 0 1px 2px rgba(255, 255, 255, 0.1) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      
      mwc-button[outlined]:hover {
        transform: translateY(-3px);
        box-shadow: 
          0 8px 20px rgba(0, 0, 0, 0.4),
          0 0 30px rgba(14, 165, 233, 0.2),
          inset 0 1px 2px rgba(255, 255, 255, 0.15) !important;
        background: linear-gradient(145deg, 
          rgba(58, 65, 85, 0.95),
          rgba(48, 54, 72, 0.95)
        ) !important;
        border-color: #60d5ff !important;
      }
      
      mwc-button[outlined]:active {
        transform: translateY(0px);
        box-shadow: 
          0 3px 10px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(0, 0, 0, 0.3) !important;
      }
      
      .field-group { 
        margin-bottom: 24px;
        padding: 20px;
        background: linear-gradient(145deg, 
          rgba(48, 55, 75, 0.7),
          rgba(38, 44, 62, 0.7)
        );
        border-radius: 12px;
        box-shadow: 
          0 6px 20px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        transition: all 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .field-group:hover {
        box-shadow: 
          0 8px 24px rgba(0, 0, 0, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.1);
      }
      
      .field-label { 
        display: block; 
        font-weight: 600; 
        margin-bottom: 10px;
        color: #ffffff;
        font-size: 1.05rem;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }
      
      .field-description { 
        font-size: 0.9em; 
        color: #a0a8c0; 
        margin-bottom: 14px;
        line-height: 1.6;
      }
      
      .hint { 
        font-size: 0.85em; 
        color: #8891a8; 
        margin-top: 10px;
        padding: 10px 14px;
        background: rgba(14, 165, 233, 0.08);
        border-radius: 8px;
        border-left: 3px solid #0ea5e9;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
      }
      
      .success-box { 
        background: linear-gradient(145deg,
          rgba(34, 197, 94, 0.15),
          rgba(22, 163, 74, 0.12)
        );
        padding: 18px; 
        border-radius: 12px; 
        border-left: 4px solid #22c55e;
        box-shadow: 
          0 6px 20px rgba(34, 197, 94, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        margin: 20px 0;
        color: #bbf7d0;
      }
      
      .info-box { 
        background: linear-gradient(145deg,
          rgba(14, 165, 233, 0.15),
          rgba(2, 132, 199, 0.12)
        );
        padding: 18px; 
        border-radius: 12px; 
        border-left: 4px solid #0ea5e9;
        box-shadow: 
          0 6px 20px rgba(14, 165, 233, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        margin: 20px 0;
        color: #bae6fd;
      }
      
      .warning-box {
        background: linear-gradient(145deg,
          rgba(251, 146, 60, 0.15),
          rgba(249, 115, 22, 0.12)
        );
        padding: 18px;
        border-radius: 12px;
        border-left: 4px solid #fb923c;
        box-shadow: 
          0 6px 20px rgba(251, 146, 60, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        margin: 20px 0;
        color: #fed7aa;
      }
      
      ha-textfield, ha-select {
        width: 100%;
        --mdc-theme-primary: #0ea5e9;
        --mdc-text-field-fill-color: rgba(38, 44, 62, 0.6);
        --mdc-text-field-ink-color: #e8eaf0;
        --mdc-text-field-label-ink-color: #a0a8c0;
        --mdc-text-field-outlined-idle-border-color: rgba(255, 255, 255, 0.12);
        --mdc-text-field-outlined-hover-border-color: rgba(14, 165, 233, 0.5);
      }
      
      ha-switch {
        --mdc-theme-secondary: #0ea5e9;
        --switch-checked-button-color: #0ea5e9;
        --switch-checked-track-color: rgba(14, 165, 233, 0.5);
      }
      
      .action-buttons {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      
      textarea { 
        width: 100%; 
        font-family: 'Courier New', monospace; 
        min-height: 200px;
        padding: 14px;
        border: 2px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        background: rgba(28, 33, 48, 0.8);
        color: #e8eaf0;
        transition: all 0.3s ease;
        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.3);
      }
      
      textarea:focus {
        outline: none;
        border-color: #0ea5e9;
        box-shadow: 
          0 0 0 4px rgba(14, 165, 233, 0.2),
          inset 0 2px 6px rgba(0, 0, 0, 0.3);
        background: rgba(28, 33, 48, 0.95);
      }
      
      .step-header {
        font-size: 1.6rem;
        font-weight: 700;
        margin-bottom: 18px;
        color: #ffffff;
        background: linear-gradient(135deg, #0ea5e9, #60d5ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-shadow: 0 4px 8px rgba(14, 165, 233, 0.3);
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
      }
      
      .step-description {
        font-size: 1rem;
        color: #cbd3e8;
        margin-bottom: 28px;
        line-height: 1.7;
      }

      /* Grid for Presets */
      .preset-cards {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 12px !important;
        margin-top: 16px !important;
        width: 100% !important;
      }

      .preset-card {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        padding: 16px !important;
        background: #3c3c3c !important;
        border-radius: 8px !important;
        border: 1px solid #555 !important;
        color: #ffffff !important;
        cursor: pointer !important;
        min-height: 110px !important;
        transition: all 0.2s ease !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      .preset-card:hover {
        background: #4a4a4a !important;
      }

      .preset-card.selected {
        border: 2px solid #00b0ff !important;
        box-shadow: 0 0 10px rgba(0, 176, 255, 0.4) !important;
      }

      .preset-icon { font-size: 2.2rem !important; margin-bottom: 4px !important; }
      .preset-title { font-weight: 600 !important; font-size: 1rem !important; }
      .preset-description { font-size: 0.8rem !important; color: #b0b0b0 !important; }
    `;
  }
  constructor() {
    super();
    this._step = 1;
    this._config = { ...DEFAULT_CONFIG };
    this._language = 'en';
    this.i18n = new EditorI18n('en');
    this.wizard = new EditorWizard(this);

    // Bind methods
    this._renderTextInput = this._renderTextInput.bind(this);
    this._renderButton = this._renderButton.bind(this);

    // Expose ALL service handlers to children steps
    this.serviceHandlers = {
      copyToClipboard,
      downloadFile,
      handleCreateHelpersYaml,
      handleCreateAutomationYaml,
      handleCreateAndReloadAutomation,
      runDeepChecks,
      handleInitializeData,
      handleSaveAll
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._deepCheckRanForStep1 = false;
    this._deepCheckSubscribed = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribeDeep) {
      try { this._unsubscribeDeep(); } catch { }
      this._unsubscribeDeep = null;
    }
    this._deepCheckSubscribed = false;
  }

  async _ensureDeepCheckSubscription() {
    if (this.hass?.connection && !this._deepCheckSubscribed) {
      try {
        this._unsubscribeDeep = await this.hass.connection.subscribeEvents((ev) => {
          const data = ev?.event?.data ?? ev?.data ?? ev;
          if (data) {
            this._deepReport = data;
            this.requestUpdate();
          }
        }, 'cronostar_setup_report');
        this._deepCheckSubscribed = true;
      } catch (e) {
        console.warn('Failed to subscribe to deep check reports:', e);
      }
    }
  }

  updated(changedProps) {
    super.updated?.(changedProps);
    if (changedProps.has('hass')) {
      this._ensureDeepCheckSubscription();
      if (this.hass && this._step === 1 && !this._deepCheckRanForStep1) {
        this._deepCheckRanForStep1 = true;
        this._runDeepChecks();
      }
    }
    if (changedProps.has('_step') && this._step === 1 && this.hass && !this._deepCheckRanForStep1) {
      this._deepCheckRanForStep1 = true;
      this._runDeepChecks();
    }
  }

  setConfig(config) {
    try {
      this._config = validateConfig(config);
    } catch (e) {
      console.warn("Config validation warning:", e);
      this._config = { ...DEFAULT_CONFIG, ...config };
    }

    if (this._config.preset) this._selectedPreset = this._config.preset;

    if (this.hass && this.hass.language) {
      this._language = this.hass.language.split('-')[0];
      this.i18n = new EditorI18n(this._language);
    }

    this._syncConfigAliases();
    this._updateAutomationYaml();
    this._updateHelpersYaml();
  }

  _isElDefined(tag) {
    return customElements.get(tag) !== undefined;
  }

  _syncConfigAliases() {
    const p = normalizePrefix(this._config.global_prefix);
    this._calculatedHelpersFilename = buildHelpersFilename(p);
    this._calculatedAutomationFilename = buildAutomationFilename(p);
  }

  _updateAutomationYaml() {
    this._automationYaml = buildAutomationYaml(this._config, 'list');
  }

  _updateHelpersYaml() {
    this._helpersYaml = buildInputNumbersYaml(this._config, false);
  }

  _dispatchConfigChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _persistCardConfigNow() {
    // Config persistence is unified into save_profile (meta).
    return Promise.resolve();
  }

  _showToast(message) {
    const event = new CustomEvent('hass-notification', {
      detail: { message, duration: 3000 },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  // Implementation of _runDeepChecks called by Wizard
  async _runDeepChecks() {
    if (!this.hass) return;
    this._deepCheckInProgress = true;
    this.requestUpdate();

    try {
      await runDeepChecks(this.hass, this._config, this._language);
      // The actual report will arrive via the 'cronostar_setup_report' event subscription.
    } catch (e) {
      console.warn("Deep check failed:", e);
    } finally {
      this._deepCheckInProgress = false;
      this.requestUpdate();
    }
  }

  _renderWizardSteps() {
    const steps = [1, 2, 3, 4, 5];
    return html`
      <div class="wizard-steps">
        ${steps.map(s => html`
          <div class="step-badge ${this._step === s ? 'active' : ''}" 
               @click=${() => { if (s < this._step) this._step = s; }}>
            ${s}
          </div>
        `)}
      </div>
    `;
  }

  _renderStepContent() {
    switch (this._step) {
      case 1: return new Step1Preset(this).render();
      case 2: return new Step2Entities(this).render();
      case 3: return new Step3Options(this).render();
      case 4: return new Step4Automation(this).render();
      case 5: return new Step5Summary(this).render();
      default: return html`<div>Unknown Step</div>`;
    }
  }

  _renderTextInput(key, value, placeholder = '') {
    return html`
      <ha-textfield
        .label=${placeholder}
        .value=${value || ''}
        @input=${(e) => this._updateConfig(key, e.target.value)}
        style="width: 100%;"
      ></ha-textfield>
    `;
  }

  renderTextInput(key, value, placeholder) {
    return this._renderTextInput(key, value, placeholder);
  }

  // Public wrapper for renderButton
  renderButton(label, click, disabled = false, outlined = false) {
    return this._renderButton({ label, click, disabled, outlined });
  }

  _renderButton({ label, click, disabled = false, outlined = false }) {
    if (outlined) {
      return html`<mwc-button outlined ?disabled=${disabled} @click=${click}>${label}</mwc-button>`;
    }
    return html`<mwc-button raised ?disabled=${disabled} @click=${click}>${label}</mwc-button>`;
  }


  _updateConfig(key, value) {
    const newConfig = { ...this._config, [key]: value };
    // Hard-remove deprecated keys (breaking change)
    if ('entity_prefix' in newConfig) delete newConfig.entity_prefix;
    this._config = newConfig;

    if (key === 'preset') {
      const presetConfig = CARD_CONFIG_PRESETS[value];
      if (presetConfig) {
        const merged = { ...this._config, ...presetConfig };
        if ('entity_prefix' in merged) delete merged.entity_prefix;
        this._config = merged;
        this._selectedPreset = value;
      }
    }

    this._syncConfigAliases();
    this._updateAutomationYaml();
    this._updateHelpersYaml();
    this._dispatchConfigChanged();
  }

  _handleNextClick() {
    if (this._canGoNext()) {
      this._showStepError = false;
      this.wizard._nextStep();
    } else {
      this._showStepError = true;
      this.requestUpdate();
    }
  }

  async _handleFinishClick(options = {}) {
    const force = options.force === true;

    if ((this._step === 5 || force) && this.hass) {
      try {
        const result = await handleSaveAll(this.hass, this._config, this._deepReport, this._language);
        this._showToast(result.message);

        if (force) {
          const closeEvent = new CustomEvent('closed', { bubbles: true, composed: true });
          this.dispatchEvent(closeEvent);
        }

      } catch (e) {
        this._showToast(`✗ ${e.message}`);
      }
    }

    this._persistCardConfigNow();
    if (this.wizard && typeof this.wizard._finish === 'function') this.wizard._finish();
  }

  _canGoNext() {
    if (this._step === 1) {
      const p = normalizePrefix(this._config.global_prefix);
      return isValidPrefix(p) && !!this._config.target_entity;
    }
    return true;
  }

  _renderWizardActions() {
    if (this._step === 1) {
      const valid = this._canGoNext();
      if (!valid) {
        return html`
               <div class="wizard-actions">
                  <div style="flex:1"></div>
                  <div class="hint" style="color: var(--error-color);">
                    ${this.i18n._t('ui.minimal_config_needed')}
                  </div>
               </div>`;
      }
      return html``;
    }

    return html`
      <div class="wizard-actions">
        <div>
          ${this._step > 1 ? html`<mwc-button outlined @click=${() => this.wizard._prevStep()}>${this.i18n._t('actions.back')}</mwc-button>` : html``}
        </div>
        <div>
          ${this._step === 5
        ? html`<mwc-button raised @click=${() => this._handleFinishClick()}>${this.i18n._t('actions.save')}</mwc-button>`
        : html`<mwc-button raised @click=${() => this._handleNextClick()}>${this.i18n._t('actions.next')}</mwc-button>`}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="editor-container">
        ${this._renderWizardSteps()}
        ${this._renderStepContent()}
        ${this._renderWizardActions()}
      </div>
    `;
  }
}

customElements.define('cronostar-card-editor', CronoStarEditor);
