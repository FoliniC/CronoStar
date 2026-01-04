import { html } from 'lit';
import { getEffectivePrefix } from '../../utils/prefix_utils.js';
import { handleInitializeData } from '../services/service_handlers.js';

export class Step5Summary {
  constructor(editor) {
    this.editor = editor;
  }

  async handleSaveAll() {
    try {
      const result = await handleInitializeData(this.editor.hass, this.editor._config, this.editor._language);
      this.editor.showToast(result.message);
    } catch (e) {
      this.editor.showToast(e.message);
    }
  }

  render() {
    const effectivePrefix = getEffectivePrefix(this.editor._config);

    // Verifica configurazione lovelace
    const requiredFields = [
      'preset_type', 'target_entity', 'global_prefix',
      'min_value', 'max_value', 'step_value'
    ];

    const missingFields = requiredFields.filter(
      field => !this.editor._config[field] && this.editor._config[field] !== 0
    );

    const configComplete = missingFields.length === 0;

    // Build YAML string for card config - include only non-default or specifically set values
    const cleanConfig = { type: 'custom:cronostar-card' };
    const validKeys = [
      'preset_type', 'global_prefix', 'target_entity', 'pause_entity',
      'profiles_select_entity', 'min_value', 'max_value', 'step_value',
      'unit_of_measurement', 'y_axis_label', 'allow_max_value',
      'logging_enabled', 'title', 'interval_minutes'
    ];

    for (const key of validKeys) {
      const val = this.editor._config[key];
      if (val !== null && val !== undefined && val !== '') {
        cleanConfig[key] = val;
      }
    }

    const cardYaml = Object.entries(cleanConfig)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? "'" + v + "'" : v}`)
      .join('\n');

    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t('headers.step5')}</div>
        <div class="step-description">${this.editor.i18n._t('descriptions.step5')}</div>

        <!-- CARD CONFIGURATION SECTION -->
        <div class="field-group" style="border-left: 4px solid #0ea5e9;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 1.1em; color: #fff;">Lovelace Card Setup</strong>
            ${configComplete 
              ? html`<span style="background: #22c55e; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">READY</span>`
              : html`<span style="background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">INCOMPLETE</span>`
            }
          </div>
          
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <pre style="margin: 0; color: #22c55e; font-size: 0.85em; font-family: monospace; white-space: pre-wrap; overflow-wrap: break-word;">${cardYaml}</pre>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
            <div style="color: #a0a8c0;">Prefix:</div>
            <div style="font-family: monospace; color: #fff;">${effectivePrefix}</div>
            
            <div style="color: #a0a8c0;">Target Entity:</div>
            <div style="font-family: monospace; color: #fff;">${this.editor._config.target_entity || 'Not set'}</div>
            
            <div style="color: #a0a8c0;">Preset:</div>
            <div style="font-family: monospace; color: #fff;">${this.editor._config.preset_type || 'Not set'}</div>
          </div>
          
          ${!configComplete ? html`
            <div style="margin-top: 8px; color: #fb923c; font-size: 0.85em;">
              <strong>Missing:</strong> ${missingFields.join(', ')}
            </div>
          ` : ''}
        </div>

        <div style="margin-top: 24px; padding: 16px; border-radius: 8px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); text-align: center;">
          <p style="color: #fff; margin: 0; font-weight: 600;">
            ${this.editor._language === 'it' 
              ? 'Tutto pronto! Clicca il pulsante "SALVA" in basso a destra (UI di Home Assistant) per confermare l\'aggiunta della card.' 
              : 'All set! Click the "SAVE" button at the bottom right (Home Assistant UI) to finalize adding the card.'}
          </p>
        </div>
      </div>
    `;
  }
}