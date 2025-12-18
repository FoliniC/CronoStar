import { Logger } from '../utils.js';
import { validateConfig, VERSION } from '../config.js';

export class CardLifecycle {
  constructor(card) {
    this.card = card;
    this.hasRegistered = false;

    // spam guards
    this.loggedProfileSelectEntityMissing = false;
    this.loggedPauseEntityMissing = false;

    if (typeof window !== 'undefined') {
      if (!window.cronostarpausewarned) window.cronostarpausewarned = new Set();
    }
  }

  setConfig(config) {
    Logger.log('CONFIG', 'CronoStar setConfig config received:', config);

    try {
      this.card.config = validateConfig(config);
      Logger.log('CONFIG', 'CronoStar setConfig validated config:', this.card.config);

      this.card.loggingEnabled = this.card.config.loggingenabled !== false;
      Logger.setEnabled(this.card.loggingEnabled);
      Logger.log('LOG', 'CronoStar Logging enabled:', this.card.loggingEnabled);

      this.card.selectedPreset = this.card.config.preset;

      const hourBaseConfig = this.card.config.hourbase;
      if (typeof hourBaseConfig === 'object') {
        this.card.hourBase = hourBaseConfig.value;
        this.card.hourBaseDetermined = hourBaseConfig.determined;
      } else {
        this.card.hourBase = 0;
        this.card.hourBaseDetermined = true;
      }

      if (this.card.stateManager) {
        const interval = this.card.config.intervalminutes || 60;
        const minVal = this.card.config.minvalue ?? 0;

        this.card.stateManager.resizeScheduleData(interval);

        // sanitize nulls
        const data = this.card.stateManager.getData();
        let dirty = false;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === null || data[i] === undefined) {
            data[i] = minVal;
            dirty = true;
          }
        }
        if (dirty) this.card.stateManager.setData(data);
      }
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
        if (this.card.chartManager?.isInitialized) {
          this.card.chartManager.recreateChartOptions();

          const chart = this.card.chartManager.getChart?.();
          if (chart && chart.options?.scales?.y) {
            chart.options.scales.y.min = this.card.config.minvalue;
            chart.options.scales.y.max = this.card.config.maxvalue;
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
      this.card.hass = hass;

      if (!this.card.languageInitialized && hass.language) {
        this.card.language = hass.language;
        this.card.languageInitialized = true;
        Logger.log('LANG', 'CronoStar Language initialized to:', this.card.language);
      }

      if (this.isEditorContext()) return;

      // mark ready when backend service exists
      if (!this.card.cronostarReady) {
        if (hass.services?.cronostar?.applynow) {
          Logger.log('LOAD', 'CronoStar Backend service found, considering it ready.');
          this.card.cronostarReady = true;
          this.card.requestUpdate();
        }
      }

      // pause entity check (spam-free)
      if (this.card.config?.pauseentity) {
        const pauseId = this.card.config.pauseentity;
        const pauseStateObj = hass.states[pauseId];
        if (pauseStateObj) {
          this.card.isPaused = pauseStateObj.state === 'on';
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
      if (this.card.config?.profilesselectentity) {
        const selId = this.card.config.profilesselectentity;
        const selObj = hass.states[selId];
        if (selObj) {
          this.loggedProfileSelectEntityMissing = false;
          const newProfile = selObj.state;
          const newOptions = selObj.attributes?.options;

          if (JSON.stringify(this.card.profileOptions) !== JSON.stringify(newOptions)) {
            this.card.profileOptions = newOptions;
            Logger.log('HASS', 'CronoStar Profile options updated:', newOptions?.length, 'profiles');
          }

          if (newProfile && newProfile !== this.card.selectedProfile) {
            this.card.selectedProfile = newProfile;
            Logger.log('HASS', 'CronoStar Selected profile updated:', newProfile);

            if (!this.card.hasUnsavedChanges) {
              this.card.profileManager?.loadProfile?.(newProfile);
            }
          }
        } else if (!this.loggedProfileSelectEntityMissing) {
          Logger.warn('HASS', 'CronoStar Profile select entity not found:', selId);
          this.loggedProfileSelectEntityMissing = true;
        }
      }

      // periodic sync check
      this.card.cardSync?.updateAutomationSync?.(hass);
      if (!this.card.syncCheckTimer) {
        this.card.syncCheckTimer = setInterval(() => {
          if (!this.card._cardConnected) return;
          this.card.cardSync?.updateAutomationSync?.(this.card.hass);
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
      const host = this.card;
      return !!(
        host.closest('hui-card-preview') ||
        host.closest('hui-card-editor') ||
        host.closest('hui-dialog-edit-card') ||
        host.closest('ha-dialog') ||
        host.closest('hui-edit-view') ||
        host.closest('hui-edit-card')
      );
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in isEditorContext:', e);
      return false;
    }
  }

  async initializeCard() {
      try {
        Logger.log('INIT', 'CronoStar initializeCard starting');
  
        // Register once: server returns profiledata + cardconfig
        if (!this.hasRegistered && this.card._cardConnected && this.card.hass) {
          Logger.log('INIT', 'CronoStar Attempting to register card with backend...');
  
          this.card.cardId = Math.random().toString(36).substr(2, 9);
  
          const wsResponse = await this.card.hass.callWS({
            type: 'call_service',
            domain: 'cronostar',
            service: 'register_card',
            service_data: {
              card_id: this.card.cardId,
              version: VERSION,
              preset: this.card.config?.preset || 'unknown',
              entity_prefix: this.card.config?.entity_prefix,
              global_prefix: this.card.config?.global_prefix,
            },
            return_response: true,
          });
  
          const response = wsResponse?.response;
          Logger.log('INIT', 'CronoStar Card registered. WS Response:', response);
  
          this.hasRegistered = true;
  
          // NEW: Apply persisted card_config if present
          if (response?.card_config && typeof response.card_config === 'object') {
            Logger.log('INIT', 'CronoStar Applying persisted card_config from backend');
            
            // Merge with current config (persisted takes priority)
            const merged = { 
              ...(this.card.config || {}), 
              ...response.card_config 
            };
            
            this.setConfig(merged);
            Logger.log('INIT', 'CronoStar Config updated from backend:', merged);
          } else {
            Logger.log('INIT', 'CronoStar No persisted card_config found, using defaults');
          }
  
          // Apply profile schedule if provided
          if (response?.profile_data) {
            const rawSchedule = response.profile_data.schedule;
            if (Array.isArray(rawSchedule)) {
              const first = rawSchedule[0];
              const hasTime = typeof first === 'object' && first !== null && 'time' in first;
              const hasValueObject = typeof first === 'object' && first !== null && 'value' in first;
              const schedulePayload = hasTime && hasValueObject ? rawSchedule : rawSchedule;
  
              const profileName = response.profile_data.profile_name || 'Default';
              this.card.selectedProfile = profileName;
  
              Logger.log('INIT', 'CronoStar Applying profile', profileName, 'data from registration response');
              this.card.stateManager?.setData?.(schedulePayload);
              if (this.card.chartManager?.isInitialized) {
                this.card.chartManager.updateData(this.card.stateManager.getData());
              }
  
              this.card.initialLoadComplete = true;
              this.card.cronostarReady = true;
              this.card.requestUpdate();
            }
          } else {
            Logger.log('INIT', 'CronoStar No profile data in registration response.');
            this.card.requestUpdate();
          }
        }
  
        // Continue with chart initialization...
        const canvas = this.card.shadowRoot?.getElementById('myChart');
        if (!canvas) {
          Logger.error('INIT', 'CronoStar Canvas element not found');
          return;
        }
  
        Logger.log('CHART', 'CronoStar initializeCard initChart starting');
        const success = await this.card.chartManager?.initChart?.(canvas);
        Logger.log('CHART', 'CronoStar initializeCard initChart result:', success);
  
        if (!success) {
          Logger.error('INIT', 'CronoStar Failed to initialize chart');
          this.card.eventHandlers?.showNotification?.(
            this.card.localizationManager?.localize?.(this.card.language, 'error.chart_init_failed') ||
              'Chart init failed',
            'error',
          );
          return;
        }
  
        this.card.pointerHandler?.attachListeners?.(canvas);
  
        const chartContainer = this.card.shadowRoot?.querySelector('.chart-container');
        if (chartContainer) {
          chartContainer.setAttribute('tabindex', this.isEditorContext() ? -1 : 0);
          if (!this.isEditorContext()) {
            this.card.keyboardHandler?.attachListeners?.(chartContainer);
            Logger.log('INIT', 'CronoStar Keyboard listeners attached');
          } else {
            this.card.keyboardHandler?.detachListeners?.(chartContainer);
            this.card.keyboardHandler?.disable?.();
          }
  
          chartContainer.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.controls')) return;
            if (e.target.closest('.menu-content')) return;
            chartContainer.focus();
            this.card.keyboardHandler?.enable?.();
          });
        } else {
          Logger.error('INIT', 'CronoStar Chart container not found');
        }
  
        Logger.log('INIT', 'CronoStar Card initialized successfully');
      } catch (e) {
        Logger.error('INIT', 'CronoStar Error in initializeCard:', e);
        this.card.eventHandlers?.showNotification?.(
          this.card.localizationManager?.localize?.(this.card.language, 'error.initialization_failed', e.message) ||
            `Initialization failed: ${e.message}`,
          'error',
        );
      }
    }

  async firstUpdated() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar firstUpdated called');
      await this.initializeCard();
      this.card.initialized = true;
      this.card.cardSync?.updateAutomationSync?.(this.card.hass);
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in firstUpdated:', e);
      this.card.eventHandlers?.showNotification?.(
        this.card.localizationManager?.localize?.(this.card.language, 'error.firstupdatefailed', e.message) ||
          `First update failed: ${e.message}`,
        'error',
      );
    }
  }

  async initializeCard() {
    try {
      Logger.log('INIT', 'CronoStar initializeCard starting');

      // Register once: server returns profiledata + NEW cardconfig
      if (!this.hasRegistered && this.card._cardConnected && this.card.hass) {
        Logger.log('INIT', 'CronoStar Attempting to register card with backend...');

        this.card.cardId = Math.random().toString(36).substr(2, 9);

        const wsResponse = await this.card.hass.callWS({
          type: 'call_service',
          domain: 'cronostar',
          service: 'registercard',
          service_data: {
            cardid: this.card.cardId,
            version: VERSION,
            preset: this.card.config?.preset || 'unknown',
            entityprefix: this.card.config?.entityprefix,
            globalprefix: this.card.config?.globalprefix,
          },
          return_response: true,
        });

        const response = wsResponse?.response;
        Logger.log('INIT', 'CronoStar Card registered. WS Response:', response);

        this.hasRegistered = true;

        // Apply persisted config coming from backend
        if (response?.cardconfig && typeof response.cardconfig === 'object') {
          Logger.log('INIT', 'CronoStar Applying persisted cardconfig from backend');
          const merged = { ...(this.card.config || {}), ...response.cardconfig };
          this.setConfig(merged);
        }

        // Apply profile schedule if provided
        if (response?.profiledata) {
          const rawSchedule = response.profiledata.schedule;
          if (Array.isArray(rawSchedule)) {
            const first = rawSchedule[0];
            const hasTime = typeof first === 'object' && first !== null && 'time' in first;
            const hasValueObject = typeof first === 'object' && first !== null && 'value' in first;
            const schedulePayload = hasTime && hasValueObject ? rawSchedule : rawSchedule;

            const profileName = response.profiledata.profilename || 'Default';
            this.card.selectedProfile = profileName;

            Logger.log('INIT', 'CronoStar Applying profile', profileName, 'data from registration response');
            this.card.stateManager?.setData?.(schedulePayload);
            if (this.card.chartManager?.isInitialized) {
              this.card.chartManager.updateData(this.card.stateManager.getData());
            }

            this.card.initialLoadComplete = true;
            this.card.cronostarReady = true;
            this.card.requestUpdate();
          }
        } else {
          Logger.log('INIT', 'CronoStar No profile data in registration response.');
          this.card.requestUpdate();
        }
      }

      // Init chart
      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (!canvas) {
        Logger.error('INIT', 'CronoStar Canvas element not found');
        return;
      }

      Logger.log('CHART', 'CronoStar initializeCard initChart starting');
      const success = await this.card.chartManager?.initChart?.(canvas);
      Logger.log('CHART', 'CronoStar initializeCard initChart result:', success);

      if (!success) {
        Logger.error('INIT', 'CronoStar Failed to initialize chart');
        this.card.eventHandlers?.showNotification?.(
          this.card.localizationManager?.localize?.(this.card.language, 'error.chartinitfailed') ||
            'Chart init failed',
          'error',
        );
        return;
      }

      this.card.pointerHandler?.attachListeners?.(canvas);

      const chartContainer = this.card.shadowRoot?.querySelector('.chart-container');
      if (chartContainer) {
        chartContainer.setAttribute('tabindex', this.isEditorContext() ? -1 : 0);
        if (!this.isEditorContext()) {
          this.card.keyboardHandler?.attachListeners?.(chartContainer);
          Logger.log('INIT', 'CronoStar Keyboard listeners attached');
        } else {
          this.card.keyboardHandler?.detachListeners?.(chartContainer);
          this.card.keyboardHandler?.disable?.();
        }

        chartContainer.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.controls')) return;
          if (e.target.closest('.menu-content')) return;
          chartContainer.focus();
          this.card.keyboardHandler?.enable?.();
        });
      } else {
        Logger.error('INIT', 'CronoStar Chart container not found');
      }

      Logger.log('INIT', 'CronoStar Card initialized successfully');
    } catch (e) {
      Logger.error('INIT', 'CronoStar Error in initializeCard:', e);
      this.card.eventHandlers?.showNotification?.(
        this.card.localizationManager?.localize?.(this.card.language, 'error.initializationfailed', e.message) ||
          `Initialization failed: ${e.message}`,
        'error',
      );
    }
  }
}
