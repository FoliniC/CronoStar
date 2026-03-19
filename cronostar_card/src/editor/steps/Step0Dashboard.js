import { html } from 'lit';
import { EditorI18n } from '../EditorI18n.js';

export class Step0Dashboard {
  constructor(editor) {
    this.editor = editor;
    this._chartJsLoaded = false;
    // Debug: verify console.log and Step 0 constructor invocation
    try {
      console.log('[DASHBOARD] Step0Dashboard constructor invoked', {
        lang: this.editor?._language,
        step: this.editor?._step,
        view: this.editor?._dashboardView
      });
      // Attempt early language sync from live card (priority over editor config)
      const cardEl = this.editor.shadowRoot?.querySelector('cronostar-card') || document.querySelector('cronostar-card');
      const cardLang = cardEl?.language;
      if (cardLang && this.editor._language !== cardLang) {
        this.editor._language = cardLang;
        this.editor.i18n = new EditorI18n(this.editor);
        console.log(`[DASHBOARD] Adopted language from card (constructor): ${cardLang}`);
      }
      // Attempt prime from backend profile metadata using current config
      setTimeout(() => { this._primeLanguageFromCurrentProfile(); }, 0);
    } catch (e) { /* ignore */ }
  }

  _syncLanguageFromCard() {
    try {
      const cardEl = this.editor.shadowRoot?.querySelector('cronostar-card') || document.querySelector('cronostar-card');
      const cardLang = cardEl?.language;
      if (cardLang && this.editor._language !== cardLang) {
        this.editor._language = cardLang;
        this.editor.i18n = new EditorI18n(this.editor);
        console.log(`[DASHBOARD] Adopted language from card: ${cardLang}`);
      }
    } catch (e) { /* ignore */ }
  }

