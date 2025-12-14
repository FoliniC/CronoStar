import { html } from 'lit';
export class Step4Automation {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    if (!this.editor._config.apply_entity) {
      return html`
        <div class="step-content">
          <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
          <div class="warning-box">
            <strong>⚠️</strong>
            <p>${this.editor.i18n._t('step2_msgs.missing_apply')}</p>
          </div>
        </div>
      `;
    }
    
    const automationDisplayPath = (this.editor._deepReport?.automation?.full_path || '') + '/' + this.editor._calculatedAutomationFilename;
    
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step4')}</div>

        <div class="success-box">
          <strong>${this.editor.i18n._t('auto.ready')}</strong>
          <p>${this.editor.i18n._t('auto.to_entity')} <code class="inline">${this.editor._config.apply_entity}</code></p>
        </div>

        <div class="action-buttons">
          ${this.editor._renderButton({ label: this.editor.i18n._t('actions.copy_yaml'), click: () => this._copyAutomation() })}
          ${this.editor._renderButton({ label: this.editor.i18n._t('actions.download_file'), click: () => this._downloadAutomation() })}
          ${this.editor._renderButton({
            label: `${this.editor._lang === 'it' ? 'Crea File YAML (su HA)' : 'Create YAML File (on HA)'} (${automationDisplayPath})`,
            icon: '✏️',
            click: () => this._createAutomationYamlFile()
          })}
          ${this.editor._renderButton({
            label: this.editor._creatingAutomation
              ? (this.editor._lang === 'it' ? '⏳ Creazione...' : '⏳ Creating...')
              : (this.editor.i18n._t('actions.create_automation_and_reload')),
            primary: true,
            raised: true,
            disabled: this.editor._creatingAutomation,
            click: () => this._createAutomation()
          })}
        </div>

        <div class="field-group" style="margin-top: 20px;">
          <ha-formfield .label=${this.editor.i18n._t('actions.show_preview')}>
            <ha-switch
              .checked=${this.editor._showAutomationPreview}
              @change=${(e) => { this.editor._showAutomationPreview = e.target.checked; this.editor.requestUpdate(); }}
            ></ha-switch>
          </ha-formfield>
        </div>

        ${this.editor._showAutomationPreview ? html`
          <div class="automation-preview">
            <pre>${this.editor._automationYaml}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  async _copyAutomation() {
    const result = await this.editor.serviceHandlers.copyToClipboard(
      this.editor._automationYaml,
      this.editor.i18n._t('messages.yaml_copied'),
      this.editor.i18n._t('messages.yaml_copy_error')
    );
    this.editor._showToast(result.message);
  }

  _downloadAutomation() {
    const result = this.editor.serviceHandlers.downloadFile(
      this.editor._calculatedAutomationFilename,
      this.editor._automationYaml,
      this.editor.i18n._t('messages.file_downloaded'),
      this.editor.i18n._t('messages.file_download_error')
    );
    this.editor._showToast(result.message);
  }

  async _createHelpersYamlFile() {
    try {
      const result = await this.editor.serviceHandlers.handleCreateHelpersYaml(
        this.editor.hass,
        this.editor._config,
        this.editor._deepReport,
        this.editor._lang
      );
      this.editor._showToast(result.message);
    } catch (e) {
      this.editor._showToast(`✗ ${e.message}`);
    }
  }

  async _createAutomationYamlFile() {
    try {
      const result = await this.editor.serviceHandlers.handleCreateAutomationYaml(
        this.editor.hass,
        this.editor._config,
        this.editor._deepReport,
        this.editor._lang
      );
      this.editor._showToast(result.message);
    } catch (e) {
      this.editor._showToast(`✗ ${e.message}`);
    }
  }

  async _createAutomation() {
    if (this.editor._creatingAutomation) return;
    
    this.editor._creatingAutomation = true;
    this.editor.requestUpdate();
    
    try {
      const result = await this.editor.serviceHandlers.handleCreateAndReloadAutomation(
        this.editor.hass,
        this.editor._config,
        this.editor._deepReport,
        this.editor._lang
      );
      this.editor._showToast(result.message);
    } catch (e) {
      this.editor._showToast(this.editor.i18n._t('messages.auto_error_prefix') + e.message);
    } finally {
      this.editor._creatingAutomation = false;
      this.editor.requestUpdate();
    }
  }
}
