import { html } from 'lit';
import { extractCardConfig } from '../../config.js';

export class Step0Dashboard {
  constructor(editor) {
    this.editor = editor;
    this._chartJsLoaded = false;
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

    this.editor._dashboardLoading = true;
    this.editor.requestUpdate();

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

    } catch (e) {
      console.warn('Failed to load profiles:', e);
      this.editor._dashboardProfilesData = {};
    }

    this.editor._dashboardLoading = false;
    this.editor.requestUpdate();
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
      schedule = cardEl.stateManager.getData().map(p => ({
        time: p.time,
        value: p.value
      }));
    }

    const meta = detailData.meta || {};
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

      return result?.response || {};
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

    // Costruisce la configurazione per la card includendo tutti i metadati (min_value, max_value, ecc.)
    const cardConfig = extractCardConfig({
      type: 'custom:cronostar-card',
      preset: presetType,
      global_prefix: globalPrefix,
      target_entity: targetEntity,
      title: meta.title || profileName,
      ...meta
    });

    // Ottiene le opzioni per il selettore profili
    const presetData = this.editor._dashboardProfilesData[presetType] || {};
    const profileOptions = (presetData.profiles || []).map(p => p.name);

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

          <div class="modal-body" style="padding: 0;">
            <div style="padding: 20px;">
                <cronostar-card
                    .hass=${this.editor.hass}
                    .config=${cardConfig}
                    .isPreview=${true}
                    .previewData=${detailData}
                    .selectedProfile=${profileName}
                    .profileOptions=${profileOptions}
                    @cronostar-state-changed=${() => this.editor.requestUpdate()}
                ></cronostar-card>
            </div>

            <div class="info-section" style="padding: 0 20px 20px 20px;">
              <h3>ℹ️ Metadata</h3>
              <div class="info-grid">
                <div><strong>Preset Type:</strong> ${presetType}</div>
                <div><strong>Global Prefix:</strong> ${globalPrefix}</div>
                <div><strong>Target Entity:</strong> ${targetEntity || 'N/A'}</div>
                <div><strong>Schedule Points:</strong> ${schedule.length}</div>
                <div><strong>Updated:</strong> ${updatedAt}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderProfilesList() {
    if (!this.editor._dashboardProfilesData) return html``;

    const presets = Object.keys(this.editor._dashboardProfilesData);

    if (presets.length === 0) {
      return html`
        <div class="info-box">
          <p>ℹ️ No profiles found. Click "New Configuration" to create one.</p>
        </div>
      `;
    }

    return html`
      <div class="profiles-list">
        ${presets.map(presetType => {
          const presetData = this.editor._dashboardProfilesData[presetType];
          const profiles = presetData.profiles || [];
          const globalPrefix = presetData.global_prefix || 'N/A';

          return html`
            <div class="preset-section">
              <div class="preset-header">
                <h3>${this.editor.i18n._t(`presetNames.${presetType}`) || presetType}</h3>
                <div class="preset-actions">
                  <mwc-button
                    outlined
                    @click=${() => {
                      this.editor._config = {
                        ...this.editor._config,
                        preset: presetType,
                        global_prefix: globalPrefix
                      };
                      this.editor._selectedPreset = presetType;
                      this.editor._isEditing = true;
                      this.editor._step = 1;
                      this.editor.requestUpdate();
                    }}
                  >
                    ⚙️ Edit Configuration
                  </mwc-button>
                </div>
              </div>
              
              <div class="preset-info">
                <span><strong>Prefix:</strong> ${globalPrefix}</span>
                <span><strong>Profiles:</strong> ${profiles.length}</span>
              </div>

              <div class="profiles-grid">
                ${profiles.map(profile => html`
                  <div class="profile-card">
                    <div class="profile-name">${profile.name}</div>
                    <div class="profile-info">
                      <span>📍 Points: ${profile.points || 0}</span>
                      <span>🕐 Updated: ${profile.updated_at || 'N/A'}</span>
                    </div>
                    <mwc-button 
                      raised
                      @click=${() => this._showProfileDetail(presetType, profile.name, globalPrefix)}
                    >
                      📊 View Details
                    </mwc-button>
                  </div>
                `)}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    return html`
      <style>
        .dashboard-container {
          padding: 20px;
        }

        .choice-buttons {
          display: flex; gap: 20px; margin-bottom: 30px; justify-content: center;
        }

        .choice-button {
          flex: 1; max-width: 300px; padding: 40px 20px;
          background: linear-gradient(145deg, rgba(48, 55, 75, 0.9), rgba(38, 44, 62, 0.9));
          border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
          cursor: pointer; transition: all 0.3s ease; text-align: center;
        }

        .choice-button:hover {
          transform: translateY(-5px); border-color: rgba(14, 165, 233, 0.5);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        .choice-button-icon { font-size: 3rem; margin-bottom: 10px; }
        .choice-button-title { font-size: 1.3rem; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
        .choice-button-desc { font-size: 0.9rem; color: #cbd3e8; }

        .preset-section {
          background: linear-gradient(145deg, rgba(48, 55, 75, 0.7), rgba(38, 44, 62, 0.7));
          border-radius: 12px; padding: 20px; margin-bottom: 20px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .preset-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 15px; padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preset-header h3 { margin: 0; color: #ffffff; font-size: 1.4rem; }
        .preset-info { display: flex; gap: 20px; margin-bottom: 15px; color: #cbd3e8; font-size: 0.9rem; }
        .profiles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; }

        .profile-card {
          background: rgba(28, 33, 48, 0.8); border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px; padding: 15px; transition: all 0.3s ease;
        }

        .profile-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4); border-color: rgba(14, 165, 233, 0.3); }
        .profile-name { font-weight: 600; font-size: 1.1rem; color: #ffffff; margin-bottom: 8px; }
        .profile-info { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; font-size: 0.85rem; color: #a0a8c0; }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.8); display: flex; align-items: center;
          justify-content: center; z-index: 9999; padding: 20px; animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-content {
          background: linear-gradient(135deg, rgba(42, 48, 66, 0.98), rgba(32, 38, 56, 0.98));
          border-radius: 12px; max-width: 900px; width: 100%; max-height: 90vh;
          overflow-y: auto; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1); animation: slideUp 0.3s ease;
        }

        @keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(145deg, rgba(48, 55, 75, 0.5), rgba(38, 44, 62, 0.5));
        }

        .modal-header .close-btn {
          background: none; border: none; font-size: 1.5rem; cursor: pointer;
          color: #cbd3e8; padding: 5px 10px; border-radius: 4px; transition: all 0.2s ease;
        }

        .modal-header .close-btn:hover { background: rgba(255, 255, 255, 0.1); color: #ffffff; }

        .modal-body { padding: 20px; }
        .info-section, .chart-section, .schedule-section { margin-bottom: 25px; }
        .info-section h3, .chart-section h3, .schedule-section h3 { color: #ffffff; margin-bottom: 12px; font-size: 1.2rem; }

        .info-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px; color: #cbd3e8; font-size: 0.95rem; background: rgba(28, 33, 48, 0.5);
          padding: 15px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .info-box {
          background: linear-gradient(145deg, rgba(14, 165, 233, 0.15), rgba(2, 132, 199, 0.12));
          padding: 18px; border-radius: 12px; border-left: 4px solid #0ea5e9;
          box-shadow: 0 6px 20px rgba(14, 165, 233, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          margin: 20px 0; color: #bae6fd; text-align: center;
        }
      </style>

      <div class="dashboard-container">
        <div class="step-header">${this.editor.i18n._t('headers.step0') || 'Dashboard'}</div>
        <div class="step-description">
          ${this.editor.i18n._t('descriptions.step0') || 'Choose an action: configure a new preset or analyze existing profiles.'}
        </div>

        <div class="choice-buttons">
          <div class="choice-button" @click=${() => { this.editor._isEditing = false; this.editor._step = 1; this.editor.requestUpdate(); }}>
            <div class="choice-button-icon">⚙️</div>
            <div class="choice-button-title">Edit Configuration</div>
            <div class="choice-button-desc">Modify the current card configuration</div>
          </div>

          <div class="choice-button" @click=${() => this._loadAllProfiles()}>
            <div class="choice-button-icon">📊</div>
            <div class="choice-button-title">Analyze Status</div>
            <div class="choice-button-desc">View existing profiles and configurations</div>
          </div>
        </div>

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