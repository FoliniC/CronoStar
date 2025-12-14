import { CARD_CONFIG_PRESETS, validateConfig } from '../config.js';
import { Logger } from '../utils.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';

export class CardEventHandlers {
    constructor(card) {
        this.card = card;
    }

    toggleMenu(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        this.card.isMenuOpen = !this.card.isMenuOpen;
        Logger.log('UI', '[CronoStar] toggleMenu: isMenuOpen is now', this.card.isMenuOpen);

        if (this.card.isMenuOpen) {
            this.card.keyboardHandler.disable();
        } else {
            this.card.keyboardHandler.enable();
            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }
        }

        this.card.requestUpdate();
    }

    handleLanguageSelect(lang) {
        Logger.log('LANG', `[CronoStar] handleLanguageSelect: ${lang}`);
        this.card.language = lang;
        this.card.isMenuOpen = false;
        this.card.keyboardHandler.enable();
        this.card.chartManager.updateChartLabels();

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }

        this.card.requestUpdate();
    }

    async handleLoggingToggle(e) {
        e.stopPropagation();
        e.preventDefault();
        const newLoggingState = e.target.checked;
        Logger.log('UI', '[CronoStar] handleLoggingToggle:', newLoggingState);
        this.card.loggingEnabled = newLoggingState;
        this.card.config = { ...this.card.config, logging_enabled: newLoggingState };
        Logger.setEnabled(newLoggingState);

        await this.card.updateComplete;

        this.card.isMenuOpen = false;
        this.card.keyboardHandler.enable();

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }
    }

    async handlePresetChange(e) {
        e.stopPropagation();
        e.preventDefault();

        const newPreset = e.detail?.value || e.target?.value;
        Logger.log('UI', '[CronoStar] handlePresetChange:', newPreset);

        if (!newPreset || newPreset === this.card.selectedPreset) {
            return;
        }

        this.card.selectedPreset = newPreset;

        const presetConfig = CARD_CONFIG_PRESETS[newPreset];
        this.card.config = {
            ...this.card.config,
            preset: newPreset,
            ...presetConfig
        };
        this.card.config = validateConfig(this.card.config);

        this.card.stateManager.setData(new Array(24).fill(null));
        this.card.awaitingAutomation = false;
        this.card.outOfSyncDetails = "";
        this.card.cardLifecycle.updateReadyFlag({ quiet: true });

        if (this.card.chartManager?.isInitialized()) {
            this.card.chartManager.recreateChartOptions();
        }

        await this.card.updateComplete;

        this.card.isMenuOpen = false;
        this.card.keyboardHandler.enable();

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }

        if (this.card.chartManager.isInitialized()) {
            const chart = this.card.chartManager.getChart();
            if (chart) {
                chart.options.scales.y.min = this.card.config.min_value;
                chart.options.scales.y.max = this.card.config.max_value;
                chart.update();
            }
            this.card.chartManager.updateChartLabels();
        }

        this.card.cardSync.updateAutomationSync(this.card._hass);
    }

    handleSelectAll() {
        this.card.selectionManager.selectAll();
        this.card.chartManager?.updatePointStyling(
            this.card.selectionManager.selectedPoint,
            this.card.selectionManager.selectedPoints
        );
        this.card.chartManager?.update();
        this.card.isMenuOpen = false;
        this.card.keyboardHandler.enable();

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }
    }

    async handleApplyNow() {
        const localize = (key, search, replace) =>
            this.card.localizationManager.localize(this.card.language, key, search, replace);

        Logger.log('APPLY', `[CronoStar] "Apply Now" triggered.`);

        if (this.card.isMenuOpen) {
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();
        }

        if (!this.card.hass) {
            Logger.error('APPLY', '[CronoStar] Home Assistant not available');
            this.showNotification(localize('ui.apply_now_error') + ' (HA not connected)', 'error');
            return;
        }

        if (!this.card.cronostarReady) {
            Logger.warn('APPLY', '[CronoStar] Backend startup not completed yet, deferring apply.');
            this.showNotification(localize('ui.waiting_profile_restore'), 'error');
            return;
        }

        const targetEntity = this.card.config.apply_entity;
        if (!targetEntity) {
            Logger.error('APPLY', '[CronoStar] `apply_entity` is not configured in the card.');
            this.showNotification(localize('ui.apply_now_error') + ': apply_entity not set', 'error');
            return;
        }

        try {
            const profileToSave = this.card.profileManager.lastLoadedProfile || this.card.selectedProfile;
            if (this.card.hasUnsavedChanges && profileToSave) {
                Logger.log('APPLY', `[CronoStar] Saving current profile '${profileToSave}' before applying`);
                await this.card.stateManager.ensureValuesApplied();
                await this.card.profileManager.saveProfile(profileToSave);
                Logger.log('APPLY', `[CronoStar] Profile '${profileToSave}' saved successfully`);
            }
            this.card.hasUnsavedChanges = false;

            const effectivePrefix = getEffectivePrefix(this.card.config);

            Logger.log('APPLY', `[CronoStar] Calling service 'cronostar.apply_now' for entity '${targetEntity}' with prefix '${effectivePrefix}'`);

            await this.card.hass.callService("cronostar", "apply_now", {
                entity_id: targetEntity,
                preset_type: this.card.selectedPreset,
                allow_max_value: this.card.config.allow_max_value,
                entity_prefix: this.card.config.entity_prefix,
                global_prefix: this.card.config.global_prefix
            });

            const currentHour = new Date().getHours().toString().padStart(2, '0');
            this.showNotification(
                localize('ui.apply_now_success', { '{hour}': currentHour }),
                'success'
            );

            this.card.cardSync.scheduleAutomationOverlaySuppression();

            setTimeout(() => {
                try {
                    this.card.cardSync.updateAutomationSync(this.card._hass);
                    this.card.requestUpdate();
                } catch (e) { Logger.warn('APPLY', '[CronoStar] Error in setTimeout:', e); } 
            }, 1000);
        } catch (err) {
            Logger.error('APPLY', '[CronoStar] Error during "Apply Now":', err);
            this.showNotification(`${localize('ui.apply_now_error')}: ${err.message}`, 'error');
        }

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }

        this.card.requestUpdate();
    }

    async handleAddProfile() {
        const localize = (key, search, replace) => this.card.localizationManager.localize(this.card.language, key, search, replace);
        try {
            const profileName = window.prompt(localize('prompt.add_profile_name'));
            if (!profileName || !profileName.trim()) {
                return;
            }
            const name = profileName.trim();

            await this.card.hass.callService("cronostar", "add_profile", {
                profile_name: name,
                preset_type: this.card.selectedPreset,
                entity_prefix: this.card.config.entity_prefix,
                global_prefix: this.card.config.global_prefix
            });
            this.showNotification(localize('notify.add_profile_success', { '{profile}': name }), 'success');
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();
            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }
        } catch (err) {
            const msg = err?.message || String(err);
            this.showNotification(this.card.localizationManager.localize(this.card.language, 'notify.add_profile_error', { '{profile}': '', '{error}': msg }), 'error');
            Logger.error('SAVE', '[CronoStar] Error adding profile:', err);
        }
    }

    async handleDeleteProfile() {
        const localize = (key, search, replace) => this.card.localizationManager.localize(this.card.language, key, search, replace);
        const profileToDelete = this.card.selectedProfile;
        if (!profileToDelete) {
            return;
        }
        const confirmed = window.confirm(localize('prompt.delete_profile_confirm', { '{profile}': profileToDelete }));
        if (!confirmed) {
            return;
        }
        try {
            await this.card.hass.callService("cronostar", "delete_profile", {
                profile_name: profileToDelete,
                preset_type: this.card.selectedPreset,
                entity_prefix: this.card.config.entity_prefix,
                global_prefix: this.card.config.global_prefix
            });
            this.showNotification(localize('notify.delete_profile_success', { '{profile}': profileToDelete }), 'success');
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();
            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }
        } catch (err) {
            const msg = err?.message || String(err);
            this.showNotification(localize('notify.delete_profile_error', { '{profile}': profileToDelete, '{error}': msg }), 'error');
            Logger.error('SAVE', '[CronoStar] Error deleting profile:', err);
        }
    }

    handleHelp() {
        const title = this.card.localizationManager.localize(this.card.language, 'help.title');
        const text = this.card.localizationManager.localize(this.card.language, 'help.text');
        try {
            window.alert(`${title}\n\n${text}`);
        } catch (e) {
            Logger.warn('UI', '[CronoStar] Unable to show help via alert');
            this.showNotification(title, 'success');
        }
    }

    async togglePause(e) {
        try {
            const checked = e?.target?.checked === true;
            const entityId = this.card.config?.pause_entity;
            if (!entityId || !this.card.hass) return;
            await this.card.hass.callService('input_boolean', checked ? 'turn_on' : 'turn_off', { entity_id: entityId });
            this.card.isPaused = checked;
            this.card.requestUpdate();
        } catch (err) {
            Logger.warn('UI', '[CronoStar] togglePause error:', err);
        }
    }

    showNotification(message, type = 'success') {
        if (!this.card.hass) {
            console.warn('[CronoStar] Cannot show notification: hass not available');
            return;
        }
        const notificationId = `cronostar_notification_${Date.now()}`;
        try {
            this.card.hass.callService("persistent_notification", "create", {
                title: type === 'success' ? "✅ CronoStar" : "❌ CronoStar",
                message: message,
                notification_id: notificationId
            });
            const dismissDelay = type === 'success' ? 5000 : 10000;
            setTimeout(() => {
                if (this.card.hass) {
                    this.card.hass.callService("persistent_notification", "dismiss", {
                        notification_id: notificationId
                    }).catch(() => { });
                }
            }, dismissDelay);
        } catch (err) {
            console.error('[CronoStar] Error showing notification:', err);
        }
    }

    handleCardClick(e) {
        if (this.card.isEditorContext()) {
            return;
        }
        if (this.card.isMenuOpen && !e.target.closest('.menu-content') && !e.target.closest('.menu-button')) {
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();

            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer) {
                chartContainer.focus();
            }

            this.card.requestUpdate();
        }
    }
}