  async _ensureChartJs() {
    if (this._chartJsLoaded || typeof Chart !== 'undefined') {
      this._chartJsLoaded = true;
      return true;
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => {
        this._chartJsLoaded = true;
        console.log('[DASHBOARD] Chart.js loaded successfully');
        resolve(true);
      };
      script.onerror = () => {
        console.error('[DASHBOARD] Failed to load Chart.js');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  async _loadAllProfiles() {
    if (!this.editor.hass) return;

    this.editor._dashboardView = 'status';
    this.editor._dashboardLoading = true;
    this.editor.requestUpdate();

    // Debug: entry log for Step 0 profiles loading
    try { console.log('[DASHBOARD] _loadAllProfiles called'); } catch (e) { /* ignore */ }

    try {
      const result = await this.editor.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'list_all_profiles',
        service_data: {
          force_reload: true
        },
        return_response: true
      });

      this.editor._dashboardProfilesData = result?.response || {};
      console.log('[DASHBOARD] Loaded profiles:', this.editor._dashboardProfilesData);

      // If any profile has a meta.language, adopt it for the editor dashboard immediately
      try {
        const firstPresetKey = Object.keys(this.editor._dashboardProfilesData || {})[0];
        const firstFile = this.editor._dashboardProfilesData?.[firstPresetKey]?.files?.[0];
        const metaLang = firstFile?.meta?.language || this.editor._dashboardProfilesData?.[firstPresetKey]?.meta?.language;
        console.log(`[DASHBOARD] 55555Adopted language from profiles list: ${metaLang}`);
        if (metaLang && this.editor._language !== metaLang) {
          this.editor._language = metaLang;
          this.editor.i18n = new EditorI18n(this.editor);
          console.log(`[DASHBOARD] Adopted language from profiles list: ${metaLang}`);
        }
      } catch { /* ignore */ }

    } catch (e) {
      console.warn('Failed to load profiles:', e);
      this.editor._dashboardProfilesData = {};
    }

    this.editor._dashboardLoading = false;
    this.editor.requestUpdate();
  }

  async _primeLanguageFromCurrentProfile() {
    try {
      if (!this.editor?.hass) return;
      const presetType = this.editor._config?.preset_type || 'thermostat';
      const globalPrefix = this.editor._config?.global_prefix;
      if (!globalPrefix) return;
      const result = await this.editor.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'load_profile',
        service_data: {
          profile_name: 'Default',
          preset_type: presetType,
          global_prefix: globalPrefix,
          force_reload: false
        },
        return_response: true
      });
      const loadedProfile = result?.response || {};
      const metaLang = loadedProfile?.meta?.language;
      if (metaLang && this.editor._language !== metaLang) {
        this.editor._language = metaLang;
        this.editor.i18n = new EditorI18n(this.editor);
        console.log(`[DASHBOARD] Adopted language from backend profile: ${metaLang}`);
        // No explicit requestUpdate; Lit will re-render based on reactive change
      }
    } catch (e) {
      // Silent; this is a best-effort prime
    }
  }

  async _handleDeleteProfile(presetType, profileName, globalPrefix) {
    const confirmed = confirm(`Delete profile '${profileName}'?`);
    if (!confirmed) return;

    try {
      await this.editor.hass.callService('cronostar', 'delete_profile', {
        profile_name: profileName,
        preset_type: presetType,
        global_prefix: globalPrefix
      });

      this.editor.showToast(`Profile '${profileName}' deleted successfully`, 'success');
      this._closeDetailModal();

      // Ricarica la lista profili
      await this._loadAllProfiles();
    } catch (e) {
      this.editor.showToast(`Error deleting profile: ${e.message}`, 'error');
    }
  }

  async _handleSaveProfile() {
    const detailData = this.editor._dashboardDetailData;
    if (!detailData || !this.editor.hass) return;

    const oldName = this.editor._dashboardSelectedProfile;
    const newName = (this.editor._dashboardEditName || "").trim();

    if (!newName) {
      this.editor.showToast("Profile name cannot be empty", "error");
      return;
    }

    const presetType = this.editor._dashboardSelectedPreset;

    // Recupera i dati aggiornati dalla card (se accessibile) o usa quelli correnti
    const cardEl = this.editor.shadowRoot?.querySelector('cronostar-card');
    let schedule = detailData.schedule;

    if (cardEl && cardEl.stateManager) {
      const isSwitchPreset = presetType === 'generic_switch' || cardEl?.config?.is_switch_preset;
      const dataToUse = isSwitchPreset && typeof cardEl.stateManager.getDataWithChangePoints === 'function'
        ? cardEl.stateManager.getDataWithChangePoints()
        : cardEl.stateManager.getData();
      schedule = dataToUse.map(p => ({
        time: p.time,
        value: p.value
      }));
    }

    // Merge meta with actual chart config values from the live card
    let meta = detailData.meta || {};
    if (cardEl && cardEl.config) {
      const cfg = cardEl.config;
      const chartMetaKeys = [
        'y_axis_label',
        'unit_of_measurement',
        'min_value',
        'max_value',
        'step_value',
        'allow_max_value',
        'drag_snap'
      ];
      const chartMeta = {};
      chartMetaKeys.forEach((k) => {
        if (cfg[k] !== undefined) chartMeta[k] = cfg[k];
      });
      meta = { ...meta, ...chartMeta };
    }
    const globalPrefix = meta.global_prefix || detailData.global_prefix;

    try {
      // 1. Salva il profilo (con il nuovo nome se cambiato)
      await this.editor.hass.callService('cronostar', 'save_profile', {
        profile_name: newName,
        preset_type: presetType,
        schedule: schedule,
        global_prefix: globalPrefix,
        meta: meta
      });

      // 2. Se il nome è cambiato, elimina il vecchio profilo
      if (newName !== oldName) {
        await this.editor.hass.callService('cronostar', 'delete_profile', {
          profile_name: oldName,
          preset_type: presetType,
          global_prefix: globalPrefix
        });
      }

      this.editor.showToast(`Profile '${newName}' saved successfully`, 'success');

      // Aggiorna lo stato locale per riflettere il nuovo nome/dati senza chiudere il modal
      this.editor._dashboardSelectedProfile = newName;
      this.editor._dashboardEditName = newName;
      this.editor._dashboardIsEditingName = false;

      // Ricarica tutto per aggiornare la dashboard sotto
      await this._loadAllProfiles();

      // Ricarica i dettagli per essere allineati al backend
      const updatedDetail = await this._loadProfileDetail(presetType, newName, globalPrefix);
      this.editor._dashboardDetailData = updatedDetail;
      this.editor.requestUpdate();

    } catch (e) {
      this.editor.showToast(`Error saving profile: ${e.message}`, 'error');
    }
  }

  async _loadProfileDetail(presetType, profileName, globalPrefix) {
    if (!this.editor.hass) return;

    try {
      const result = await this.editor.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'load_profile',
        service_data: {
          profile_name: profileName,
          preset_type: presetType,
          global_prefix: globalPrefix,
          force_reload: true
        },
        return_response: true
      });

      const loadedProfile = result?.response || {};
      const loadedLanguage = loadedProfile?.meta?.language || 'N/A';
      console.log(`[DASHBOARD] Loaded profile detail for '${profileName}'. Language: ${loadedLanguage}`);

      // Ensure editor language matches the loaded profile if specified
      if (loadedProfile?.meta?.language && this.editor._language !== loadedProfile.meta.language) {
        this.editor._language = loadedProfile.meta.language;
        this.editor.i18n = new EditorI18n(this.editor);
        console.log(`[DASHBOARD] Synchronized editor language to loaded profile: ${loadedProfile.meta.language}`);
      }
      return loadedProfile;
    } catch (e) {
      console.error('Failed to load profile detail:', e);
      return { error: e.message };
    }
  }

  async _showProfileDetail(presetType, profileName, globalPrefix) {
    this.editor._dashboardSelectedPreset = presetType;
    this.editor._dashboardSelectedProfile = profileName;
    this.editor._dashboardEditName = profileName;
    this.editor._dashboardIsEditingName = false;
    this.editor._dashboardShowDetailModal = true;

    const profileData = await this._loadProfileDetail(presetType, profileName, globalPrefix);
    this.editor._dashboardDetailData = profileData;

    // Aggiorna la lingua dell'editor se presente nel profilo caricato
    const loadedLanguage = profileData?.meta?.language;
    if (loadedLanguage && this.editor._language !== loadedLanguage) {
      this.editor._language = loadedLanguage;
      this.editor.i18n = new EditorI18n(this.editor); // Re-initialize i18n with the new language
      console.log(`[DASHBOARD] Editor language updated to: ${loadedLanguage}`);
    }

    this.editor.requestUpdate();
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

  _renderDetailModal() {
    if (!this.editor._dashboardShowDetailModal || !this.editor._dashboardDetailData) return html``;

    const detailData = this.editor._dashboardDetailData;
    const schedule = detailData.schedule || [];

    // Mergia i metadati: quelli del profilo hanno priorità su quelli del container
    const meta = detailData.meta || {};

    const profileName = this.editor._dashboardSelectedProfile;
    const presetType = this.editor._dashboardSelectedPreset;

    // Dati con fallback per la configurazione della card
    const globalPrefix = meta.global_prefix || detailData.global_prefix || 'cronostar_';
    const targetEntity = meta.target_entity || detailData.target_entity || '';
    const updatedAt = detailData.updated_at || meta.updated_at || 'N/A';

    // LOGICA VISIBILITÀ TASTO SALVA:
    // 1. Nome modificato
    const isNameChanged = (this.editor._dashboardEditName || "").trim() !== profileName;
    // 2. Schedule modificato (verificando la card figlia se presente)
    const cardEl = this.editor.shadowRoot?.querySelector('cronostar-card');
    const isScheduleChanged = cardEl?.hasUnsavedChanges === true;

    const showSaveButton = isNameChanged || isScheduleChanged;

    return html`
      <div class="modal-overlay" @click=${() => this._closeDetailModal()}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-height: 56px;">
              ${this.editor._dashboardIsEditingName
        ? html`
                    <ha-textfield
                      label="Profile Name"
                      .value=${this.editor._dashboardEditName}
                      @input=${(e) => { this.editor._dashboardEditName = e.target.value; this.editor.requestUpdate(); }}
                      @keydown=${(e) => { if (e.key === 'Enter') this._handleSaveProfile(); }}
                      style="flex: 1; max-width: 300px;"
                    ></ha-textfield>
                  `
        : html`
                    <h2 @click=${() => { this.editor._dashboardIsEditingName = true; this.editor.requestUpdate(); }} style="cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0;">
                      📊 ${profileName}
                      <ha-icon icon="mdi:pencil" style="--mdc-icon-size: 18px; color: var(--secondary-text-color); opacity: 0.6;"></ha-icon>
                    </h2>
                  `
      }
            </div>
            <div style="display: flex; gap: 8px;">
              ${showSaveButton ? html`
                <mwc-button
                  raised
                  @click=${() => this._handleSaveProfile()}
                >
                  💾 Save Changes
                </mwc-button>
              ` : ''}
              <mwc-button
                outlined
                @click=${() => this._handleDeleteProfile(presetType, profileName, globalPrefix)}
                style="--mdc-theme-primary: var(--error-color, #ef4444);"
              >
                🗑️ Delete Profile
              </mwc-button>
              <button class="close-btn" @click=${() => this._closeDetailModal()}>✕</button>
            </div>
          </div>

          <div class="modal-body" style="padding: 20px;">
            <div class="info-section">
              <h3>ℹ️ Metadata</h3>
              <div class="info-grid">
                <div><strong>Preset Type:</strong> ${presetType}</div>
                <div><strong>Global Prefix:</strong> ${globalPrefix}</div>
                <div><strong>Target Entity:</strong> ${targetEntity || 'N/A'}</div>
                <div><strong>Updated:</strong> ${updatedAt}</div>
              </div>
            </div>

            <div class="schedule-section">
              <h3>⏰ Schedule Points (${schedule.length})</h3>
              <div style="background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: #cbd3e8;">
                  <thead>
                    <tr style="background: rgba(255,255,255,0.05); text-align: left;">
                      <th style="padding: 10px 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">Time</th>
                      <th style="padding: 10px 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${schedule.map((point, index) => html`
                                            <tr style="${index % 2 === 0 ? '' : 'background: rgba(255, 255, 255, 0.02);'}">
                                              <td style="padding: 8px 15px; font-family: monospace;">${point.time}</td>
                                              <td style="padding: 8px 15px; font-family: monospace; color: #0ea5e9; font-weight: bold;">
                                                ${presetType === 'generic_switch' ? (point.value >= 0.5 ? 'ON' : 'OFF') : point.value}
                                              </td>
                                            </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderProfilesList() {
    if (!this.editor._dashboardProfilesData || this.editor._dashboardView !== 'status') return html``;

    // Aggregazione intelligente per evitare mis-categorizzazioni
    const categorizedData = {};

    Object.keys(this.editor._dashboardProfilesData).forEach(presetType => {
      const presetData = this.editor._dashboardProfilesData[presetType];
      const files = presetData.files || [];

      files.forEach(fileInfo => {
        // Determina il preset REALE del file
        let realPreset = presetType;
        const filename = fileInfo.filename.toLowerCase();

        // Se un file contiene 'switch' nel nome ma è finito in thermostat, correggilo
        if (filename.includes('_switch_')) realPreset = 'generic_switch';
        else if (filename.includes('_temp_')) realPreset = 'thermostat';
        else if (filename.includes('_ev_')) realPreset = 'ev_charging';
        else if (filename.includes('_kwh_')) realPreset = 'generic_kwh';
        else if (filename.includes('_gentemp_')) realPreset = 'generic_temperature';

        if (!categorizedData[realPreset]) categorizedData[realPreset] = { files: [] };

        // Evita duplicati se il file è già stato aggiunto (per sicurezza)
        if (!categorizedData[realPreset].files.find(f => f.filename === fileInfo.filename)) {
          categorizedData[realPreset].files.push(fileInfo);
        }
      });
    });

    const presets = Object.keys(categorizedData).sort();

    if (presets.length === 0) {
      return html`
        <div class="info-box">
          <p>ℹ️ No profiles found. Click "New Configuration" to create one.</p>
        </div>
      `;
    }

    return html`
      <div class="profiles-list">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
          <mwc-button outlined @click=${() => { this.editor._dashboardView = 'choice'; this.editor.requestUpdate(); }}>
            ↩ Back to Choices
          </mwc-button>
        </div>
        ${presets.map(presetKey => {
      const presetData = categorizedData[presetKey];
      const files = presetData.files || [];

      return html`
            <div class="preset-section">
              <div class="preset-header">
                <h3>${this.editor.i18n._t(`presetNames.${presetKey}`) || presetKey}</h3>
              </div>
              
              ${files.map((fileInfo, fIdx) => html`
                <div class="file-entry">
                  <div class="file-header">
                    <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden; width: 100%;">
                      <span style="font-family: monospace; color: #0ea5e9; font-size: 1rem; font-weight: bold; display: flex; align-items: center; gap: 10px; word-break: break-all;">
                        <ha-icon icon="mdi:file-code-outline" style="--mdc-icon-size: 22px; flex-shrink: 0;"></ha-icon>
                        ${fileInfo.filename}
                      </span>
                      <span style="font-size: 0.8rem; color: #a0a8c0; margin-left: 32px; font-family: monospace; opacity: 0.8;">
                        <strong>Path:</strong> /config/cronostar/profiles/${fileInfo.filename}
                      </span>
                      <span style="font-size: 0.85rem; color: #cbd3e8; margin-left: 32px;"><strong>Prefix:</strong> ${fileInfo.global_prefix}</span>
                    </div>
                  </div>

                  <div class="profiles-grid">
                    ${fileInfo.profiles.map(profile => html`
                      <div class="profile-card">
                        <div class="profile-name">📄 ${profile.name}</div>
                        <div class="profile-info">
                          <span>📍 Points: ${profile.points || 0}</span>
                          <span>🕐 Updated: ${profile.updated_at || 'N/A'}</span>
                        </div>
                        <mwc-button 
                          raised
                          fullwidth
                          @click=${() => this._showProfileDetail(presetKey, profile.name, fileInfo.global_prefix)}
                          style="margin-top: 8px;"
                        >
                          📊 View Details
                        </mwc-button>
                      </div>
                    `)}
                  </div>
                </div>
              `)}
            </div>
          `;
    })}
      </div>
    `;
  }

  render() {
    // Debug: verify console.log and Step 0 render invocation
    try {
      console.log('[DASHBOARD] Step0Dashboard.render invoked', {
        lang: this.editor?._language,
        step: this.editor?._step,
        view: this.editor?._dashboardView
      });
    } catch (e) { /* ignore */ }
    const showChoice = this.editor._dashboardView === 'choice';

    return html`
      <style>
        .dashboard-container {
          padding: 10px;
        }

        .choice-buttons {
          display: flex; gap: 20px; margin-bottom: 40px; justify-content: center;
          flex-wrap: wrap;
        }

        .choice-button {
          flex: 1; min-width: 240px; max-width: 320px; padding: 40px 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px;
          cursor: pointer; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
          text-align: center;
          display: flex; flex-direction: column; align-items: center;
        }

        .choice-button:hover {
          transform: translateY(-8px); border-color: #0ea5e9;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
          background: rgba(14, 165, 233, 0.05);
        }

        .choice-button-icon { font-size: 3rem; margin-bottom: 16px; }
        .choice-button-title { font-size: 1.25rem; font-weight: 800; color: #ffffff; margin-bottom: 10px; }
        .choice-button-desc { font-size: 0.95rem; color: #94a3b8; line-height: 1.5; }

        .preset-section {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 16px; padding: 24px; margin-bottom: 40px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .preset-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 24px; padding-bottom: 16px;
          border-bottom: 1px solid rgba(14, 165, 233, 0.2);
        }

        .preset-header h3 { margin: 0; color: #ffffff; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; }

        .file-entry {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 32px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .file-header {
          display: flex; justify-content: space-between; align-items: center; 
          margin-bottom: 24px; background: rgba(14, 165, 233, 0.08); 
          padding: 16px 20px; border-radius: 12px;
          border-left: 4px solid #0ea5e9;
        }

        .profiles-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
          gap: 20px;
        }

        .profile-card {
          background: rgba(255, 255, 255, 0.02); 
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px; padding: 20px; 
          transition: all 0.3s ease;
        }

        .profile-card:hover { 
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(14, 165, 233, 0.3);
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .profile-name { font-weight: 700; font-size: 1.15rem; color: #ffffff; margin-bottom: 10px; }
        .profile-info { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; font-size: 0.9rem; color: #94a3b8; }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
          display: flex; align-items: center;
          justify-content: center; z-index: 9999; padding: 24px;
        }

        .modal-content {
          background: #1a1f2e;
          border-radius: 20px; max-width: 960px; width: 100%; max-height: 85vh;
          overflow-y: auto; box-shadow: 0 32px 64px rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .modal-header .close-btn {
          background: rgba(255, 255, 255, 0.05); border: none; font-size: 1.2rem; cursor: pointer;
          color: #ffffff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s ease;
        }

        .modal-header .close-btn:hover { background: #ef4444; }

        .modal-body { padding: 32px; }
        .info-section h3, .schedule-section h3 { color: #ffffff; margin-bottom: 16px; font-size: 1.3rem; font-weight: 800; }

        .info-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px; color: #ffffff; font-size: 1rem; background: rgba(0, 0, 0, 0.2);
          padding: 20px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .info-grid strong { color: #94a3b8; font-weight: 500; margin-right: 8px; }

        .info-box {
          background: rgba(14, 165, 233, 0.1);
          padding: 24px; border-radius: 16px; border: 1px solid rgba(14, 165, 233, 0.3);
          margin: 24px 0; color: #7dd3fc; text-align: center;
        }
      </style>

      <div class="dashboard-container">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="/cronostar_card/cronostar-logo.png" style="width: 24px; height: auto; margin-bottom: 16px;">
          <div class="step-header" style="margin-bottom: 0;">${this.editor.i18n._t('headers.step0') || 'Dashboard'}</div>
        </div>
        <div class="step-description" style="text-align: center;">
          ${this.editor.i18n._t('descriptions.step0') || 'Choose an action: configure a new preset or analyze existing profiles.'}
        </div>

        ${showChoice ? html`
          <div class="choice-buttons">
            ${this.editor._isEditing ? html`
              <div class="choice-button" @click=${() => { this.editor._step = 1; this.editor.requestUpdate(); }}>
                <div class="choice-button-icon">⚙️</div>
                <div class="choice-button-title">${this.editor.i18n._t('actions.edit_config')}</div>
                <div class="choice-button-desc">${this.editor.i18n._t('actions.edit_config_desc')}</div>
              </div>
            ` : html`
              <div class="choice-button" @click=${() => this.editor._handleResetConfig()}>
                <div class="choice-button-icon">🆕</div>
                <div class="choice-button-title">${this.editor.i18n._t('actions.new_config')}</div>
                <div class="choice-button-desc">${this.editor.i18n._t('actions.new_config_desc')}</div>
              </div>
            `}

            <div class="choice-button" @click=${() => this._loadAllProfiles()}>
              <div class="choice-button-icon">📊</div>
              <div class="choice-button-title">${this.editor.i18n._t('actions.analyze_status')}</div>
              <div class="choice-button-desc">${this.editor.i18n._t('actions.analyze_status_desc')}</div>
            </div>
          </div>
        ` : ''}

        ${this.editor._dashboardLoading ? html`
          <div class="info-box">
            <ha-circular-progress active></ha-circular-progress>
            <p>⏳ Loading profiles...</p>
          </div>
        ` : this._renderProfilesList()}
      </div>

      ${this._renderDetailModal()}
    `;
  }
}