import { html } from 'lit';
import { CARD_CONFIG_PRESETS, TIMEOUTS, VERSION } from '../config.js';

export class CardRenderer {
  constructor(card) {
    this.card = card;
  }

  render() {
    if (!this.card.config) return html``;

    const localize = (key, search, replace) => this.card.localizationManager.localize(this.card.language, key, search, replace);
    
    // ✅ IMPROVED: Dynamic title logic
    let title = this.card.config?.title;
    if (!title) {
      const preset = this.card.selectedPreset || this.card.config?.preset_type || 'thermostat';
      const presetName = localize(`preset.${preset}`);
      title = `${localize('ui.title')} ${presetName}`;

      // Append custom part of prefix if present
      const prefix = this.card.config?.global_prefix || '';
      const basePrefix = `cronostar_${preset}_`;
      if (prefix.startsWith(basePrefix) && prefix.length > basePrefix.length) {
        const suffix = prefix.substring(basePrefix.length).replace(/_+$/, '').replace(/_/g, ' ');
        if (suffix) {
          title = `${title} ${suffix}`;
        }
      }
    }

    // ✅ FIX: Fallback if global_prefix is missing (New card state)
    if (!this.card.config?.global_prefix) {
      return html`
        <ha-card @click=${(e) => this.card.eventHandlers.handleCardClick(e)}>
          <div class="card-header">
            <div class="header-left">
              <img src="/cronostar_card/cronostar-logo.png" class="header-logo" alt="CronoStar">
              <div class="title">${title}</div>
            </div>
          </div>
          <div style="padding: 24px; text-align: center; color: var(--secondary-text-color);">
            <ha-icon icon="mdi:cog-transfer-outline" style="--mdc-icon-size: 48px; opacity: 0.5; margin-bottom: 16px;"></ha-icon>
            <p style="font-size: 1.1em; font-weight: 500; margin: 0 0 8px 0; color: var(--primary-text-color);">
              ${this.card.language === 'it' ? 'Configurazione Incompleta' : 'Configuration Incomplete'}
            </p>
            <p style="margin: 0; font-size: 0.9em;">
              ${this.card.language === 'it' 
                ? 'Usa l\'editor per impostare il prefisso e l\'entità di destinazione.' 
                : 'Please use the card editor to set the identification prefix and target entity.'}
            </p>
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
      const img = this.card.config?.preview_image || '/cronostar_card/cronostar-preview.png';
      return html`
        <ha-card style="padding: 16px; text-align: center;">
          <img alt="CronoStar preview" src="${img}" style="display:block;max-width:100%;height:auto;border-radius:12px;box-shadow: var(--ha-card-box-shadow, 0 2px 2px 0 rgba(0,0,0,0.14), 0 1px 5px 0 rgba(0,0,0,0.12), 0 3px 1px -2px rgba(0,0,0,0.2));" />
        </ha-card>
      `;
    }

    const enRaised = this.card.language === 'en';
    const itRaised = this.card.language === 'it';

    const isMenuVisible = this.card.isMenuOpen;

    // Overlay Logic
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

    const isAnyExpanded = this.card.isExpandedV || this.card.isExpandedH;

    return html`
      <ha-card class="${this.card.isExpandedV ? 'expanded-v' : ''} ${this.card.isExpandedH ? 'expanded-h' : ''}" @click=${(e) => this.card.eventHandlers.handleCardClick(e)}>
        <div class="card-header">
          <div class="header-left">
            <img src="/cronostar_card/cronostar-logo.png" class="header-logo" alt="CronoStar">
            <div class="title">
              ${title}
              <span style="font-size: 0.8em; opacity: 0.7; margin-left: 8px;">v${VERSION}</span>
            </div>
          </div>
            ${isAnyExpanded ? html`
              <ha-icon-button @click=${(e) => {
          e.stopPropagation();
          this.card.isExpandedV = false;
          this.card.isExpandedH = false;
          this.card.requestUpdate();
        }} title="Minimize">
                <ha-icon icon="mdi:arrow-collapse"></ha-icon>
              </ha-icon-button>
            ` : html`
              <ha-icon-button @click=${(e) => {
          e.stopPropagation();
          this.card.isExpandedV = true;
          this.card.isExpandedH = true;
          this.card.requestUpdate();
        }} title="Expand">
                <ha-icon icon="mdi:arrow-expand"></ha-icon>
              </ha-icon-button>
            `}
            ${!this.card.isEnabled ? html`<ha-icon icon="mdi:pause-circle" class="pause-indicator" title="Automation Disabled"></ha-icon>` : ''}
            <div class="menu-container">
              <button class="menu-button" @click=${(e) => this.card.eventHandlers.toggleMenu(e)}>
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>
            </div>
          </div>
        </div>

        ${isMenuVisible ? html`
          <div class="menu-content" @click=${(e) => e.stopPropagation()}>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleApplyNow()}>
              <ha-icon icon="mdi:check-circle-outline"></ha-icon>
              ${localize('menu.apply_now')}
            </mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleSelectAll()}>
              <ha-icon icon="mdi:select-all"></ha-icon>
              ${localize('menu.select_all')}
            </mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignLeft()}>
              <ha-icon icon="mdi:align-horizontal-left"></ha-icon>
              ${localize('menu.align_left', 'Align Left')}
            </mwc-list-item>
            <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignRight()}>
              <ha-icon icon="mdi:align-horizontal-right"></ha-icon>
              ${localize('menu.align_right', 'Align Right')}
            </mwc-list-item>
            
            ${!isPreview ? html`
              <mwc-list-item @click=${() => this.card.handleAddProfile()}>
                <ha-icon icon="mdi:plus-circle-outline"></ha-icon>
                ${localize('menu.add_profile')}
              </mwc-list-item>
              <mwc-list-item .disabled=${!this.card.selectedProfile} @click=${() => this.card.handleDeleteProfile()}>
                <ha-icon icon="mdi:delete-outline"></ha-icon>
                ${localize('menu.delete_profile')}
              </mwc-list-item>
            ` : ''}

            <mwc-list-item @click=${() => this.card.eventHandlers.handleHelp()}>
              <ha-icon icon="mdi:help-circle-outline"></ha-icon>
              ${localize('menu.help')}
            </mwc-list-item>
            <div class="menu-item-with-switch" @click=${(e) => e.stopPropagation()}>
              <div style="display: flex; align-items: center; gap: 8px;">
                <ha-icon icon="mdi:console-line"></ha-icon>
                <span>${localize('menu.enable_logging')}</span>
              </div>
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
              <span style="font-size: 12px; color: var(--secondary-text-color); margin-right: 4px;">${localize('menu.language')}:</span>
              <ha-icon icon="mdi:translate" style="margin-right: 8px; --mdc-icon-size: 16px;"></ha-icon>
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

            ${this.card.contextMenu?.show ? html`
              <div class="context-menu" style="left: ${this.card.contextMenu.x}px; top: ${this.card.contextMenu.y}px;" @click=${(e) => e.stopPropagation()}>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleDeleteSelected()}>
                  <ha-icon icon="mdi:delete"></ha-icon>
                  ${localize('menu.delete_selected')}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignLeft()}>
                  <ha-icon icon="mdi:align-horizontal-left"></ha-icon>
                  ${localize('menu.align_left')}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleAlignRight()}>
                  <ha-icon icon="mdi:align-horizontal-right"></ha-icon>
                  ${localize('menu.align_right')}
                </mwc-list-item>
                <mwc-list-item @click=${() => this.card.eventHandlers.handleSelectAll()}>
                  <ha-icon icon="mdi:select-all"></ha-icon>
                  ${localize('menu.select_all')}
                </mwc-list-item>
                <li divider role="separator"></li>
                <mwc-list-item @click=${() => { this.card.contextMenu = { ...this.card.contextMenu, show: false }; this.card.requestUpdate(); }}>
                  <ha-icon icon="mdi:close"></ha-icon>
                  ${localize('menu.close_menu')}
                </mwc-list-item>
              </div>
            ` : ''}

            ${isWaitingForData ? html`<div class="chart-overlay loading-overlay"><div><ha-circular-progress active></ha-circular-progress><p>${localize('ui.loading_data')}</p></div></div>` : ''}
            ${showStartupOverlay ? html`<div class="chart-overlay loading-overlay"><div><ha-circular-progress active></ha-circular-progress><p>${localize('ui.starting_backend')}</p></div></div>` : ''}
            ${showMissingEntitiesDetailsOverlay ? html`<div class="chart-overlay error-overlay"><div><ha-icon icon="mdi:alert-circle"></ha-icon><p>${localize('ui.missing_entities')}: ${this.card.missingEntities.join(', ')}</p><mwc-button raised @click=${() => this.card.cardLifecycle.registerCard(this.card.hass)}>${localize('ui.retry')}</mwc-button></div></div>` : ''}
            ${showAnomalousOverlay ? html`<div class="chart-overlay anomalous-overlay"><div><ha-icon icon="mdi:information-outline"></ha-icon><p>${localize('ui.check_configuration')}</p></div></div>` : ''}
            ${showAwaitingAutomationOverlay ? html`<div class="chart-overlay automation-overlay"><div><ha-icon icon="mdi:sync" class="sync-icon"></ha-icon><p>${this.card.cardSync.getAwaitingAutomationText()}</p><div class="sync-details">${this.card.outOfSyncDetails}</div></div></div>` : ''}
          </div>

          <div class="controls">
            ${this.card.config?.enabled_entity ? html`
              <div class="control-group">
                <ha-switch
                  .checked=${this.card.isEnabled}
                  @change=${(e) => this.card.eventHandlers.toggleEnabled(e)}
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
    `;
  }
}