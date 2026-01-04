import { html } from 'lit';

export class Step4Automation {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const yaml = this.editor._automationYaml || '';
    
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step4')}</div>

        <div class="field-group">
          <div class="field-description" style="color: #bae6fd; font-weight: 500;">
            ${"it" === this.editor._language 
              ? "Copia questo template nelle tue automazioni di Home Assistant per attivare l'applicazione automatica dei profili." 
              : "Copy this template into your Home Assistant automations to enable automatic profile application."}
          </div>
          
          <div style="position: relative; margin-top: 16px;">
            <textarea 
              readonly 
              style="height: 300px; font-size: 12px; line-height: 1.4; background: rgba(0,0,0,0.4);"
            >${yaml}</textarea>
            
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
              <mwc-button raised @click=${() => this.editor.serviceHandlers.copyToClipboard(yaml, "✓ Copied!", "Error")}>
                📋 ${"it" === this.editor._language ? "Copia YAML" : "Copy YAML"}
              </mwc-button>
            </div>
          </div>
        </div>

        <div class="info-box" style="margin-top: 24px;">
          <ha-icon icon="mdi:information-outline" style="margin-right: 8px;"></ha-icon>
          ${"it" === this.editor._language 
            ? "Puoi modificare il trigger (es. /5 o /10 minuti) o aggiungere condizioni personalizzate sopra questo template." 
            : "You can modify the trigger (e.g. /5 or /10 minutes) or add custom conditions on top of this template."}
        </div>
      </div>
    `;
  }
}
