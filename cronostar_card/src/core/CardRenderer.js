import { html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { CARD_CONFIG_PRESETS, TIMEOUTS, VERSION } from "../config.js";
import { Logger } from "../utils.js";

export class CardRenderer {
  constructor(card) {
    this.card = card;
  }

  _renderAdminBox(title) {
    const isIt = this.card.language === "it";
    const config = this.card.config || {};

    const localize = (key, search, replace) =>
      this.card.localizationManager.localize(
        this.card.language,
        key,
        search,
        replace,
      );

    // Retrieve validation information if present
    const validInfo = config.validation || { valid: true, errors: [] };
    const borderColor = validInfo.valid ? "var(--divider-color)" : "#ef4444";
    const bgColor = validInfo.valid ? "transparent" : "rgba(239, 68, 68, 0.05)";

    // ✅ FIX: Internal Editor Fallback for Admin mode
    if (this.card.isEditorInternal) {
      // Inline positioning uses runtime-measured HA chrome bounds (set by
      // handleEditConfig → _calcContentAreaInsets) instead of unreliable
      // CSS variables like --ha-sidebar-width / --header-height.
      const _wi = this.card._wizardInsets || {};
      const _top  = (_wi.headerHeight ?? 56) + 4;
      const _left = (_wi.sidebarWidth  ?? 0)  + 4;
      const _wizardStyle = [
        "position:fixed",
        `top:${_top}px`,
        `left:${_left}px`,
        "right:4px",
        "bottom:4px",
        "z-index:50",
        "width:auto",
        "max-width:none",
        "margin:0",
      ].join(" !important;") + " !important;";
      return html`
        <ha-card
          class="editor-internal-container wizard-fullscreen-admin"
          style="${_wizardStyle}"
        >
          <div
            class="card-header"
            style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--divider-color); background: rgba(255,255,255,0.05);"
          >
            <div style="display: flex; align-items: center; gap: 12px;">
              <img
                src="/cronostar_card/cronostar-logo.png"
                style="height: 24px;"
              />
              <span style="font-weight: 700; color: var(--primary-color);">
                ${this.card.language === "it"
                  ? "WIZARD CONFIGURAZIONE"
                  : "CONFIGURATION WIZARD"}
              </span>
            </div>
            <ha-icon-button
              @click=${async () => {
                this.card.isEditorInternal = false;
                this.card.isExpandedV = false;
                this.card.isExpandedH = false;
                if (this.card._lastGoodConfig) {
                  this.card.setConfig(this.card._lastGoodConfig);
                }
                this.card.requestUpdate();
              }}
              title="Chiudi"
            >
              <ha-icon icon="mdi:close"></ha-icon>
            </ha-icon-button>
          </div>
          <div style="padding: 16px; width: 100%; box-sizing: border-box; overflow-y: auto; flex: 1; min-height: 0;">
            <cronostar-card-editor
              .hass=${this.card.hass}
              .config=${this.card.config}
              .step=${this.card.editorStep || 0}
              .language=${this.card.language}
              @cronostar-wizard-done=${async (ev) => {
                this.card.isEditorInternal = false;
                this.card.isExpandedV = false;
                this.card.isExpandedH = false;
                if (ev.detail?.config) {
                  this.card.setConfig(ev.detail.config);
                }
                this.card.requestUpdate();
              }}
              @config-changed=${async (ev) => {
                const newConfig = { ...ev.detail.config };
                if (newConfig._close_wizard) {
                  delete newConfig._close_wizard;
                  this.card.isEditorInternal = false;
                  this.card.isExpandedV = false;
                  this.card.isExpandedH = false;
                }
                this.card.setConfig(newConfig);
                this.card.requestUpdate();
              }}
            ></cronostar-card-editor>
          </div>
        </ha-card>
      `;
    }

    if (config.not_configured) {
      return html`
        <ha-card
          style="padding: 16px; border: 2px dashed var(--primary-color); background: rgba(var(--rgb-primary-color), 0.05); cursor: pointer;"
          @click=${() => this.card.handleCreateController()}
        >
          <div
            style="display: flex; justify-content: center; align-items: center; height: 60px; gap: 12px; color: var(--primary-color);"
          >
            <ha-icon
              icon="mdi:plus-circle-outline"
              style="--mdc-icon-size: 32px;"
            ></ha-icon>
            <div style="font-weight: 700; font-size: 1.2rem;">
              ${title ||
              (isIt ? "Aggiungi Nuovo Controller" : "Add New Controller")}
            </div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card
        style="padding: 16px; background: ${bgColor}; transition: all 0.2s;"
      >
        <!-- Title and Buttons Stacked Vertically -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- 1. Title Row -->
          <div
            style="display: flex; align-items: center; gap: 12px; cursor: pointer;"
            @click=${() => this.card.handleEditConfig(1)}
          >
            <img
              src="/cronostar_card/cronostar-logo.png"
              style="width: 24px; height: auto;"
              alt="CronoStar"
            />
            <div
              style="font-weight: 700; font-size: 1.1rem; color: var(--primary-text-color);"
            >
              ${title}
              ${!validInfo.valid
                ? html`<ha-icon
                    icon="mdi:alert-circle"
                    style="color: #ef4444; margin-left: 8px; --mdc-icon-size: 20px; vertical-align: middle;"
                  ></ha-icon>`
                : ""}
            </div>
          </div>

          <!-- 2. Buttons Row -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <button
              class="cs-btn"
              @click=${(e) => {
                e.stopPropagation();
                this.card.handleEditConfig(1);
              }}
              title="${isIt ? "Configura" : "Configure"}"
            >
              <ha-icon icon="mdi:cog"></ha-icon>
              ${isIt ? "Configura" : "Configure"}
            </button>
            <button
              class="cs-btn cs-btn-secondary"
              @click=${(e) => {
                e.stopPropagation();
                this.card.toggleChart();
              }}
              title="${isIt ? "Toggle Grafico" : "Toggle Chart"}"
            >
              <ha-icon icon="mdi:chart-bell-curve"></ha-icon>
              ${isIt ? "Grafico" : "Chart"}
            </button>
            ${this.card._showChart 
              ? html`
                <button
                  class="cs-btn cs-btn-secondary"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.card.eventHandlers.toggleMenu(e);
                  }}
                  title="Menu"
                >
                  <ha-icon icon="mdi:menu"></ha-icon>
                  ${isIt ? "Menu" : "Menu"}
                </button>
              ` : ""}
            <button
              class="cs-btn cs-btn-danger"
              @click=${(e) => {
                e.stopPropagation();
                this.card.handleDeleteController();
              }}
              title="${isIt ? "Elimina Controller" : "Delete Controller"}"
            >
              <ha-icon icon="mdi:delete-outline"></ha-icon>
              ${isIt ? "Elimina" : "Delete"}
            </button>
          </div>
        </div>

        ${this.card.isMenuOpen
          ? html`
              <div class="menu-content admin-menu" style="position: absolute; right: 16px; top: 100px; z-index: 100; min-width: 220px;" @click=${(e) => e.stopPropagation()}>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleApplyNow()}>
                  <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                  ${localize("menu.apply_now")}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleSelectAll()}>
                  <ha-icon icon="mdi:select-all"></ha-icon>
                  ${localize("menu.select_all")}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignLeft()}>
                  <ha-icon icon="mdi:align-horizontal-left"></ha-icon>
                  ${localize("menu.align_left", "Align Left")}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignRight()}>
                  <ha-icon icon="mdi:align-horizontal-right"></ha-icon>
                  ${localize("menu.align_right", "Align Right")}
                </mwc-list-item>
                <li divider role="separator" style="height: 1px; background: var(--divider-color); margin: 4px 0;"></li>

                <mwc-list-item @click=${() => this.card.handleAddProfile()}>
                  <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                  ${localize("menu.add_profile")}
                </mwc-list-item>
                <mwc-list-item .disabled=${!this.card.selectedProfile} @click=${() => this.card.handleDeleteProfile()}>
                  <ha-icon icon="mdi:delete-outline"></ha-icon>
                  ${localize("menu.delete_profile")}
                </mwc-list-item>

                <li divider role="separator" style="height: 1px; background: var(--divider-color); margin: 4px 0;"></li>

                <mwc-list-item @click=${() => this.card.eventHandlers.handleHelp()}>
                  <ha-icon icon="mdi:help-circle-outline"></ha-icon>
                  ${localize("menu.help")}
                </mwc-list-item>

                <div class="menu-item-with-switch" @click=${(e) => e.stopPropagation()}>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <ha-icon icon="mdi:console-line"></ha-icon>
                    <span>${localize("menu.enable_logging")}</span>
                  </div>
                  <ha-switch
                    .checked=${this.card.loggingEnabled}
                    @change=${(e) => this.card.eventHandlers.handleLoggingToggle(e)}
                  ></ha-switch>
                </div>

                <div class="menu-item-with-select">
                  <ha-select
                    label="${localize("menu.select_preset")}"
                    .value=${this.card.selectedPreset}
                    @selected=${(e) => this.card.eventHandlers.handlePresetChange(e)}
                    fixedMenuPosition
                    naturalMenuWidth
                  >
                    ${Object.keys(CARD_CONFIG_PRESETS).map(
                      (presetKey) =>
                        html`<mwc-list-item .value=${presetKey}>${localize(`preset.${presetKey}`)}</mwc-list-item>`
                    )}
                  </ha-select>
                </div>

                <div class="language-menu" style="padding: 8px 16px; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--divider-color); margin-top: 4px;">
                  <ha-icon icon="mdi:translate" style="--mdc-icon-size: 16px;"></ha-icon>
                  <button class="lang-btn ${this.card.language === "it" ? "active" : ""}" @click=${() => this.card.eventHandlers.handleLanguageSelect("it")}>IT</button>
                  <button class="lang-btn ${this.card.language === "en" ? "active" : ""}" @click=${() => this.card.eventHandlers.handleLanguageSelect("en")}>EN</button>
                </div>
              </div>
            `
          : ""}

        <!-- Info Section Stacked Vertically -->
        <div
          style="margin-top: 16px; font-size: 0.85rem; color: var(--secondary-text-color); opacity: 0.9; display: flex; flex-direction: column; gap: 8px;"
        >
          <div
            style="background: rgba(var(--rgb-primary-color), 0.07); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(var(--rgb-primary-color), 0.1);"
          >
            <strong>Entity:</strong>
            <span style="font-family: monospace; margin-left: 4px;"
              >${config.target_entity || "N/A"}</span
            >
          </div>
          <div
            style="background: rgba(var(--rgb-primary-color), 0.07); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(var(--rgb-primary-color), 0.1);"
          >
            <strong>Prefix:</strong>
            <span style="font-family: monospace; margin-left: 4px;"
              >${config.global_prefix || "N/A"}</span
            >
          </div>
        </div>
        ${!validInfo.valid
          ? html`
              <div
                style="margin-top: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.2); color: #fca5a5; font-size: 0.85rem;"
              >
                <div
                  style="font-weight: 800; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;"
                >
                  <ha-icon
                    icon="mdi:alert-box"
                    style="--mdc-icon-size: 18px;"
                  ></ha-icon>
                  ${isIt
                    ? "PROBLEMI DI CONFIGURAZIONE"
                    : "CONFIGURATION ISSUES"}
                </div>
                <ul style="margin: 0; padding-left: 20px;">
                  ${validInfo.errors.map((err) => html`<li>${err}</li>`)}
                </ul>
              </div>
            `
          : html`
              <div
                style="margin-top: 12px; font-size: 0.8rem; color: #86efac; display: flex; align-items: center; gap: 6px; opacity: 0.8;"
              >
                <ha-icon
                  icon="mdi:check-decagram"
                  style="--mdc-icon-size: 16px;"
                ></ha-icon>
                <span
                  >${isIt
                    ? "Controller Attivo e Valido"
                    : "Controller Active and Valid"}</span
                >
              </div>
            `}

        ${this.card._showChart 
          ? html`
            <div class="card-content" style="margin-top: 16px; border-top: 1px solid var(--divider-color); padding-top: 16px;">
              <div class="chart-container"
                   tabindex="0"
                   @pointermove=${(e) => this.card.selectionManager.handlePointerMove(e)}
                   @pointerdown=${(e) => this.card.selectionManager.handlePointerDown(e)}
                   @pointerup=${(e) => this.card.selectionManager.handlePointerUp(e)}>
                <canvas id="myChart"></canvas>
                <div id="drag-value-display" class="chart-tooltip"></div>
                <div id="hover-value-display" class="chart-tooltip hover-tooltip"></div>
                <div id="selection-rect" class="selection-rect"></div>
              </div>
              
              <div class="controls" style="margin-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                ${this.card.profileOptions?.length > 0
                  ? html`
                      <div class="control-group" style="flex: 1;">
                        <ha-select
                          label="${isIt ? "Seleziona Profilo" : "Select Profile"}"
                          .value=${this.card.selectedProfile}
                          @selected=${(e) => {
                            const val = e.target.value || e.detail?.value;
                            if (val && val !== this.card.selectedProfile) {
                              this.card.profileManager.handleProfileSelection({
                                target: { value: val },
                              });
                            }
                          }}
                          style="width: 100%;"
                        >
                          ${this.card.profileOptions.map(
                            (opt) => html`<mwc-list-item .value=${opt}>${opt}</mwc-list-item>`
                          )}
                        </ha-select>
                      </div>
                    `
                  : ""}

                ${config.enabled_entity 
                  ? html`
                    <div class="control-group" style="display: flex; align-items: center; gap: 12px; background: rgba(var(--rgb-primary-color), 0.05); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(var(--rgb-primary-color), 0.1);">
                      <ha-switch
                        .checked=${this.card.isEnabled}
                        @change=${(e) => this.card.eventHandlers.toggleEnabled(e)}
                        style="--mdc-theme-secondary: var(--primary-color);"
                      ></ha-switch>
                      <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.65rem; opacity: 0.7; font-weight: 700; text-transform: uppercase;">
                          ${localize("ui.automation_enabled") || (isIt ? "Automazione" : "Automation")}
                        </span>
                        <span style="font-size: 0.9rem; font-weight: 800; color: ${this.card.isEnabled ? 'var(--primary-color)' : 'var(--secondary-text-color)'};">
                          ${this.card.isEnabled ? (isIt ? "ATTIVA" : "ACTIVE") : (isIt ? "PAUSA" : "PAUSED")}
                        </span>
                      </div>
                    </div>
                  ` : ""}
              </div>
            </div>
          `
          : html``
        }
      </ha-card>
    `;
  }

  render() {
    if (this.card._showChart) {
      console.info(`[CronoStar] [UI] [${this.card.config?.global_prefix || "no-prefix"}] Chart is VISIBLE (_showChart: true)`);
    }
    if (!this.card.config) return html``;

    const localize = (key, search, replace) =>
      this.card.localizationManager.localize(
        this.card.language,
        key,
        search,
        replace,
      );

    // ✅ IMPROVED: Dynamic title logic
    let title = this.card.config?.title;
    if (!title) {
      const preset =
        this.card.selectedPreset ||
        this.card.config?.preset_type ||
        "thermostat";
      const presetName = localize(`preset.${preset}`);
      title = `${localize("ui.title")} ${presetName}`;

      // Append custom part of prefix if present
      const prefix = this.card.config?.global_prefix || "";
      const basePrefix = `cronostar_${preset}_`;
      if (prefix.startsWith(basePrefix) && prefix.length > basePrefix.length) {
        const suffix = prefix
          .substring(basePrefix.length)
          .replace(/_+$/, "")
          .replace(/_/g, " ");
        if (suffix) {
          title = `${title} ${suffix}`;
        }
      }
    }

    if (this.card.config?.view_mode === "admin") {
      return this._renderAdminBox(title);
    }

    return this._renderFullCard(title);
  }

  _renderFullCard(title) {
    if (!this.card.config) return html``;

    const localize = (key, search, replace) =>
      this.card.localizationManager.localize(
        this.card.language,
        key,
        search,
        replace,
      );

    // ✅ FIX: Internal Editor Fallback (for panels where standard editor won't open)
    if (this.card.isEditorInternal) {
      return html`
        <ha-card
          class="editor-internal-container expanded-v expanded-h"
          style="width: 100% !important; max-width: none !important; margin: 0 !important; border-radius: 0;"
        >
          <div
            class="card-header"
            style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--divider-color); background: rgba(255,255,255,0.05);"
          >
            <div style="display: flex; align-items: center; gap: 12px;">
              <img
                src="/cronostar_card/cronostar-logo.png"
                style="height: 24px;"
              />
              <span style="font-weight: 700; color: var(--primary-color);">
                ${this.card.language === "it"
                  ? "WIZARD CONFIGURAZIONE"
                  : "CONFIGURATION WIZARD"}
              </span>
            </div>
            <ha-icon-button
              @click=${async () => {
                console.info(
                  "[CronoStar] Wizard closed via X. Restoring previous state...",
                );

                // 1. Reset editor and expansion flags
                this.card.isEditorInternal = false;
                this.card.isExpandedV = false;
                this.card.isExpandedH = false;

                // 2. Restore config if backup exists
                if (this.card._lastGoodConfig) {
                  this.card.setConfig(this.card._lastGoodConfig);
                }

                // 3. Request update and wait for DOM to reflect the change (returning to standard card view)
                this.card.requestUpdate();
                await this.card.updateComplete;

                // 4. Now that the canvas is back in DOM, reinitialize the chart
                if (this.card.cardLifecycle) {
                  console.info(
                    "[CronoStar] DOM ready, reinitializing chart...",
                  );
                  this.card.cardLifecycle.reinitializeCard();

                  // 5. Force a backend sync to ensure data is fresh
                  if (this.card.hass) {
                    this.card.cardLifecycle.registerCard(this.card.hass);
                  }
                }
              }}
              title="Chiudi"
            >
              <ha-icon icon="mdi:close"></ha-icon>
            </ha-icon-button>
          </div>
          <div style="padding: 16px; width: 100%; box-sizing: border-box; overflow-y: auto; flex: 1; min-height: 0;">
            ${console.info(
              `[CronoStar] Rendering Editor with language: ${this.card.language}`,
            )}
            <cronostar-card-editor
              .hass=${this.card.hass}
              .config=${this.card.config}
              .step=${this.card.editorStep || 0}
              .language=${this.card.language}
              @cronostar-wizard-done=${async (ev) => {
                console.info(
                  "[CronoStar CardRenderer] cronostar-wizard-done event received. Closing editor...",
                );
                
                // 1. Force closure and collapse
                this.card.isEditorInternal = false;
                this.card.isExpandedV = false;
                this.card.isExpandedH = false;
                
                // 2. Adopt provided config if any
                if (ev.detail?.config) {
                  this.card.setConfig(ev.detail.config);
                }

                // 3. Request update and wait for DOM transition
                this.card.requestUpdate();
                await this.card.updateComplete;

                // 4. Full reinitialization
                if (this.card.cardLifecycle) {
                  this.card.cardLifecycle.reinitializeCard();
                  if (this.card.hass) {
                    this.card.cardLifecycle.registerCard(this.card.hass);
                  }
                }
              }}
              @config-changed=${async (ev) => {
                const newConfig = { ...ev.detail.config };
                const shouldClose = !!newConfig._close_wizard;
                console.info(`[CronoStar CardRenderer] config-changed event received. shouldClose=${shouldClose}`);
                
                if (shouldClose) delete newConfig._close_wizard;

                // Shallow compare to avoid redundant updates
                if (
                  JSON.stringify(this.card.config) !== JSON.stringify(newConfig)
                ) {
                  console.info("[CronoStar CardRenderer] Applying new config to card");
                  this.card.setConfig(newConfig);
                }

                // BACKUP: Force closure if flag is present and still in editor
                if (shouldClose && this.card.isEditorInternal) {
                  console.info("[CronoStar CardRenderer] Closing via _close_wizard backup");
                  this.card.isEditorInternal = false;
                  this.card.isExpandedV = false;
                  this.card.isExpandedH = false;
                  this.card.requestUpdate();
                } else {
                  this.card.requestUpdate();
                }
              }}
            ></cronostar-card-editor>
          </div>
        </ha-card>
      `;
    }

    // ✅ FIX: Show setup UI if explicitly not configured
    if (this.card.config?.not_configured === true) {
      const isEditor = this.card.cardLifecycle?.isEditorContext() || false;
      return html`
        <ha-card>
          <div class="card-header">
            <div class="header-left">
              <img
                src="/cronostar_card/cronostar-logo.png"
                class="header-logo"
                alt="CronoStar"
              />
              <div class="title">${title}</div>
            </div>
          </div>
          <div
            style="padding: 24px; text-align: center; color: var(--secondary-text-color);"
          >
            <ha-icon
              icon="mdi:cog-transfer-outline"
              style="--mdc-icon-size: 48px; opacity: 0.5; margin-bottom: 16px;"
            ></ha-icon>
            <p
              style="font-size: 1.1em; font-weight: 500; margin: 0 0 8px 0; color: var(--primary-text-color);"
            >
              ${this.card.language === "it"
                ? "Nessun controller configurato"
                : "No controller configured"}
            </p>
            <p style="margin: 0 0 20px 0; font-size: 0.9em;">
              ${this.card.language === "it"
                ? isEditor
                  ? "Usa il pannello di configurazione per impostare la card."
                  : "Aggiungi un controller per iniziare a gestire i tuoi orari."
                : isEditor
                  ? "Use the configuration panel to set up the card."
                  : "Add a controller to start managing your schedules."}
            </p>
            ${!isEditor
              ? html`
                  <mwc-button
                    class="btn-3d"
                    unelevated
                    @click=${() => this.card.handleCreateController()}
                  >
                    <ha-icon icon="mdi:plus" slot="icon"></ha-icon>
                    ${this.card.language === "it"
                      ? "Configura Ora"
                      : "Configure Now"}
                  </mwc-button>
                `
              : html`
                  <div
                    style="font-size: 0.85em; opacity: 0.7; padding: 8px; border: 1px dashed var(--divider-color); border-radius: 4px;"
                  >
                    ${this.card.language === "it"
                      ? "Configurazione necessaria"
                      : "Configuration required"}
                  </div>
                `}
          </div>
        </ha-card>
      `;
    }

    // ✅ FIX: Check multiple sources for Step 0
    const isEditor = this.card.cardLifecycle?.isEditorContext() || false;
    const wizardStep = this.card.config?.step;
    const isFromWizard = wizardStep !== undefined && wizardStep !== null;

    // Picker preview: show static image only
    const isPickerPreview = this.card.cardLifecycle?.isPickerPreviewContext?.();

    if (isPickerPreview && !isFromWizard) {
      const img =
        this.card.config?.preview_image ||
        "/cronostar_card/cronostar-preview.png";
      return html`
        <ha-card style="padding: 16px; text-align: center;">
          <img
            alt="CronoStar preview"
            src="${img}"
            style="display:block;max-width:100%;height:auto;border-radius:12px;box-shadow: var(--ha-card-box-shadow, 0 2px 2px 0 rgba(0,0,0,0.14), 0 1px 5px 0 rgba(0,0,0,0.12), 0 3px 1px -2px rgba(0,0,0,0.2));"
          />
        </ha-card>
      `;
    }

    const enRaised = this.card.language === "en";
    const itRaised = this.card.language === "it";

    // ✅ FIX: Hide chart if not operational
    const isBroken =
      !this.card.config?.target_entity &&
      !isEditor &&
      !isPickerPreview &&
      this.card.initialLoadComplete &&
      !this.card.isEditorInternal;
    if (isBroken) {
      return html`
        <ha-card style="padding: 16px; text-align: center;">
          <div
            class="card-header"
            style="justify-content: center; margin-bottom: 16px; border-bottom: none;"
          >
            <div class="header-left">
              <img
                src="/cronostar_card/cronostar-logo.png"
                class="header-logo"
                alt="CronoStar"
              />
              <div class="title">${title}</div>
            </div>
          </div>
          <div style="padding: 24px 16px;">
            <ha-icon
              icon="mdi:alert-circle-outline"
              style="--mdc-icon-size: 48px; color: #ef4444; margin-bottom: 12px; opacity: 0.8;"
            ></ha-icon>
            <p
              style="font-weight: 700; font-size: 1.1rem; margin: 0 0 8px 0; color: var(--primary-text-color);"
            >
              ${this.card.language === "it"
                ? "Controller non operativo"
                : "Controller not operational"}
            </p>
            <p
              style="font-size: 0.95rem; color: var(--secondary-text-color); margin: 0 0 24px 0; line-height: 1.4;"
            >
              ${this.card.language === "it"
                ? "L'entità di destinazione non è stata configurata. Il grafico è nascosto finché il controller non è attivo."
                : "The target entity has not been configured. The chart is hidden until the controller is active."}
            </p>
            <mwc-button
              class="btn-3d"
              unelevated
              @click=${() => this.card.handleEditConfig(1)}
            >
              <ha-icon icon="mdi:cog" slot="icon"></ha-icon>
              ${this.card.language === "it" ? "Configura ora" : "Configure now"}
            </mwc-button>
          </div>
        </ha-card>
      `;
    }

    const isMenuVisible = this.card.isMenuOpen;

    // Overlay Logic
    const isPreview = this.card.isPreview;
    const isWaitingForData =
      !isEditor && !isPreview && !this.card.initialLoadComplete;
    const showStartupOverlay =
      !isEditor &&
      !isPreview &&
      this.card.initialLoadComplete &&
      !this.card.cronostarReady;
    const showMissingEntitiesDetailsOverlay =
      !isEditor &&
      !isPreview &&
      !this.card.cronostarReady &&
      this.card.missingEntities.length > 0 &&
      this.card.initialLoadComplete;
    const showAnomalousOverlay =
      !isEditor &&
      !isPreview &&
      this.card.missingEntities.length > 0 &&
      this.card.initialLoadComplete;
    const showAwaitingAutomationOverlay =
      !isEditor &&
      !isPreview &&
      !isWaitingForData &&
      !showStartupOverlay &&
      !showMissingEntitiesDetailsOverlay &&
      this.card.awaitingAutomation &&
      this.card.initialLoadComplete &&
      !this.card.hasUnsavedChanges &&
      !this.card.isDragging &&
      Date.now() >= this.card.overlaySuppressionUntil &&
      (!this.card.lastEditAt ||
        Date.now() - this.card.lastEditAt >= TIMEOUTS.editingGraceMs);

    const isAnyExpanded = this.card.isExpandedV || this.card.isExpandedH;

    return html`
      <ha-card class="${this.card.isExpandedV ? "expanded-v" : ""} ${this.card.isExpandedH ? "expanded-h" : ""}" @click=${(e) => this.card.eventHandlers.handleCardClick(e)}>
        <div class="card-header">
          <div class="header-left">
            <img src="/cronostar_card/cronostar-logo.png" class="header-logo" alt="CronoStar">
            <div class="title">
              ${title}
              <span style="font-size: 0.8em; opacity: 0.7; margin-left: 8px;">v${VERSION}</span>
              ${
                this.card.versionCheckEnabled &&
                this.card.integrationVersion &&
                this.card.integrationVersion !== VERSION
                  ? html`
                      <ha-icon
                        icon="mdi:alert-outline"
                        style="color: #fbbf24; margin-left: 4px; --mdc-icon-size: 14px; vertical-align: middle;"
                        title="${this.card.language === "it"
                          ? `Versione non aggiornata! Disponibile: ${this.card.integrationVersion}`
                          : `Version mismatch! Latest: ${this.card.integrationVersion}`}"
                      ></ha-icon>
                    `
                  : ""
              }
            </div>
          </div>
            ${
              isAnyExpanded
                ? html`
                    <ha-icon-button
                      @click=${(e) => {
                        e.stopPropagation();
                        this.card.isExpandedV = false;
                        this.card.isExpandedH = false;
                        this.card.requestUpdate();
                      }}
                      title="Minimize"
                    >
                      <ha-icon icon="mdi:arrow-collapse"></ha-icon>
                    </ha-icon-button>
                  `
                : html`
                    <ha-icon-button
                      @click=${(e) => {
                        e.stopPropagation();
                        this.card.isExpandedV = true;
                        this.card.isExpandedH = true;
                        this.card.requestUpdate();
                      }}
                      title="Expand"
                    >
                      <ha-icon icon="mdi:arrow-expand"></ha-icon>
                    </ha-icon-button>
                  `
            }
            ${!this.card.isEnabled ? html`<ha-icon icon="mdi:pause-circle" class="pause-indicator" title="Automation Disabled"></ha-icon>` : ""}
            <div class="menu-container">
              ${
                this.card.isEditorContext() 
                  ? "" 
                  : html`
                    <button class="menu-button" @click=${(e) => {
                        e.stopPropagation();
                        this.card.toggleChart();
                    }}>
                      <ha-icon icon="mdi:chart-bell-curve"></ha-icon>
                    </button>
                  `
              }
              <button class="menu-button" @click=${(e) => this.card.eventHandlers.toggleMenu(e)}>
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>            </div>
          </div>
        </div>

        ${
          isMenuVisible
            ? html`
                <div class="menu-content" @click=${(e) => e.stopPropagation()}>
                  <mwc-list-item
                    @click=${() => this.card.eventHandlers.handleApplyNow()}
                  >
                    <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                    ${localize("menu.apply_now")}
                  </mwc-list-item>
                  <mwc-list-item
                    @click=${() => this.card.eventHandlers.handleSelectAll()}
                  >
                    <ha-icon icon="mdi:select-all"></ha-icon>
                    ${localize("menu.select_all")}
                  </mwc-list-item>
                  <mwc-list-item
                    @click=${() => this.card.eventHandlers.handleAlignLeft()}
                  >
                    <ha-icon icon="mdi:align-horizontal-left"></ha-icon>
                    ${localize("menu.align_left", "Align Left")}
                  </mwc-list-item>
                  <mwc-list-item
                    @click=${() => this.card.eventHandlers.handleAlignRight()}
                  >
                    <ha-icon icon="mdi:align-horizontal-right"></ha-icon>
                    ${localize("menu.align_right", "Align Right")}
                  </mwc-list-item>

                  ${!isPreview
                    ? html`
                        <mwc-list-item
                          @click=${() => this.card.handleAddProfile()}
                        >
                          <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                          ${localize("menu.add_profile")}
                        </mwc-list-item>
                        <mwc-list-item
                          .disabled=${!this.card.selectedProfile}
                          @click=${() => this.card.handleDeleteProfile()}
                        >
                          <ha-icon icon="mdi:delete-outline"></ha-icon>
                          ${localize("menu.delete_profile")}
                        </mwc-list-item>
                      `
                    : ""}

                  <mwc-list-item
                    @click=${() => this.card.eventHandlers.handleHelp()}
                  >
                    <ha-icon icon="mdi:help-circle-outline"></ha-icon>
                    ${localize("menu.help")}
                  </mwc-list-item>
                  <mwc-list-item @click=${() => this.card.handleEditConfig(1)}>
                    <ha-icon icon="mdi:cog-outline"></ha-icon>
                    ${this.card.language === "it"
                      ? "Configura Controller"
                      : "Configure Controller"}
                  </mwc-list-item>
                  <div
                    class="menu-item-with-switch"
                    @click=${(e) => e.stopPropagation()}
                  >
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <ha-icon icon="mdi:console-line"></ha-icon>
                      <span>${localize("menu.enable_logging")}</span>
                    </div>
                    <ha-switch
                      .checked=${this.card.loggingEnabled}
                      @change=${(e) =>
                        this.card.eventHandlers.handleLoggingToggle(e)}
                    ></ha-switch>
                  </div>

                  ${!isPreview
                    ? html`
                        <div class="menu-item-with-select">
                          <ha-select
                            label="${localize("menu.select_preset")}"
                            .value=${this.card.selectedPreset}
                            @selected=${(e) =>
                              this.card.eventHandlers.handlePresetChange(e)}
                          >
                            ${Object.keys(CARD_CONFIG_PRESETS).map(
                              (presetKey) =>
                                html`<mwc-list-item .value=${presetKey}
                                  >${localize(
                                    `preset.${presetKey}`,
                                  )}</mwc-list-item
                                >`,
                            )}
                          </ha-select>
                        </div>
                      `
                    : ""}

                  <div class="language-menu">
                    <span
                      style="font-size: 12px; color: var(--secondary-text-color); margin-right: 4px;"
                      >${localize("menu.language")}:</span
                    >
                    <ha-icon
                      icon="mdi:translate"
                      style="margin-right: 8px; --mdc-icon-size: 16px;"
                    ></ha-icon>
                    <button
                      class="lang-btn ${itRaised ? "active" : ""}"
                      @click=${() =>
                        this.card.eventHandlers.handleLanguageSelect("it")}
                    >
                      IT
                    </button>
                    <button
                      class="lang-btn ${enRaised ? "active" : ""}"
                      @click=${() =>
                        this.card.eventHandlers.handleLanguageSelect("en")}
                    >
                      EN
                    </button>
                  </div>
                </div>
              `
            : ""
        }

        <div class="card-content">
          ${this.card._showChart 
            ? html`
              <div class="chart-container"
                   tabindex="0"
                   @pointermove=${(e) => this.card.selectionManager.handlePointerMove(e)}
                   @pointerdown=${(e) => this.card.selectionManager.handlePointerDown(e)}
                   @pointerup=${(e) => this.card.selectionManager.handlePointerUp(e)}>
                <canvas id="myChart"></canvas>
                <div id="drag-value-display" class="chart-tooltip"></div>
                <div id="hover-value-display" class="chart-tooltip hover-tooltip"></div>
                <div id="selection-rect" class="selection-rect"></div>
              </div>`
            : html``
          }

            ${
              this.card.contextMenu?.show
                ? html`
                    <div
                      class="context-menu"
                      style="left: ${this.card.contextMenu.x}px; top: ${this
                        .card.contextMenu.y}px;"
                      @click=${(e) => e.stopPropagation()}
                    >
                      <mwc-list-item
                        @click=${() =>
                          this.card.eventHandlers.handleDeleteSelected()}
                      >
                        <ha-icon icon="mdi:delete"></ha-icon>
                        ${localize("menu.delete_selected")}
                      </mwc-list-item>
                      <mwc-list-item
                        @click=${() =>
                          this.card.eventHandlers.handleAlignLeft()}
                      >
                        <ha-icon icon="mdi:align-horizontal-left"></ha-icon>
                        ${localize("menu.align_left")}
                      </mwc-list-item>
                      <mwc-list-item
                        @click=${() =>
                          this.card.eventHandlers.handleAlignRight()}
                      >
                        <ha-icon icon="mdi:align-horizontal-right"></ha-icon>
                        ${localize("menu.align_right")}
                      </mwc-list-item>
                      <mwc-list-item
                        @click=${() =>
                          this.card.eventHandlers.handleSelectAll()}
                      >
                        <ha-icon icon="mdi:select-all"></ha-icon>
                        ${localize("menu.select_all")}
                      </mwc-list-item>
                      <mwc-list-item
                        @click=${() => this.card.eventHandlers.handleCopyJson()}
                      >
                        <ha-icon icon="mdi:code-json"></ha-icon>
                        ${localize("menu.copy_json")}
                      </mwc-list-item>
                      <li divider role="separator"></li>
                      <mwc-list-item
                        @click=${() => {
                          this.card.contextMenu = {
                            ...this.card.contextMenu,
                            show: false,
                          };
                          this.card.requestUpdate();
                        }}
                      >
                        <ha-icon icon="mdi:close"></ha-icon>
                        ${localize("menu.close_menu")}
                      </mwc-list-item>
                    </div>
                  `
                : ""
            }

            ${
              isWaitingForData
                ? html`<div class="chart-overlay loading-overlay">
                    <div>
                      <ha-circular-progress active></ha-circular-progress>
                      <p>${localize("ui.loading_data")}</p>
                    </div>
                  </div>`
                : ""
            }
            ${
              showStartupOverlay
                ? html`<div class="chart-overlay loading-overlay">
                    <div>
                      <ha-circular-progress active></ha-circular-progress>
                      <p>${localize("ui.starting_backend")}</p>
                    </div>
                  </div>`
                : ""
            }
            ${
              showMissingEntitiesDetailsOverlay
                ? html`<div class="chart-overlay error-overlay">
                    <div>
                      <ha-icon icon="mdi:alert-circle"></ha-icon>
                      <p>
                        ${localize("ui.missing_entities")}:
                        ${this.card.missingEntities.join(", ")}
                      </p>
                      <mwc-button
                        raised
                        @click=${() =>
                          this.card.cardLifecycle.registerCard(this.card.hass)}
                        >${localize("ui.retry")}</mwc-button
                      >
                    </div>
                  </div>`
                : ""
            }
            ${
              showAnomalousOverlay
                ? html`<div class="chart-overlay anomalous-overlay">
                    <div>
                      <ha-icon icon="mdi:information-outline"></ha-icon>
                      <p>${localize("ui.check_configuration")}</p>
                    </div>
                  </div>`
                : ""
            }
            ${
              showAwaitingAutomationOverlay
                ? html`<div class="chart-overlay automation-overlay">
                    <div>
                      <ha-icon icon="mdi:sync" class="sync-icon"></ha-icon>
                      <p>${this.card.cardSync.getAwaitingAutomationText()}</p>
                      <div class="sync-details">
                        ${this.card.outOfSyncDetails}
                      </div>
                    </div>
                  </div>`
                : ""
            }
          </div>

          <div class="controls">
            ${
              this.card.config?.enabled_entity
                ? html`
                    <div class="control-group">
                      <ha-switch
                        .checked=${this.card.isEnabled}
                        @change=${(e) =>
                          this.card.eventHandlers.toggleEnabled(e)}
                      ></ha-switch>
                      <label>${localize("ui.automation_enabled")}</label>
                    </div>
                  `
                : ""
            }

            ${
              this.card.isStartup
                ? html`
                    <div class="control-group startup-wait">
                      <ha-circular-progress
                        active
                        size="small"
                      ></ha-circular-progress>
                      <span
                        style="font-size: 0.9em; opacity: 0.8; margin-left: 8px;"
                        >${this.card.language === "it"
                          ? "Avvio HA in corso..."
                          : "HA Starting..."}</span
                      >
                    </div>
                  `
                : this.card.profileOptions?.length > 0 && !isPreview
                  ? html`
                      <div class="control-group">
                        <ha-select
                          label="${localize("ui.select_profile")}"
                          .value=${this.card.selectedProfile}
                          @selected=${(e) => {
                            const val = e.target.value || e.detail?.value;
                            if (val && val !== this.card.selectedProfile) {
                              this.card.profileManager.handleProfileSelection({
                                target: { value: val },
                              });
                            }
                          }}
                          @closed=${(e) => e.stopPropagation()}
                        >
                          ${(this.card.profileOptions || [])
                            .filter(
                              (opt) =>
                                opt &&
                                opt !== "undefined" &&
                                opt !== "unavailable" &&
                                opt !== "unknown",
                            )
                            .map(
                              (opt) => html`
                                <mwc-list-item
                                  value="${opt}"
                                  .value=${opt}
                                  role="option"
                                  ?selected=${opt === this.card.selectedProfile}
                                  @click=${(e) => {
                                    // Redundant click handler to ensure selection and CLOSURE
                                    this.card.profileManager.handleProfileSelection(
                                      { target: { value: opt } },
                                    );

                                    // Aggressively close the menu
                                    const selectEl =
                                      e.target.closest("ha-select");
                                    if (selectEl) {
                                      selectEl.open = false;
                                      // Try mwc-select specific property if available
                                      if (selectEl.menuOpen !== undefined)
                                        selectEl.menuOpen = false;
                                      selectEl.blur();
                                      // Force focus away
                                      document.body.focus();
                                    }
                                  }}
                                  >${opt}</mwc-list-item
                                >
                              `,
                            )}
                        </ha-select>
                      </div>
                    `
                  : ""
            }
          </div>
        </div>

        ${
          this.card.showUnsavedChangesDialog
            ? html`
                <div class="dialog-overlay">
                  <div class="dialog-content">
                    <h3>
                      ⚠️
                      ${itRaised ? "Modifiche non salvate" : "Unsaved Changes"}
                    </h3>
                    <p>
                      ${itRaised
                        ? `Ci sono modifiche non salvate nel profilo '${this.card.profileManager.lastLoadedProfile || this.card.selectedProfile}'. Cosa vuoi fare?`
                        : `There are unsaved changes in profile '${this.card.profileManager.lastLoadedProfile || this.card.selectedProfile}'. What would you like to do?`}
                    </p>
                    <div class="dialog-buttons">
                      <mwc-button
                        raised
                        class="save-btn"
                        @click=${async () => {
                          await this.card.profileManager.saveProfile();
                          this.card.showUnsavedChangesDialog = false;
                          this.card.isMenuOpen = false;
                          this.card.keyboardHandler?.enable();
                          await this.card.profileManager.loadProfile(
                            this.card.pendingProfileChange,
                          );
                          this.card.selectedProfile =
                            this.card.pendingProfileChange;
                          this.card.requestUpdate();
                        }}
                      >
                        💾 Save
                      </mwc-button>
                      <mwc-button
                        raised
                        class="discard-btn"
                        @click=${async () => {
                          this.card.showUnsavedChangesDialog = false;
                          this.card.hasUnsavedChanges = false;
                          this.card.isMenuOpen = false;
                          this.card.keyboardHandler?.enable();
                          await this.card.profileManager.loadProfile(
                            this.card.pendingProfileChange,
                          );
                          this.card.selectedProfile =
                            this.card.pendingProfileChange;
                          this.card.requestUpdate();
                        }}
                      >
                        🗑️ Yes (Discard)
                      </mwc-button>
                      <mwc-button
                        @click=${() => {
                          this.card.showUnsavedChangesDialog = false;
                          this.card.pendingProfileChange = null;
                          this.card.requestUpdate();
                        }}
                      >
                        Cancel
                      </mwc-button>
                    </div>
                  </div>
                </div>
              `
            : ""
        }
</ha-card>
    `;
  }
}
