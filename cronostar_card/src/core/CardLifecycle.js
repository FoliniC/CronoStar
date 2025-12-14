import { Logger } from '../utils.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';
import { validateConfig } from '../config.js';

export class CardLifecycle {
    constructor(card) {
        this.card = card;
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

            const hourBaseConfig = this.card.config.hour_base;
            if (typeof hourBaseConfig === 'object') {
                this.card.hourBase = hourBaseConfig.value;
                this.card.hourBaseDetermined = hourBaseConfig.determined;
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

    detectHourBase(hass) {
        try {
            if (this.card.hourBaseDetermined) return;

            const effectivePrefix = getEffectivePrefix(this.card.config);
            let countZero = 0;
            let countOne = 0;

            for (let i = 0; i < 24; i++) {
                const id = `input_number.${effectivePrefix}${i.toString().padStart(2, '0')}`;
                if (hass.states[id] !== undefined) countZero++;
            }

            for (let i = 1; i <= 24; i++) {
                const id = `input_number.${effectivePrefix}${i.toString().padStart(2, '0')}`;
                if (hass.states[id] !== undefined) countOne++;
            }

            this.card.hourBase = countOne > countZero ? 1 : 0;
            this.card.hourBaseDetermined = true;

            Logger.base(
                `[CronoStar] Hour base detection -> 0-based: ${countZero}, 1-based: ${countOne}. ` +
                `Selected: ${this.card.hourBase} (${this.card.hourBase === 0 ? '00-23' : '01-24'})`
            );
        } catch (e) {
            Logger.error('HASS', '[CronoStar] Error in detectHourBase:', e);
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

            if (this.card.config && this.card.config.entity_prefix) {
                this.detectHourBase(hass);

                const dataChanged = this.card.stateManager.updateFromHass(hass);

                const prevMissing = this.card._lastMissingCount;
                this.card.missingEntities = this.card.stateManager.missingEntities;
                this.card._lastMissingCount = Array.isArray(this.card.missingEntities) ? this.card.missingEntities.length : 0;

                if (dataChanged && this.card.chartManager.isInitialized()) {
                    this.card.chartManager.updateData(this.card.stateManager.getData());
                }

                if (this.card.config.pause_entity) {
                    const pauseStateObj = hass.states[this.card.config.pause_entity];
                    if (pauseStateObj) {
                        this.card.isPaused = pauseStateObj.state === "on";
                    }
                }

                if (this.card.config.profiles_select_entity) {
                    const profilesSelectObj = hass.states[this.card.config.profiles_select_entity];
                    if (profilesSelectObj) {
                        this.card.selectedProfile = profilesSelectObj.state;
                        this.card.profileOptions = profilesSelectObj.attributes.options || [];
                    }
                }

                if (dataChanged || this.card._lastMissingCount !== prevMissing) {
                    this.updateReadyFlag({ quiet: false });
                }

                if (!this.card._readyCheckTimer && !this.card.cronostarReady) {
                    this.card._readyCheckIntervalMs = 5000;
                    this.card._readyCheckTicks = 0;
                    this.card._readyCheckTimer = setInterval(() => this._onReadyCheckTick(), this.card._readyCheckIntervalMs);
                }

                this.card.cardSync.updateAutomationSync(hass);

                if (!this.card._syncCheckTimer) {
                    this.card._syncCheckTimer = setInterval(() => {
                        if (!this.card._isConnected) return;
                        this.card.cardSync.updateAutomationSync(this.card._hass);
                        if (!this.card.awaitingAutomation && this.card._syncCheckTimer) {
                            clearInterval(this.card._syncCheckTimer);
                            this.card._syncCheckTimer = null;
                        }
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

    _onReadyCheckTick() {
        try {
            if (this.card.cronostarReady) {
                if (this.card._readyCheckTimer) {
                    clearInterval(this.card._readyCheckTimer);
                    this.card._readyCheckTimer = null;
                }
                return;
            }
            this.card._readyCheckTicks++;
            this.updateReadyFlag({ quiet: true });

            const shouldBackoffTo15s = this.card._readyCheckTicks === 6 && this.card._readyCheckIntervalMs < 15000;
            const shouldBackoffTo60s = this.card._readyCheckTicks === 12 && this.card._readyCheckIntervalMs < this.card._readyCheckMaxMs;

            if (shouldBackoffTo15s || shouldBackoffTo60s) {
                if (this.card._readyCheckTimer) {
                    clearInterval(this.card._readyCheckTimer);
                    this.card._readyCheckTimer = null;
                }
                this.card._readyCheckIntervalMs = shouldBackoffTo60s ? this.card._readyCheckMaxMs : 15000;
                this.card._readyCheckTimer = setInterval(() => this._onReadyCheckTick(), this.card._readyCheckIntervalMs);
                Logger.log('LOAD', `[CronoStar] Ready check interval backoff to ${this.card._readyCheckIntervalMs}ms`);
            }
        } catch (e) {
            Logger.error('LIFECYCLE', '[CronoStar] Error in _onReadyCheckTick:', e);
        }
    }

    updateReadyFlag(options = {}) {
        try {
            const quiet = options?.quiet === true;

            if (this.card.cronostarReady) return;
            const data = this.card.stateManager?.scheduleData || [];
            const allLoaded = Array.isArray(data) && data.length === 24 && data.every(v => v !== null && !Number.isNaN(Number(v)));
            const noMissing = Array.isArray(this.card.missingEntities) && this.card.missingEntities.length === 0;

            if (allLoaded && noMissing) {
                this.card.cronostarReady = true;
                Logger.log('LOAD', '[CronoStar] Ready state reached by heuristic (data loaded, no missing entities)');
                this.card.requestUpdate();
                return;
            }

            const now = Date.now();
            const missingCount = Array.isArray(this.card.missingEntities) ? this.card.missingEntities.length : 0;
            const missingChanged = missingCount !== this.card._lastMissingCount;
            const canLog = (!quiet) && ((now - this.card._lastReadyFlagNotMetLogAt) > 30000 || missingChanged);

            if (canLog) {
                this.card._lastReadyFlagNotMetLogAt = now;
                Logger.log('LOAD', `[CronoStar] updateReadyFlag: Heuristic not met. allLoaded=${allLoaded}, noMissing=${noMissing}, missingCount=${missingCount}`);
            }
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

            if (this.card._readyCheckTimer) {
                clearInterval(this.card._readyCheckTimer);
                this.card._readyCheckTimer = null;
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
            this.card.initialLoadComplete = true;
            if (!this.isEditorContext()) {
                this.updateReadyFlag({ quiet: true });
                this.card.cardSync.updateAutomationSync(this.card._hass);
            }
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