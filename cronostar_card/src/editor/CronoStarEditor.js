// editor/CronoStarEditor.js
import { LitElement, html, css } from 'lit';
import { CARD_CONFIG_PRESETS, DEFAULT_CONFIG } from '../config.js';
import { normalizePrefix, getEffectivePrefix, isValidPrefix } from '../utils/prefix_utils.js';
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
      _calculatedHelpersFilename: { type: String },
      _calculatedAutomationFilename: { type: String },
      _creatingAutomation: { type: Boolean },
      _deepCheckInProgress: { type: Boolean },
      _showStepError: { type: Boolean },
    };
  }

  static get styles() {
    return css`
      .editor-container {
        padding: 16px;
      }
      .wizard-steps {
        display: flex;
        justify-content: space-between;
        margin-bottom: 24px;
        padding: 0 20px;
      }

      /* Wizard actions layout and spacing */
      .wizard-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        padding: 0 16px; /* horizontal gutter */
      }

      .wizard-actions > div {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px;
      }

      .wizard-actions mwc-button {
        margin: 6px 12px; /* give horizontal breathing room */
      }

      /* Action buttons container used in steps (copy/download/create) */
      .action-buttons {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        margin: 6px 0;
      }

      /* Ensure buttons inside action-buttons don't collapse together */
      .action-buttons mwc-button,
      .action-buttons button {
        margin: 0 !important;
      }
      .wizard-step {
        flex: 1;
        text-align: center;
        position: relative;
        padding: 10px;
      }
      .wizard-step::before {
        content: '';
        position: absolute;
        top: 20px;
        left: -50%;
        right: 50%;
        height: 2px;
        background: var(--divider-color);
        z-index: -1;
      }
      .wizard-step:first-child::before {
        display: none;
      }
      .step-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--divider-color);
        color: var(--secondary-text-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        margin-bottom: 8px;
        transition: all 0.3s;
      }
      .wizard-step.active .step-circle {
        background: var(--primary-color);
        color: white;
      }
      .wizard-step.completed .step-circle {
        background: var(--success-color, #4caf50);
        color: white;
      }
      .step-title {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .wizard-step.active .step-title {
        color: var(--primary-text-color);
        font-weight: 500;
      }
      .step-content {
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 16px;
      }
      /* 3D styled Material Web buttons for the editor wizard */
      mwc-button.mwc-3d {
        --mdc-theme-primary: var(--primary-color, #1e88e5);
        box-shadow: 0 10px 28px rgba(16,24,40,0.12), 0 4px 12px rgba(16,24,40,0.08);
        transform: translateZ(0);
        transition: transform 220ms cubic-bezier(.2,.9,.2,1), box-shadow 220ms ease, outline 160ms;
        border-radius: 10px;
      }
      mwc-button.mwc-3d:hover {
        transform: translateY(-6px) rotateX(2deg) scale(1.02);
        box-shadow: 0 20px 44px rgba(16,24,40,0.16), 0 8px 18px rgba(16,24,40,0.08);
      }
      mwc-button.mwc-3d:active {
        transform: translateY(-2px) scale(0.995);
        box-shadow: 0 8px 20px rgba(16,24,40,0.10);
      }
      mwc-button.mwc-3d.outlined {
        --mdc-button-outline-color: color-mix(in srgb, var(--primary-color, #1e88e5) 36%, var(--divider-color, #e0e0e0) 64%);
        background: linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 94%, #000 6%), var(--card-background-color, #fff));
      }
      mwc-button.mwc-3d:focus-visible {
        outline: 3px solid color-mix(in srgb, var(--primary-color, #1e88e5) 18%, transparent 82%);
        outline-offset: 4px;
      }
      /* Fallback/base styles for mwc-button when module isn't loaded */
      mwc-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 14px;
        font-size: 0.95rem;
        border-radius: 8px;
        border: 1px solid transparent;
        background: var(--mdc-theme-primary, var(--primary-color, #1e88e5));
        color: var(--mwc-button-foreground, #ffffff);
        cursor: pointer;
        text-transform: none;
        line-height: 1;
        box-sizing: border-box;
        transition: transform 160ms ease, box-shadow 160ms ease, background 120ms ease, border-color 120ms ease;
      }

      mwc-button[raised] {
        box-shadow: 0 8px 24px rgba(16,24,40,0.12), 0 4px 12px rgba(16,24,40,0.06);
      }

      mwc-button.outlined {
        background: transparent;
        color: var(--primary-color, #1e88e5);
        border-color: var(--mdc-button-outline-color, var(--divider-color, #e0e0e0));
      }

      mwc-button:focus-visible {
        outline: 3px solid color-mix(in srgb, var(--primary-color, #1e88e5) 18%, transparent 82%);
        outline-offset: 3px;
      }

      mwc-button[disabled], mwc-button[disabled] * {
        opacity: 0.6;
        cursor: default;
        pointer-events: none;
      }
      .step-header {
        font-size: 20px;
        font-weight: 500;
        margin-bottom: 8px;
        color: var(--primary-text-color);
      }
      .step-description {
        font-size: 14px;
        color: var(--secondary-text-color);
        margin-bottom: 20px;
        line-height: 1.5;
      }
      .field-group {
        margin-bottom: 16px;
      }
      .field-group ha-textfield,
      .field-group ha-entity-picker {
        display: block;
      }
      .wizard-actions {
        display: flex;
        justify-content: space-between;
        padding-top: 16px;
        border-top: 1px solid var(--divider-color);
      }
      .preset-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .preset-card {
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
        background: var(--card-background-color);
        color: var(--primary-text-color);
      }
      .preset-card:hover {
        border-color: var(--primary-color);
        box-shadow: var(--ha-card-box-shadow, 0px 2px 4px rgba(0, 0, 0, 0.1));
      }
      .preset-card.selected {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px var(--primary-color);
        background: var(--primary-color-light, rgba(3, 169, 244, 0.1));
      }
      .preset-icon {
        font-size: 2em;
        margin-bottom: 8px;
      }
      .preset-title {
        font-weight: 500;
        font-size: 1.1em;
        margin-bottom: 4px;
      }
      .preset-description {
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
    `;
  }

  constructor() {
    super();

    this._config = { ...DEFAULT_CONFIG };
    this._step = 1;
    this._selectedPreset = 'thermostat';
    this._automationYaml = '';
    this._showAutomationPreview = false;
    this._helpersYaml = '';
    this._showHelpersPreview = false;
    this._language = 'en';
    this._quickCheck = null;
    this._deepReport = null;
    this._unsubDeep = null;
    this._deepCheckRanForStep2 = false;
    this._calculatedHelpersFilename = '';
    this._calculatedAutomationFilename = '';
    this._creatingAutomation = false;
    this._deepCheckInProgress = false;
    this._showStepError = false;

    this.i18n = new EditorI18n(this);
    this.wizard = new EditorWizard(this);
    this.step1 = new Step1Preset(this);
    this.step2 = new Step2Entities(this);
    this.step3 = new Step3Options(this);
    this.step4 = new Step4Automation(this);
    this.step5 = new Step5Summary(this);
    this.serviceHandlers = {
      copyToClipboard,
      downloadFile,
      handleCreateHelpersYaml,
      handleCreateAutomationYaml,
      handleCreateAndReloadAutomation,
      runDeepChecks,
    };
    this.yamlGenerators = { buildAutomationYaml, buildInputNumbersYaml };
  }

  // richiesto da HA
  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._selectedPreset = this._config.preset || 'thermostat';

    if (!this._config.entity_prefix && CARD_CONFIG_PRESETS[this._selectedPreset]?.entity_prefix) {
      this._config.entity_prefix = CARD_CONFIG_PRESETS[this._selectedPreset].entity_prefix;
    }

    this._ensurePresetDefaults();
    this._updateAutomationYaml();
    this._updateHelpersYaml();
    this.requestUpdate();
  }

  set hass(hass) {
    this._hass = hass;
    const lang = hass?.language?.toLowerCase() || this._language || 'en';
    this._language = lang.startsWith('it') ? 'it' : 'en';
    this._subscribeDeepReports();
    this.requestUpdate();
  }

  get hass() {
    return this._hass;
  }

  get _lang() {
    const lang = this.hass?.language?.toLowerCase() || this._language || 'en';
    return lang.startsWith('it') ? 'it' : 'en';
  }

  connectedCallback() {
    super.connectedCallback();
    this._subscribeDeepReports();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (typeof this._unsubDeep === 'function') {
      try {
        this._unsubDeep();
      } catch (e) {
        console.error('Error unsubscribing from deep reports:', e);
      }
      this._unsubDeep = null;
    }
  }

  _subscribeDeepReports() {
    try {
      if (this.hass?.connection && !this._unsubDeep) {
        this._unsubDeep = this.hass.connection.subscribeEvents(
          (ev) => {
            try {
              const payload = ev?.data ?? ev?.event?.data ?? ev;
              if (payload && typeof payload === 'object') {
                this._deepReport = payload;
                this._deepCheckInProgress = false;
                this.requestUpdate();
              }
            } catch (e) {
              console.error('Error processing deep report payload:', e);
            }
          },
          'cronostar_setup_report',
        );
      }
    } catch (e) {
      console.error('Error subscribing to deep reports:', e);
    }
  }

  _canGoNext() {
    if (this._step === 1) {
      const prefix = this._config.global_prefix || getEffectivePrefix(this._config);
      return isValidPrefix(prefix);
    }
    if (this._step === 2) {
      const prefix = getEffectivePrefix(this._config);
      const applyEntity = this._config.apply_entity;
      return isValidPrefix(prefix) && !!applyEntity;
    }
    return true;
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

  render() {
    return html`
      <div class="editor-container">
        ${this._renderWizardSteps()}
        ${this._renderStepContent()}
        ${this._renderWizardActions()}
      </div>
    `;
  }

  _renderWizardSteps() {
    const steps = [
      { id: 1, title: this.i18n._t('steps.tipo') },
      { id: 2, title: this.i18n._t('steps.entita') },
      { id: 3, title: this.i18n._t('steps.opzioni') },
      { id: 4, title: this.i18n._t('steps.automazione') },
      { id: 5, title: this.i18n._t('steps.fine') },
    ];
    return html`
      <div class="wizard-steps">
        ${steps.map(
          (step) => html`
            <div
              class="wizard-step ${this._step === step.id ? 'active' : ''} ${this._step > step.id
                ? 'completed'
                : ''}"
            >
              <div class="step-circle">${this._step > step.id ? '✓' : step.id}</div>
              <div class="step-title">${step.title}</div>
            </div>
          `,
        )}
      </div>
    `;
  }

  _renderStepContent() {
    switch (this._step) {
      case 1:
        return this.step1.render();
      case 2:
        return this.step2.render();
      case 3:
        return this.step3.render();
      case 4:
        return this.step4.render();
      case 5:
        return this.step5.render();
      default:
        return html``;
    }
  }

  _renderWizardActions() {
    return html`
      <div class="wizard-actions">
        <div>
          ${this._step > 1
            ? html`<mwc-button
                class="mwc-3d outlined"
                outlined
                @click=${() => this.wizard._prevStep()}
                >${this.i18n._t('actions.back')}</mwc-button
              >`
            : ''}
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          ${this._showStepError
            ? html`<div class="warning-box" style="margin-bottom: 0px; padding: 8px 12px;">
                  ${this.i18n._t('messages.fix_step_to_proceed')}
                </div>`
            : ''}
          ${this._step < 5
            ? html`<mwc-button
                class="mwc-3d"
                raised
                @click=${() => this._handleNextClick()}
                >${this.i18n._t('actions.next')}</mwc-button
              >`
            : html`<mwc-button raised @click=${() => this.wizard._finish()}
                >${this.i18n._t('actions.save')}</mwc-button
              >`}
        </div>
      </div>
    `;
  }

  // --- utilità e binding config ---

  _t(path) {
    return this.i18n._t(path);
  }

  _isElDefined(tag) {
    try {
      return typeof customElements !== 'undefined' && !!customElements.get(tag);
    } catch {
      return false;
    }
  }

  _renderTextInput(key, value, label) {
    const hasHaTextfield = this._isElDefined('ha-textfield');
    const hasMwcTextfield = this._isElDefined('mwc-textfield');

    if (hasHaTextfield) {
      return html`
        <ha-textfield
          style="margin-top:8px;"
          .value=${value || ''}
          .label=${label}
          @input=${(e) => this._updateConfig(key, (e.target.value || '').trim())}
        ></ha-textfield>
      `;
    }
    if (hasMwcTextfield) {
      return html`
        <mwc-textfield
          style="margin-top:8px;"
          .value=${value || ''}
          label=${label}
          @input=${(e) => this._updateConfig(key, (e.target.value || '').trim())}
        ></mwc-textfield>
      `;
    }
    return html`
      <input
        type="text"
        style="margin-top:8px;width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--divider-color);border-radius:4px;"
        .value=${value || ''}
        placeholder=${label}
        @input=${(e) => this._updateConfig(key, (e.target.value || '').trim())}
      />
    `;
  }

  _handleButtonClick(e, fn) {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof fn === 'function') {
        fn(e);
      } else {
        console.warn('[CronoStarEditor] Button clicked but no handler provided');
      }
    } catch (err) {
      console.warn('[CronoStarEditor] Button click error:', err);
      this._showToast(
        this._lang === 'it'
          ? `Errore: ${err?.message || err}`
          : `Error: ${err?.message || err}`,
      );
    }
  }

  _renderButton({
    label,
    click,
    primary = false,
    outlined = false,
    raised = true,
    text = false,
    icon = '',
    disabled = false,
  }) {
    // If text is true, force others to false
    if (text) {
      raised = false;
      outlined = false;
    }
    return html`
      <mwc-button
        class="${primary ? 'primary' : ''}"
        ?raised=${raised && !outlined}
        ?outlined=${outlined}
        ?unelevated=${!raised && !outlined && !text}
        ?disabled=${disabled}
        aria-busy="${disabled ? 'true' : 'false'}"
        @click=${(e) => this._handleButtonClick(e, click)}
      >
        ${icon ? `${icon} ` : ''}${label}
      </mwc-button>
    `;
  }

  _updateConfig(key, value) {
    this._config = { ...this._config, [key]: value };
    this._showStepError = false;
    this._ensurePresetDefaults();
    this._updateAutomationYaml();
    this._updateHelpersYaml();
    this._dispatchConfigChanged();
  }

  _updateNumber(key, value) {
    const num = value === '' || value === null || value === undefined ? null : Number(value);
    this._updateConfig(key, Number.isFinite(num) ? num : this._config[key]);
  }

  _ensurePresetDefaults() {
    const p = CARD_CONFIG_PRESETS[this._selectedPreset] || {};
    if (this._config.min_value === undefined || this._config.min_value === null) this._config.min_value = p.min_value;
    if (this._config.max_value === undefined || this._config.max_value === null) this._config.max_value = p.max_value;
    if (this._config.step_value === undefined || this._config.step_value === null) this._config.step_value = p.step_value;
    if (!this._config.unit_of_measurement && p.unit_of_measurement) this._config.unit_of_measurement = p.unit_of_measurement;
    if (!this._config.y_axis_label && p.y_axis_label) this._config.y_axis_label = p.y_axis_label;
    if (!this._config.entity_prefix && p.entity_prefix) this._config.entity_prefix = p.entity_prefix;
  }

  _updateAutomationYaml() {
    if (!this._config.apply_entity) {
      this._automationYaml =
        this._lang === 'it'
          ? "# Configura prima l'entità di destinazione"
          : '# Configure the target entity first';
      return;
    }
    const autoSource = this._deepReport?.automation?.source;
    const style = autoSource === 'inline' ? 'inline' : 'list';
    const autoPrefix = this._getEffectivePrefix().replace(/_+$/, '');
    this._calculatedAutomationFilename = `${autoPrefix}_automation.yaml`;
    this._automationYaml = this.yamlGenerators.buildAutomationYaml(this._config, style);
  }

  _updateHelpersYaml() {
    try {
      const inputNumberSource = this._deepReport?.input_number?.source || 'unknown';
      this._helpersYaml = this.yamlGenerators.buildInputNumbersYaml(this._config, inputNumberSource);
    } catch {
      this._helpersYaml =
        this._lang === 'it'
          ? "# Errore nel generare gli helpers. Controlla prefisso e valori min/max/step."
          : '# Error generating helpers. Check prefix and min/max/step values.';
    }
  }

  _getEffectivePrefix() {
    const gp = (this._config.global_prefix || '').trim();
    const ep = (this._config.entity_prefix || '').trim();
    return gp || ep || 'cronostar_';
  }

  _showToast(message) {
    if (this.hass) {
      this.hass.callService('persistent_notification', 'create', {
        title: 'CronoStar Editor',
        message,
        notification_id: `cronostar_editor_${Date.now()}`,
      });
    }
  }

  _dispatchConfigChanged() {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // --- servizi delegati ---

  async _copyAutomation() {
    const result = await this.serviceHandlers.copyToClipboard(
      this._automationYaml,
      this.i18n._t('messages.yaml_copied'),
      this.i18n._t('messages.yaml_copy_error'),
    );
    this._showToast(result.message);
  }

  _downloadAutomation() {
    const result = this.serviceHandlers.downloadFile(
      this._calculatedAutomationFilename,
      this._automationYaml,
      this.i18n._t('messages.file_downloaded'),
      this.i18n._t('messages.file_download_error'),
    );
    this._showToast(result.message);
  }

  async _copyHelpersYaml() {
    const result = await this.serviceHandlers.copyToClipboard(
      this._helpersYaml,
      this.i18n._t('messages.helpers_yaml_copied'),
      this.i18n._t('messages.helpers_yaml_error'),
    );
    this._showToast(result.message);
  }

  _downloadHelpersYaml() {
    const result = this.serviceHandlers.downloadFile(
      this._calculatedHelpersFilename,
      this._helpersYaml,
      this.i18n._t('messages.helpers_yaml_downloaded'),
      this.i18n._t('messages.file_download_error'),
    );
    this._showToast(result.message);
  }

  async _createHelpersYamlFile() {
    try {
      const result = await this.serviceHandlers.handleCreateHelpersYaml(
        this.hass,
        this._config,
        this._deepReport,
        this._lang,
      );
      this._showToast(result.message);
    } catch (e) {
      this._showToast(`✗ ${e.message}`);
    }
  }

  async _createAutomationYamlFile() {
    try {
      const result = await this.serviceHandlers.handleCreateAutomationYaml(
        this.hass,
        this._config,
        this._deepReport,
        this._lang,
      );
      this._showToast(result.message);
    } catch (e) {
      this._showToast(`✗ ${e.message}`);
    }
  }

  async _createAutomation() {
    if (this._creatingAutomation) return;

    this._creatingAutomation = true;
    this.requestUpdate();

    try {
      const result = await this.serviceHandlers.handleCreateAndReloadAutomation(
        this.hass,
        this._config,
        this._deepReport,
        this._lang,
      );
      this._showToast(result.message);
    } catch (e) {
      this._showToast(this.i18n._t('messages.auto_error_prefix') + e.message);
    } finally {
      this._creatingAutomation = false;
      this.requestUpdate();
    }
  }

  async _runDeepChecks() {
    this._deepCheckInProgress = true;
    this.requestUpdate();
    try {
      const result = await this.serviceHandlers.runDeepChecks(
        this.hass,
        this._config,
        this._lang,
      );
      this._showToast(result.message);
    } catch (e) {
      this._showToast(`✗ ${e.message}`);
    }
  }
}

// Registrazione semplice (se non già fatta da main.js)
if (!customElements.get('cronostar-card-editor')) {
  try {
    customElements.define('cronostar-card-editor', CronoStarEditor);
  } catch (e) {
    if (!String(e).includes('already been used') && !String(e).includes('already defined')) {
      throw e;
    }
  }
}
