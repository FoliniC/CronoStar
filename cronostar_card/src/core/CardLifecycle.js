import { Logger } from '../utils.js';
import { validateConfig, VERSION, extractCardConfig } from '../config.js';

export class CardLifecycle {
  constructor(card) {
    this.card = card;
    this.hasRegistered = false;

    // When HA changes view/cards, the element may remain connected but become hidden.
    // We use IntersectionObserver to detect re-visibility and force a safe chart rebuild.
    this._visibilityObserver = null;
    this._lastVisible = null;

    // spam guards
    this.loggedProfileSelectEntityMissing = false;
    this.loggedPauseEntityMissing = false;

    if (typeof window !== 'undefined') {
      if (!window.cronostarpausewarned) window.cronostarpausewarned = new Set();
    }
  }

  setConfig(config) {
    Logger.log('CONFIG', 'CronoStar setConfig config received:', config);

    // Close menu when configuration changes (typically when entering editor)
    this.card.isMenuOpen = false;

    try {
      this.card.config = validateConfig(config);
      Logger.log('CONFIG', 'CronoStar setConfig validated config:', this.card.config);

      this.card.loggingEnabled = this.card.config.logging_enabled !== false;
      Logger.setEnabled(this.card.loggingEnabled);
      Logger.log('LOG', 'CronoStar Logging enabled:', this.card.loggingEnabled);

      this.card.selectedPreset = this.card.config.preset;

      const hourBaseConfig = this.card.config.hour_base;
      if (typeof hourBaseConfig === 'object') {
        this.card.hourBase = hourBaseConfig.value;
        this.card.hourBaseDetermined = hourBaseConfig.determined;
      } else {
        this.card.hourBase = 0;
        this.card.hourBaseDetermined = true;
      }

      // Sparse mode: no interval-based resizing or grid sanitization
    } catch (e) {
      Logger.error('CONFIG', 'CronoStar Error in setConfig:', e);
      this.card.eventHandlers?.showNotification?.(
        this.card.localizationManager?.localize?.(this.card.language, 'error.configerror', e.message) ||
        `Config error: ${e.message}`,
        'error',
      );
    }
  }

  updated(changed) {
    if (changed.has('config')) {
      try {
        if (this.card.chartManager?.isInitialized()) {
          this.card.chartManager.recreateChartOptions();

          const chart = this.card.chartManager.getChart?.();
          if (chart && chart.options?.scales?.y) {
            chart.options.scales.y.min = this.card.config.min_value;
            chart.options.scales.y.max = this.card.config.max_value;
            chart.update();
          }
          this.card.chartManager.updateChartLabels?.();
        }
      } catch (e) {
        Logger.warn('UPDATE', 'CronoStar updated(config) chart refresh failed:', e);
      }
    }
  }

  setHass(hass) {
    if (!hass) {
      Logger.warn('HASS', 'CronoStar Received null hass object');
      return;
    }

    try {
      // Store hass safely for getters and internal usage
      this._hass = hass;
      const card = this.card;

      if (card.isPreview) {
        if (!card.languageInitialized && hass.language) {
          card.language = hass.language;
          card.languageInitialized = true;
          Logger.log('LANG', 'CronoStar (Preview) Language initialized to:', card.language);
        }
        return;
      }

      // IMPORTANT: do NOT assign this.card.hass = hass here, to avoid recursion with CronoStarCard.set hass.
      // Use the passed-in hass for all reads/writes instead.

      if (!card.languageInitialized && hass.language) {
        card.language = hass.language;
        card.languageInitialized = true;
        Logger.log('LANG', 'CronoStar Language initialized to:', card.language);
      }

      if (this.isEditorContext()) return;

      // mark ready when backend service exists
      if (!card.cronostarReady) {
        // Support both apply_now (snake) and legacy applynow (no underscore)
        if (hass.services?.cronostar?.apply_now || hass.services?.cronostar?.applynow) {
          Logger.log('LOAD', 'CronoStar Backend service found, considering it ready.');
          card.cronostarReady = true;
          card.requestUpdate();
        }
      }

      // Register the card with backend as soon as the service is available
      if (!this.hasRegistered && hass.services?.cronostar && (hass.services.cronostar.register_card || hass.services.cronostar.registercard)) {
        this.registerCard(hass).catch((e) => {
          Logger.warn('LOAD', 'CronoStar register_card call failed:', e);
        });
      }

      // pause entity check (spam-free)
      if (card.config?.pause_entity) {
        const pauseId = card.config.pause_entity;
        const pauseStateObj = hass.states[pauseId];
        if (pauseStateObj) {
          card.isPaused = pauseStateObj.state === 'on';
          this.loggedPauseEntityMissing = false;
        } else {
          let alreadyWarnedGlobally = false;
          if (typeof window !== 'undefined' && window.cronostarpausewarned instanceof Set) {
            alreadyWarnedGlobally = window.cronostarpausewarned.has(pauseId);
          }
          if (!this.loggedPauseEntityMissing && !alreadyWarnedGlobally) {
            Logger.warn('HASS', 'CronoStar Pause entity not found:', pauseId);
            if (typeof window !== 'undefined' && window.cronostarpausewarned instanceof Set) {
              window.cronostarpausewarned.add(pauseId);
            }
            this.loggedPauseEntityMissing = true;
          }
        }
      }

      // profiles select entity read
      if (card.config?.profiles_select_entity) {
        const selId = card.config.profiles_select_entity;
        const selObj = hass.states[selId];
        if (selObj) {
          this.loggedProfileSelectEntityMissing = false;
          const newProfile = selObj.state;
          const newOptions = selObj.attributes?.options;

          if (JSON.stringify(card.profileOptions) !== JSON.stringify(newOptions)) {
            card.profileOptions = newOptions;
            Logger.log('HASS', 'CronoStar Profile options updated:', newOptions?.length, 'profiles');
          }

          if (newProfile && newProfile !== card.selectedProfile) {
            card.selectedProfile = newProfile;
            Logger.log('HASS', 'CronoStar Selected profile updated:', newProfile);

            if (!card.hasUnsavedChanges) {
              card.profileManager?.loadProfile?.(newProfile).catch((e) => {
                Logger.warn('LOAD', 'Profile load failed:', e);
              });
            }
          }
        } else if (!this.loggedProfileSelectEntityMissing) {
          Logger.warn('HASS', 'CronoStar Profile select entity not found:', selId);
          this.loggedProfileSelectEntityMissing = true;
        }
      }

      // periodic sync check
      card.cardSync?.updateAutomationSync?.(hass);
      if (!card.syncCheckTimer) {
        card.syncCheckTimer = setInterval(() => {
          if (!card._cardConnected) return;
          card.cardSync?.updateAutomationSync?.(hass);

          // Redraw chart to update current time indicator
          if (card.chartManager?.isInitialized()) {
            card.chartManager.update('none');
          }
        }, 5000);
      }
    } catch (err) {
      Logger.error('HASS', 'CronoStar Error in setHass:', err);
    }
  }

