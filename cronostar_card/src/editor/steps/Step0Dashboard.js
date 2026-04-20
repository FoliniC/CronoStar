import { html } from "lit";
import { EditorI18n } from "../EditorI18n.js";

export class Step0Dashboard {
  constructor(editor) {
    this.editor = editor;
    this._chartJsLoaded = false;

    // Inizializzazione: Caricamento automatico dei controller
    if (!this.editor._dashboardProfilesData) {
      setTimeout(() => {
        try {
          this._loadAllProfiles();
        } catch (e) {
          /* ignore */
        }
      }, 0);
    }
    // Prime della lingua dai metadati backend
    setTimeout(() => {
      try {
        this._primeLanguageFromCurrentProfile();
      } catch (e) {
        /* ignore */
      }
    }, 0);
  }

  async _loadAllProfiles() {
    if (!this.editor.hass) return;

    this.editor._dashboardLoading = true;
    this.editor.requestUpdate();

    try {
      const result = await this.editor.hass.callWS({
        type: "call_service",
        domain: "cronostar",
        service: "list_all_profiles",
        service_data: { force_reload: true },
        return_response: true,
      });

      this.editor._dashboardProfilesData = result?.response || {};
      console.log(
        "[DASHBOARD] Loaded controllers:",
        this.editor._dashboardProfilesData,
      );
    } catch (e) {
      console.warn("Failed to load controllers:", e);
      this.editor._dashboardProfilesData = {};
    }

    this.editor._dashboardLoading = false;
    this.editor.requestUpdate();
  }

  _getControllerTitle(fileInfo) {
    const meta = fileInfo.meta || {};
    if (meta.title) return meta.title;

    const preset = meta.preset_type || meta.preset || "thermostat";
    const prefix = fileInfo.global_prefix || "";
    const presetName = this.editor.i18n._t(`presetNames.${preset}`) || preset;
    return `CronoStar ${presetName} ${prefix.replace(/_/g, " ").trim()}`;
  }

  _handleEditControllerConfig(fileInfo) {
    const meta = fileInfo.meta || {};
    const newConfig = {
      type: "custom:cronostar-card",
      ...meta,
      preset_type: meta.preset_type || meta.preset || "thermostat",
      global_prefix: fileInfo.global_prefix || meta.global_prefix,
    };

    this.editor._config = newConfig;
    this.editor._isEditing = true;
    this.editor._step = 1;
    this.editor.requestUpdate();
    this.editor._dispatchConfigChanged(true);
  }

