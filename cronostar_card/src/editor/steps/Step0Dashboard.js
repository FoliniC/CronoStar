import { html } from 'lit';
import { EditorI18n } from '../EditorI18n.js';

export class Step0Dashboard {
  constructor(editor) {
    this.editor = editor;
    this._chartJsLoaded = false;
    
    // Inizializzazione: Caricamento automatico dei controller
    try {
      if (!this.editor._dashboardProfilesData) {
        setTimeout(() => { this._loadAllProfiles(); }, 0);
      }
      // Prime della lingua dai metadati backend
      setTimeout(() => { this._primeLanguageFromCurrentProfile(); }, 0);
    } catch (e) { /* ignore */ }
  }

  async _loadAllProfiles() {
    if (!this.editor.hass) return;

    this.editor._dashboardLoading = true;
    this.editor.requestUpdate();

    try {
      const result = await this.editor.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'list_all_profiles',
        service_data: { force_reload: true },
        return_response: true
      });

      this.editor._dashboardProfilesData = result?.response || {};
      console.log('[DASHBOARD] Loaded controllers:', this.editor._dashboardProfilesData);

    } catch (e) {
      console.warn('Failed to load controllers:', e);
      this.editor._dashboardProfilesData = {};
    }

    this.editor._dashboardLoading = false;
    this.editor.requestUpdate();
  }

  _getControllerTitle(fileInfo) {
    const meta = fileInfo.meta || {};
    if (meta.title) return meta.title;
    
    const preset = meta.preset_type || meta.preset || 'thermostat';
    const prefix = fileInfo.global_prefix || '';
    const presetName = this.editor.i18n._t(`presetNames.${preset}`) || preset;
    return `CronoStar ${presetName} ${prefix.replace(/_/g, ' ').trim()}`;
  }

  _handleEditControllerConfig(fileInfo) {
    const meta = fileInfo.meta || {};
    const newConfig = {
      type: 'custom:cronostar-card',
      ...meta,
      preset_type: meta.preset_type || meta.preset || 'thermostat',
      global_prefix: fileInfo.global_prefix || meta.global_prefix
    };
    
    this.editor._config = newConfig;
    this.editor._isEditing = true;
    this.editor._step = 1;
    this.editor.requestUpdate();
    this.editor._dispatchConfigChanged(true);
  }

  async _primeLanguageFromCurrentProfile() {
    try {
      if (!this.editor?.hass) return;
      const prefix = this.editor._config?.global_prefix;
      if (!prefix) return;
      const result = await this.editor.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'load_profile',
        service_data: {
          profile_name: 'Default',
          preset_type: this.editor._config?.preset_type || 'thermostat',
          global_prefix: prefix,
          force_reload: false
        },
        return_response: true
      });
      const metaLang = result?.response?.meta?.language;
      if (metaLang && this.editor._language !== metaLang) {
        this.editor._language = metaLang;
        this.editor.i18n = new EditorI18n(this.editor);
      }
    } catch (e) {}
  }

  _closeDetailModal() {
    this.editor._dashboardShowDetailModal = false;
    this.editor._dashboardSelectedPreset = null;
    this.editor._dashboardSelectedProfile = null;
    this.editor._dashboardDetailData = null;
    this.editor._dashboardIsEditingName = false;
    this.editor._dashboardEditName = "";
    this.editor.requestUpdate();
  }

  _renderProfilesList() {
    if (!this.editor._dashboardProfilesData) return html``;

    const allFiles = [];
    Object.values(this.editor._dashboardProfilesData).forEach(pData => {
      if (pData.files) allFiles.push(...pData.files);
    });

    if (allFiles.length === 0) {
      return html`
        <div class="info-box">
          <p>ℹ️ No controllers found. Click "New Configuration" below to start.</p>
        </div>
      `;
    }

    return html`
      <div class="controllers-grid">
        ${allFiles.map(fileInfo => html`
          <div class="controller-box">
            <div class="controller-header">
              <div class="controller-title">${this._getControllerTitle(fileInfo)}</div>
              <mwc-button 
                outlined 
                @click=${() => this._handleEditControllerConfig(fileInfo)}
                style="--mdc-theme-primary: #0ea5e9;"
              >
                ⚙️ Configura
              </mwc-button>
            </div>
            <div class="controller-info">
              <span><strong>Prefix:</strong> ${fileInfo.global_prefix}</span>
              <span><strong>Profiles:</strong> ${fileInfo.profiles?.length || 0}</span>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  render() {
    return html`
      <style>
        .dashboard-container { padding: 10px; }
        .step-header { font-size: 1.5rem; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
        .step-description { font-size: 1rem; color: #94a3b8; margin-bottom: 32px; }
        
        .controllers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .controller-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px; padding: 24px; transition: all 0.3s ease;
        }
        .controller-box:hover { border-color: #0ea5e9; background: rgba(14, 165, 233, 0.05); }
        .controller-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .controller-title { font-weight: 700; color: #ffffff; font-size: 1.1rem; }
        .controller-info { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #94a3b8; }
        
        .info-box { background: rgba(14, 165, 233, 0.1); padding: 24px; border-radius: 16px; text-align: center; color: #7dd3fc; }
        
        .new-config-btn {
          margin-top: 32px; padding: 20px; border: 2px dashed rgba(255,255,255,0.1);
          border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;
        }
        .new-config-btn:hover { border-color: #0ea5e9; background: rgba(14, 165, 233, 0.05); }
      </style>

      <div class="dashboard-container">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="/cronostar_card/cronostar-logo.png" style="width: 32px; height: auto; margin-bottom: 12px;">
          <div class="step-header">${this.editor.i18n._t('headers.step0')} (Step 0)</div>
          <div class="step-description">Manage your existing controllers or create a new one.</div>
        </div>

        ${this.editor._dashboardLoading 
          ? html`<div class="info-box"><ha-circular-progress active></ha-circular-progress><p>Loading controllers...</p></div>` 
          : this._renderProfilesList()}

        <div class="new-config-btn" @click=${() => this.editor._handleResetConfig()}>
          <div style="font-size: 1.5rem; margin-bottom: 8px;">🆕</div>
          <div style="font-weight: 700; color: #ffffff;">Nuova Configurazione</div>
          <div style="font-size: 0.85rem; color: #94a3b8;">Crea un nuovo controller da zero</div>
        </div>
      </div>
    `;
  }
}
