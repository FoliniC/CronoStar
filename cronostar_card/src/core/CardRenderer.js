import { html } from 'lit';
import { CARD_CONFIG_PRESETS, TIMEOUTS } from '../config.js';
import { Logger } from '../utils.js';

export class CardRenderer {
  constructor(card) {
    this.card = card;
  }

  render() {
    if (!this.card.config) return html``;

    const isEditor = this.card.cardLifecycle.isEditorContext();
    const localize = (key, search, replace) => this.card.localizationManager.localize(this.card.language, key, search, replace);
    const title = this.card.config?.title || localize('ui.title');

    const enRaised = this.card.language === 'en';
    const itRaised = this.card.language === 'it';

    const isMenuVisible = this.card.isMenuOpen && !isEditor;

    // --- Overlay Logic ---
    const isPreview = this.card.isPreview;
    const isWaitingForData = !isEditor && !isPreview && !this.card.initialLoadComplete;
    const showStartupOverlay = !isEditor && !isPreview && this.card.initialLoadComplete && !this.card.cronostarReady;
    const showMissingEntitiesDetailsOverlay = !isEditor && !isPreview && !this.card.cronostarReady && this.card.missingEntities.length > 0 && this.card.initialLoadComplete;
    const showAnomalousOverlay = !isEditor && !isPreview && this.card.missingEntities.length > 0 && this.card.initialLoadComplete;
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
      (!this.card.lastEditAt || (Date.now() - this.card.lastEditAt) >= TIMEOUTS.editingGraceMs);

    return html`
      <ha-card @click=${(e) => this.card.eventHandlers.handleCardClick(e)}>
        <div class="card-header">
          <div class="header-left">
            <ha-icon icon="mdi:star-clock" class="star-icon"></ha-icon>
            <div class="title">${title}</div>
          </div>
          <div class="header-right">
            ${this.card.isPaused ? html`<ha-icon icon="mdi:pause-circle" class="pause-indicator" title="Automation Paused"></ha-icon>` : ''}
            <div class="menu-container">
              <button class="menu-button" @click=${(e) => this.card.eventHandlers.toggleMenu(e)}>
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>
            </div>
          </div>
        </div>

        ${isMenuVisible ? html`
          <div class="menu-content" @click=${(e) => e.stopPropagation()}>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleApplyNow()}>${localize('menu.apply_now')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleSelectAll()}>${localize('menu.select_all')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignLeft()}>${localize('menu.align_left', 'Align Left')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignRight()}>${localize('menu.align_right', 'Align Right')}</mwc-list-item>
            
            ${!isPreview ? html`
              <mwc-list-item @click=${() => this.card.handleAddProfile()}>${localize('menu.add_profile')}</mwc-list-item>
              <mwc-list-item .disabled=${!this.card.selectedProfile} @click=${() => this.card.handleDeleteProfile()}>${localize('menu.delete_profile')}</mwc-list-item>
            ` : ''}

            <mwc-list-item @click=${() => this.card.eventHandlers.handleHelp()}>${localize('menu.help')}</mwc-list-item>
            <div class="menu-item-with-switch" @click=${(e) => e.stopPropagation()}>
              <span>${localize('menu.enable_logging')}</span>
              <ha-switch
                .checked=${this.card.loggingEnabled}
                @change=${(e) => this.card.eventHandlers.handleLoggingToggle(e)}
              ></ha-switch>
            </div>

            ${!isPreview ? html`
              <div class="menu-item-with-select">
                <ha-select
                  label="${localize('menu.select_preset')}"
                  .value=${this.card.selectedPreset}
                  @selected=${(e) => this.card.eventHandlers.handlePresetChange(e)}
                >
                  ${Object.keys(CARD_CONFIG_PRESETS).map(
                    (presetKey) => html`<mwc-list-item .value=${presetKey}>${localize(`preset.${presetKey}`)}</mwc-list-item>`
                  )}
                </ha-select>
              </div>
            ` : ''}

