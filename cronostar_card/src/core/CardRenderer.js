import { html } from 'lit';
import { VERSION, CARD_CONFIG_PRESETS, TIMEOUTS } from '../config.js';
import { Logger } from '../utils.js';

export class CardRenderer {
  constructor(card) {
    this.card = card;
  }

  render() {
    const isEditor = this.card.cardLifecycle.isEditorContext();
    const localize = (key, search, replace) => this.card.localizationManager.localize(this.card.language, key, search, replace);
    const title = this.card.config?.title || localize('ui.title');

    const enRaised = this.card.language === 'en';
    const itRaised = this.card.language === 'it';

    // --- Overlay Logic ---
    const isWaitingForData = !isEditor && !this.card.initialLoadComplete;
    const showStartupOverlay = !isEditor && this.card.initialLoadComplete && !this.card.cronostarReady;
    const showMissingEntitiesDetailsOverlay = !isEditor && !this.card.cronostarReady && this.card.missingEntities.length > 0 && this.card.initialLoadComplete;
    const showAnomalousOverlay = !isEditor && this.card.missingEntities.length > 0 && this.card.initialLoadComplete;
    const showAwaitingAutomationOverlay =
      !isEditor &&
      !isWaitingForData &&
      !showStartupOverlay &&
      !showMissingEntitiesDetailsOverlay &&
      this.card.awaitingAutomation &&
      this.card.initialLoadComplete &&
      !this.card.hasUnsavedChanges &&
      !this.card.isDragging &&
      Date.now() >= this.card.overlaySuppressionUntil &&
      (!this.card.lastEditAt || (Date.now() - this.card.lastEditAt) >= TIMEOUTS.editingGraceMs);

    Logger.log('UI_RENDER', `[CronoStar] Rendering Overlays Check:
         - isWaitingForData: ${isWaitingForData} (initialLoadComplete: ${this.card.initialLoadComplete})
         - showStartupOverlay: ${showStartupOverlay} (initialLoadComplete: ${this.card.initialLoadComplete}, cronostarReady: ${this.card.cronostarReady})
         - showMissingEntitiesDetailsOverlay: ${showMissingEntitiesDetailsOverlay}
         - showAwaitingAutomationOverlay: ${showAwaitingAutomationOverlay} (awaitingAutomation: ${this.card.awaitingAutomation})
        `);

    if (showStartupOverlay && !this.card._startupOverlayState) {
      Logger.log('UI', `[CronoStar] STARTUP_OVERLAY (${this.card.selectedPreset}): State changed to ACTIVE (waiting for backend).`);
    } else if (!showStartupOverlay && this.card._startupOverlayState) {
      Logger.log('UI', `[CronoStar] STARTUP_OVERLAY (${this.card.selectedPreset}): State changed to INACTIVE (backend ready).`);
    }
    this.card._startupOverlayState = showStartupOverlay;

    return html`
      <ha-card @click=${(e) => this.card.eventHandlers.handleCardClick(e)}>
        <div class="card-header">
          <div class="name">${title} (v${VERSION})</div>
          <button class="menu-button" @click=${(e) => this.card.eventHandlers.toggleMenu(e)}>
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
            </svg>
          </button>
        </div>

        ${this.card.isMenuOpen ? html`
          <div class="menu-content" @click=${(e) => e.stopPropagation()}>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleApplyNow()}>${localize('menu.apply_now')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleSelectAll()}>${localize('menu.select_all')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignLeft()}>${localize('menu.align_left', 'Align Left')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignRight()}>${localize('menu.align_right', 'Align Right')}</mwc-list-item>
            <!-- Use card wrappers to avoid runtime "not a function" if bundler caches an old eventHandlers -->
            <mwc-list-item @click=${() => this.card.handleAddProfile()}>${localize('menu.add_profile')}</mwc-list-item>
            <mwc-list-item .disabled=${!this.card.selectedProfile} @click=${() => this.card.handleDeleteProfile()}>${localize('menu.delete_profile')}</mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleHelp()}>${localize('menu.help')}</mwc-list-item>
            <div class="menu-item-with-switch" @click=${(e) => e.stopPropagation()}>
              <span>${localize('menu.enable_logging')}</span>
              <ha-switch
                .checked=${this.card.loggingEnabled}
                @change=${(e) => this.card.eventHandlers.handleLoggingToggle(e)}
              ></ha-switch>
            </div>
            <div class="menu-item-with-select">
              <ha-select
                label="${localize('menu.select_preset')}"
                .value=${this.card.selectedPreset}
                @selected=${(e) => this.card.eventHandlers.handlePresetChange(e)}
                @opened=${() => {
          this.card.keyboardHandler.disable();
          this.card.suppressClickUntil = Date.now() + TIMEOUTS.menuSuppression;
        }}
                @closed=${() => {
          this.card.keyboardHandler.enable();
          this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;
        }}
              >
                ${Object.keys(CARD_CONFIG_PRESETS).map(
          (presetKey) => html`<mwc-list-item .value=${presetKey}>${localize(`preset.${presetKey}`)}</mwc-list-item>`
        )}
              </ha-select>
            </div>
            <div class="language-menu">
              <mwc-list-item>${localize('menu.language')}</mwc-list-item>
              <mwc-button
                ?raised=${enRaised}
                style="${enRaised ? 'border: 2px solid var(--primary-color, #03a9f4);' : ''}"
                @click=${() => this.card.eventHandlers.handleLanguageSelect('en')}
              >EN</mwc-button>
              <mwc-button
                ?raised=${itRaised}
                style="${itRaised ? 'border: 2px solid var(--primary-color, #03a9f4);' : ''}"
                @click=${() => this.card.eventHandlers.handleLanguageSelect('it')}
              >IT</mwc-button>
            </div>
          </div>
        ` : ''}

        <div class="card-content">
          <div class="chart-container" tabindex="${isEditor ? '-1' : '0'}">
            ${isWaitingForData
        ? html`<div class="loading-overlay"><div>${localize('ui.loading')}</div></div>`
        : (!isEditor && this.card.initialLoadComplete && this.card.missingEntities.length > 0)
          ? html`<div class="loading-overlay anomalous-operation-overlay">
                        <div>
                            <div>${localize('ui.create_missing_entities_message')}</div>
                        </div>
                        </div>`
          : showStartupOverlay
            ? html`<div class="loading-overlay startup-overlay">
                            <div>
                            <div>${localize('ui.waiting_ha_start')}</div>
                            <div>${localize('ui.waiting_profile_restore')}</div>
                            </div>
                        </div>`
            : ''}

            ${showAwaitingAutomationOverlay && !showAnomalousOverlay
        ? html`<div class="loading-overlay awaiting-automation-overlay" style="pointer-events:none;">
                  <div>${this.card.cardSync.getAwaitingAutomationText()}</div>
                  ${this.card.outOfSyncDetails ? html`<div class="details">${this.card.outOfSyncDetails}</div>` : ''}
                </div>`
        : ''}

            <canvas id="myChart"></canvas>

            ${showAnomalousOverlay
        ? html`<div class="anomalous-watermark">${localize('ui.anomalous_operation_watermark')}</div>`
        : showStartupOverlay
          ? html`<div class="startup-watermark">${localize('ui.startup_watermark')}</div>`
          : showAwaitingAutomationOverlay
            ? html`<div class="anomalous-watermark" style="pointer-events:none;">Automation pending</div>`
            : ''}

            <div id="selection-rect" class="selection-rect"></div>
            <div id="drag-value-display" class="drag-value-display"></div>
            <div id="hover-value-display" class="drag-value-display" style="display:none"></div>
          </div>

          <div class="controls">
            ${this.card.config?.pause_entity ? html`
              <div class="control-group">
                <ha-switch
                  .checked=${this.card.isPaused}
                  @change=${(e) => this.card.eventHandlers.togglePause(e)}
                ></ha-switch>
                <span>${localize('ui.pause')}</span>
              </div>
            ` : ''}

            ${this.card.config?.profiles_select_entity ? html`
              <div class="control-group">
                <ha-select
                  label="${localize('ui.profile')}"
                  .value=${this.card.selectedProfile}
                  @selected=${(e) => this.card.profileManager.handleProfileSelection(e)}
                  @opened=${() => {
          this.card.keyboardHandler.disable();
          this.card.suppressClickUntil = Date.now() + 1000;
        }}
                  @closed=${() => {
          this.card.keyboardHandler.enable();
          const container = this.card.shadowRoot.querySelector(".chart-container");
          if (container && !isEditor) {
            container.focus();
          }
          this.card.suppressClickUntil = Date.now() + 500;
        }}
                >
                  ${this.card.profileOptions && this.card.profileOptions.length > 0
          ? this.card.profileOptions.map(
            (option) => html`<mwc-list-item .value=${option}>${option}</mwc-list-item>`
          )
          : html`<mwc-list-item disabled>No profiles found</mwc-list-item>`
        }
                </ha-select>
              </div>
            ` : ''}

            ${this.card.hasUnsavedChanges ? html`
              <div class="control-group">
                <span class="unsaved-indicator">● ${localize('ui.unsaved_changes')}</span>
                <mwc-button outlined @click=${() => this.card.profileManager.resetChanges()}>
                  ${localize('ui.reset')}
                </mwc-button>
              </div>
            ` : ''}
          </div>
        </div>
      </ha-card>
    `;
  }
}  