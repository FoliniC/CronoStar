import { Logger } from '../utils.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';
import { validateConfig, VERSION } from '../config.js';

export class CardLifecycle {
    constructor(card) {
        this.card = card;
        this._hasRegistered = false;
    }

    setConfig(config) {
        Logger.log('CONFIG', '[CronoStar] setConfig: config received', config);
        try {
            this.card.config = validateConfig(config);
            Logger.log('CONFIG', '[CronoStar] setConfig: validated config', this.card.config);

            this.card.loggingEnabled = this.card.config.logging_enabled !== false;
            Logger.setEnabled(this.card.loggingEnabled);
            Logger.log('LOG', `[CronoStar] Logging enabled: ${this.card.loggingEnabled}`);

            this.card.selectedPreset = this.card.config.preset;

            // Hour base is less relevant now without entities, but keep for label formatting if needed
            const hourBaseConfig = this.card.config.hour_base;
            if (typeof hourBaseConfig === 'object') {
                this.card.hourBase = hourBaseConfig.value;
                this.card.hourBaseDetermined = hourBaseConfig.determined;
            } else {
                this.card.hourBase = 0; // Default to 0 if not specified
                this.card.hourBaseDetermined = true;
            }

            // Ensure StateManager is aligned with config (interval, min_value)
            // StateManager constructor runs before setConfig, so it might have used defaults.
            if (this.card.stateManager) {
                const interval = this.card.config.interval_minutes || 60;
                const minVal = this.card.config.min_value ?? 0;
                
                // Resize/Re-init data if needed
                this.card.stateManager.resizeScheduleData(interval);
                
                // If data contains null/undefined (initial state), fill with min_value
                const data = this.card.stateManager.getData();
                let dirty = false;
                for(let i=0; i<data.length; i++) {
                    if (data[i] === null || data[i] === undefined) {
                        data[i] = minVal;
                        dirty = true;
                    }
                }
                if (dirty) {
                    this.card.stateManager.setData(data);
                }
            }
        } catch (e) {
            Logger.error('CONFIG', '[CronoStar] Error in setConfig:', e);
            // Optionally, show a notification to the user
            this.card.eventHandlers.showNotification(
                this.card.localizationManager.localize(this.card.language, 'error.config_error') + `: ${e.message}`,
                'error'
            );
        }
    }

    updated(changed) {
        if (changed.has('config')) {
            try {
                if (this.card.chartManager?.isInitialized()) {
                    this.card.chartManager.recreateChartOptions();
                    const chart = this.card.chartManager.getChart();
                    if (chart && chart.options?.scales?.y) {
                        chart.options.scales.y.min = this.card.config.min_value;
                        chart.options.scales.y.max = this.card.config.max_value;
                        chart.update();
                    }
                    this.card.chartManager.updateChartLabels();
                }
            } catch (e) {
                Logger.warn('UPDATE', '[CronoStar] updated(config) chart refresh failed:', e);
            }
        }
    }