  connectedCallback() {
    try {
      this.card._cardConnected = true;
      Logger.log('LIFECYCLE', 'CronoStar connectedCallback - element added to DOM');

      // If the element is re-attached after being hidden/removed, Chart.js may be stuck with a 0x0 canvas.
      // Use ONLY the canvas size check as requested. Defer until render completes.
      try {
        if (!this.isEditorContext()) {
          const doCanvasCheck = () => {
            try {
              const canvas = this.card.shadowRoot?.getElementById('myChart');
              if (!canvas) {
                // Canvas not yet rendered; retry shortly
                setTimeout(doCanvasCheck, 100);
                return;
              }
              const rect = canvas.getBoundingClientRect();
              const w = Math.round(rect?.width || 0);
              const h = Math.round(rect?.height || 0);
              Logger.log('LIFECYCLE', `CronoStar canvas check: ${w}x${h}`);
              const chartReady = !!(this.card.chartManager?.isInitialized?.() && this.card.chartManager?.getChart?.());
              if (w === 0 || h === 0 || !chartReady) {
                Logger.log('LIFECYCLE', `CronoStar chart not ready (size=${w}x${h}, ready=${chartReady}); rebuilding`);
                this.reinitializeCard();
              } else {
                // Chart exists and canvas has size: trigger a safe update
                try { this.card.chartManager?.update?.('none'); } catch { }
              }
            } catch (err) {
              Logger.warn('LIFECYCLE', 'Canvas check error:', err);
            }
          };

          // After the next render cycle
          try { this.card.updateComplete?.then(() => setTimeout(doCanvasCheck, 0)); } catch { }
          // Also schedule via RAF as a fallback
          requestAnimationFrame(() => setTimeout(doCanvasCheck, 0));
        }
      } catch (e) {
        Logger.warn('LIFECYCLE', 'Canvas size check failed:', e);
      }

      if (this.card.initialized) {
        Logger.log('LIFECYCLE', 'CronoStar Reconnected - scheduling reinitialization');
        requestAnimationFrame(() => this.reinitializeCard());
      }
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in connectedCallback:', e);
    }
  }

  disconnectedCallback() {
    try {
      this.card._cardConnected = false;

      Logger.log('LIFECYCLE', 'CronoStar disconnectedCallback - element removed from DOM');

      // No visibility observers used (canvas size check only)

      if (this.card.syncCheckTimer) {
        clearInterval(this.card.syncCheckTimer);
        this.card.syncCheckTimer = null;
      }
      this.cleanupCard();
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in disconnectedCallback:', e);
    }
  }

