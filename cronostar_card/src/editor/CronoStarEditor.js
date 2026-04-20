// editor/CronoStarEditor.js
import { LitElement, html, css } from "lit";
import {
  CARD_CONFIG_PRESETS,
  DEFAULT_CONFIG,
  validateConfig,
  extractCardConfig,
} from "../config.js";
import { log } from "../utils/logger_utils.js";
import {
  normalizePrefix,
  isValidPrefix,
  getEffectivePrefix,
} from "../utils/prefix_utils.js";
import { debounce, Logger } from "../utils.js";
import { EditorI18n } from "./EditorI18n.js";
import { EditorWizard } from "./EditorWizard.js";
import { Step0Dashboard } from "./steps/Step0Dashboard.js";
import { Step1Preset } from "./steps/Step1Preset.js";
import { Step2Entities } from "./steps/Step2Entities.js";
import { Step3Options } from "./steps/Step3Options.js";
import { Step4Automation } from "./steps/Step4Automation.js";
import { Step5Summary } from "./steps/Step5Summary.js";
import {
  copyToClipboard,
  downloadFile,
  handleInitializeData,
} from "./services/service_handlers.js";
import { buildAutomationTemplate } from "./yaml/yaml_generators.js";

export class CronoStarEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _config: { type: Object },
      _step: { type: Number },
      step: { type: Number },
      _selectedPreset: { type: String },
      _automationYaml: { type: String },
      _showLlmPrompt: { type: Boolean },
      _language: { type: String },
      language: { type: String },
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
      logging_enabled: { type: Boolean },
    };
  }

  static get styles() {
    return css`
      :host {
        --primary-text-color: var(--primary-text-color, #ffffff);
        --secondary-text-color: var(--secondary-text-color, #cbd5e1);
        --tertiary-text-color: var(--secondary-text-color, #94a3b8);
        --primary-color: var(--primary-color, #03a9f4);
        --divider-color: var(--divider-color, rgba(255, 255, 255, 0.1));
        --card-background-color: var(--card-background-color, #1e293b);
        --paper-dialog-background-color: var(--card-background-color, #1e293b);
        --background-color-secondary: var(--secondary-background-color, #1e293b);
        
        /* State colors from HA */
        --state-info-color: var(--info-color, #03a9f4);
        --state-success-color: var(--success-color, #4caf50);
        --state-warning-color: var(--warning-color, #ff9800);
        --state-danger-color: var(--error-color, #f44336);
      }

      .editor-container {
        padding: 0;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-family: var(--paper-font-body1_-_font-family, inherit);
        width: 100%;
        max-width: 100% !important;
        box-sizing: border-box;
      }

      /* STEPPER REDESIGN */
      .wizard-steps {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        padding: 16px;
        background: var(--background-color-secondary);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
      }

      .step-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: 1;
        position: relative;
      }

      .step-badge {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--card-background-color);
        color: var(--secondary-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
        border: 1px solid var(--divider-color);
        z-index: 2;
      }

      .step-badge.active {
        background: var(--state-info-color);
        color: white;
        border-color: var(--state-info-color);
        box-shadow: 0 0 10px rgba(var(--rgb-primary-color), 0.3);
      }

      .step-badge.done {
        background: var(--state-success-color);
        color: white;
        border-color: var(--state-success-color);
      }

      .step-label {
        font-size: 10px;
        color: var(--tertiary-text-color);
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .step-label.active {
        color: var(--state-info-color);
        font-weight: 700;
      }

      .step-connector {
        flex: 1;
        height: 1px;
        background: var(--divider-color);
        margin: 0 -10px;
        margin-top: -18px;
        z-index: 1;
      }

      /* PANEL & CONTENT */
      .step-content {
        min-height: 300px;
        padding: 24px;
        background: var(--card-background-color);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
      }

      .step-header {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 8px;
        color: var(--primary-text-color);
      }

      .step-description {
        font-size: 0.95rem;
        color: var(--secondary-text-color);
        margin-bottom: 24px;
        line-height: 1.5;
      }

      /* FIELD GROUPS */
      .field-group {
        margin-bottom: 20px;
        padding: 16px;
        background: var(--background-color-secondary);
        border-radius: 8px;
        border: 1px solid var(--divider-color);
      }

      .field-label {
        display: block;
        font-weight: 700;
        margin-bottom: 4px;
        color: var(--primary-text-color);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .field-description {
        font-size: 0.9rem;
        color: var(--secondary-text-color);
        margin-bottom: 12px;
        line-height: 1.4;
      }

      /* PRESET TILES */
      .preset-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
        margin: 20px 0;
      }

      .preset-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        background: var(--card-background-color);
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        color: var(--primary-text-color);
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .preset-card:hover {
        background: var(--background-color-secondary);
        border-color: var(--state-info-color);
      }

      .preset-card.selected {
        background: rgba(var(--rgb-primary-color), 0.1);
        border: 2px solid var(--state-info-color);
        font-weight: 700;
      }

      .preset-icon {
        font-size: 1.5rem;
        margin-bottom: 8px;
      }

      .preset-title {
        font-weight: 600;
        font-size: 0.95rem;
        margin-bottom: 2px;
      }

      .preset-description {
        font-size: 0.8rem;
        color: var(--tertiary-text-color);
        text-align: center;
      }

      /* ACTIONS */
      .wizard-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
        padding: 16px;
        background: var(--background-color-secondary);
        border-radius: 12px;
        border: 1px solid var(--divider-color);
      }

      mwc-button {
        --mdc-theme-primary: var(--primary-color);
      }

      /* ALERTS & NOTICES */
      .notice, .error-box, .success-box, .info-box {
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 0.9rem;
        margin-bottom: 16px;
        line-height: 1.5;
        border: 1px solid transparent;
      }

      .error-box {
        background: rgba(var(--rgb-error-color, 244, 67, 54), 0.1);
        color: var(--error-color, #f44336);
        border-color: rgba(var(--rgb-error-color, 244, 67, 54), 0.2);
      }

      .success-box {
        background: rgba(var(--rgb-success-color, 76, 175, 80), 0.1);
        color: var(--success-color, #4caf50);
        border-color: rgba(var(--rgb-success-color, 76, 175, 80), 0.2);
      }

      .info-box, .hint {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
        color: var(--primary-color, #03a9f4);
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
      }

      /* SUMMARY TABLE */
      .summary-table {
        width: 100%;
        border-collapse: collapse;
      }

      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--divider-color);
      }

      .summary-row:last-child {
        border-bottom: none;
      }

      .summary-key {
        color: var(--secondary-text-color);
        font-size: 0.9rem;
      }

      .summary-val {
        color: var(--primary-text-color);
        font-family: var(--code-font-family, monospace);
        font-size: 0.85rem;
      }

      /* FIELD ROWS & TOGGLES */
      .field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        margin-bottom: 8px;
        background: var(--background-color-secondary);
      }

      .field-row-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .field-row-sub {
        font-size: 11px;
        color: var(--tertiary-text-color);
        margin-top: 2px;
      }

      /* CONTROLS OVERRIDES */
      ha-textfield, ha-select, ha-entity-picker, ha-selector {
        --mdc-theme-primary: var(--primary-color);
        --mdc-text-field-fill-color: var(--card-background-color);
        --mdc-text-field-ink-color: var(--primary-text-color);
        --mdc-text-field-label-ink-color: var(--secondary-text-color);
        --mdc-text-field-outlined-idle-border-color: var(--divider-color);
      }
    `;
  }

  constructor() {
    super();
    this._step = 0;
    this.config = null;
    this._config = { ...DEFAULT_CONFIG };
    // Initialize logging preference for the editor
    this._config.logging_enabled = DEFAULT_CONFIG.logging_enabled;
    this._language = "en";
    this._initialized = false; // Flag to prevent early dispatches
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
    this._dashboardView = "choice";
    // Forza il rendering del picker: la definizione può arrivare dal registry scoped (patch in main.js)
    // DISATTIVATO: Se il picker non è definito, usiamo il fallback testuale.
    this._pickerLoaded = false;

    this._showStepError = false;
    this._showLlmPrompt = false;

    // Debounce config-changed to avoid constant card recreations while typing
    this._debouncedDispatch = debounce(() => {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: { ...this._config, step: this._step } },
        }),
      );
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
      saveGlobalSettings: (settings) => this._saveGlobalSettings(settings),
    };

    // Cache Step 0 instance to avoid re-creation on each render
    this._step0Dashboard = null;

    // Stabilize language at startup by adopting card language once if available
    setTimeout(() => {
      try {
        const cardEl =
          this.shadowRoot?.querySelector("cronostar-card") ||
          document.querySelector("cronostar-card");
        const cardLang = cardEl?.language;
        if (cardLang && this._language !== cardLang) {
          this._language = cardLang;
          this.i18n = new EditorI18n(this);
          // Persist to config.meta to avoid future flips
          this._config.meta = {
            ...(this._config.meta || {}),
            language: this._language,
          };
          Logger.log(
            "LANG",
            `[Editor] Startup adopted language from card: ${cardLang}`,
          );
        }
      } catch {
        /* ignore */
      }
    }, 0);
  }

  async _saveGlobalSettings(settings) {
    if (!this.hass) return;
    try {
      await this.hass.callService("cronostar", "save_settings", {
        settings: settings,
      });
      this.showToast(
        this._language === "it"
          ? "Impostazioni globali salvate"
          : "Global settings saved",
      );

      // Update local card instance if possible
      const cardEl = this.getRootNode().host;
      if (cardEl && "globalSettings" in cardEl) {
        cardEl.globalSettings = settings;
      }
    } catch (e) {
      log(
        "error",
        this._config.logging_enabled,
        "Error saving global settings:",
        e,
      );
      this.showToast(`✗ ${e.message}`);
    }
  }

  handleShowHelp() {
    const lang = this._language || "en";
  }

  connectedCallback() {
    super.connectedCallback();
  }

  updated(changedProps) {
    super.updated(changedProps);

    // Sync step property to internal _step
    if (changedProps.has("step") && this.step !== undefined) {
      console.log(`[CronoStar Editor] Step property changed to: ${this.step}`);
      this._step = this.step;
    }

    if (changedProps.has("hass")) {
      if (this.hass) {
        // Only update from HASS language if no language is explicitly set in config.meta
        if (!this._config.meta?.language) {
          // Prefer card element language if available (synchronized from profile meta). If present, do not fall back to hass.
          const cardEl =
            this.shadowRoot?.querySelector("cronostar-card") ||
            document.querySelector("cronostar-card");
          const cardLang = cardEl?.language;
          if (cardLang && this._language !== cardLang) {
            this._language = cardLang;
            this.i18n = new EditorI18n(this);
            console.log(`[DASHBOARD] Adopted language from card: ${cardLang}`);
          } else if (!cardLang) {
            const currentLang = this.hass.language
              ? this.hass.language.split("-")[0]
              : "en";
            if (this._language !== currentLang) {
              this._language = currentLang;
              this.i18n = new EditorI18n(this);
            }
          }
          // Persist to config.meta to avoid future flips
          this._config.meta = {
            ...(this._config.meta || {}),
            language: this._language,
          };
        }
        log(
          "info",
          this._config.logging_enabled,
          "HASS object received/updated",
        );
      }
    }

    if (changedProps.has("_step")) {
      // ✅ FIX: Dispatch immediately on step change so preview is updated
      if (this._step !== 0) {
        this._dispatchConfigChanged(true);
      }
    }

    if (changedProps.has("config") || changedProps.has("language")) {
      console.log("[CronoStar Editor] Component updated with properties:", {
        configChanged: changedProps.has("config"),
        langChanged: changedProps.has("language"),
        passedLang: this.language,
      });
      this.setConfig(this.config || this._config);
    }

    // Hide preview in Step 0
    this._updatePreviewVisibility();

    // Manage standard HA SAVE button visibility
    this._updateSaveButtonVisibility();

    // Applica il fix ricorsivo per il contrasto degli entity pickers
    this._applyShadowDomFix();
  }

  _applyShadowDomFix() {
    const styleId = "cronostar-force-contrast-style";
    const css = `
      /* Brutal force black for everything inside shadow roots */
      * { 
        color: #000000 !important; 
        -webkit-text-fill-color: #000000 !important;
      }
      
      /* PROTECT LABELS: They must stay light even if * is black */
      .mdc-floating-label, 
      .mdc-floating-label--float-above,
      label,
      .field-label,
      ha-label,
      [slot="label"] {
        color: #cbd5e1 !important;
        -webkit-text-fill-color: #cbd5e1 !important;
      }

      /* Force white background for the containers of these black elements */
      :host,
      .mdc-text-field--filled:not(.mdc-text-field--disabled),
      .input-container,
      #input,
      .mdc-list-item,
      vaadin-combo-box-overlay,
      #overlay,
      #content,
      #scroller,
      vaadin-combo-box-item {
        background-color: #ffffff !important;
        background: #ffffff !important;
      }

      /* Layout fixes for labels */
      .mdc-text-field { overflow: visible !important; }
      #label {
        white-space: nowrap !important;
        text-overflow: clip !important;
        overflow: visible !important;
        max-width: none !important;
      }
    `;

    const injectToShadow = (el) => {
      if (!el || !el.shadowRoot) return;
      
      // Target specific components for injection
      const tagName = el.tagName.toLowerCase();
      const isPickerRelated = 
        tagName.includes("ha-entity-picker") || 
        tagName.includes("ha-combo-box") || 
        tagName.includes("ha-textfield") ||
        tagName.includes("ha-select") ||
        tagName.includes("vaadin-combo-box") ||
        tagName.includes("selector") ||
        tagName.includes("menu") ||
        tagName.includes("overlay");

      if (isPickerRelated) {
        if (!el.shadowRoot.querySelector(`#${styleId}`)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = css;
          el.shadowRoot.appendChild(style);
        }
      }
      
      // Recurse into all children that might have a shadowRoot
      el.shadowRoot.querySelectorAll("*").forEach(child => {
        if (child.shadowRoot) injectToShadow(child);
      });
    };

    // 1. Scansione immediata del nostro Shadow DOM
    this.shadowRoot.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) injectToShadow(el);
    });

    // 2. Observer per catturare elementi dinamici (specialmente overlay nel body)
    if (!this._contrastObserver) {
      this._contrastObserver = new MutationObserver(() => {
        const targets = document.querySelectorAll("vaadin-combo-box-overlay, mwc-menu, ha-select, ha-entity-picker, vaadin-combo-box-item");
        targets.forEach(t => injectToShadow(t));
      });
      
      this._contrastObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // 3. Esecuzione periodica per sicurezza (copre casi di rendering asincrono complesso)
    if (!this._contrastInterval) {
      this._contrastInterval = setInterval(() => {
        const targets = document.querySelectorAll("vaadin-combo-box-overlay, ha-entity-picker, ha-selector, ha-combo-box, vaadin-combo-box-item");
        targets.forEach(t => injectToShadow(t));
      }, 1000);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // Dynamic width expansion for admin mode
    if (this.config?.view_mode === 'admin') {
      const updateWidth = () => {
        const parent = this.closest('hui-card-element-editor') || this.getRootNode().host;
        if (parent) {
          const isWide = window.innerWidth > 800;
          parent.style.setProperty('max-width', isWide ? '800px' : '100%', 'important');
          parent.style.setProperty('width', '100%', 'important');
          parent.style.setProperty('margin', '0 auto', 'important');
        }
      };
      
      updateWidth();
      window.addEventListener('resize', updateWidth);
      this._resizeListener = updateWidth;
    }
  }

  disconnectedCallback() {
    if (this._resizeListener) {
      window.removeEventListener('resize', this._resizeListener);
    }
    if (this._contrastObserver) this._contrastObserver.disconnect();
    if (this._contrastInterval) clearInterval(this._contrastInterval);
    super.disconnectedCallback();
  }

  _updateSaveButtonVisibility() {
    try {
      const shouldHide = this._step >= 0 && this._step <= 3;
      const root = document.head || document.body; // Robust fallback
      if (!root) return;

      let styleEl = document.getElementById(
        "cronostar-editor-save-button-hide",
      );

      if (shouldHide) {
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "cronostar-editor-save-button-hide";
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
        styleEl.textContent = "";
      }
    } catch (e) {
      log(
        "warn",
        this._config.logging_enabled,
        "[SAVE-BUTTON] Visibility update failed:",
        e,
      );
    }
  }

  _updatePreviewVisibility() {
    try {
      const shouldHide = this._step === 0;

      const root = this.getRootNode();
      if (!root || (root !== document && !(root instanceof ShadowRoot))) {
        return;
      }

      // Inject both in local root and global document for maximum coverage
      const targets = [root, document.head || document.body];

      targets.forEach((t, idx) => {
        if (!t) return;
        const isGlobal = idx === 1;
        let styleEl = isGlobal
          ? document.getElementById("cronostar-editor-style-global")
          : root.getElementById("cronostar-editor-style");

        if (shouldHide) {
          if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = isGlobal
              ? "cronostar-editor-style-global"
              : "cronostar-editor-style";
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
          styleEl.textContent = "";
        }
      });

      this._previewWasHidden = shouldHide;
    } catch (e) {
      log(
        "warn",
        this._config.logging_enabled,
        "[PREVIEW] Visibility update failed:",
        e,
      );
    }
  }

  _renderWizardSteps() {
    if (this._step === 0) return html``;
    const steps = [0, 1, 2, 3, 4, 5];
    const canJump = this._canGoNext();
    const labels = ["Dashboard", "Preset", "Entities", "Options", "Automation", "Summary"];

    return html`
      <div class="wizard-steps">
        ${steps.map(
          (s, idx) => html`
            <div class="step-item">
              <div
                class="step-badge ${this._step === s ? "active" : ""} ${this._step > s ? "done" : ""}"
                @click=${() => {
                  if (
                    s === 0 ||
                    s <= this._step ||
                    (canJump && this._step !== 0)
                  ) {
                    this._step = s;
                    this._dispatchConfigChanged(true);
                    this.requestUpdate();
                  }
                }}
              >
                ${this._step > s ? "✓" : (s === 0 ? "🏠" : s)}
              </div>
              <div class="step-label ${this._step === s ? "active" : ""}">
                ${labels[idx]}
              </div>
            </div>
            ${idx < steps.length - 1 ? html`<div class="step-connector"></div>` : ""}
          `,
        )}
      </div>
    `;
  }

  setConfig(config) {
    if (!config) return;

    // PROTECTION: If we recently made a local change, ignore incoming config updates
    // for a short window to allow HA state to synchronize without "bouncing" values back.
    if (this._ignoreInboundUntil && Date.now() < this._ignoreInboundUntil) {
      console.info("[CronoStar Editor] setConfig ignored due to recent local interaction (debouncing synchronization)");
      return;
    }

    // Detailed F12 debug log to trace the incoming configuration
    console.group("[CronoStar Editor] setConfig Trace");
    console.info("Target config object:", config);
    console.info("Editor property .language:", this.language);

    try {
      // 1. Validate the incoming config
      const validated = validateConfig(config, config.logging_enabled);

      // 2. Resolve initialization logic
      if (!this._config || this._config.not_configured) {
        console.info("Adopting incoming config as primary source (Initial Load)");
        this._config = { ...validated };
      } else {
        // PROTECTION DURING WIZARD:
        // If we are currently in the wizard (Step > 0), DO NOT allow HA to overwrite 
        // critical fields like target_entity or global_prefix.
        if (this._step > 0) {
          console.info("[CronoStar Editor] Wizard active: Protecting local core fields from HA overwrite");
          const protectedFields = {
            target_entity: this._config.target_entity,
            global_prefix: this._config.global_prefix,
            preset_type: this._config.preset_type,
            enabled_entity: this._config.enabled_entity,
            profiles_select_entity: this._config.profiles_select_entity
          };
          this._config = { ...validated, ...this._config, ...protectedFields };
        } else {
          console.info("Syncing incoming config with current state (prioritizing local)");
          this._config = { ...validated, ...this._config };
        }
      }

      // 3. Mark as editing if we have core fields
      this._isEditing =
        !!this._config.target_entity && !!this._config.global_prefix;

      // 4. Resolve Language immediately
      const oldLang = this._language;
      const metaLang = this._config.meta?.language || config.meta?.language;

      if (this.language) {
        this._language = this.language;
      } else if (metaLang) {
        this._language = metaLang;
      } else if (this.hass?.language) {
        this._language = this.hass.language.split("-")[0];
      }

      if (this._language !== oldLang) {
        // Prevent reverting 'it' to 'en' if we are receiving a generic update
        if (
          oldLang === "it" &&
          this._language === "en" &&
          !config.meta?.language
        ) {
          this._language = "it";
        } else {
          console.info(`Language changed from ${oldLang} to ${this._language}`);
          this.i18n = new EditorI18n(this);
        }
      }

      this._initialized = true;
      console.info(`Final resolved language: ${this._language}`);
      console.groupEnd();
    } catch (e) {
      console.warn("[CronoStar Editor] setConfig error:", e);
      console.groupEnd();
      this._config = { ...DEFAULT_CONFIG, ...config };
    }

    if (this._config.preset_type)
      this._selectedPreset = this._config.preset_type;
    this._updateAutomationYaml();
    this._syncConfigAliases();
  }
  _isElDefined(tag) {
    return customElements.get(tag) !== undefined;
  }

  _syncConfigAliases() {
    // No-op - removed calculated filenames
  }

  _updateAutomationYaml() {
    console.log(
      "[CronoStarEditor] _updateAutomationYaml called. Current config:",
      this._config,
    );
    this._automationYaml = buildAutomationTemplate(this._config);
    console.log(
      "[CronoStarEditor] _automationYaml set to:",
      this._automationYaml,
    );
  }

  // Ensure dispatched/saved config contains required fields and omits nulls
  _sanitizeConfig(cfg) {
    const out = { ...cfg };
    // Ensure type
    if (!out.type) out.type = "custom:cronostar-card";

    // IMPROVED: Logic for not_configured flag
    if (cfg.not_configured === true) {
      out.not_configured = true;
    } else {
      // If we have a target entity and prefix, we are definitely configured
      const hasCore = !!out.target_entity && !!out.global_prefix;
      out.not_configured = !hasCore;
    }

    // Remove empty-string values but preserve nulls for core keys to avoid defaulting
    for (const key of Object.keys(out)) {
      if (out[key] === "") {
        delete out[key];
      }
    }
    return out;
  }

  _dispatchConfigChanged(immediate = false) {
    // PROTECT INITIALIZATION: Don't dispatch if not initialized or if we're pushing an empty config over a valid one
    if (
      !this._initialized ||
      (!this._config.target_entity && this._isEditing)
    ) {
      return;
    }

    if (this._step === 0 && !this._isEditing && !immediate) {
      return;
    }

    if (immediate) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      // Ensure type is present and correct, and pass current step
      const configToDispatch = {
        ...this._sanitizeConfig(this._config),
        step: this._step,
      };
      // Ensure language persists through HA editor cycles
      configToDispatch.meta = {
        ...(configToDispatch.meta || {}),
        language: this._language,
      };

      // Log the exact payload intended for YAML persistence via standard Save using CronoStar Logger
      Logger.log(
        "CONFIG",
        "[EDITOR] YAML save intent (standard Save):",
        configToDispatch,
      );
      Logger.log("CONFIG", "Dispatching config-changed", configToDispatch);
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: configToDispatch },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this._debouncedDispatch();
    }
  }

  _persistCardConfigNow() {
    // Config persistence is unified into save_profile (meta).
    return Promise.resolve();
  }

  async _saveMetadata() {
    if (!this.hass || !this._config.global_prefix) return;

    try {
      const cardEl =
        this.shadowRoot?.querySelector("cronostar-card") ||
        document.querySelector("cronostar-card");
      const profileName = cardEl?.selectedProfile || "Default";
      const presetType =
        this._selectedPreset || this._config.preset_type || "thermostat";
      const prefix = this._config.global_prefix;

      // Fetch current schedule to avoid losing data
      const scheduleData =
        cardEl?.stateManager
          ?.getData()
          ?.map((p) => ({ time: p.time, value: p.value })) || [];

      // Build meta with entities list, using extractCardConfig for sanitization
      const sanitizedConfig = extractCardConfig(this._config);

      const meta = { ...sanitizedConfig };
      meta.entities = [
        sanitizedConfig.target_entity,
        sanitizedConfig.enabled_entity,
        sanitizedConfig.profiles_select_entity,
      ].filter((e) => !!e);

      Logger.log(
        "EDITOR",
        `[CronoStar] Saving full profile data for '${profileName}'...`,
      );

      await this.hass.callService("cronostar", "save_profile", {
        profile_name: profileName,
        preset_type: presetType,
        schedule: scheduleData,
        global_prefix: prefix,
        meta: meta,
      });

      Logger.log(
        "EDITOR",
        `[CronoStar] Profile data saved successfully for '${profileName}'`,
      );
    } catch (e) {
      Logger.error("EDITOR", "Error saving profile data:", e);
    }
  }

  showToast(message) {
    const event = new CustomEvent("hass-notification", {
      detail: { message, duration: 3000 },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _handleResetConfig() {
    const confirmMsg =
      this.i18n._t("prompts.reset_confirm") ||
      "Are you sure you want to reset this card?";
    if (!this._isEditing || confirm(confirmMsg)) {
      this._config = { ...DEFAULT_CONFIG };
      this._isEditing = false;
      this._step = 1;
      this._dispatchConfigChanged(true);
      this.requestUpdate();
    }
  }

  _renderStepContent() {
    // PROTECTIVE FILTER: Ensure we don't show validation errors for entities 
    // that the user has already changed in the local editor state.
    const rawValidation = this._config.validation || { valid: true, errors: [] };
    const filteredErrors = (rawValidation.errors || []).filter(err => {
      const target = (this._config.target_entity || "").toLowerCase();
      const errorMsg = err.toLowerCase();

      // If the error mentions "Target entity" and we have a local choice,
      // hide the error if it doesn't contain our local choice.
      if (errorMsg.includes("target entity") && target) {
        if (!errorMsg.includes(target)) return false;
      }
      
      // If the user just selected a new target entity and it exists in HASS, hide the "not found" error for it
      if (errorMsg.includes("not found") && target && errorMsg.includes(target)) {
        if (this.hass?.states[this._config.target_entity]) return false;
      }

      // Suppress "not found" errors for CronoStar's own entities (select.cronostar_* and switch.cronostar_*)
      // because they might be in the process of being created or within the grace period.
      if (errorMsg.includes("not found")) {
        if (errorMsg.includes("select.cronostar_") || errorMsg.includes("switch.cronostar_")) {
          return false;
        }
      }
      return true;
    });
    
    const validation = { 
      valid: filteredErrors.length === 0, 
      errors: filteredErrors 
    };

    const showErrorBox = !validation.valid && this._step > 0;

    return html`
      ${showErrorBox
        ? html`
            <div class="error-box" style="margin-bottom: 20px;">
              <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">
                ⚠️ PROBLEMI DI CONFIGURAZIONE
              </div>
              <ul style="margin: 0; padding-left: 20px;">
                ${validation.errors.map((err) => html`<li>${err}</li>`)}
              </ul>
            </div>
          `
        : ""}
      ${this._renderStep(validation)}
    `;
  }

  _renderStep(validation) {
    switch (this._step) {
      case 0:
        if (!this._step0Dashboard) {
          this._step0Dashboard = new Step0Dashboard(this);
        }
        return this._step0Dashboard.render();
      case 1:
        return new Step1Preset(this).render();
      case 2:
        return new Step2Entities(this).render(validation);
      case 3:
        return new Step3Options(this).render();
      case 4:
        return new Step4Automation(this).render();
      case 5:
        return new Step5Summary(this).render(validation);
      default:
        return html`<div>Unknown Step</div>`;
    }
  }

  _handleLocalUpdate(key, value) {
    // PROTECTION: Set a window where we ignore incoming setConfig calls
    // to prevent HA synchronization from reverting our local changes.
    this._ignoreInboundUntil = Date.now() + 2000;

    const newConfig = { ...this._config, [key]: value };
    newConfig.type = this._config.type || DEFAULT_CONFIG.type;
    if ("entity_prefix" in newConfig) delete newConfig.entity_prefix;
    this._config = newConfig;

    this._syncConfigAliases();
    this._updateAutomationYaml();
    // Immediately notify HA editor so the standard Save button persists latest values
    this._dispatchConfigChanged(true);
    this.requestUpdate();

    if (key === "enabled_entity" || key === "profiles_select_entity") {
      this._saveMetadata();
    }
  }

  renderEntityPicker(key, value, label = "Entity", includeDomains = null) {
    if (!this.hass) return html``;

    // PROTECTION: If it's a CronoStar internal entity (identified by the prefix),
    // do NOT use the standard HA entity picker/selector because it will complain
    // "Unknown entity selected" until the backend has finished its sync.
    // We use a simple text field for these cases to allow the user to proceed.
    if (value && (value.includes(".cronostar_") || value.startsWith("cronostar_"))) {
      return this._renderTextInput(key, value, label);
    }

    const hasSelector = !!customElements.get("ha-selector");
    const hasPicker = !!customElements.get("ha-entity-picker");

    if (hasSelector) {
      return html`
        <ha-selector
          .hass=${this.hass}
          .label=${label}
          .value=${value || ""}
          .selector=${{ entity: { domain: includeDomains } }}
          @value-changed=${(ev) => {
            const v = ev?.detail?.value || "";
            // FORCE IMMEDIATE for target_entity to avoid race conditions
            const isImmediate = key === "target_entity";
            this._updateConfig(key, v === "" ? null : v, isImmediate);
          }}
        ></ha-selector>
      `;
    }

    if (hasPicker) {
      return html`
        <ha-entity-picker
          .hass=${this.hass}
          .label=${label}
          .value=${value || ""}
          .includeDomains=${includeDomains}
          allow-custom-entity
          @value-changed=${(ev) => {
            const v = ev?.detail?.value || "";
            // FORCE IMMEDIATE for target_entity to avoid race conditions
            const isImmediate = key === "target_entity";
            this._updateConfig(key, v === "" ? null : v, isImmediate);
          }}
        ></ha-entity-picker>
      `;
    }

    return this.renderTextInput(key, value, label);
  }

  _renderTextInput(key, value, placeholder = "") {
    return html`
      <ha-textfield
        .label=${placeholder}
        .value=${value || ""}
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
      return html`<mwc-button outlined ?disabled=${disabled} @click=${click}
        >${label}</mwc-button
      >`;
    }
    return html`<mwc-button raised ?disabled=${disabled} @click=${click}
      >${label}</mwc-button
    >`;
  }

  _updateConfig(key, value, immediate = false) {
    // PROTECTION: Set a window where we ignore incoming setConfig calls
    this._ignoreInboundUntil = Date.now() + 2000;

    // ✅ NEW: Clear validation errors immediately if a core field changes
    // This prevents showing "sensor.dsdf not found" when the user has already changed it.
    if (key === "target_entity" || key === "global_prefix" || key === "preset_type") {
      this._config.validation = { valid: true, errors: [] };
    }

    const newConfig = { ...this._config, [key]: value };

    // Explicitly enforce stable type to avoid reconstruction
    newConfig.type = this._config.type || DEFAULT_CONFIG.type;

    // Hard-remove deprecated keys
    if ("entity_prefix" in newConfig) delete newConfig.entity_prefix;

    if (key === "preset_type") {
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

    if (key === "enabled_entity" || key === "profiles_select_entity") {
      this._saveMetadata();
    }
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
      // PROTECTION: Extend the ignore window during the final save
      this._ignoreInboundUntil = Date.now() + 5000;

      // 1. Prepare final clean config for persistence (remove internal wizard helpers)
      let finalConfig = { ...this._config };
      delete finalConfig.step;

      // Ensure global_prefix is present and normalized on final save
      finalConfig.global_prefix = normalizePrefix(
        finalConfig.global_prefix || getEffectivePrefix(finalConfig),
      );

      // Sanitize before dispatch/save
      finalConfig = this._sanitizeConfig(finalConfig);

      // Log what should be saved to YAML, then dispatch immediately so HA can persist
      Logger.log(
        "CONFIG",
        "[EDITOR] YAML save intent (wizard Finish):",
        finalConfig,
      );
      
      // EXTREME PROTECTION: Block all inbound setConfig for 10 seconds or until finished
      this._ignoreInboundUntil = Date.now() + 10000;

      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: { ...finalConfig, step: 5, _close_wizard: true } },
          bubbles: true,
          composed: true,
        }),
      );

      try {
        // 2. Perform backend operations (data analysis/initialization)
        const result = await handleInitializeData(
          this.hass,
          finalConfig,
          this._language,
        );
        this.showToast(result.message);

        // 3. Update local state to show 'Finished' state if needed,
        // but let the user click the HA "SAVE" button to close the dialog.
        if (isFinalStep) {
          this._step = 5;
          this.requestUpdate();
        }
      } catch (e) {
        log("error", this._config.logging_enabled, "Finish error:", e);
        this.showToast(`✗ ${e.message}`);
      }
    } else {
      // Not at the end yet, just move next if possible
      if (this.wizard && typeof this.wizard._nextStep === "function") {
        this.wizard._nextStep();
      }
    }

    if (this._persistCardConfigNow) {
      this._persistCardConfigNow();
    }

    if (this.wizard && typeof this.wizard._finish === "function") {
      this.wizard._finish();
    }
  }

  _handleKeyDown(e) {
    // Disable exit on Enter if in wizard (step > 0)
    if (this._step > 0 && e.key === "Enter") {
      // Only block if not in a textarea
      if (e.target.tagName !== "TEXTAREA") {
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
        return html` <div class="wizard-actions">
          <div style="flex:1"></div>
          <div class="hint" style="color: var(--error-color);">
            ${this.i18n._t("ui.minimal_config_needed")}
          </div>
        </div>`;
      }
      return html`<div class="wizard-actions"></div>`;
    }

    return html`
      <div class="wizard-actions">
        <div>
          ${this._step > 1
            ? html`<mwc-button
                outlined
                @click=${() => {
                  this._dispatchConfigChanged(true);
                  this.wizard._prevStep();
                }}
                >${this.i18n._t("actions.back")}</mwc-button
              >`
            : html``}
        </div>
        <div>
          ${this._step > 0 && this._step < 5
            ? html`<mwc-button raised @click=${() => this._handleNextClick()}
                >${this.i18n._t("actions.next")}</mwc-button
              >`
            : this._step === 5
              ? html`<mwc-button
                  raised
                  @click=${() => this._handleFinishClick({ force: true })}
                  >💾
                  ${this.i18n._t("actions.save_and_close") ||
                  "Save & Close"}</mwc-button
                >`
              : html``}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="editor-container" @keydown=${this._handleKeyDown}>
        ${this._renderStepContent()} ${this._renderWizardSteps()}
        ${this._renderWizardActions()}
      </div>
    `;
  }
}
