import { html } from 'lit';

export class Step4Automation {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    if (!this.editor._config.target_entity) {
      return html`
        <div class="step-content">
          <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
          <div class="warning-box">
            ${this.editor.i18n._t('step2_msgs.missing_apply')}
          </div>
        </div>
      `;
    }

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step4')}</div>
        <div class="field-group">
          <label class="field-label">Applies to: ${this.editor._config.target_entity}</label>
        </div>
        <pre style="background: var(--secondary-background-color); padding: 12px; border-radius: 4px; overflow: auto; white-space: pre-wrap;">${this.editor._automationYaml}</pre>
        <div class="action-buttons">
          ${this.editor.renderButton(this.editor.i18n._t('actions.copy_yaml'), () => this.editor.serviceHandlers.copyToClipboard(this.editor._automationYaml))}
          ${this.editor.renderButton(this.editor.i18n._t('actions.download_file'), () => this.editor.serviceHandlers.downloadFile('automation.yaml', this.editor._automationYaml))}
        </div>
      </div>
    `;
  }
}