    setHass(hass) {
        if (!hass) {
            Logger.warn('HASS', '[CronoStar] Received null hass object');
            return;
        }

        try {
            this.card._hass = hass;

            if (!this.card._languageInitialized && hass.language) {
                this.card.language = hass.language;
                this.card._languageInitialized = true;
                Logger.log('LANG', `[CronoStar] Language initialized to: ${this.card.language}`);
            }

            if (this.isEditorContext()) {
                return;
            }

            if (!this.card.cronostarReady) {
                // First, check if backend is ALREADY ready.
                if (hass.services.cronostar && hass.services.cronostar.apply_now) {
                    Logger.log('LOAD', '[CronoStar] Backend service found, considering it ready.');
                    this.card.cronostarReady = true;
                    this.card.requestUpdate();
                    
                    // Initial load if we haven't loaded data yet
                    if (!this.card.initialLoadComplete) {
                        const profileToLoad = this.card.selectedProfile || ''; 
                        // If selectedProfile is empty, we might want to check the input_select
                        if (!profileToLoad && this.card.config.profiles_select_entity) {
                             // Will be handled in the state update block below
                        } else if (profileToLoad) {
                             this.card.profileManager.loadProfile(profileToLoad);
                        }
                        this.card.initialLoadComplete = true;
                    }
                } else if (!this.card._unsubProfilesLoaded && hass.connection?.subscribeEvents) {
                    // If not ready, subscribe to the event.
                    const setReady = (event) => {
                        if (!this.card.cronostarReady) {
                            Logger.log('LOAD', '[CronoStar] Backend is ready via event.', event ? {event} : "");
                            this.card.cronostarReady = true;
                            this.card.requestUpdate();
                            if (this.card._unsubProfilesLoaded) {
                                try {
                                    this.card._unsubProfilesLoaded().catch(err => {
                                        if (err.code !== 'not_found') {
                                            Logger.warn('LOAD', 'Error unsubscribing after ready event:', err);
                                        }
                                    });
                                } catch (e) {
                                    Logger.warn('LOAD', 'Error calling unsubscribe after ready event:', e);
                                }
                                this.card._unsubProfilesLoaded = null;
                            }
                        }
                    };
                    hass.connection.subscribeEvents(setReady, 'cronostar_profiles_loaded').then((unsub) => {
                        this.card._unsubProfilesLoaded = unsub;
                        Logger.log('LOAD', '[CronoStar] Subscribed to cronostar_profiles_loaded');
                    }).catch((err) => {
                        Logger.warn('LOAD', '[CronoStar] Unable to subscribe to cronostar_profiles_loaded:', err);
                    });
                }
            }

            if (this.card.config) {
                // No longer updating from input_number entities
                
                if (this.card.config.pause_entity) {
                    const pauseStateObj = hass.states[this.card.config.pause_entity];
                    if (pauseStateObj) {
                        this.card.isPaused = pauseStateObj.state === "on";
                        Logger.log('HASS', `[CronoStar] Pause state updated: ${this.card.isPaused}`);
                    } else {
                        Logger.warn('HASS', `[CronoStar] Pause entity not found: ${this.card.config.pause_entity}`);
                    }
                }

                if (this.card.config.profiles_select_entity) {
                    const profilesSelectObj = hass.states[this.card.config.profiles_select_entity];
                    if (profilesSelectObj) {
                        const newProfile = profilesSelectObj.state;
                        const newOptions = profilesSelectObj.attributes.options || [];
                        
                        // Always update options
                        if (JSON.stringify(this.card.profileOptions) !== JSON.stringify(newOptions)) {
                            this.card.profileOptions = newOptions;
                            Logger.log('HASS', `[CronoStar] Profile options updated: ${newOptions.length} profiles`);
                        }
                        
                        // Update selected profile if changed
                        if (newProfile !== this.card.selectedProfile) {
                             this.card.selectedProfile = newProfile;
                             Logger.log('HASS', `[CronoStar] Selected profile updated: ${newProfile}`);
                             if (!this.card.hasUnsavedChanges) {
                                 this.card.profileManager.loadProfile(newProfile);
                             }
                        }
                    } else {
                        Logger.warn('HASS', `[CronoStar] Profile select entity not found: ${this.card.config.profiles_select_entity}`);
                    }
                }

                this.updateReadyFlag({ quiet: false });

                // Sync check loop (to update "awaiting automation" status)
                this.card.cardSync.updateAutomationSync(hass);

                if (!this.card._syncCheckTimer) {
                    this.card._syncCheckTimer = setInterval(() => {
                        if (!this.card._isConnected) return;
                        this.card.cardSync.updateAutomationSync(this.card._hass);
                    }, 5000);
                }
            }
        } catch (err) {
            Logger.error('HASS', '[CronoStar] Error in setHass:', err);
        }
    }

    get hass() {
        return this.card._hass;
    }

    updateReadyFlag(options = {}) {
        try {
            if (this.card.cronostarReady) return;
            
            // Simplified check: if we have config and backend service is there (checked in setHass)
            // we are effectively ready. 
            // We removed dependency on 24/48 entities loading.
            
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in updateReadyFlag:', e);
        }
    }

    connectedCallback() {
        try {
            this.card._isConnected = true;
            Logger.log('LIFECYCLE', '[CronoStar] connectedCallback - element added to DOM');

            if (this.card._initialized) {
                Logger.log('LIFECYCLE', '[CronoStar] Reconnected - scheduling reinitialization');
                requestAnimationFrame(() => {
                    this.reinitializeCard();
                });
            }
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in connectedCallback:', e);
        }
    }

    disconnectedCallback() {
        try {
            this.card._isConnected = false;
            Logger.log('LIFECYCLE', '[CronoStar] disconnectedCallback - element removed from DOM');

            if (typeof this.card._unsubProfilesLoaded === 'function') {
                try {
                    this.card._unsubProfilesLoaded().catch(err => {
                        if (err.code !== 'not_found') {
                            Logger.warn('LIFECYCLE', 'Error unsubscribing on disconnect:', err);
                        }
                    });
                } catch (e) {
                    Logger.warn('LIFECYCLE', 'Error calling unsubscribe on disconnect:', e);
                }
                this.card._unsubProfilesLoaded = null;
            }

            if (this.card._syncCheckTimer) {
                clearInterval(this.card._syncCheckTimer);
                this.card._syncCheckTimer = null;
            }

            this.cleanupCard();
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in disconnectedCallback:', e);
        }
    }

