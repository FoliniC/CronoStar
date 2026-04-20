import { html } from "lit";
import { getEffectivePrefix } from "../../utils/prefix_utils.js";
import { handleInitializeData } from "../services/service_handlers.js";

export class Step5Summary {
  constructor(editor) {
    this.editor = editor;
  }

  async handleSaveAll() {
    try {
      const result = await handleInitializeData(
        this.editor.hass,
        this.editor._config,
        this.editor._language,
      );
      this.editor.showToast(result.message);
    } catch (e) {
      this.editor.showToast(e.message);
    }
  }

  render() {
    console.log("[Step5Summary] Rendering...");
    try {
      const effectivePrefix = getEffectivePrefix(this.editor._config);
      const isIt = this.editor._language === "it";

      // Build associated entity names
      const currentEntity = `sensor.${effectivePrefix}current`;
      const selectEntity = `select.${effectivePrefix}current_profile`;
      const enabledEntity = `switch.${effectivePrefix}enabled`;

      console.log("[Step5Summary] Entities:", {
        currentEntity,
        selectEntity,
        enabledEntity,
      });

      // Verifica configurazione lovelace
      const requiredFields = [
        "preset_type",
        "target_entity",
        "global_prefix",
        "min_value",
        "max_value",
        "step_value",
      ];

      const missingFields = requiredFields.filter(
        (field) =>
          !this.editor._config[field] && this.editor._config[field] !== 0,
      );

      const configComplete = missingFields.length === 0;
      console.log(
        "[Step5Summary] Config complete:",
        configComplete,
        "Missing:",
        missingFields,
      );

      // Build YAML string for card config - include only non-default or specifically set values
      const cleanConfig = { type: "custom:cronostar-card" };
      const keys = [
        "preset_type",
        "global_prefix",
        "target_entity",
        "enabled_entity",
        "profiles_select_entity",
        "min_value",
        "max_value",
        "step_value",
        "unit_of_measurement",
        "y_axis_label",
        "allow_max_value",
        "logging_enabled",
        "title",
        "interval_minutes",
      ];

      for (const key of keys) {
        let val = this.editor._config[key];

        // FIX: Ensure profiles_select_entity uses the correct prefix if not manually overridden
        if (key === "profiles_select_entity" && !val) {
          val = selectEntity;
        }
        if (key === "enabled_entity" && !val) {
          val = enabledEntity;
        }

        if (val !== null && val !== undefined && val !== "") {
          cleanConfig[key] = val;
        }
      }

      const cardYaml = Object.entries(cleanConfig)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? "'" + v + "'" : v}`)
        .join("\n");

      console.log("[Step5Summary] Generated YAML length:", cardYaml.length);

      return html`
        <div class="step-content">
          <div class="step-header">
            ${this.editor.i18n._t("headers.step5")} (Step 5)
          </div>
          <div class="step-description">
            ${this.editor.i18n._t("descriptions.step5")}
          </div>

          <!-- SUMMARY SECTION REDESIGN -->
          <div class="field-group" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <img
                  src="/cronostar_card/cronostar-logo.png"
                  style="width: 24px; height: auto;"
                  alt="CronoStar"
                />
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--primary-text-color);">
                  ${this.editor._config.title || "CronoStar Controller"}
                </div>
              </div>
              ${configComplete
                ? html`<span class="badge-success" style="padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;">VALID</span>`
                : html`<span class="badge-danger" style="padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;">INCOMPLETE</span>`}
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="summary-key">Target Entity</span>
                <span class="summary-val">${this.editor._config.target_entity || "—"}</span>
              </div>
              <div class="summary-row">
                <span class="summary-key">Global Prefix</span>
                <span class="summary-val">${effectivePrefix}</span>
              </div>
              <div class="summary-row">
                <span class="summary-key">Preset Type</span>
                <span class="summary-val">${this.editor._config.preset_type || "thermostat"}</span>
              </div>
              <div class="summary-row">
                <span class="summary-key">Range</span>
                <span class="summary-val">${this.editor._config.min_value} to ${this.editor._config.max_value} ${this.editor._config.unit_of_measurement}</span>
              </div>
              <div class="summary-row">
                <span class="summary-key">Step</span>
                <span class="summary-val">${this.editor._config.step_value}</span>
              </div>
            </div>

            ${!configComplete
              ? html`
                  <div class="error-box" style="margin-top: 24px;">
                    <div style="font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                      <ha-icon icon="mdi:alert-box" style="--mdc-icon-size: 18px;"></ha-icon>
                      ${isIt ? "CONFIGURAZIONE INCOMPLETA" : "INCOMPLETE CONFIGURATION"}
                    </div>
                    <ul style="margin: 0; padding-left: 20px;">
                      ${missingFields.map(field => html`<li>Missing field: <strong>${field}</strong></li>`)}
                    </ul>
                  </div>
                `
              : html`
                  <div class="success-box" style="margin-top: 24px; display: flex; align-items: center; gap: 8px;">
                    <ha-icon icon="mdi:check-decagram" style="--mdc-icon-size: 18px;"></ha-icon>
                    <span>${isIt ? "Configurazione completata con successo" : "Configuration completed successfully"}</span>
                  </div>
                `}
          </div>

          <details style="margin-bottom: 24px; cursor: pointer;">
            <summary
              style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 8px;"
            >
              ${isIt ? "Mostra YAML configurazione" : "Show YAML configuration"}
            </summary>
            <div
              style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"
            >
              <pre
                style="margin: 0; color: #38bdf8; font-size: 0.85rem; font-family: 'Fira Code', monospace; white-space: pre-wrap;"
              >
${cardYaml}</pre
              >
            </div>
          </details>

          <div class="success-box" style="text-align: center;">
            <p style="font-weight: 700; font-size: 1.1rem; margin: 0;">
              ${isIt
                ? 'Tutto pronto! Clicca il pulsante "SALVA" in basso a destra per confermare.'
                : 'All set! Click the "SAVE" button at the bottom right to finalize.'}
            </p>
          </div>
        </div>
      `;
    } catch (e) {
      console.error("[Step5Summary] Render error:", e);
      return html`<div style="color: red; padding: 20px;">
        Error rendering Step 5: ${e.message}
      </div>`;
    }
  }
}
