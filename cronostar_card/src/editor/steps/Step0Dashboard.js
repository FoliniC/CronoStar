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

    if (!confirm(this.editor.i18n._t("ui.dashboard_delete_confirm"))) {
      return;
    }

    try {
      this.editor._dashboardLoading = true;
      this.editor.requestUpdate();

      await this.editor.hass.callService("cronostar", "delete_controller", {
        global_prefix: prefix,
        preset_type: preset,
      });

      this.editor.showToast(this.editor.i18n._t("ui.dashboard_deleted"), false);

      // Reload list
      setTimeout(() => {
        this._loadAllProfiles();
      }, 1000);
    } catch (e) {
      console.error("Failed to delete controller:", e);
      this.editor.showToast(
        this.editor.i18n._t("ui.dashboard_delete_error") + e.message,
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

    if (allFiles.length === 0) {
      return html`
        <div class="info-box">
          <p>
            ℹ️ ${this.editor.i18n._t("ui.dashboard_no_controllers")}
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

              ${!validInfo.valid &&
              validInfo.errors &&
              validInfo.errors.length > 0
                ? html`
                    <div class="validation-errors">
                      <strong>${this.editor.i18n._t("ui.dashboard_issues")}</strong>
                      <ul style="margin: 4px 0; padding-left: 18px; font-size: 11px;">
                        ${validInfo.errors.map((err) => html`<li>${err}</li>`)}
                      </ul>
                    </div>
                  `
                : ""}

              <div class="cc-footer">
                ${validInfo.valid
                  ? html`<span class="badge badge-success"
                      >${this.editor.i18n._t("ui.dashboard_active")}</span
                    >`
                  : html`<span class="badge badge-danger"
                      >${this.editor.i18n._t("ui.dashboard_incomplete")}</span
                    >`}
                <mwc-button
                  class="btn btn-sm"
                  style="margin-left:auto"
                  @click=${() => this._handleEditControllerConfig(fileInfo)}
                >
                  ${this.editor.i18n._t("actions.edit_config")}
                </mwc-button>
                <mwc-button
                  class="btn btn-sm btn-danger"
                  @click=${() => this._handleDeleteController(fileInfo)}
                >
                  ${this.editor.i18n._t("actions.delete_profile")}
                </mwc-button>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    return html`
      <div class="step-content">
        <div class="step-header">${this.editor.i18n._t("headers.step0")}</div>
        <div class="step-description">
          ${this.editor.i18n._t("ui.dashboard_manage")}
        </div>

        ${this.editor._dashboardLoading
          ? html`<div class="info-box">
              ${this.editor.i18n._t("ui.dashboard_loading")}
            </div>`
          : this._renderProfilesList()}

        <div class="divider"></div>

        <div class="new-btn" @click=${() => this.editor._handleResetConfig()}>
          <div class="new-btn-icon">+</div>
          <div>
            <div style="font-weight: 500; color: var(--primary-text-color);">
              ${this.editor.i18n._t("ui.new_config_title")}
            </div>
            <div style="font-size: 11px; margin-top: 2px;">
              ${this.editor.i18n._t("ui.new_config_desc")}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