  cleanupCard() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar Cleaning up card resources');

      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas) this.card.pointerHandler?.detachListeners?.(canvas);

      const chartContainer = this.card.shadowRoot?.querySelector('.chart-container');
      if (chartContainer) this.card.keyboardHandler?.detachListeners?.(chartContainer);

      this.card.chartManager?.destroy?.();
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in cleanupCard:', e);
    }
  }

  isEditorContext() {
    try {
      let el = this.card;
      while (el) {
        if (el.tagName) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'hui-card-preview' || 
              tag === 'hui-card-editor' || 
              tag === 'hui-dialog-edit-card' || 
              tag === 'ha-dialog' || 
              tag === 'hui-edit-view' || 
              tag === 'hui-edit-card') {
            return true;
          }
        }
        el = el.parentElement || el.parentNode || el.host;
      }
      return false;
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in isEditorContext:', e);
      return false;
    }
  }

  /**
   * First update hook: initialize chart and handlers once after render
   */
  firstUpdated() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar firstUpdated called');

      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas && typeof this.card.chartManager?.initChart === 'function') {
        this.card.chartManager.initChart(canvas);
      }

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (container) {
        this.card.keyboardHandler?.attachListeners?.(container);
      }
      if (canvas) {
        this.card.pointerHandler?.attachListeners?.(canvas);
      }

      this.card.cardSync?.updateAutomationSync?.(this.card.hass);
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in firstUpdated:', e);
    }
  }

  /**
   * Reinitialize the card safely after reconnection.
   * Recreates chart, reattaches keyboard/pointer listeners and refreshes UI.
   */
  reinitializeCard() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar reinitializeCard starting');

      // Recreate chart
      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas) {
        try { this.card.chartManager?.destroy?.(); } catch { }
        if (typeof this.card.chartManager?.initChart === 'function') {
          this.card.chartManager.initChart(canvas);
        }
      }

      // Reattach keyboard listeners to chart-container
      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (container) {
        try { this.card.keyboardHandler?.detachListeners?.(container); } catch { }
        this.card.keyboardHandler?.attachListeners?.(container);
      }

      // Reattach pointer listeners to canvas
      if (canvas) {
        try { this.card.pointerHandler?.detachListeners?.(canvas); } catch { }
        this.card.pointerHandler?.attachListeners?.(canvas);
      }

      // Refresh UI
      this.card.requestUpdate();
      Logger.log('LIFECYCLE', 'CronoStar reinitializeCard done');
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in reinitializeCard:', e);
    }
  }

  /**
   * Register the card with the backend and apply any initialization data returned.
   */
  async registerCard(hass) {
    if (this.card.isPreview || !this.card.config?.global_prefix) return;
    try {
      const cfg = this.card.config || {};
      const serviceData = {
        card_id: 'cronostar-card',
        version: VERSION,
        preset: cfg.preset || 'thermostat',
        global_prefix: cfg.global_prefix,
        selected_profile: this.card.selectedProfile
      };

      const result = await hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'register_card',
        service_data: serviceData,
        return_response: true,
      });

      const response = result?.response ?? result;
      Logger.log('LOAD', 'CronoStar register_card response:', response);

      // NOTE: persisted wizard/card config is now stored in profile meta and not returned here.

      // Initialize schedule from profile data, if provided
      const profileData = response?.profile_data;
      
      // Update local card config from profile metadata if available
      if (profileData?.meta) {
        const cleanMeta = extractCardConfig(profileData.meta);
        this.card.config = { ...this.card.config, ...cleanMeta };
        Logger.log('LOAD', 'CronoStar updated card config from register_card metadata');
      }

      const rawSchedule = profileData?.schedule;
      if (Array.isArray(rawSchedule) && rawSchedule.length > 0) {
        this.card.stateManager.setData(rawSchedule);
        if (this.card.chartManager?.isInitialized()) {
          this.card.chartManager.updateData(rawSchedule);
        }
        this.card.hasUnsavedChanges = false;
        Logger.log('LOAD', 'CronoStar initialized schedule from backend profile_data');
      } else {
        // Fallback for presets that don't return profile_data on registration (e.g., generic_switch)
        try {
          const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
          const hasNoData = !Array.isArray(this.card.stateManager?.scheduleData) || this.card.stateManager.scheduleData.length === 0;
          if (isSwitch && hasNoData && this.card.profileManager?.loadProfile) {
            const candidates = [
              this.card.selectedProfile,
              this.card.profileManager?.lastLoadedProfile,
              'Default',
              'Comfort'
            ].filter(Boolean);
            const name = candidates[0];
            if (name) {
              Logger.log('LOAD', `[CronoStar] Fallback load_profile for switch: '${name}'`);
              try {
                await this.card.profileManager.loadProfile(name);
              } catch (e) {
                Logger.warn('LOAD', `Fallback load_profile failed for '${name}':`, e);
              }
            }
          }
        } catch { }
      }

      // Registration succeeded: mark initial load complete and backend ready to hide overlays
      this.card.initialLoadComplete = true;
      this.card.cronostarReady = true;
      
      // Store entity states for help menu
      if (response?.entity_states) {
        this.card.entityStates = response.entity_states;
      }
      
      this.card.requestUpdate();

      this.hasRegistered = true;
    } catch (e) {
      Logger.warn('LOAD', 'CronoStar register_card failed:', e);
    }
  }
}
