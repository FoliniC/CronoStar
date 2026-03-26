import { html } from "lit";
import { buildAutomationTemplate } from "../yaml/yaml_generators.js";

export class Step4Automation {
  constructor(editor) {
    this.editor = editor;
  }

  render() {
    const yaml =
      this.editor._automationYaml ||
      buildAutomationTemplate(this.editor._config);
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
        <div class="step-header">
          ${this.editor.i18n._t("headers.step4")} (Step 4)
        </div>

        <div class="success-box" style="margin-top: 0; margin-bottom: 32px;">
          <div
            style="display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.1rem;"
          >
            <ha-icon icon="mdi:check-circle" style="color: #4ade80;"></ha-icon>
            ${isIt
              ? "CronoStar applica automaticamente la pianificazione!"
              : "CronoStar automatically applies the schedule!"}
          </div>
          <p style="margin: 8px 0 0 36px; color: #cbd5e1;">
            ${isIt
              ? "Non è necessaria alcuna automazione per il funzionamento base."
              : "No automation is needed for basic operation."}
          </p>
        </div>

        <div class="step-description">
          ${isIt
            ? "Tuttavia, puoi rendere la tua casa più intelligente cambiando automaticamente i profili (es. Casa/Fuori/Notte) in base agli eventi. Ecco un esempio per la gestione della presenza:"
            : "However, you can make your home smarter by automatically switching profiles (e.g. Home/Away/Night) based on events. Here is an example for presence management:"}
        </div>

        <div class="field-group">
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"
          >
            <span style="font-weight: 700; color: #ffffff;"
              >${isIt
                ? "Automazione Smart Presence"
                : "Smart Presence Automation"}</span
            >
            <mwc-button
              outlined
              @click=${() =>
                this.editor.serviceHandlers.copyToClipboard(
                  yaml,
                  "✓ Copied!",
                  "Error",
                )}
            >
              📋 ${isIt ? "Copia YAML" : "Copy YAML"}
            </mwc-button>
          </div>

          <textarea
            readonly
            style="width: 100%; height: 280px; font-size: 13px; line-height: 1.5; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); color: #38bdf8; font-family: 'Fira Code', 'Roboto Mono', monospace;"
          >
${yaml}</textarea
          >
        </div>

        <div
          style="margin-top: 40px; text-align: center; padding: 24px; background: rgba(255,255,255,0.02); border-radius: 16px;"
        >
          <div style="margin-bottom: 16px; color: #cbd5e1; font-size: 1.1rem;">
            ${isIt
              ? "Vuoi un'automazione più complessa?"
              : "Do you want a more complex automation?"}
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
    const target = config.target_entity || "your_entity";
    const preset = config.preset_type || "thermostat";

    const promptText = isIt
      ? `Agisci come un esperto di Home Assistant. Ho installato il componente CronoStar per gestire il mio dispositivo '${target}' (${preset}).
Il componente espone un'entità select chiamata 'select.${config.global_prefix || "cronostar_"}current_profile' che mi permette di cambiare il profilo attivo (es. Default, Away, Holiday) e un sensore 'sensor.${config.global_prefix || "cronostar_"}current' che mostra il valore schedulato attuale.

Per favore scrivi un'automazione Home Assistant (usando la sintassi moderna con triggers, conditions, actions) che:
1. Passi al profilo "Away" quando non c'è nessuno a casa.
2. Torni al profilo "Default" quando qualcuno rientra.
3. Torni al profilo "Default" per sicurezza se il valore schedulato (sensor.${config.global_prefix || "cronostar_"}current) scende sotto 13.
4. (Opzionale) Passi al profilo "Eco" se una finestra è aperta per più di 5 minuti.

Usa 'choose' nelle azioni per gestire i diversi scenari in un'unica automazione.`
      : `Act as a Home Assistant expert. I have installed the CronoStar component to manage my '${target}' device (${preset}).
The component exposes a select entity named 'select.${config.global_prefix || "cronostar_"}current_profile' that allows me to change the active profile (e.g., Default, Away, Holiday) and a sensor 'sensor.${config.global_prefix || "cronostar_"}current' showing the current scheduled value.

Please write a Home Assistant automation (using modern syntax with triggers, conditions, actions) that:
1. Switches to the "Away" profile when no one is home.
2. Returns to the "Default" profile when someone arrives.
3. Returns to the "Default" profile for safety if the scheduled value (sensor.${config.global_prefix || "cronostar_"}current) drops below 13.
4. (Optional) Switches to an "Eco" profile if a window is open for more than 5 minutes.

Use 'choose' in the actions to handle these different scenarios in a single automation.`;

    return html`
      <div class="step-content">
        <div class="step-header">
          <ha-icon
            icon="mdi:robot-excited-outline"
            style="margin-right: 12px; color: #c084fc;"
          ></ha-icon>
          ${isIt ? "Prompt per AI Assistant" : "AI Assistant Prompt"}
        </div>

        <div class="step-description">
          ${isIt
            ? "Copia questo testo e incollalo in ChatGPT, Gemini o Claude per generare un'automazione su misura per le tue esigenze."
            : "Copy this text and paste it into ChatGPT, Gemini, or Claude to generate an automation tailored to your needs."}
        </div>

        <div
          class="field-group"
          style="background: linear-gradient(145deg, rgba(88, 28, 135, 0.15), rgba(59, 7, 100, 0.1)); border-color: rgba(192, 132, 252, 0.2);"
        >
          <textarea
            readonly
            style="height: 300px; font-size: 13px; line-height: 1.5; background: rgba(0,0,0,0.3); color: #e9d5ff;"
          >
${promptText}</textarea
          >

          <div
            style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 12px;"
          >
            <mwc-button outlined @click=${toggleHandler}>
              ${isIt ? "Indietro" : "Back"}
            </mwc-button>
            <mwc-button
              raised
              style="--mdc-theme-primary: #c084fc;"
              @click=${() =>
                this.editor.serviceHandlers.copyToClipboard(
                  promptText,
                  "Prompt Copied!",
                  "Error",
                )}
            >
              📋 ${isIt ? "Copia Prompt" : "Copy Prompt"}
            </mwc-button>
          </div>
        </div>
      </div>
    `;
  }
}
