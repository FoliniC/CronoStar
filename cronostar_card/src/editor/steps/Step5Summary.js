import { html } from 'lit';
import { getAliasWithPrefix, getEffectivePrefix } from '../../utils/prefix_utils.js';
import { getExpectedAutomationId } from '../../utils/filename_utils.js';
import { handleSaveAll } from '../services/service_handlers.js';

export class Step5Summary {
  constructor(editor) {
    this.editor = editor;
  }

  async handleDeepChecks() {
    try {
      await this.editor._runDeepChecks();
      this.editor.showToast(this.editor.i18n._t('ui.checks_triggered') || 'Deep check triggered');
    } catch (e) {
      this.editor.showToast(e.message);
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
    const inum = this.editor._deepReport?.input_number;
    const autoInfo = this.editor._deepReport?.automation;
    const effectivePrefix = getEffectivePrefix(this.editor._config);
    const expectedAlias = getAliasWithPrefix(effectivePrefix, this.editor._lang);
    const expectedId = getExpectedAutomationId(effectivePrefix);

    // Verifica configurazione lovelace
    const requiredFields = [
      'preset', 'target_entity', 'global_prefix',
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
      target_entity: this.editor._config.target_entity,
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

        <!-- 1. CARD CONFIGURATION SECTION -->
        <div class="field-group" style="border-left: 4px solid #0ea5e9;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 1.1em; color: #fff;">1. Lovelace Card Setup</strong>
            ${configComplete 
              ? html`<span style="background: #22c55e; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">READY</span>`
              : html`<span style="background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">INCOMPLETE</span>`
            }
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
            <div style="color: #a0a8c0;">Prefix:</div>
            <div style="font-family: monospace; color: #fff;">${proposedConfig.global_prefix}</div>
            
            <div style="color: #a0a8c0;">Target Entity:</div>
            <div style="font-family: monospace; color: #fff;">${this.editor._config.target_entity || 'Not set'}</div>
            
            <div style="color: #a0a8c0;">Preset:</div>
            <div style="font-family: monospace; color: #fff;">${proposedConfig.preset}</div>
          </div>
          
          ${!configComplete ? html`
            <div style="margin-top: 8px; color: #fb923c; font-size: 0.85em;">
              <strong>Missing:</strong> ${missingFields.join(', ')}
            </div>
          ` : ''}
        </div>

        <!-- 2. INFRASTRUCTURE SECTION -->
        <div class="field-group" style="border-left: 4px solid ${inum && inum.found >= inum.expected ? '#22c55e' : '#fb923c'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 1.1em; color: #fff;">2. Backend Infrastructure</strong>
            <mwc-button dense .disabled=${this.editor._deepCheckInProgress} @click=${() => this.handleDeepChecks()} style="--mdc-theme-primary: #a0a8c0;">
              ${this.editor._deepCheckInProgress ? html`<ha-circular-progress active size="small"></ha-circular-progress>` : html`<ha-icon icon="mdi:refresh" style="--mdc-icon-size: 18px;"></ha-icon>`}
            </mwc-button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; align-items: flex-start; gap: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
              <ha-icon icon="mdi:package-variant-closed" style="color: #0ea5e9;"></ha-icon>
              <div style="flex: 1; overflow: hidden;">
                <div style="font-size: 0.9em; color: #fff;">YAML Package File</div>
                <div style="font-size: 0.8em; color: #a0a8c0; font-family: monospace; word-break: break-all; overflow-wrap: anywhere;">config/packages/${effectivePrefix}package.yaml</div>
              </div>
              <div style="color: ${inum && inum.found >= inum.expected ? '#22c55e' : '#8891a8'};">
                <ha-icon icon=${inum && inum.found >= inum.expected ? 'mdi:check-circle' : 'mdi:circle-outline'}></ha-icon>
              </div>
            </div>

            <div style="display: flex; align-items: flex-start; gap: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
              <ha-icon icon="mdi:database" style="color: #0ea5e9;"></ha-icon>
              <div style="flex: 1; overflow: hidden;">
                <div style="font-size: 0.9em; color: #fff;">Profile Data Storage</div>
                <div style="font-size: 0.8em; color: #a0a8c0; font-family: monospace; word-break: break-all; overflow-wrap: anywhere;">config/cronostar/profiles/${effectivePrefix.replace(/_+$/, '')}_data.json</div>
              </div>
              <div style="color: #22c55e;">
                <ha-icon icon="mdi:check-circle"></ha-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. AUTOMATION SECTION -->
        <div class="field-group" style="border-left: 4px solid ${autoInfo && autoInfo.found ? '#22c55e' : '#fb923c'};">
          <strong style="display: block; font-size: 1.1em; color: #fff; margin-bottom: 12px;">3. Automation Logic</strong>
          
          <div style="display: flex; align-items: flex-start; gap: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
            <ha-icon icon="mdi:robot" style="color: #0ea5e9;"></ha-icon>
            <div style="flex: 1; overflow: hidden;">
              <div style="font-size: 0.9em; color: #fff;">Hourly Scheduler</div>
              <div style="font-size: 0.85em; color: #a0a8c0;">Alias: <strong>${expectedAlias}</strong></div>
              <div style="font-size: 0.8em; color: #a0a8c0; font-family: monospace; margin-top: 4px; word-break: break-all;">ID: ${expectedId}</div>
            </div>
            <div style="color: ${autoInfo && autoInfo.found ? '#22c55e' : '#8891a8'};">
              <ha-icon icon=${autoInfo && autoInfo.found ? 'mdi:check-circle' : 'mdi:alert-circle-outline'}></ha-icon>
            </div>
          </div>
        </div>

        <!-- 4. MANUAL CONFIGURATION FIX (IF NEEDED) -->
        ${(!inum || inum.found < inum.expected || !autoInfo || !autoInfo.found) ? html`
          <div class="field-group" style="border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05);">
            <strong style="display: block; font-size: 1.1em; color: #fff; margin-bottom: 12px;">⚠️ ${this.editor.i18n._t('ui.manual_config_title')}</strong>
            <p style="font-size: 0.9em; color: #cbd3e8;">${this.editor.i18n._t('ui.manual_config_desc')}</p>
            
            <div style="position: relative; margin-top: 12px;">
              <pre style="background: #000; color: #22c55e; padding: 12px; border-radius: 8px; font-size: 0.85em; overflow-x: auto; border: 1px solid #333;"><code>homeassistant:
  packages: !include_dir_named packages

automation: !include_dir_merge_list automations</code></pre>
              <mwc-button dense style="position: absolute; top: 4px; right: 4px; --mdc-theme-primary: #0ea5e9;" 
                @click=${() => this.editor.serviceHandlers.copyToClipboard('homeassistant:\n  packages: !include_dir_named packages\n\nautomation: !include_dir_merge_list automations')}>
                ${this.editor.i18n._t('ui.copy')}
              </mwc-button>
            </div>
          </div>
        ` : ''}

        <!-- SUMMARY ACTION -->
        <div class="info-box" style="border: 1px solid rgba(14, 165, 233, 0.3); background: rgba(14, 165, 233, 0.05); display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center;">
          <div>
            <strong style="color: #fff;">${this.editor.i18n._t('finalmodtitle')}</strong>
            <p style="font-size: 0.9em; margin: 8px 0;">${this.editor.i18n._t('finalmodtext')}</p>
          </div>
          <mwc-button raised @click=${() => this.handleSaveAll()}>
            💾 ${this.editor._language === 'it' ? 'Salva e Applica File' : 'Save & Apply Files'}
          </mwc-button>
        </div>
      </div>
    `;
  }
}