    cleanupCard() {
        try {
            Logger.log('LIFECYCLE', '[CronoStar] Cleaning up card resources');

            const canvas = this.card.shadowRoot?.getElementById("myChart");
            if (canvas) {
                this.card.pointerHandler.detachListeners(canvas);
            }

            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer) {
                this.card.keyboardHandler.detachListeners(chartContainer);
            }

            this.card.chartManager.destroy();
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in cleanupCard:', e);
        }
    }

    isEditorContext() {
        try {
            const host = this.card;
            return !!(host.closest('hui-card-preview') ||
                host.closest('hui-card-editor') ||
                host.closest('hui-dialog-edit-card') ||
                host.closest('ha-dialog') ||
                host.closest('hui-edit-view') ||
                host.closest('hui-edit-card'));
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in isEditorContext:', e);
            return false;
        }
    }

    async reinitializeCard() {
        try {
            if (!this.card._isConnected) {
                Logger.log('LIFECYCLE', '[CronoStar] Not connected, skipping reinitialization');
                return;
            }

            Logger.log('LIFECYCLE', '[CronoStar] Reinitializing card');

            await this.card.updateComplete;

            const canvas = this.card.shadowRoot?.getElementById("myChart");
            if (!canvas) {
                Logger.warn('LIFECYCLE', '[CronoStar] Canvas not found during reinitialization, retrying...');
                setTimeout(() => this.reinitializeCard(), 100);
                return;
            }

            Logger.log('CHART', '[CronoStar] reinitializeCard: initChart starting');
            const success = await this.card.chartManager.initChart(canvas);
            Logger.log('CHART', `[CronoStar] reinitializeCard: initChart result=${success}`);

            if (!success) {
                Logger.error('LIFECYCLE', "[CronoStar] Failed to reinitialize chart");
                this.card.eventHandlers.showNotification(
                    this.card.localizationManager.localize(this.card.language, 'error.chart_init_failed'),
                    'error'
                );
                return;
            }

            this.card.pointerHandler.attachListeners(canvas);

            const chartContainer = this.card.shadowRoot.querySelector(".chart-container");
            if (chartContainer) {
                chartContainer.setAttribute('tabindex', this.isEditorContext() ? '-1' : '0');

                if (!this.isEditorContext()) {
                    this.card.keyboardHandler.attachListeners(chartContainer);
                } else {
                    this.card.keyboardHandler.detachListeners(chartContainer);
                    this.card.keyboardHandler.disable();
                }

                chartContainer.addEventListener('pointerdown', (e) => {
                    if (e.target.closest('.controls') || e.target.closest('.menu-content')) {
                        return;
                    }
                    if (!this.isEditorContext()) {
                        chartContainer.focus();
                        this.card.keyboardHandler.enable();
                    }
                });
            }

            if (this.card.stateManager.scheduleData.some(val => val !== null)) {
                this.card.chartManager.updateData(this.card.stateManager.getData());
            }

            this.card.cardSync.updateAutomationSync(this.card._hass);

            Logger.log('LIFECYCLE', '[CronoStar] Card reinitialized successfully');
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in reinitializeCard:', e);
            this.card.eventHandlers.showNotification(
                this.card.localizationManager.localize(this.card.language, 'error.reinitialization_failed') + `: ${e.message}`,
                'error'
            );
        }
    }

    async firstUpdated() {
        try {
            Logger.log('LIFECYCLE', '[CronoStar] firstUpdated called');
            await this.initializeCard();
            this.card._initialized = true;
            // Removed updateReadyFlag call
            this.card.cardSync.updateAutomationSync(this.card._hass);
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in firstUpdated:', e);
            this.card.eventHandlers.showNotification(
                this.card.localizationManager.localize(this.card.language, 'error.first_update_failed') + `: ${e.message}`,
                'error'
            );
        }
    }

    async initializeCard() {
        try {
            Logger.log('INIT', '[CronoStar] initializeCard starting');

            // Register card with backend for logging (once per session)
            if (!this._hasRegistered && this.card._isConnected && this.card.hass) {
                Logger.log('INIT', '[CronoStar] Attempting to register card with backend...');
                // Generate and store Card ID on the instance
                this.card.cardId = Math.random().toString(36).substr(2, 9);
                
                this.card.hass.callWS({
                    type: 'call_service',
                    domain: 'cronostar',
                    service: 'register_card',
                    service_data: {
                        card_id: this.card.cardId,
                        version: VERSION,
                        preset: this.card.config?.preset || "unknown",
                        entity_prefix: this.card.config?.entity_prefix,
                        global_prefix: this.card.config?.global_prefix
                    },
                    return_response: true
                }).then((wsResponse) => {
                    const response = wsResponse?.response;
                    Logger.log('INIT', '[CronoStar] Card registered. WS Response:', response);
                    this._hasRegistered = true;
                    
                    // Handle returned profile data
                    if (response && response.profile_data) {
                        const rawSchedule = response.profile_data.schedule;
                        if (Array.isArray(rawSchedule)) {
                            let scheduleValues = rawSchedule;
                            // Normalize object array to values if needed
                            if (typeof rawSchedule[0] === 'object' && rawSchedule[0] !== null && 'value' in rawSchedule[0]) {
                                scheduleValues = rawSchedule.map(item => item.value);
                            }

                            const profileName = response.profile_data.profile_name || 'Default';
                            this.card.selectedProfile = profileName;
                            
                            Logger.log('INIT', `[CronoStar] ✅ Applying profile '${profileName}' data from registration response`);
                            Logger.log('INIT', `[CronoStar] 📊 Schedule length=${scheduleValues.length}, sample=${JSON.stringify(scheduleValues.slice(0, 5))}`);
                            
                            this.card.stateManager.setData(scheduleValues);
                            if (this.card.chartManager?.isInitialized()) {
                                this.card.chartManager.updateData(scheduleValues);
                            }
                            
                            // Mark as loaded and ready
                            this.card.initialLoadComplete = true;
                            this.card.cronostarReady = true;
                            this.card.requestUpdate();
                            
                            Logger.log('INIT', '[CronoStar] ✅ Initialization complete, overlay should hide now');
                        }
                    } else {
                        Logger.log('INIT', '[CronoStar] ⚠️ No profile data in registration response. Overlay will remain.');
                        // Do NOT mark as loaded/ready, so the overlay remains
                        this.card.requestUpdate();
                    }
                }).catch(err => {
                    Logger.warn('INIT', '[CronoStar] Failed to register card via WS:', err);
                    // Do NOT mark as loaded/ready, so the overlay remains
                    this.card.requestUpdate();
                });
            }

            const canvas = this.card.shadowRoot.getElementById("myChart");
            if (!canvas) {
                Logger.error('INIT', "[CronoStar] Canvas element not found");
                return;
            }

            Logger.log('CHART', '[CronoStar] initializeCard: initChart starting');
            const success = await this.card.chartManager.initChart(canvas);
            Logger.log('CHART', `[CronoStar] initializeCard: initChart result=${success}`);

            if (!success) {
                Logger.error('INIT', "[CronoStar] Failed to initialize chart");
                this.card.eventHandlers.showNotification(
                    this.card.localizationManager.localize(this.card.language, 'error.chart_init_failed'),
                    'error'
                );
                return;
            }

            this.card.pointerHandler.attachListeners(canvas);
            Logger.log('INIT', '[CronoStar] Pointer listeners attached');

            const chartContainer = this.card.shadowRoot.querySelector(".chart-container");
            if (chartContainer) {
                chartContainer.setAttribute('tabindex', this.isEditorContext() ? '-1' : '0');

                if (!this.isEditorContext()) {
                    this.card.keyboardHandler.attachListeners(chartContainer);
                    Logger.log('INIT', '[CronoStar] Keyboard listeners attached');

                    chartContainer.addEventListener('pointerdown', (e) => {
                        if (e.target.closest('.controls') || e.target.closest('.menu-content')) {
                            return;
                        }
                        chartContainer.focus();
                        this.card.keyboardHandler.enable();
                    });

                    setTimeout(() => {
                        if (this.card._isConnected) {
                            chartContainer.focus();
                            this.card.keyboardHandler.enable();
                            Logger.log('INIT', '[CronoStar] Initial focus set on chart container');
                        }
                    }, 100);
                } else {
                    this.card.keyboardHandler.detachListeners(chartContainer);
                    this.card.keyboardHandler.disable();
                }
            } else {
                Logger.error('INIT', '[CronoStar] Chart container not found');
            }

            Logger.log('INIT', "[CronoStar] Card initialized successfully");
        } catch (e) {
            Logger.error('INIT', '[CronoStar] Error in initializeCard:', e);
            this.card.eventHandlers.showNotification(
                this.card.localizationManager.localize(this.card.language, 'error.initialization_failed') + `: ${e.message}`,
                'error'
            );
        }
    }
}