  async _handleDeleteController(fileInfo) {
    const meta = fileInfo.meta || {};
    const prefix = fileInfo.global_prefix || meta.global_prefix;
    const preset = meta.preset_type || meta.preset || "thermostat";
    const isIt = this.editor._language === "it";

    const confirmMsg = isIt
      ? "Sei sicuro di voler eliminare questo controller? Questa azione non può essere annullata."
      : "Are you sure you want to delete this controller? This cannot be undone.";

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      this.editor._dashboardLoading = true;
      this.editor.requestUpdate();

      await this.editor.hass.callService("cronostar", "delete_controller", {
        global_prefix: prefix,
        preset_type: preset,
      });

      this.editor.showToast(
        isIt ? "Controller eliminato" : "Controller deleted",
        false,
      );

      // Reload list
      setTimeout(() => {
        this._loadAllProfiles();
      }, 1000);
    } catch (e) {
      console.error("Failed to delete controller:", e);
      this.editor.showToast(
        (isIt ? "Errore eliminazione: " : "Failed to delete controller: ") +
          e.message,
        true,
      );
      this.editor._dashboardLoading = false;
      this.editor.requestUpdate();
    }
  }

  async _primeLanguageFromCurrentProfile() {
    try {
      if (!this.editor?.hass) return;
      const prefix = this.editor._config?.global_prefix;
      if (!prefix) return;
      const result = await this.editor.hass.callWS({
        type: "call_service",
        domain: "cronostar",
        service: "load_profile",
        service_data: {
          profile_name: "Default",
          preset_type: this.editor._config?.preset_type || "thermostat",
          global_prefix: prefix,
          force_reload: false,
        },
        return_response: true,
      });
      const metaLang = result?.response?.meta?.language;
      if (metaLang && this.editor._language !== metaLang) {
        this.editor._language = metaLang;
        this.editor.i18n = new EditorI18n(this.editor);
      }
    } catch (e) {
      // Ignore errors when loading profile meta on dashboard
    }
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
    Object.values(this.editor._dashboardProfilesData).forEach((pData) => {
      if (pData.files) allFiles.push(...pData.files);
    });

    const isIt = this.editor._language === "it";

    if (allFiles.length === 0) {
      return html`
        <div class="info-box">
          <p>
            ℹ️ ${isIt ? "Nessun controller trovato. Clicca 'Nuova configurazione' sotto per iniziare." : "No controllers found. Click 'New Configuration' below to start."}
          </p>
        </div>
      `;
    }

    return html`
      <div class="controllers-grid">
        ${allFiles.map((fileInfo) => {
          const validInfo = fileInfo.validation || { valid: true, errors: [] };
          const borderColor = validInfo.valid
            ? "rgba(255, 255, 255, 0.08)"
            : "#ef4444";
          const bgColor = validInfo.valid
            ? "rgba(255, 255, 255, 0.03)"
            : "rgba(239, 68, 68, 0.1)";

          return html`
            <div class="controller-card ${validInfo.valid ? "valid" : "error"}">
              <div class="cc-title">${this._getControllerTitle(fileInfo)}</div>
              <div class="cc-meta">
                Prefix: <code>${fileInfo.global_prefix}</code><br>
                Target: <code>${fileInfo.meta?.target_entity || "—"}</code><br>
                Profiles: ${fileInfo.profiles?.length || 0}
              </div>

              ${!validInfo.valid && validInfo.errors && validInfo.errors.length > 0 ? html`
                <div class="validation-errors">
                  <strong>${isIt ? "⚠️ Problemi rilevati:" : "⚠️ Validation issues:"}</strong>
                  <ul style="margin: 4px 0; padding-left: 18px; font-size: 11px;">
                    ${validInfo.errors.map(err => html`<li>${err}</li>`)}
                  </ul>
                </div>
              ` : ""}

              <div class="cc-footer">
                ${validInfo.valid 
                  ? html`<span class="badge badge-success">${isIt ? "Configurazione Attiva" : "Active"}</span>`
                  : html`<span class="badge badge-danger">${isIt ? "Incompleto" : "Incomplete"}</span>`}
                <mwc-button class="btn btn-sm" style="margin-left:auto" @click=${() => this._handleEditControllerConfig(fileInfo)}>
                  ${isIt ? "Configura" : "Configure"}
                </mwc-button>
                <mwc-button class="btn btn-sm btn-danger" @click=${() => this._handleDeleteController(fileInfo)}>
                  ${isIt ? "Elimina" : "Delete"}
                </mwc-button>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    const isIt = this.editor._language === "it";
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t("headers.step0")}</div>
        <div class="step-description">${isIt ? "Gestisci i controller esistenti o creane uno nuovo." : "Manage existing controllers or create a new one."}</div>

        ${this.editor._dashboardLoading
          ? html`<div class="info-box">${isIt ? "Caricamento controller..." : "Loading controllers..."}</div>`
          : this._renderProfilesList()}

        <div class="divider"></div>

        <div class="new-btn" @click=${() => this.editor._handleResetConfig()}>
          <div class="new-btn-icon">+</div>
          <div>
            <div style="font-weight: 500; color: var(--primary-text-color);">${isIt ? "Nuova configurazione" : "New configuration"}</div>
            <div style="font-size: 11px; margin-top: 2px;">${isIt ? "Crea un controller da zero" : "Create a controller from scratch"}</div>
          </div>
        </div>
      </div>
    `;
  }
}
