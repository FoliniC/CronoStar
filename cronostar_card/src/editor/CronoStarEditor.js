// editor/CronoStarEditor.js
import { LitElement, html, css } from 'lit';
import { CARD_CONFIG_PRESETS, DEFAULT_CONFIG, validateConfig } from '../config.js';
import { log } from '../utils/logger_utils.js';
import { normalizePrefix, isValidPrefix, getEffectivePrefix } from '../utils/prefix_utils.js';
import { debounce, Logger } from '../utils.js';
import { EditorI18n } from './EditorI18n.js';
import { EditorWizard } from './EditorWizard.js';
import { Step0Dashboard } from './steps/Step0Dashboard.js';
import { Step1Preset } from './steps/Step1Preset.js';
import { Step2Entities } from './steps/Step2Entities.js';
import { Step3Options } from './steps/Step3Options.js';
import { Step4Automation } from './steps/Step4Automation.js';
import { Step5Summary } from './steps/Step5Summary.js';
import {
  copyToClipboard,
  downloadFile,
  handleInitializeData
} from './services/service_handlers.js';
import { buildAutomationTemplate } from './yaml/yaml_generators.js';

export class CronoStarEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
      _step: { type: Number },
      _selectedPreset: { type: String },
      _automationYaml: { type: String },
      _language: { type: String },
      _creatingAutomation: { type: Boolean },
      _showStepError: { type: Boolean },
      // NUOVO: Proprietà reattive per Step 0 Dashboard
      _dashboardProfilesData: { type: Object },
      _dashboardLoading: { type: Boolean },
      _dashboardSelectedPreset: { type: String },
      _dashboardSelectedProfile: { type: String },
      _dashboardShowDetailModal: { type: Boolean },
      _dashboardDetailData: { type: Object },
      _dashboardIsEditingName: { type: Boolean },
      _dashboardEditName: { type: String },
      _isEditing: { type: Boolean },
      _pickerLoaded: { type: Boolean },
      _dashboardView: { type: String }, // 'choice' or 'status'
      logging_enabled: { type: Boolean }
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
    this._step = 0;
    this._config = { ...DEFAULT_CONFIG };
    // Initialize logging preference for the editor
    this._config.logging_enabled = DEFAULT_CONFIG.logging_enabled;
    this._language = 'en';
    this.i18n = new EditorI18n(this);
    this.wizard = new EditorWizard(this);

    // NUOVO: Proprietà reattive per Step 0 Dashboard
    this._dashboardProfilesData = null;
    this._dashboardLoading = false;
    this._dashboardSelectedPreset = null;
    this._dashboardSelectedProfile = null;
    this._dashboardShowDetailModal = false;
    this._dashboardDetailData = null;
    this._dashboardIsEditingName = false;
    this._dashboardEditName = "";
    this._isEditing = false;
    this._dashboardView = 'choice';
    // Forza il rendering del picker: la definizione può arrivare dal registry scoped (patch in main.js)
    this._pickerLoaded = true;

    this._showStepError = false;

    // Debounce config-changed to avoid constant card recreations while typing
    this._debouncedDispatch = debounce(() => {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...this._config, step: this._step } } }));
    }, 500);

    // Bind methods
    this._renderTextInput = this._renderTextInput.bind(this);
    this._renderButton = this._renderButton.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);

    // Expose ALL service handlers to children steps
    this.serviceHandlers = {
      copyToClipboard,
      downloadFile,
      handleInitializeData,
      saveGlobalSettings: (settings) => this._saveGlobalSettings(settings)
    };
  }

  async _saveGlobalSettings(settings) {
    if (!this.hass) return;
    try {
      await this.hass.callService('cronostar', 'save_settings', {
        settings: settings
      });
      this.showToast(this._language === 'it' ? 'Impostazioni globali salvate' : 'Global settings saved');
      
      // Update local card instance if possible
      const cardEl = this.getRootNode().host;
      if (cardEl && 'globalSettings' in cardEl) {
        cardEl.globalSettings = settings;
      }
    } catch (e) {
      log('error', this._config.logging_enabled, 'Error saving global settings:', e);
      this.showToast(`✗ ${e.message}`);
    }
  }



  handleShowHelp() {
    const lang = this._language || 'en';
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  updated(changedProps) {
    super.updated?.(changedProps);
    if (changedProps.has('hass')) {
      if (this.hass) {
        log('info', this._config.logging_enabled, 'HASS object received/updated');
      }
    }
    if (changedProps.has('_step')) {
      // ✅ FIX: Dispatch immediately on step change so preview is updated
      // Only dispatch if NOT in Step 0 (Dashboard), to prevent loading the preview card there
      if (this._step !== 0) {
        this._dispatchConfigChanged(true);
      }
    }

    // Hide preview in Step 0
    this._updatePreviewVisibility();
    
    // Manage standard HA SAVE button visibility
    this._updateSaveButtonVisibility();
  }

  _updateSaveButtonVisibility() {
    try {
      const shouldHide = (this._step >= 0 && this._step <= 3);
      const root = document.head;
      let styleEl = document.getElementById('cronostar-editor-save-button-hide');

      if (shouldHide) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'cronostar-editor-save-button-hide';
          root.appendChild(styleEl);
        }
        styleEl.textContent = `
          /* CronoStar: Aggressively hide standard HA Save button in wizard steps 0-3 */
          mwc-button[slot="primaryAction"],
          ha-button[slot="primaryAction"],
          ha-dialog mwc-button[slot="primaryAction"],
          ha-dialog ha-button[slot="primaryAction"],
          .mdc-dialog__actions mwc-button[slot="primaryAction"],
          .mdc-dialog__actions ha-button[slot="primaryAction"],
          hui-dialog-edit-card mwc-button[slot="primaryAction"],
          hui-dialog-edit-card ha-button[slot="primaryAction"],
          ha-dialog ha-button,
          .primary-action {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `;
      } else if (styleEl) {
        styleEl.textContent = '';
      }
    } catch (e) {
      log('warn', this._config.logging_enabled, '[SAVE-BUTTON] Visibility update failed:', e);
    }
  }

  _updatePreviewVisibility() {
    try {
      const shouldHide = (this._step === 0);

      const root = this.getRootNode();
      if (!root || (root !== document && !(root instanceof ShadowRoot))) {
        return;
      }

      // Inject both in local root and global document for maximum coverage
      const targets = [root, document.head];

      targets.forEach(t => {
        if (!t) return;
        let styleEl = (t === document.head)
          ? document.getElementById('cronostar-editor-style-global')
          : root.getElementById('cronostar-editor-style');

        if (shouldHide) {
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = (t === document.head) ? 'cronostar-editor-style-global' : 'cronostar-editor-style';
            t.appendChild(styleEl);
          }

          styleEl.textContent = `
            /* CronoStar: Force 0x0 preview collapse */
            .element-preview,
            .preview,
            hui-card-preview,
            hui-card-preview-overlay,
            [class*="preview-container"],
            [class*="PreviewContainer"] {
              display: none !important;
              height: 0 !important;
              width: 0 !important;
              min-height: 0 !important;
              min-width: 0 !important;
              max-height: 0 !important;
              max-width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              opacity: 0 !important;
              visibility: hidden !important;
              pointer-events: none !important;
              position: absolute !important;
              transform: scale(0) !important;
              overflow: hidden !important;
              z-index: -9999 !important;
              left: -9999px !important;
              top: -9999px !important;
            }

            /* Kill grid gaps and padding in parent containers */
            .elements, .content, .container, hui-card-element-editor {
              gap: 0 !important;
              grid-gap: 0 !important;
              padding: 0 !important;
            }

            .element-editor, .editor, hui-card-editor {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 100% !important;
              flex: 1 1 100% !important;
            }
          `;
        } else if (styleEl) {
          styleEl.textContent = '';
        }
      });

      this._previewWasHidden = shouldHide;
    } catch (e) {
      log('warn', this._config.logging_enabled, '[PREVIEW] Visibility update failed:', e);
    }
  }

  _renderWizardSteps() {
    if (this._step === 0) return html``;
    const steps = [0, 1, 2, 3, 4, 5];
    const canJump = this._canGoNext();

    return html`
      <div class="wizard-steps">
        ${steps.map(s => html`
          <div
            class="step-badge ${this._step === s ? "active" : ""}"
            @click=${() => {
        if (s === 0 || s <= this._step || (canJump && this._step !== 0)) {
          this._step = s;
          this._dispatchConfigChanged(true); // Dispatch immediately on click
          this.requestUpdate();
        }
      }}
          >
            ${s === 0 ? '🏠' : s}
          </div>
        `)}
      </div>
    `;
  }

  setConfig(config) {
    try {
      this._config = validateConfig(config, config.logging_enabled);
      
      // IMPROVED: Check the normalized configuration
      this._isEditing = this._config && !config.not_configured && !!this._config.global_prefix && !!this._config.target_entity;
      
      Logger.log('CONFIG', `[Editor] setConfig - isEditing: ${this._isEditing}`, { 
        not_configured: config?.not_configured,
        has_prefix: !!this._config.global_prefix,
        has_target: !!this._config.target_entity 
      });
    } catch (e) {
      log('warn', this._config.logging_enabled, "Config validation warning:", e);
      this._config = { ...DEFAULT_CONFIG, ...config };
      this._isEditing = false;
    }

    if (this._config.preset_type) this._selectedPreset = this._config.preset_type;

    if (this.hass && this.hass.language) {
      this._language = this.hass.language.split('-')[0];
      this.i18n = new EditorI18n(this);
    }

    this._syncConfigAliases();
    this._updateAutomationYaml();
  }

  _isElDefined(tag) {
    return customElements.get(tag) !== undefined;
  }

  _syncConfigAliases() {
    // No-op - removed calculated filenames
  }

  _updateAutomationYaml() {
    this._automationYaml = buildAutomationTemplate(this._config);
  }

  // Ensure dispatched/saved config contains required fields and omits nulls
  _sanitizeConfig(cfg) {
    const out = { ...cfg };
    // Ensure type
    if (!out.type) out.type = 'custom:cronostar-card';
    
    // Always remove not_configured once we are in the editor and about to persist
    delete out.not_configured;

    // Remove null/undefined/empty-string values
    for (const key of Object.keys(out)) {
      const val = out[key];
      if (val === null || val === undefined || val === '') {
        delete out[key];
      }
    }
    return out;
  }

  _dispatchConfigChanged(immediate = false) {
    if (immediate) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      // Ensure type is present and correct, and pass current step
      const configToDispatch = { ...this._sanitizeConfig(this._config), step: this._step };

      // Log the exact payload intended for YAML persistence via standard Save using CronoStar Logger
      Logger.log('CONFIG', '[EDITOR] YAML save intent (standard Save):', configToDispatch);
      Logger.log('CONFIG', 'Dispatching config-changed', configToDispatch);
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: configToDispatch },
        bubbles: true,
        composed: true
      }));
    } else {
      this._debouncedDispatch();
    }
  }

  _persistCardConfigNow() {
    // Config persistence is unified into save_profile (meta).
    return Promise.resolve();
  }

  showToast(message) {
    const event = new CustomEvent('hass-notification', {
      detail: { message, duration: 3000 },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _handleResetConfig() {
    const confirmMsg = this.i18n._t('prompts.reset_confirm') || 'Are you sure you want to reset this card?';
    if (!this._isEditing || confirm(confirmMsg)) {
      this._config = { ...DEFAULT_CONFIG };
      this._isEditing = false;
      this._step = 1;
      this._dispatchConfigChanged(true);
      this.requestUpdate();
    }
  }

  _renderStepContent() {
    switch (this._step) {
      case 0: return new Step0Dashboard(this).render();
      case 1: return new Step1Preset(this).render();
      case 2: return new Step2Entities(this).render();
      case 3: return new Step3Options(this).render();
      case 4: return new Step4Automation(this).render();
      case 5: return new Step5Summary(this).render();
      default: return html`<div>Unknown Step</div>`;
    }
  }

  _handleLocalUpdate(key, value) {
    const newConfig = { ...this._config, [key]: value };
    newConfig.type = this._config.type || DEFAULT_CONFIG.type;
    if ('entity_prefix' in newConfig) delete newConfig.entity_prefix;
    this._config = newConfig;

    this._syncConfigAliases();
    this._updateAutomationYaml();
    // Immediately notify HA editor so the standard Save button persists latest values
    this._dispatchConfigChanged(true);
    this.requestUpdate();
  }

  _renderEntityPicker(key, value, label = "Entity") {
    // fallback se il picker non c'è (o non è ancora definito)
    if (!this._pickerLoaded) {
      return this._renderTextInput(key, value, label);
    }

    return html`
      <ha-entity-picker
        .hass=${this.hass}
        .label=${label}
        .value=${value ?? ""}
        allow-custom-entity
        @value-changed=${(ev) => {
        const v = ev?.detail?.value ?? "";
        // se vuoi salvare null quando vuoto:
        this._handleLocalUpdate(key, v === "" ? null : v);
        this._dispatchConfigChanged(true);
      }}
      ></ha-entity-picker>
    `;
  }

  // opzionale: wrapper pubblico come hai fatto per renderTextInput
  renderEntityPicker(key, value, label) {
    return this._renderEntityPicker(key, value, label);
  }

  _renderTextInput(key, value, placeholder = '') {
    return html`
      <ha-textfield
        .label=${placeholder}
        .value=${value || ''}
        @input=${(e) => this._handleLocalUpdate(key, e.target.value)}
        @change=${() => this._dispatchConfigChanged(true)}
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

  _updateConfig(key, value, immediate = false) {
    const newConfig = { ...this._config, [key]: value };

    // Explicitly enforce stable type to avoid reconstruction
    newConfig.type = this._config.type || DEFAULT_CONFIG.type;

    // Hard-remove deprecated keys
    if ('entity_prefix' in newConfig) delete newConfig.entity_prefix;

    if (key === 'preset_type') {
      const presetConfig = CARD_CONFIG_PRESETS[value];
      if (presetConfig) {
        Object.assign(newConfig, presetConfig);
        this._selectedPreset = value;
      }
    }

    // Ensure global_prefix is present
    if (!newConfig.global_prefix) {
      newConfig.global_prefix = getEffectivePrefix(newConfig);
    }

    this._config = newConfig;
    this._syncConfigAliases();
    this._dispatchConfigChanged(immediate);
  }

  _handleNextClick() {
    if (this._canGoNext()) {
      this._showStepError = false;
      this._dispatchConfigChanged(true);
      this.wizard._nextStep();
    } else {
      this._showStepError = true;
      this.requestUpdate();
    }
  }

  async _handleFinishClick(options = {}) {
    const isFinalStep = this._step === 5;
    const isForced = options.force === true;

    if ((isFinalStep || isForced) && this.hass) {
      // 1. Prepare final clean config for persistence (remove internal wizard helpers)
      let finalConfig = { ...this._config };
      delete finalConfig.step;

      // Ensure global_prefix is present and normalized on final save
      finalConfig.global_prefix = normalizePrefix(finalConfig.global_prefix || getEffectivePrefix(finalConfig));

      // Sanitize before dispatch/save
      finalConfig = this._sanitizeConfig(finalConfig);

      // Log what should be saved to YAML, then dispatch immediately so HA can persist
      Logger.log('CONFIG', '[EDITOR] YAML save intent (wizard Finish):', finalConfig);
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: finalConfig },
        bubbles: true,
        composed: true
      }));

      try {
        // 2. Perform backend operations (data analysis/initialization)
        const result = await handleInitializeData(this.hass, finalConfig, this._language);
        this.showToast(result.message);

        // 3. Update local state to show 'Finished' state if needed, 
        // but let the user click the HA "SAVE" button to close the dialog.
        if (isFinalStep) {
          this._step = 5;
          this.requestUpdate();
        }

      } catch (e) {
        log('error', this._config.logging_enabled, 'Finish error:', e);
        this.showToast(`✗ ${e.message}`);
      }
    } else {
      // Not at the end yet, just move next if possible
      if (this.wizard && typeof this.wizard._nextStep === 'function') {
        this.wizard._nextStep();
      }
    }

    if (this._persistCardConfigNow) {
      this._persistCardConfigNow();
    }

    if (this.wizard && typeof this.wizard._finish === 'function') {
      this.wizard._finish();
    }
  }

  _handleKeyDown(e) {
    // Disable exit on Enter if in wizard (step > 0)
    if (this._step > 0 && e.key === 'Enter') {
      // Only block if not in a textarea
      if (e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  _canGoNext() {
    if (this._step === 0) return true;
    if (this._step === 1) {
      const p = normalizePrefix(this._config.global_prefix);
      return isValidPrefix(p) && !!this._config.target_entity;
    }
    return true;
  }

  _renderWizardActions() {
    if (this._step === 0) {
      return html``;
    }

    if (this._step === 1) {
      const valid = this._canGoNext();
      if (!valid) {
        return html`
               <div class="wizard-actions">
                  <mwc-button outlined @click=${() => { this._step = 0; this.requestUpdate(); }}>
                    ${this.i18n._t('actions.back')}
                  </mwc-button>
                  <div style="flex:1"></div>
                  <div class="hint" style="color: var(--error-color);">
                    ${this.i18n._t('ui.minimal_config_needed')}
                  </div>
               </div>`;
      }
      return html`
        <div class="wizard-actions">
          <mwc-button outlined @click=${() => { this._step = 0; this.requestUpdate(); }}>
            ${this.i18n._t('actions.back')}
          </mwc-button>
        </div>
      `;
    }

    return html`
      <div class="wizard-actions">
        <div>
          ${this._step > 1 ? html`<mwc-button outlined @click=${() => { this._dispatchConfigChanged(true); this.wizard._prevStep(); }}>${this.i18n._t('actions.back')}</mwc-button>` : html``}
        </div>
        <div>
          ${this._step > 0 && this._step < 5
        ? html`<mwc-button raised @click=${() => this._handleNextClick()}>${this.i18n._t('actions.next')}</mwc-button>`
        : html``}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="editor-container" @keydown=${this._handleKeyDown}>
        ${this._renderStepContent()}
        ${this._renderWizardSteps()}
        ${this._renderWizardActions()}
      </div>
    `;
  }
}

customElements.define('cronostar-card-editor', CronoStarEditor);
