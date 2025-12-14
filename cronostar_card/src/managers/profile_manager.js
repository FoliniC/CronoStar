/**
 * Profile management for CronoStar Card (Refactored)
 * @module profile-manager
 */

import { Logger, safeParseFloat } from '../utils.js';
import { TIMEOUTS } from '../config.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';



export class ProfileManager {
  constructor(card) {
    this.card = card;
    this.lastLoadedProfile = "";
  }

  /**
   * Wait for entity to reach expected state
   * @param {string} entityId - Entity ID
   * @param {string} expectedState - Expected state
   * @param {number} timeoutMs - Timeout in ms
   * @returns {Promise}
   */
  async waitForEntityState(entityId, expectedState, timeoutMs = TIMEOUTS.entityStateWait) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const current = this.card.hass?.states?.[entityId]?.state;
        if (current === expectedState) {
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${entityId} to become '${expectedState}', current: '${current}'`));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  async saveProfile(profileName = this.lastLoadedProfile) {
    if (!profileName) {
      Logger.warn('SAVE', "[CronoStar] No profile specified for saving.");
      throw new Error("No profile specified for saving");
    }

    const presetType = this.card.selectedPreset || 'thermostat';
    const effectivePrefix = getEffectivePrefix(this.card.config);
    
    Logger.save(
      `[CronoStar] Saving profile '${profileName}' for preset type '${presetType}' ` +
      `with prefix '${effectivePrefix}' via service.`
    );

    const scheduleData = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourEntityId = this.card.stateManager.getEntityIdForHour(hour);
      const state = this.card.hass?.states?.[hourEntityId];
      const value = state ? safeParseFloat(state.state, this.card.config.min_value) : this.card.config.min_value;
      scheduleData.push({ hour: hour, value: value });
    }

    try {
      await this.card.hass.callService("cronostar", "save_profile", {
        profile_name: profileName,
        preset_type: presetType,
        schedule: scheduleData,
        entity_prefix: this.card.config.entity_prefix,
        global_prefix: this.card.config.global_prefix
      });

      this.card.hasUnsavedChanges = false;
      this.lastLoadedProfile = profileName;

      Logger.save(`[CronoStar] Profile '${profileName}' saved successfully.`);
    } catch (err) {
      Logger.error('SAVE', `[CronoStar] Error calling save_profile service for '${profileName}':`, err);
      throw err;
    }
  }

  /**
   * Load a profile into the schedule using the backend service.
   * @param {string} profileName - Name of the profile to load.
   * @returns {Promise}
   */
  async loadProfile(profileName) {
    this.card.stateManager.isLoadingProfile = true;
    
    const effectivePrefix = getEffectivePrefix(this.card.config);
    Logger.load(
      `[CronoStar] Loading profile '${profileName}' via service ` +
      `(prefix: '${effectivePrefix}')`
    );

    try {
      const presetType = this.card.selectedPreset || 'thermostat';

      const result = await this.card.hass.callWS({
        type: "call_service",
        domain: "cronostar",
        service: "load_profile",
        service_data: {
          profile_name: profileName,
          preset_type: presetType,
          entity_prefix: this.card.config.entity_prefix,
          global_prefix: this.card.config.global_prefix
        },
        return_response: true,
      });

      const responseData = result?.response;
      const rawSchedule = responseData?.schedule;
      let scheduleValues = null;

      if (responseData && !responseData.error && rawSchedule && Array.isArray(rawSchedule) && rawSchedule.length === 24) {
        // Success case: Profile loaded from backend
        if (typeof rawSchedule[0] === 'object' && rawSchedule[0] !== null && 'value' in rawSchedule[0]) {
          scheduleValues = rawSchedule.map(item => item.value);
        } else {
          scheduleValues = rawSchedule;
        }
        Logger.load(`[CronoStar] Profile data processed for '${profileName}'.`);
      } else {
        // Fallback case: Profile not found or invalid, create a default schedule
        Logger.warn('LOAD', `[CronoStar] Profile '${profileName}' not found or invalid. Falling back to default values.`);
        const defaultValue = this.card.config.min_value;
        scheduleValues = new Array(24).fill(defaultValue);
      }

      // Apply the loaded or default schedule
      for (let hour = 0; hour < 24; hour++) {
        const entityId = this.card.stateManager.getEntityIdForHour(hour);
        await this.card.hass.callService("input_number", "set_value", {
          entity_id: entityId,
          value: scheduleValues[hour],
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      this.card.stateManager.setData(scheduleValues);

      if (this.card.chartManager?.isInitialized()) {
        this.card.chartManager.updateData(scheduleValues);
      }

      this.card.hasUnsavedChanges = false;
      this.lastLoadedProfile = profileName;
      Logger.load(`[CronoStar] Profile '${profileName}' loaded and applied successfully.`);

    } catch (err) {
      Logger.error('LOAD', `[CronoStar] Error calling load_profile service for '${profileName}':`, err);
    } finally {
      this.card.stateManager.isLoadingProfile = false;
    }
  }

  /**
   * Handle profile selection change from the UI.
   * @param {Event} e - The selection event.
   */
  async handleProfileSelection(e) {
    this.card.suppressClickUntil = Date.now() + TIMEOUTS.menuSuppression + 500;

    if (this.card.selectionManager) {
      this.card.selectionManager.snapshotSelection();
    }

    const newProfile = e?.target?.value || e?.detail?.value || '';
    if (!newProfile || newProfile === this.card.selectedProfile) {
      return;
    }

    const previousProfile = this.lastLoadedProfile || this.card.selectedProfile;

    if (this.card.hasUnsavedChanges && previousProfile) {
      try {
        Logger.save(`[CronoStar] Auto-saving previous profile '${previousProfile}'`);
        await this.card.stateManager.ensureValuesApplied();
        await this.saveProfile(previousProfile);
      } catch (err) {
        Logger.error('SAVE', "[CronoStar] Error during auto-save:", err);
      }
    }

    this.card.selectedProfile = newProfile;
    if (this.card.config.profiles_select_entity) {
      try {
        await this.card.hass.callService("input_select", "select_option", {
          entity_id: this.card.config.profiles_select_entity,
          option: newProfile,
        });
        await this.waitForEntityState(this.card.config.profiles_select_entity, newProfile, TIMEOUTS.entityStateWait);
      } catch (err) {
        Logger.warn('LOAD', "[CronoStar] select_option failed:", err);
      }
    }

    try {
      await this.loadProfile(newProfile);
      if (this.card.selectionManager) {
        this.card.selectionManager.restoreSelectionFromSnapshot();
      }
      this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;
    } catch (err) {
      Logger.error('LOAD', "[CronoStar] Error during profile load:", err);
    }
  }

  /**
   * Reset changes by reloading the current profile.
   */
  async resetChanges() {
    const profileToReload = this.lastLoadedProfile || this.card.selectedProfile;
    if (!profileToReload) {
      Logger.warn('LOAD', "[CronoStar] No profile to reload.");
      return;
    }

    if (this.card.selectionManager) {
      this.card.selectionManager.snapshotSelection();
    }

    try {
      await this.loadProfile(profileToReload);
      if (this.card.selectionManager) {
        this.card.selectionManager.restoreSelectionFromSnapshot();
      }
    } catch (err) {
      Logger.error('LOAD', "[CronoStar] Error reloading profile:", err);
    }
  }
}