            <div class="language-menu">
              <button class="lang-btn ${itRaised ? 'active' : ''}" @click=${() => this.card.eventHandlers.handleLanguageSelect('it')}>IT</button>
              <button class="lang-btn ${enRaised ? 'active' : ''}" @click=${() => this.card.eventHandlers.handleLanguageSelect('en')}>EN</button>
            </div>
          </div>
        ` : ''}

        <div class="card-content">
          <div class="chart-container" 
               tabindex="0"
               @pointermove=${(e) => this.card.selectionManager.handlePointerMove(e)}
               @pointerdown=${(e) => this.card.selectionManager.handlePointerDown(e)}
               @pointerup=${(e) => this.card.selectionManager.handlePointerUp(e)}>
            <canvas id="myChart"></canvas>
            <div id="drag-value-display" class="chart-tooltip"></div>
            <div id="hover-value-display" class="chart-tooltip hover-tooltip"></div>
            <div id="selection-rect" class="selection-rect"></div>

            ${isWaitingForData ? html`<div class="chart-overlay loading-overlay"><div><ha-circular-progress active></ha-circular-progress><p>${localize('ui.loading_data')}</p></div></div>` : ''}
            ${showStartupOverlay ? html`<div class="chart-overlay loading-overlay"><div><ha-circular-progress active></ha-circular-progress><p>${localize('ui.starting_backend')}</p></div></div>` : ''}
            ${showMissingEntitiesDetailsOverlay ? html`<div class="chart-overlay error-overlay"><div><ha-icon icon="mdi:alert-circle"></ha-icon><p>${localize('ui.missing_entities')}: ${this.card.missingEntities.join(', ')}</p><mwc-button raised @click=${() => this.card.cardLifecycle.registerCard(this.card.hass)}>${localize('ui.retry')}</mwc-button></div></div>` : ''}
            ${showAnomalousOverlay ? html`<div class="chart-overlay anomalous-overlay"><div><ha-icon icon="mdi:information-outline"></ha-icon><p>${localize('ui.check_configuration')}</p></div></div>` : ''}
            ${showAwaitingAutomationOverlay ? html`<div class="chart-overlay automation-overlay"><div><ha-icon icon="mdi:sync" class="sync-icon"></ha-icon><p>${this.card.cardSync.getAwaitingAutomationText()}</p><div class="sync-details">${this.card.outOfSyncDetails}</div></div></div>` : ''}
          </div>

          <div class="controls">
            ${this.card.config?.pause_entity ? html`
              <div class="control-group">
                <ha-switch
                  .checked=${!this.card.isPaused}
                  @change=${(e) => this.card.eventHandlers.togglePause(e)}
                ></ha-switch>
                <label>${localize('ui.automation_enabled')}</label>
              </div>
            ` : ''}

            ${this.card.profileOptions?.length > 0 && !isPreview ? html`
              <div class="control-group">
                <ha-select
                  label="${localize('ui.select_profile')}"
                  .value=${this.card.selectedProfile}
                  @selected=${(e) => this.card.profileManager.handleProfileSelection(e)}
                >
                  ${this.card.profileOptions.map(
                    (opt) => html`<mwc-list-item .value=${opt}>${opt}</mwc-list-item>`
                  )}
                </ha-select>
              </div>
            ` : ''}
          </div>
        </div>

        ${this.card.showUnsavedChangesDialog ? html`
          <div class="dialog-overlay">
            <div class="dialog-content">
              <h3>⚠️ ${itRaised ? 'Modifiche non salvate' : 'Unsaved Changes'}</h3>
              <p>
                ${itRaised 
                  ? `Ci sono modifiche non salvate nel profilo '${this.card.profileManager.lastLoadedProfile || this.card.selectedProfile}'. Cosa vuoi fare?`
                  : `There are unsaved changes in profile '${this.card.profileManager.lastLoadedProfile || this.card.selectedProfile}'. What would you like to do?`}
              </p>
              <div class="dialog-buttons">
                <mwc-button raised class="save-btn" @click=${async () => {
                  await this.card.profileManager.saveProfile();
                  this.card.showUnsavedChangesDialog = false;
                  await this.card.profileManager.loadProfile(this.card.pendingProfileChange);
                  this.card.selectedProfile = this.card.pendingProfileChange;
                  this.card.requestUpdate();
                }}>
                  💾 Save
                </mwc-button>
                <mwc-button raised class="discard-btn" @click=${async () => {
                  this.card.showUnsavedChangesDialog = false;
                  this.card.hasUnsavedChanges = false;
                  await this.card.profileManager.loadProfile(this.card.pendingProfileChange);
                  this.card.selectedProfile = this.card.pendingProfileChange;
                  this.card.requestUpdate();
                }}>
                  🗑️ Yes (Discard)
                </mwc-button>
                <mwc-button @click=${() => {
                  this.card.showUnsavedChangesDialog = false;
                  this.card.pendingProfileChange = null;
                  this.card.requestUpdate();
                }}>
                  Cancel
                </mwc-button>
              </div>
            </div>
          </div>
        ` : ''}
      </ha-card>

      <style>
        /* Dialog Styles */
        .dialog-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7); display: flex; align-items: center;
          justify-content: center; z-index: 10000; padding: 20px;
        }
        .dialog-content {
          background: var(--card-background-color, white);
          border-radius: 12px; padding: 24px; max-width: 450px; width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); border: 1px solid var(--divider-color);
        }
        .dialog-content h3 { margin-top: 0; color: var(--primary-text-color); }
        .dialog-content p { color: var(--secondary-text-color); margin-bottom: 24px; line-height: 1.5; }
        .dialog-buttons { display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
        .save-btn { --mdc-theme-primary: var(--primary-color); }
        .discard-btn { --mdc-theme-primary: var(--error-color, #ef4444); }

        /* Existing Styles... */
        ha-card { position: relative; padding: 16px; height: 100%; display: flex; flex-direction: column; overflow: visible; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .header-left { display: flex; align-items: center; gap: 8px; }
        .star-icon { color: var(--primary-color); }
        .title { font-weight: bold; font-size: 1.1em; color: var(--primary-text-color); }
        .pause-indicator { color: var(--warning-color, #ffa600); margin-right: 8px; }
        .menu-container { position: relative; }
        .menu-button { background: none; border: none; cursor: pointer; color: var(--primary-text-color); padding: 4px; border-radius: 50%; display: flex; transition: background 0.2s; }
        .menu-button:hover { background: var(--secondary-background-color); }
        .menu-content { position: absolute; top: 100%; right: 0; width: 220px; background: var(--card-background-color, white); border: 1px solid var(--divider-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); z-index: 1000; overflow: hidden; padding: 8px 0; }
        .menu-item-with-switch, .menu-item-with-select { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; color: var(--primary-text-color); font-size: 14px; }
        .menu-item-with-select ha-select { width: 100%; }
        .language-menu { display: flex; justify-content: center; gap: 8px; padding: 8px 16px; border-top: 1px solid var(--divider-color); margin-top: 4px; }
        .lang-btn { background: none; border: 1px solid var(--divider-color); color: var(--secondary-text-color); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .lang-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
        .card-content { flex: 1; display: flex; flex-direction: column; min-height: 250px; }
        .chart-container { position: relative; flex: 1; min-height: 200px; cursor: crosshair; outline: none; }
        canvas { width: 100% !important; height: 100% !important; }
        .chart-tooltip { position: absolute; pointer-events: none; background: rgba(0, 0, 0, 0.8); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; z-index: 10; display: none; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        .hover-tooltip { background: rgba(50, 50, 50, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); }
        .selection-rect { position: absolute; pointer-events: none; border: 1px solid var(--primary-color); background: rgba(3, 169, 244, 0.1); display: none; z-index: 5; }
        .chart-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; z-index: 20; text-align: center; border-radius: 4px; }
        .loading-overlay { background: rgba(var(--rgb-card-background-color, 255, 255, 255), 0.7); backdrop-filter: blur(2px); }
        .error-overlay { background: rgba(244, 67, 54, 0.1); color: var(--error-color, #f44336); }
        .automation-overlay { background: rgba(33, 150, 243, 0.05); pointer-events: none; }
        .sync-icon { font-size: 40px; color: var(--primary-color); animation: spin 4s linear infinite; opacity: 0.3; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .controls { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; align-items: center; }
        .control-group { display: flex; align-items: center; gap: 8px; }
        .control-group label { font-size: 13px; color: var(--secondary-text-color); }
        ha-select { --mdc-theme-primary: var(--primary-color); min-width: 150px; }
      </style>
    `;
  }
}