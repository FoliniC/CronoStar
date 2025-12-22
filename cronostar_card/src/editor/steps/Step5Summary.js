import { html } from 'lit';
import { getAliasWithPrefix, getEffectivePrefix } from '../../utils/prefix_utils.js';
import { getExpectedAutomationId, buildAutomationFilename } from '../../utils/filename_utils.js';
import { handleSaveAll, runDeepChecks } from '../services/service_handlers.js';

export class Step5Summary {
  constructor(editor) {
    this.editor = editor;
  }

  async handleDeepChecks() {
    this.editor._deepCheckInProgress = true;
    try {
      const result = await runDeepChecks(this.editor.hass, this.editor._config, this.editor._lang);
      this.editor._deepReport = await this.editor.hass.callService('cronostar', 'check_setup', {
        prefix: getEffectivePrefix(this.editor._config),
        // params...
      });
      this.editor.showToast('Deep check complete');
    } catch (e) {
      this.editor.showToast(e.message);
    } finally {
      this.editor._deepCheckInProgress = false;
      this.editor.requestUpdate();
    }
  }

  async handleSaveAll() {
    try {
      const result = await handleSaveAll(this.editor.hass, this.editor._config, this.editor._deepReport, this.editor._lang);
      this.editor.showToast(result.message);
    } catch (e) {
      this.editor.showToast(e.message);
    }
  }

  render() {
    const qc = this.editor._quickCheck;
    const hasDeep = !!this.editor.hass?.services?.cronostar?.check_setup;
    const inum = this.editor._deepReport?.input_number;
    const autoInfo = this.editor._deepReport?.automation;
    const effectivePrefix = getEffectivePrefix(this.editor._config);
    const expectedAlias = getAliasWithPrefix(effectivePrefix, this.editor._lang);
    const expectedId = getExpectedAutomationId(effectivePrefix);
    const autoFilename = buildAutomationFilename(effectivePrefix);

    // Verifica configurazione lovelace
    const requiredFields = [
      'preset', 'apply_entity', 'global_prefix',
      'min_value', 'max_value', 'step_value'
    ];

    const missingFields = requiredFields.filter(
      field => !this.editor._config[field] && this.editor._config[field] !== 0
    );

    const configComplete = missingFields.length === 0;

    const proposedConfig = {
      type: 'custom:cronostar-card',
      preset: this.editor._config.preset,
      global_prefix: effectivePrefix,
      apply_entity: this.editor._config.apply_entity,
      pause_entity: this.editor._config.pause_entity,
      profiles_select_entity: this.editor._config.profiles_select_entity,
      min_value: this.editor._config.min_value,
      max_value: this.editor._config.max_value,
      step_value: this.editor._config.step_value,
      unit_of_measurement: this.editor._config.unit_of_measurement,
      y_axis_label: this.editor._config.y_axis_label,
      logging_enabled: this.editor._config.logging_enabled !== false
    };

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step5')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step5')}</div>

        <!-- Card Configuration Status -->
        ${configComplete ? html`
          <div class="success-box" style="margin: 16px 0;">
            <strong>✅ ${this.editor.i18n._t('ui.card_config_complete')}</strong>
            <p>${this.editor.i18n._t('ui.card_config_ready')}</p>
          </div>
        ` : html`
          <div class="warning-box" style="margin: 16px 0;">
            <strong>⚠️ ${this.editor.i18n._t('ui.card_config_incomplete')}</strong>
            <p>${this.editor.i18n._t('ui.missing_fields')}: ${missingFields.join(', ')}</p>
          </div>
        `}

        <div class="warning-box">
          <strong>${this.editor.i18n._t('finalmodtitle')}</strong>
          <p>${this.editor.i18n._t('finalmodtext')}</p>
          <ul>
            <li>global_prefix: <code>${proposedConfig.global_prefix}</code></li>
            <li>apply_entity: <code>${this.editor._config.apply_entity}</code></li>
            <li>package: <code>${effectivePrefix}package.yaml</code></li>
          </ul>
        </div>

        ${hasDeep ? html`
          <div class="field-group">
            <div class="action-buttons">
              <mwc-button raised @click=${() => this.handleDeepChecks()}>${this.editor.i18n._t('actions.run_deep_checks')}</mwc-button>
            </div>
            ${inum ? html`<div>Helpers: ${inum.found}/${inum.expected}</div>` : ''}
            ${autoInfo ? html`<div>Automation: ${autoInfo.found ? expectedId : 'Missing'}</div>` : ''}
          </div>
        ` : html`
          <div class="info-box">Deep checks service unavailable.</div>
        `}

        <div class="info-box">
          <strong>Expected:</strong><br>
          Alias: <code>${expectedAlias}</code><br>
          Auto ID: <code>${expectedId}</code><br>
          Auto file: <code>${autoFilename}</code>
        </div>
      </div>
    `;
  }
}