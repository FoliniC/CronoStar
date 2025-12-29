/**
 * Profile management for CronoStar Card (Refactored - No Entities)
 * @module profile-manager
 */

import { Logger } from '../utils.js';
import { TIMEOUTS, extractCardConfig } from '../config.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';

export class ProfileManager {
  constructor(card) {
    this.card = card;
    this.lastLoadedProfile = "";
  }

  _buildMetaFromConfig(config) {
    const src = (config && typeof config === 'object') ? config : {};
    // Persist only safe wizard/card config keys (single source of truth).
    // IMPORTANT: do not leak deprecated keys like entity_prefix into saved JSON.
    const cleanConfig = extractCardConfig(src);
    const rest = { ...cleanConfig };
    delete rest.entity_prefix;
    // Ensure meta carries global_prefix consistently.
    if (!rest.global_prefix) {
      const effectivePrefix = getEffectivePrefix(src);
      if (effectivePrefix) rest.global_prefix = effectivePrefix;
    }
    return rest;
  }

  async saveProfile(profileName = this.lastLoadedProfile) {
    if (!profileName) {
      Logger.warn('SAVE', "[CronoStar] No profile specified for saving.");
      throw new Error("No profile specified for saving");
    }

    const presetType = this.card.selectedPreset || 'thermostat';
    const effectivePrefix = getEffectivePrefix(this.card.config);

    Logger.save(
      `[CronoStar] === SAVE PROFILE START === Profile: '${profileName}', Preset: ${presetType}, Prefix: ${effectivePrefix}`
    );

    // Build schedule from current points without extra compression;
    // backend will normalize and optimize.
    const rawData = this.card.stateManager.getData() || [];
    const scheduleData = rawData
      .map((p) => ({
        minutes: this.card.stateManager.timeToMinutes(p.time),
        time: String(p.time),
        value: Number(p.value)
      }))
      .filter((pt) => Number.isFinite(pt.value) && /^\d{2}:\d{2}$/.test(pt.time))
      .sort((a, b) => a.minutes - b.minutes)
      .map(({ time, value }) => ({ time, value }));

    // Log outgoing sparse schedule
    Logger.save(
      `[CronoStar] 📤 Outgoing schedule: count=${scheduleData.length}, sample=${JSON.stringify(scheduleData.slice(0, 10))}`
    );

    try {
      await this.card.hass.callService('cronostar', 'save_profile', {
        profile_name: profileName,
        preset_type: presetType,
        schedule: scheduleData,
        global_prefix: effectivePrefix,
        meta: this._buildMetaFromConfig(this.card.config),
      });

      this.card.hasUnsavedChanges = false;
      this.lastLoadedProfile = profileName;

      Logger.save(`[CronoStar] (Success) Profile '${profileName}' saved successfully.`);
      Logger.save("[CronoStar] === SAVE PROFILE END ===");
    } catch (err) {
      Logger.error('SAVE', `[CronoStar] (Error) Error calling save_profile service for '${profileName}':`, err);
      Logger.save("[CronoStar] === SAVE PROFILE END (ERROR) ===");
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
      `[CronoStar] === LOAD PROFILE START === Profile: '${profileName}', Prefix: '${effectivePrefix}'`
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
          global_prefix: effectivePrefix
        },
        return_response: true,
      });

      const responseData = result?.response;

      Logger.load(`[CronoStar] 📥 Response received:`, responseData);

      const rawSchedule = responseData?.schedule;
      const meta = responseData?.meta;
      let scheduleValues = [];

      if (responseData && !responseData.error && rawSchedule && Array.isArray(rawSchedule)) {
        // Success case: Profile loaded from backend
        // Update local config if meta is present in response
        if (meta) {
          const cleanMeta = extractCardConfig(meta);
          this.card.config = { ...this.card.config, ...cleanMeta };
        }

        // Sparse mode: expect {time,value} or {x,y} objects and pass through
        scheduleValues = rawSchedule;

        // Log sample
        const sample = scheduleValues.slice(0, 5);
        Logger.load(
          `[CronoStar] 📊 Parsed schedule: length=${scheduleValues.length}, sample=${JSON.stringify(sample)}`
        );

        Logger.load(`[CronoStar] (Success) Profile data processed for '${profileName}'. Points: ${scheduleValues.length}`);
      } else {
        // Fallback: no schedule returned; keep existing data (sparse mode)
        Logger.warn('LOAD', `[CronoStar] ⚠️ Profile '${profileName}' not found or invalid. Keeping existing schedule.`);
        scheduleValues = this.card.stateManager.getData();
      }

      // Update Internal Memory directly
      this.card.stateManager.setData(scheduleValues);

      // Sparse mode: no grid resize

      // Update Chart
      if (this.card.chartManager?.isInitialized()) {
        this.card.chartManager.updateData(scheduleValues);
      }

      this.card.hasUnsavedChanges = false;
      this.lastLoadedProfile = profileName;
      Logger.load(`[CronoStar] (Success) Profile '${profileName}' loaded to memory successfully.`);
      Logger.load("[CronoStar] === LOAD PROFILE END ===");

    } catch (err) {
      Logger.error('LOAD', `[CronoStar] (Error) Error calling load_profile service for '${profileName}':`, err);
      Logger.load("[CronoStar] === LOAD PROFILE END (ERROR) ===");
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
      this.card.pendingProfileChange = newProfile;
      this.card.showUnsavedChangesDialog = true;
      this.card.requestUpdate();
      return;
    }

    this.card.selectedProfile = newProfile;

    // Update the input_select entity so other clients know (if configured)
    if (this.card.config.profiles_select_entity) {
      this.card.hass.callService("input_select", "select_option", {
        entity_id: this.card.config.profiles_select_entity,
        option: newProfile,
      }).catch(err => Logger.warn('LOAD', "[CronoStar] select_option failed:", err));
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
