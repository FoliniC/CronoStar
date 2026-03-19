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
    const isIt = this.editor._language === 'it';

    // Build associated entity names
    const currentEntity = `sensor.${effectivePrefix}current`;
    const selectEntity = `select.${effectivePrefix}current_profile`;
    const enabledEntity = `switch.${effectivePrefix}enabled`;

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
    const keys = [
      'preset_type', 'global_prefix', 'target_entity', 'enabled_entity',
      'profiles_select_entity', 'min_value', 'max_value', 'step_value',
      'unit_of_measurement', 'y_axis_label', 'allow_max_value',
      'logging_enabled', 'title', 'interval_minutes'
    ];

    for (const key of keys) {
      let val = this.editor._config[key];
      
      // FIX: Ensure profiles_select_entity uses the correct prefix if not manually overridden
      if (key === 'profiles_select_entity' && !val) {
        val = selectEntity;
      }
      if (key === 'enabled_entity' && !val) {
        val = enabledEntity;
      }

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
        <div class="field-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <strong style="font-size: 1.2rem; color: #ffffff;">Lovelace Card Setup</strong>
            ${configComplete 
              ? html`<span style="background: #22c55e; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;">READY</span>`
              : html`<span style="background: #ef4444; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;">INCOMPLETE</span>`
            }
          </div>
          
          <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px;">
            <pre style="margin: 0; color: #38bdf8; font-size: 0.9rem; font-family: 'Fira Code', monospace; white-space: pre-wrap; overflow-wrap: break-word;">${cardYaml}</pre>
          </div>
          
          <div class="field-value-info" style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px 16px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
            <div style="color: #94a3b8;">Prefix:</div>
            <div style="font-family: monospace; color: #ffffff;">${effectivePrefix}</div>
            
            <div style="color: #94a3b8;">Target:</div>
            <div style="font-family: monospace; color: #ffffff;">${this.editor._config.target_entity || 'Not set'}</div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.1); grid-column: span 2; margin: 8px 0;"></div>

            <div style="color: #38bdf8;">Sensor (Current):</div>
            <div style="font-family: monospace; color: #ffffff;">${currentEntity}</div>

            <div style="color: #38bdf8;">Select (Profile):</div>
            <div style="font-family: monospace; color: #ffffff;">${selectEntity}</div>

            <div style="color: #38bdf8;">Switch (Enabled):</div>
            <div style="font-family: monospace; color: #ffffff;">${enabledEntity}</div>
          </div>
          
          ${!configComplete ? html`
            <div class="warning-box" style="margin-top: 16px;">
              <strong>Missing:</strong> ${missingFields.join(', ')}
            </div>
          ` : ''}
        </div>

        <div class="success-box" style="text-align: center;">
          <p style="font-weight: 700; font-size: 1.1rem; margin: 0;">
            ${isIt 
              ? 'Tutto pronto! Clicca il pulsante "SALVA" in basso a destra per confermare.' 
              : 'All set! Click the "SAVE" button at the bottom right to finalize.'}
          </p>
        </div>
      </div>
    `;
  }
}