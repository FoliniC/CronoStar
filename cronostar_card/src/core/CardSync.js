import { TIMEOUTS } from '../config.js';
import { Logger } from '../utils.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';

export class CardSync {
    constructor(card) {
        this.card = card;
    }

    computeNextHourBoundaryPlus(msAfter = 5000) {
        const d = new Date();
        d.setSeconds(0, 0);
        d.setMinutes(0);
        d.setHours(d.getHours() + 1);
        return d.getTime() + (msAfter || 0);
    }

    scheduleAutomationOverlaySuppression(ms = TIMEOUTS.automationSuppression) {
        const untilNextHour = this.computeNextHourBoundaryPlus(5000);
        const simpleCooldown = Date.now() + (ms || 7000);
        this.card.overlaySuppressionUntil = Math.max(untilNextHour, simpleCooldown);
        this.card.lastEditAt = Date.now();
        this.card.awaitingAutomation = false;
        this.card.outOfSyncDetails = "";
        Logger.log('SYNC', `[CronoStar] Suppressing automation overlay until ${new Date(this.card.overlaySuppressionUntil).toLocaleTimeString()} (cooldown=${ms || 7000}ms)`);
        this.card.requestUpdate();
    }

    getAwaitingAutomationText() {
        const hour = new Date().getHours().toString().padStart(2, '0');
        if (this.card.language === 'it') {
            return `In attesa che l'automazione applichi i valori del profilo (ora ${hour}:00).`;
        }
        return `Waiting for automation to apply the scheduled values (hour ${hour}:00).`;
    }

    getScheduledValue(hass) {
        try {
            // Get value from internal memory
            const hourIdx = this.card.stateManager?.getCurrentIndex() || 0;
            const data = this.card.stateManager?.getData();
            if (!data || data.length === 0) return null;
            
            // Handle different intervals
            // If we have more than 24 points, we need to pick the correct index
            // getCurrentIndex handles this logic (time -> index)
            const val = data[hourIdx];
            return (val !== null && val !== undefined) ? Number(val) : null;
        } catch {
            return null;
        }
    }

    getTargetEntityAppliedValue(hass) {
        try {
            const entityId = this.card.config?.target_entity;
            if (!entityId) return null;
            const st = hass.states[entityId];
            if (!st) return null;
            const domain = entityId.split('.')[0];
            if (domain === 'climate') {
                const attrs = st.attributes || {};
                if (attrs.temperature !== undefined && attrs.temperature !== null) {
                    const v = Number(attrs.temperature);
                    return Number.isFinite(v) ? v : null;
                }
                if (attrs.target_temperature !== undefined && attrs.target_temperature !== null) {
                    const v = Number(attrs.target_temperature);
                    return Number.isFinite(v) ? v : null;
                }
                if (attrs.target_temp_low !== undefined && attrs.target_temp_low !== null) {
                    const v = Number(attrs.target_temp_low);
                    return Number.isFinite(v) ? v : null;
                }
                return null;
            } else if (domain === 'number') {
                const v = Number(st.state);
                return Number.isFinite(v) ? v : null;
            } else if (domain === 'switch') {
                return st.state === 'on' ? 1 : 0;
            }
            return null;
        } catch {
            return null;
        }
    }

    updateAutomationSync(hass) {
        if (this.card.isEditorContext()) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }
        if (!hass || !this.card.config?.target_entity) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }
        // Removed cronostarReady check related to entities
        
        if (this.card.isPaused) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }
        if (this.card.hasUnsavedChanges || this.card.isDragging) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }
        if (Date.now() < this.card.overlaySuppressionUntil) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }
        if (this.card.lastEditAt && (Date.now() - this.card.lastEditAt) < TIMEOUTS.editingGraceMs) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }

        // Only check for sync if the user has actually edited/interacted with the card in this session
        if (!this.card.lastEditAt) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }

        const scheduled = this.getScheduledValue(hass);
        const applied = this.getTargetEntityAppliedValue(hass);

        if (scheduled === null || applied === null) {
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
            return;
        }

        const isSwitchPreset = this.card.config?.is_switch_preset === true;
        const tolerance = isSwitchPreset ? 0.5 : Math.max(0.05, (this.card.config?.step_value || 0.5) / 2);
        const wasAwaiting = this.card.awaitingAutomation;
        const diff = Math.abs(Number(scheduled) - Number(applied));
        const mismatchNow = diff > tolerance;

        if (!mismatchNow) {
            this.card.mismatchSince = 0;
            this.card.awaitingAutomation = false;
            this.card.outOfSyncDetails = "";
        } else {
            if (!this.card.mismatchSince) {
                this.card.mismatchSince = Date.now();
                this.card.awaitingAutomation = false;
                this.card.outOfSyncDetails = "";
            } else {
                const persisted = Date.now() - this.card.mismatchSince;
                this.card.awaitingAutomation = persisted >= TIMEOUTS.mismatchPersistenceMs;

                if (this.card.awaitingAutomation) {
                    const hourIdx = this.card.stateManager?.getCurrentIndex() || 0;
                    const hourLabel = this.card.stateManager?.getPointLabel(hourIdx) || 'Now';
                    const details = this.card.language === 'it'
                        ? `Programma ${hourLabel}: ${scheduled} ≠ Entità (${this.card.config.target_entity}) ${applied}`
                        : `Schedule ${hourLabel}: ${scheduled} ≠ Entity (${this.card.config.target_entity}) ${applied}`;
                    
                    this.card.outOfSyncDetails = details;

                    if (!wasAwaiting) {
                        Logger.log('SYNC', `[CronoStar] Awaiting automation started (persisted ${persisted}ms): scheduled=${scheduled}, applied=${applied}`);
                    }
                } else {
                    this.card.outOfSyncDetails = "";
                }
            }
        }

        this.card.requestUpdate();
    }
}
