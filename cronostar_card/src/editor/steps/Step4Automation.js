import { html } from 'lit';

export class Step4Automation {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const yaml = this.editor._automationYaml || '';
    const isIt = this.editor._language === "it";
    
    // Toggle handler for LLM prompt view
    const toggleLlmPrompt = () => {
      this.editor._showLlmPrompt = !this.editor._showLlmPrompt;
      this.editor.requestUpdate();
    };

    if (this.editor._showLlmPrompt) {
      return this._renderLlmPromptView(isIt, toggleLlmPrompt);
    }

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step4')}</div>
        
        <div class="success-box" style="margin-top: 0; margin-bottom: 24px;">
          <ha-icon icon="mdi:check-circle-outline" style="margin-right: 8px;"></ha-icon>
          ${isIt 
            ? "CronoStar applica automaticamente la pianificazione! Non è necessaria alcuna automazione per il funzionamento base." 
            : "CronoStar automatically applies the schedule! No automation is needed for basic operation."}
        </div>

        <div class="step-description">
          ${isIt 
            ? "Tuttavia, puoi rendere la tua casa più intelligente cambiando automaticamente i profili (es. Casa/Fuori/Notte) in base agli eventi. Ecco un esempio per la gestione della presenza:" 
            : "However, you can make your home smarter by automatically switching profiles (e.g. Home/Away/Night) based on events. Here is an example for presence management:"}
        </div>

        <div class="field-group">
          <div class="field-description" style="color: #bae6fd; font-weight: 500; display: flex; justify-content: space-between; align-items: center;">
            <span>${isIt ? "Automazione Smart Presence" : "Smart Presence Automation"}</span>
            <mwc-button outlined style="--mdc-theme-primary: #bae6fd;" @click=${() => this.editor.serviceHandlers.copyToClipboard(yaml, "✓ Copied!", "Error")}>
              📋 ${isIt ? "Copia YAML" : "Copy YAML"}
            </mwc-button>
          </div>
          
          <div style="position: relative; margin-top: 12px;">
            <textarea 
              readonly 
              style="height: 250px; font-size: 12px; line-height: 1.4; background: rgba(0,0,0,0.4); font-family: 'Roboto Mono', monospace;"
            >${yaml}</textarea>
          </div>
        </div>

        <div style="margin-top: 32px; text-align: center;">
          <div style="margin-bottom: 12px; color: #a0a8c0;">
            ${isIt ? "Vuoi un'automazione più complessa?" : "Do you want a more complex automation?"}
          </div>
          <mwc-button raised @click=${toggleLlmPrompt}>
            ✨ ${isIt ? "Genera Prompt per AI" : "Generate AI Prompt"}
          </mwc-button>
        </div>
      </div>
    `;
  }

  _renderLlmPromptView(isIt, toggleHandler) {
    const config = this.editor._config || {};
    const target = config.target_entity || 'your_entity';
    const preset = config.preset_type || 'thermostat';
    
    const promptText = isIt 
      ? `Agisci come un esperto di Home Assistant. Ho installato il componente CronoStar per gestire il mio dispositivo '${target}' (${preset}).
Il componente espone un'entità select chiamata 'select.${config.global_prefix || 'cronostar_'}current_profile' che mi permette di cambiare il profilo attivo (es. Default, Away, Holiday) e un sensore 'sensor.${config.global_prefix || 'cronostar_'}current' che mostra il valore schedulato attuale.

Per favore scrivi un'automazione Home Assistant (usando la sintassi moderna con triggers, conditions, actions) che:
1. Passi al profilo "Away" quando non c'è nessuno a casa.
2. Torni al profilo "Default" quando qualcuno rientra.
3. Torni al profilo "Default" per sicurezza se il valore schedulato (sensor.${config.global_prefix || 'cronostar_'}current) scende sotto 13.
4. (Opzionale) Passi al profilo "Eco" se una finestra è aperta per più di 5 minuti.

Usa 'choose' nelle azioni per gestire i diversi scenari in un'unica automazione.`
      : `Act as a Home Assistant expert. I have installed the CronoStar component to manage my '${target}' device (${preset}).
The component exposes a select entity named 'select.${config.global_prefix || 'cronostar_'}current_profile' that allows me to change the active profile (e.g., Default, Away, Holiday) and a sensor 'sensor.${config.global_prefix || 'cronostar_'}current' showing the current scheduled value.

Please write a Home Assistant automation (using modern syntax with triggers, conditions, actions) that:
1. Switches to the "Away" profile when no one is home.
2. Returns to the "Default" profile when someone arrives.
3. Returns to the "Default" profile for safety if the scheduled value (sensor.${config.global_prefix || 'cronostar_'}current) drops below 13.
4. (Optional) Switches to an "Eco" profile if a window is open for more than 5 minutes.

Use 'choose' in the actions to handle these different scenarios in a single automation.`;

    return html`
      <div class="step-content">
        <div class="step-header">
          <ha-icon icon="mdi:robot-excited-outline" style="margin-right: 12px; color: #c084fc;"></ha-icon>
          ${isIt ? "Prompt per AI Assistant" : "AI Assistant Prompt"}
        </div>
        
        <div class="step-description">
          ${isIt 
            ? "Copia questo testo e incollalo in ChatGPT, Gemini o Claude per generare un'automazione su misura per le tue esigenze." 
            : "Copy this text and paste it into ChatGPT, Gemini, or Claude to generate an automation tailored to your needs."}
        </div>

        <div class="field-group" style="background: linear-gradient(145deg, rgba(88, 28, 135, 0.15), rgba(59, 7, 100, 0.1)); border-color: rgba(192, 132, 252, 0.2);">
          <textarea 
            readonly 
            style="height: 300px; font-size: 13px; line-height: 1.5; background: rgba(0,0,0,0.3); color: #e9d5ff;"
          >${promptText}</textarea>
          
          <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 12px;">
            <mwc-button outlined @click=${toggleHandler}>
              ${isIt ? "Indietro" : "Back"}
            </mwc-button>
            <mwc-button raised style="--mdc-theme-primary: #c084fc;" @click=${() => this.editor.serviceHandlers.copyToClipboard(promptText, "Prompt Copied!", "Error")}>
              📋 ${isIt ? "Copia Prompt" : "Copy Prompt"}
            </mwc-button>
          </div>
        </div>
      </div>
    `;
  }
}