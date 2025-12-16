import { html } from 'lit';
import { getAliasWithPrefix, getEffectivePrefix } from '../../utils/prefix_utils.js';
import { getExpectedAutomationId } from '../../utils/filename_utils.js';

export class Step5Summary {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const qc = this.editor._quickCheck;
    const hasDeep = !!this.editor.hass?.services?.cronostar?.check_setup;
    const inum = this.editor._deepReport?.input_number;
    const auto = this.editor._deepReport?.automation;
    const expectedAlias = getAliasWithPrefix(getEffectivePrefix(this.editor._config), this.editor._lang);
    const expectedId = getExpectedAutomationId(getEffectivePrefix(this.editor._config));

    return html`
      <div class="step-content">
        <div class="step-header">🎉 ${this.editor.i18n._t('headers.step5')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step5')}</div>

        <div class="success-box">
          <strong>${this.editor.i18n._t('summary.config')}</strong>
          <ul style="margin: 8px 0; padding-left: 20px;">
            <li><strong>${this.editor.i18n._t('summary.preset')}:</strong> ${this.editor.i18n._getPresetName()}</li>
            <li><strong>${this.editor.i18n._t('summary.target')}:</strong> ${this.editor._config.apply_entity || (this.editor._lang === 'it' ? 'Non configurata' : 'Not configured')}</li>
            ${this.editor._config.profiles_select_entity ? html`
              <li><strong>${this.editor.i18n._t('summary.profiles')}:</strong> ${this.editor._config.profiles_select_entity}</li>
            ` : ''}
            ${this.editor._config.pause_entity ? html`
              <li><strong>${this.editor.i18n._t('summary.pause')}:</strong> ${this.editor._config.pause_entity}</li>
            ` : ''}
          </ul>
        </div>

        <div class="info-box">
          <div><strong>${this.editor.i18n._t('checks.expected_alias_label')}:</strong> <code class="inline">${expectedAlias}</code></div>
          <div style="margin-top:6px;"><strong>${this.editor.i18n._t('checks.expected_auto_id_label')}:</strong> <code class="inline">${expectedId}</code></div>
        </div>

        <div class="warning-box">
          <strong>📋 ${this.editor.i18n._t('what_to_do_next.title')}</strong>
          <ol style="margin: 8px 0; padding-left: 20px;">
            <li>
              ${this.editor.i18n._t('what_to_do_next.step1_helpers_button')}
            </li>
            <li>
              ${this.editor.i18n._t('what_to_do_next.step2_automation_button')}
            </li>
            <li>
              ${this.editor.i18n._t('what_to_do_next.step3_restart')}
            </li>
            <li>
              ${this.editor.i18n._t('what_to_do_next.step4_save_config')}
            </li>
          </ol>
        </div>

        <div class="field-group">
          <label class="field-label">${this.editor.i18n._t('checks.title')}</label>
          <div class="field-description">${this.editor.i18n._t('checks.deep_hint')}</div>
          <div class="action-buttons">
            ${this.editor._renderButton({
              label: this.editor.i18n._t('actions.run_deep_checks'),
              primary: true,
              icon: '🧪',
              click: () => this._runDeepChecks(expectedAlias)
            })}
            ${this.editor._renderButton({
              label: this.editor._lang === 'it' ? 'Inizializza File Dati' : 'Initialize Data File',
              icon: '💾',
              click: () => this._initData()
            })}
          </div>

          ${qc ? html`
            <div class="${qc.ok ? 'success-box' : 'warning-box'}" style="margin-top:12px;">
              <strong>${qc.ok ? this.editor.i18n._t('checks.quick_ok') : this.editor.i18n._t('checks.quick_warn')}</strong>
              <div style="margin-top:6px;">
                <div>
                  ${this.editor.i18n._t('checks.inputs_found_prefix')} ${qc.inputs.count} ${this.editor.i18n._t('checks.inputs_found_suffix')}
                  ${inum?.full_path ? html`
                    <div><strong>${this.editor.i18n._t('checks.location_prefix')}</strong> ${inum.full_path}</div>
                  ` : html`
                    <div>${this.editor.i18n._t('checks.inputs_run_deep')}</div>
                  `}
                </div>
                ${qc.inputs.missing.length ? html`
                  <div style="margin-top:6px;">
                    <div>${this.editor._lang === 'it' ? `Mancano ${qc.inputs.missing.length} ore:` : `Missing ${qc.inputs.missing.length} hours:`}</div>
                    <ul class="inline">
                      ${qc.inputs.missing.map(hh => html`<li>${hh}</li>`)}
                    </ul>
                  </div>
                ` : ''}
                <div style="margin-top:6px;">
                  ${qc.auto.ok ? this.editor.i18n._t('checks.auto_ok') : html`
                    <div>
                      ${this.editor.i18n._t('checks.auto_missing')} ${auto?.full_path ? html`
                        <div><strong>${this.editor.i18n._t('checks.location_prefix')}</strong> ${auto.full_path}</div>
                      ` : ''}
                      <div>${this.editor.i18n._t('checks.auto_create_where_prefix')} <strong>${this._formatAutoCreateWhere(auto)}</strong></div>
                    </div>
                  `}
                </div>
              </div>
            </div>
          ` : ''}

          ${!hasDeep ? html`
            <div class="info-box" style="margin-top:12px;">
              ${this.editor.i18n._t('messages.deep_checks_integration_missing')}
            </div>
          ` : ''}

          ${this.editor._deepReport ? html`
              <div class="field-group" style="margin-top:12px;">
                  <label class="field-label">${this.editor.i18n._t('checks.deep_report_label')}</label>
                  <textarea
                  readonly
                  style="width: 100%; height: 200px; font-family: monospace; resize: vertical; background-color: var(--code-editor-background-color, #1e1e1e); color: var(--code-editor-color, #d4d4d4); border: 1px solid var(--divider-color); border-radius: 4px;"
                  >${this.editor._deepReport.formatted_message}</textarea>
              </div>
          ` : ''}
        </div>

        <div class="info-box">
          <strong>💡 ${this.editor.i18n._t('tips.title')}</strong>
          <ul style="margin: 8px 0; padding-left: 20px;">
            ${this.editor.i18n._t('tips.items').map(s => html`<li>${s}</li>`)}
          </ul>
        </div>

        <div class="warning-box">
          <strong>⚠️ ${this.editor.i18n._t('important.title')}</strong>
          <p>${this.editor.i18n._t('important.text')}</p>
        </div>
      </div>
    `;
  }

  async _runDeepChecks(alias) {
    try {
      const result = await this.editor.serviceHandlers.runDeepChecks(
        this.editor.hass,
        this.editor._config,
        this.editor._lang
      );
      this.editor._showToast(result.message);
    } catch (e) {
      this.editor._showToast(`✗ ${e.message}`);
    }
  }

  async _initData() {
    try {
      // Lazy import or assume it's attached to serviceHandlers (it is in CronoStarEditor.js if we updated it)
      // We updated the file service_handlers.js but we need to ensure CronoStarEditor.js imports it.
      // Actually CronoStarEditor.js imports * from service_handlers.js, so we need to update that file too
      // to export handleInitializeData.
      // Assuming it is available via this.editor.serviceHandlers (we need to update CronoStarEditor to map it)
      
      if (this.editor.serviceHandlers.handleInitializeData) {
          const result = await this.editor.serviceHandlers.handleInitializeData(
            this.editor.hass,
            this.editor._config,
            this.editor._lang
          );
          this.editor._showToast("✓ Data Initialized!");
      } else {
          this.editor._showToast("✗ Handler not found (reload required?)");
      }
    } catch (e) {
      this.editor._showToast(`✗ ${e.message}`);
    }
  }
}
