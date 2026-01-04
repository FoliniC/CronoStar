import { CARD_CONFIG_PRESETS, validateConfig, VERSION } from '../config.js';
import { Logger, timeToMinutes } from '../utils.js';
import { getEffectivePrefix, getAliasWithPrefix } from '../utils/prefix_utils.js';
import { copyToClipboard } from '../editor/services/service_handlers.js';

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
            // Close menu on next global click
            const closeMenu = (event) => {
                if (!event.composedPath().includes(this.card)) {
                    this.card.isMenuOpen = false;
                    this.card.keyboardHandler.enable();
                    this.card.requestUpdate();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 10);
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
        // Ensure default drag snap configuration exists if not provided
        this.card.config.drag_snap = {
            default: this.card.config.drag_snap?.default ?? 5,
            shift: this.card.config.drag_snap?.shift ?? 30,
            ctrl: this.card.config.drag_snap?.ctrl ?? 1,
            alt: this.card.config.drag_snap?.alt ?? 15,
        };
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

        this.card.cardSync.updateAutomationSync(this.card.hass);
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
        this._closeContextMenu();

        const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
        if (chartContainer && !this.card.isEditorContext()) {
            chartContainer.focus();
        }
    }

    handleAlignLeft() {
        this.card.stateManager.alignSelectedPoints('left');
        this.card.isMenuOpen = false;
        this._closeContextMenu();
    }

    handleAlignRight() {
        this.card.stateManager.alignSelectedPoints('right');
        this.card.isMenuOpen = false;
        this._closeContextMenu();
    }

    handleDeleteSelected() {
        const selMgr = this.card.selectionManager;
        const indices = [...selMgr.getSelectedPoints()].sort((a, b) => b - a);

        if (indices.length === 0) {
            this._closeContextMenu();
            return;
        }

        const stateMgr = this.card.stateManager;
        const numPoints = stateMgr.getNumPoints();

        // Protective logic: don't delete if we only have boundaries or if point is a boundary
        // Boundaries are index 0 and index (length-1)
        indices.forEach(idx => {
            if (idx === 0 || idx === numPoints - 1) {
                Logger.warn('UI', `Skipping deletion of boundary point at index ${idx}`);
                return;
            }
            stateMgr.removePoint(idx);
        });

        // Sync chart
        if (this.card.chartManager?.isInitialized()) {
            this.card.chartManager.updateData(stateMgr.getData());
        }

        selMgr.clearSelection();
        this._closeContextMenu();
        this.card.requestUpdate();
    }

    _closeContextMenu() {
        this.card.contextMenu = { ...this.card.contextMenu, show: false };
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
        const targetEntity = this.card.config.target_entity;
        if (!targetEntity) {
            Logger.error('APPLY', '[CronoStar] `target_entity` is not configured in the card.');
            this.showNotification(localize('ui.apply_now_error') + ': target_entity not set', 'error');
            return;
        }

        try {
            const effectivePrefix = getEffectivePrefix(this.card.config);

            // Build sparse schedule payload for persistence
            const rawData = this.card.stateManager.getData() || [];
            const scheduleData = rawData
                .map((p) => ({
                    minutes: timeToMinutes(p.time),
                    time: String(p.time),
                    value: Number(p.value)
                }))
                .filter((pt) => Number.isFinite(pt.value) && /^\d{2}:\d{2}$/.test(pt.time))
                .sort((a, b) => a.minutes - b.minutes)
                .map(({ time, value }) => ({ time, value }));

            const profileName = this.card.selectedProfile || this.card.profileManager.lastLoadedProfile || 'Default';

            // Persist profile explicitly like the wizard
            const safeMeta = (() => {
                const src = (this.card.config && typeof this.card.config === 'object') ? this.card.config : {};
                const rest = { ...src };
                delete rest.entity_prefix;
                if (!rest.global_prefix && effectivePrefix) rest.global_prefix = effectivePrefix;
                // Ensure scheduler can apply immediately by persisting the canonical target entity in profile meta
                if (!rest.target_entity && targetEntity) rest.target_entity = targetEntity;
                // Persist drag snap config for frontend reference only (not used by backend schedule)
                if (this.card.config?.drag_snap) rest.drag_snap = this.card.config.drag_snap;
                return rest;
            })();

            await this.card.hass.callService('cronostar', 'save_profile', {
                profile_name: profileName,
                preset_type: this.card.selectedPreset,
                schedule: scheduleData,
                global_prefix: effectivePrefix,
                meta: safeMeta,
            });

            this.card.hasUnsavedChanges = false;

            Logger.log('APPLY', `[CronoStar] Calling service 'cronostar.apply_now' for entity '${targetEntity}' with prefix '${effectivePrefix}'`);
            try {
                const first = scheduleData?.[0];
                const last = scheduleData?.[scheduleData.length - 1];
                Logger.log(
                    'APPLY',
                    `[CronoStar] apply_now payload: profile_name='${profileName}' preset_type='${this.card.selectedPreset}' global_prefix='${effectivePrefix}' schedule_len=${scheduleData?.length || 0} first=${first ? JSON.stringify(first) : 'null'} last=${last ? JSON.stringify(last) : 'null'} target_entity='${targetEntity}'`
                );
            } catch (e) {
                Logger.warn('APPLY', '[CronoStar] Failed to log apply_now payload:', e);
            }

            await this.card.hass.callService("cronostar", "apply_now", {
                target_entity: targetEntity,
                preset_type: this.card.selectedPreset,
                allow_max_value: this.card.config.allow_max_value,
                // IMPORTANT: backend save_profile requires global_prefix.
                // Use the same effective prefix used elsewhere (and ensure trailing underscore via getEffectivePrefix).
                global_prefix: effectivePrefix,
                // Provide optional persistence params so backend can save after apply
                profile_name: profileName,
                schedule: scheduleData,
                // Let backend persist enough config for later scheduler apply.
                // (safe: profile_service only uses meta when provided)
                meta: {
                    target_entity: targetEntity,
                },
            });

            const currentHour = new Date().getHours().toString().padStart(2, '0');
            this.showNotification(
                localize('ui.apply_now_success', { '{hour}': currentHour }),
                'success'
            );

            this.card.cardSync.scheduleAutomationOverlaySuppression();
            setTimeout(() => {
                try {
                    this.card.cardSync.updateAutomationSync(this.card.hass);
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

    // --- NEW: Add/Delete profile handlers ---
    async handleAddProfile() {
        const localize = (key, search, replace) =>
            this.card.localizationManager.localize(this.card.language, key, search, replace);

        try {
            if (!this.card.hass) {
                this.showNotification(localize('notify.add_profile_error', { '{error}': 'HA not connected' }), 'error');
                return;
            }
            // Open interactive dialog with suggestions from other cards sharing the same preset type
            const profileName = await this._openAddProfileDialog();
            if (!profileName) return; // user cancelled

            // Optional: avoid duplicates client-side
            if (Array.isArray(this.card.profileOptions) && this.card.profileOptions.includes(profileName)) {
                this.showNotification(localize('notify.add_profile_error', { '{error}': 'Profile already exists' }), 'error');
                return;
            }

            await this.card.hass.callService('cronostar', 'add_profile', {
                profile_name: profileName,
                preset_type: this.card.selectedPreset,
                global_prefix: this.card.config.global_prefix
            });

            // Update UI
            try {
                // Update local options list immediately (backend will also refresh the input_select)
                if (!Array.isArray(this.card.profileOptions)) this.card.profileOptions = [];
                if (!this.card.profileOptions.includes(profileName)) {
                    this.card.profileOptions = [...this.card.profileOptions, profileName];
                }

                // Set selected profile and load it
                this.card.selectedProfile = profileName;
                await this.card.profileManager.loadProfile(profileName);

                // If we have an input_select entity, set the option there too
                if (this.card.config.profiles_select_entity) {
                    this.card.hass.callService('input_select', 'select_option', {
                        entity_id: this.card.config.profiles_select_entity,
                        option: profileName
                    }).catch(() => { /* ignore */ });
                }
            } catch (e) {
                Logger.warn('PROFILE', 'Post-create UI update failed:', e);
            }

            this.showNotification(localize('notify.add_profile_success', { '{profile}': profileName }), 'success');

        } catch (err) {
            Logger.error('PROFILE', '[CronoStar] Error adding profile:', err);
            const msg = err?.message || String(err);
            this.showNotification(this.card.localizationManager.localize(this.card.language, 'notify.add_profile_error', { '{error}': msg }), 'error');
        } finally {
            // Close menu, focus chart
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();
            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }
            this.card.requestUpdate();
        }
    }

    async _fetchProfileNameSuggestions(presetType) {
        try {
            const result = await this.card.hass.callWS({
                type: 'call_service',
                domain: 'cronostar',
                service: 'list_all_profiles',
                service_data: { force_reload: true },
                return_response: true
            });
            const data = result?.response || {};
            const section = data?.[presetType] || {};
            const files = Array.isArray(section.files) ? section.files : [];

            const existing = new Set(Array.isArray(this.card.profileOptions) ? this.card.profileOptions : []);
            const currentPrefix = (this.card.config?.global_prefix || '').replace(/_+$/, '');
            const names = new Set();

            files.forEach(f => {
                const fname = String(f?.filename || '');
                // Exclude this card's container by matching prefix in filename if present
                if (currentPrefix && fname.includes(currentPrefix)) return;
                const profs = Array.isArray(f?.profiles) ? f.profiles : (Array.isArray(f?.profile_names) ? f.profile_names : []);
                profs.forEach(n => { const name = String(n || '').trim(); if (name && !existing.has(name)) names.add(name); });
            });

            return Array.from(names).sort();
        } catch (e) {
            Logger.warn('PROFILE', 'Failed to fetch profile suggestions:', e);
            return [];
        }
    }

    async _openAddProfileDialog() {
        const localize = (key, search, replace) =>
            this.card.localizationManager.localize(this.card.language, key, search, replace);
        // Safe localize with fallback: if localization returns the key or empty, use fallback
        const t = (key, fallback) => {
            try {
                const s = this.card.localizationManager.localize(this.card.language, key);
                return (s && s !== key) ? s : fallback;
            } catch (_) {
                return fallback;
            }
        };

        const presetType = this.card.selectedPreset || this.card.config?.preset_type || 'thermostat';
        const suggestions = await this._fetchProfileNameSuggestions(presetType);

        return new Promise((resolve) => {
            // Overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.6);
                display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;`;
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: var(--card-background-color, #fff);
                border-radius: 12px; padding: 20px; width: 420px; max-width: 95vw; color: var(--primary-text-color);
                box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: 1px solid var(--divider-color);`;

            const title = document.createElement('h3');
            title.textContent = t('prompt.add_profile_title', 'Add Profile');
            title.style.margin = '0 0 12px 0';
            title.style.color = 'var(--primary-color)';

            const inputLabel = document.createElement('label');
            inputLabel.textContent = t('prompt.add_profile_name', 'Profile name');
            inputLabel.style.display = 'block';
            inputLabel.style.margin = '10px 0 6px 0';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = t('prompt.add_profile_placeholder', 'Enter profile name');
            input.style.cssText = 'width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color); box-sizing: border-box;';

            const suggTitle = document.createElement('div');
            suggTitle.textContent = t('prompt.add_profile_suggestions', 'Suggestions from other cards');
            suggTitle.style.cssText = 'margin: 14px 0 8px 0; font-weight: 600; opacity: 0.8;';

            const suggWrap = document.createElement('div');
            suggWrap.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

            if (suggestions.length === 0) {
                const none = document.createElement('div');
                none.textContent = t('prompt.no_suggestions', 'No suggestions available');
                none.style.cssText = 'opacity: 0.7; font-size: 13px;';
                suggWrap.appendChild(none);
            } else {
                suggestions.forEach(name => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.textContent = name;
                    chip.style.cssText = `
                        padding: 6px 10px; border-radius: 999px; border: 1px solid var(--divider-color);
                        background: var(--secondary-background-color, #f5f5f5); cursor: pointer; font-size: 13px;`;
                    chip.onclick = () => { input.value = name; input.focus(); };
                    suggWrap.appendChild(chip);
                });
            }

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = t('prompt.cancel', 'Cancel');
            cancelBtn.style.cssText = 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--divider-color); background: transparent; cursor: pointer;';
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.textContent = t('prompt.create', 'Create');
            okBtn.style.cssText = 'padding: 8px 12px; border-radius: 8px; border: none; background: var(--primary-color); color: white; cursor: pointer;';

            const close = (val) => { overlay.remove(); resolve(val); };
            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => {
                const val = (input.value || '').trim();
                if (!val) return;
                close(val);
            };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

            dialog.appendChild(title);
            dialog.appendChild(inputLabel);
            dialog.appendChild(input);
            dialog.appendChild(suggTitle);
            dialog.appendChild(suggWrap);
            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(okBtn);
            dialog.appendChild(btnRow);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            input.focus();
        });
    }

    async handleDeleteProfile() {
        const localize = (key, search, replace) =>
            this.card.localizationManager.localize(this.card.language, key, search, replace);

        try {
            if (!this.card.hass) {
                this.showNotification(localize('notify.delete_profile_error', { '{error}': 'HA not connected' }), 'error');
                return;
            }

            const current = this.card.selectedProfile;
            if (!current) {
                this.showNotification(localize('notify.delete_profile_error', { '{error}': 'No profile selected' }), 'error');
                return;
            }

            const confirmed = (typeof window !== 'undefined')
                ? window.confirm(localize('prompt.delete_profile_confirm', { '{profile}': current }))
                : true;

            if (!confirmed) return;

            await this.card.hass.callService('cronostar', 'delete_profile', {
                profile_name: current,
                preset_type: this.card.selectedPreset,
                global_prefix: this.card.config.global_prefix
            });

            // Update options and selection
            try {
                const options = Array.isArray(this.card.profileOptions) ? [...this.card.profileOptions] : [];
                const idx = options.indexOf(current);
                if (idx >= 0) {
                    options.splice(idx, 1);
                    this.card.profileOptions = options;
                }

                // Pick next profile (first in list) or clear
                const next = options.length ? options[0] : '';
                this.card.selectedProfile = next;

                if (next) {
                    await this.card.profileManager.loadProfile(next);
                    if (this.card.config.profiles_select_entity) {
                        this.card.hass.callService('input_select', 'select_option', {
                            entity_id: this.card.config.profiles_select_entity,
                            option: next
                        }).catch(() => { /* ignore */ });
                    }
                } else {
                    // No profiles left: reset schedule to defaults
                    this.card.stateManager._initializeScheduleData();
                    if (this.card.chartManager?.isInitialized()) {
                        this.card.chartManager.updateData(this.card.stateManager.getData());
                    }
                }
            } catch (e) {
                Logger.warn('PROFILE', 'Post-delete UI update failed:', e);
            }

            this.showNotification(localize('notify.delete_profile_success', { '{profile}': current }), 'success');

        } catch (err) {
            Logger.error('PROFILE', '[CronoStar] Error deleting profile:', err);
            const msg = err?.message || String(err);
            this.showNotification(this.card.localizationManager.localize(this.card.language, 'notify.delete_profile_error', { '{error}': msg }), 'error');
        } finally {
            // Close menu, focus chart
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();
            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }
            this.card.requestUpdate();
        }
    }

    handleHelp() {
        const localize = (key, search, replace) =>
            this.card.localizationManager.localize(this.card.language, key, search, replace);

        const title = localize('help.title');
        const introText = localize('help.text');
        const mouseManual = localize('help.mouse_manual');
        const keyboardManual = localize('help.keyboard_manual');

        // Current Configuration Info
        const cardId = this.card.cardId || 'Not registered';
        const preset = this.card.config?.preset_type || this.card.config?.preset || "thermostat";
        const prefix = getEffectivePrefix(this.card.config);
        const targetEntity = this.card.config?.target_entity || 'Not configured';
        const profileEntity = this.card.config?.profiles_select_entity || 'Not configured';
        const pauseEntity = this.card.config?.pause_entity || 'Not configured';
        const currentProfile = this.card.selectedProfile || 'No profile selected';
        const automationAlias = getAliasWithPrefix(prefix, this.card.language);

        // Entity States (from registration)
        const states = this.card.entityStates || {};
        const stTarget = states.target ? ` (${states.target})` : '';
        const stHelper = states.current_helper ? ` (${states.current_helper})` : '';
        const stSelector = states.selector ? ` (${states.selector})` : '';
        const stPause = states.pause ? ` (${states.pause})` : '';

        // Expected entities
        const prefixBase = prefix.replace(/_+$/, '');
        const currentEntity = `input_number.${prefix}current`;


        // Dynamic info
        const actualPoints = this.card.stateManager?.getNumPoints() || 0;

        const configInfoTechnical = this.card.language === 'it'
            ? `=== Configurazione Attuale ===
Card ID: ${cardId}
Versione: ${VERSION}
Preset: ${preset}
Profilo Attivo: ${currentProfile}
Prefisso: ${prefix}
Automazione: ${automationAlias}

=== Entità ===
Entità Destinazione: ${targetEntity}${stTarget}
Entità Valore Corrente: ${currentEntity}${stHelper}
Selettore Profili: ${profileEntity}${stSelector}
Entità Pausa: ${pauseEntity}${stPause}

=== Configurazione ===
Intervallo: Dinamico (Time-based)
Punti nel Profilo: ${actualPoints}

=== File di Configurazione ===
1. Profili: /config/cronostar/profiles/${prefixBase}_data.json`
            : `=== Current Configuration ===
Card ID: ${cardId}
Version: ${VERSION}
Preset: ${preset}
Active Profile: ${currentProfile}
Prefix: ${prefix}
Automation: ${automationAlias}

=== Entities ===
Target Entity: ${targetEntity}${stTarget}
Current Value Entity: ${currentEntity}${stHelper}
Profiles Selector: ${profileEntity}${stSelector}
Pause Entity: ${pauseEntity}${stPause}

=== Configuration ===
Interval: Dynamic (Time-based)
Points in Profile: ${actualPoints}

=== Configuration Files ===
1. Profiles: /config/cronostar/profiles/${prefixBase}_data.json`;

        // Create custom dialog overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px;
    `;
        const dialog = document.createElement('div');
        dialog.style.cssText = `
      background: var(--card-background-color, white);
      border-radius: 12px; padding: 24px;
      max-width: 800px; width: 100%; max-height: 90vh;
      overflow-y: auto; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      font-family: var(--paper-font-body1_-_font-family, inherit);
    `;
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; border-bottom: 1px solid var(--divider-color);
      padding-bottom: 10px;
    `;
        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        titleEl.style.cssText = `margin: 0; color: var(--primary-color);`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
      background: none; border: none; font-size: 24px; cursor: pointer;
      color: var(--primary-text-color); padding: 4px;
    `;
        closeBtn.onclick = () => overlay.remove();
        headerDiv.appendChild(titleEl);
        headerDiv.appendChild(closeBtn);
        dialog.appendChild(headerDiv);

        const sections = [
            { title: '', text: introText },
            { title: this.card.language === 'it' ? '(Mouse) Utilizzo Mouse' : '(Mouse) Mouse Usage', text: mouseManual },
            { title: this.card.language === 'it' ? '(Keyboard) Utilizzo Tastiera' : '(Keyboard) Keyboard Usage', text: keyboardManual }
        ];

        sections.forEach(s => {
            if (s.title) {
                const h3 = document.createElement('h3');
                h3.textContent = s.title;
                h3.style.margin = '16px 0 8px 0';
                dialog.appendChild(h3);
            }
            const p = document.createElement('div');
            p.style.whiteSpace = 'pre-wrap';
            p.style.marginBottom = '16px';
            p.style.lineHeight = '1.5';
            p.style.fontSize = '14px';
            p.textContent = s.text;
            dialog.appendChild(p);
        });

        const techTitle = document.createElement('h3');
        techTitle.textContent = this.card.language === 'it' ? '(Technical Details) Dettagli Tecnici' : '(Technical Details) Technical Details';
        techTitle.style.margin = '24px 0 8px 0';
        dialog.appendChild(techTitle);

        const textarea = document.createElement('textarea');
        textarea.value = configInfoTechnical;
        textarea.readOnly = true;
        textarea.style.cssText = `
      width: 100%; min-height: 200px;
      font-family: monospace; font-size: 12px;
      padding: 12px; border: 1px solid var(--divider-color);
      border-radius: 8px; background: var(--secondary-background-color, #f5f5f5);
      color: var(--primary-text-color); resize: vertical; box-sizing: border-box;
    `;
        dialog.appendChild(textarea);

        const copyBtn = document.createElement('button');
        copyBtn.textContent = this.card.language === 'it' ? '📋 Copia dettagli tecnici' : '📋 Copy technical details';
        copyBtn.style.cssText = `
      margin-top: 12px; padding: 10px 20px;
      background: var(--primary-color); color: white;
      border: none; border-radius: 6px;
      cursor: pointer; font-size: 14px; font-weight: bold;
    `;
        copyBtn.onclick = async () => {
            const successMsg = this.card.language === 'it' ? '(Copied!) Copiato!' : '(Copied!) Copied!';
            const errorMsg = this.card.language === 'it' ? 'Errore copia' : 'Copy Error';
            const result = await copyToClipboard(configInfoTechnical, successMsg, errorMsg);
            if (result.success) {
                copyBtn.textContent = result.message;
                setTimeout(() => {
                    copyBtn.textContent = this.card.language === 'it' ? '📋 Copia dettagli tecnici' : '📋 Copy technical details';
                }, 2000);
            }
        };
        dialog.appendChild(document.createElement('br'));
        dialog.appendChild(copyBtn);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    } // Missing closing brace added here
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
                title: type === 'success' ? "(Success) CronoStar" : "(Error) CronoStar",
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
        if (this.card.isMenuOpen && !e.target.closest('.menu-content') && !e.target.closest('.menu-button')) {
            this.card.isMenuOpen = false;
            this.card.keyboardHandler.enable();

            const chartContainer = this.card.shadowRoot?.querySelector(".chart-container");
            if (chartContainer && !this.card.isEditorContext()) {
                chartContainer.focus();
            }

            this.card.requestUpdate();
        }
    }
}  
