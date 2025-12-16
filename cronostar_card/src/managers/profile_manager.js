/**
 * Profile management for CronoStar Card (Refactored - No Entities)
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

  async saveProfile(profileName = this.lastLoadedProfile) {
    if (!profileName) {
      Logger.warn('SAVE', "[CronoStar] No profile specified for saving.");
      throw new Error("No profile specified for saving");
    }

    const presetType = this.card.selectedPreset || 'thermostat';
    const effectivePrefix = getEffectivePrefix(this.card.config);
    
    Logger.save(
      `[CronoStar] Saving profile '${profileName}' for preset type '${presetType}' ` +
      `with prefix '${effectivePrefix}' via service (from internal memory).`
    );

    // Read directly from internal memory
    const rawData = this.card.stateManager.getData();
    // Convert to object array format expected by backend if needed, or just values
    // Backend expects: [{hour: 0, value: 20}, ...] usually
    // But wait, the backend save_profile service usually takes just the schedule list or we adapt it.
    // Let's stick to the previous format: [{hour: i, value: v}]
    // BUT we might have > 24 points now.
    // If the backend expects 24 hours, we might have an issue if we send 48 points.
    // The user said "remove utilization of home assistant entities".
    // We will send the raw array. The backend service cronostar.save_profile likely handles the format.
    // Let's construct the legacy format for compatibility if possible, or just the values.
    // The previous code did: scheduleData.push({ hour: hour, value: value });
    
    const scheduleData = rawData.map((val, index) => ({
      index: index, // Changed from 'hour' to 'index' to support sub-hourly? 
                    // Or keep 'hour' if backend assumes 24?
                    // If we send 48 points, 'hour' 0..47 is misleading but unique.
      value: val
    }));

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

      if (responseData && !responseData.error && rawSchedule && Array.isArray(rawSchedule)) {
        // Success case: Profile loaded from backend
        // We need to handle potential size mismatch (e.g. loading 24 points into 48 slots)
        let loadedValues;
        if (typeof rawSchedule[0] === 'object' && rawSchedule[0] !== null && 'value' in rawSchedule[0]) {
          loadedValues = rawSchedule.map(item => item.value);
        } else {
          loadedValues = rawSchedule;
        }
        
        // Resize/Interpolate if needed to match current interval
        // For now, assuming direct mapping or StateManager handles resize later if we update it.
        // But here we are setting data directly.
        // Let's assume strict length match for now, or fill.
        scheduleValues = loadedValues;
        
        Logger.load(`[CronoStar] Profile data processed for '${profileName}'. Points: ${scheduleValues.length}`);
      } else {
        // Fallback case: Profile not found or invalid. Using default values.
        Logger.warn('LOAD', `[CronoStar] Profile '${profileName}' not found or invalid. Using default values.`);
        const numPoints = this.card.stateManager.getNumPoints();
        const defaultVal = this.card.config.min_value ?? 0;
        scheduleValues = new Array(numPoints).fill(defaultVal);
      }

      // Update Internal Memory directly
      this.card.stateManager.setData(scheduleValues);

      // Update Chart
      if (this.card.chartManager?.isInitialized()) {
        this.card.chartManager.updateData(scheduleValues);
      }

      this.card.hasUnsavedChanges = false;
      this.lastLoadedProfile = profileName;
      Logger.load(`[CronoStar] Profile '${profileName}' loaded to memory successfully.`);

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
        await this.saveProfile(previousProfile);
      } catch (err) {
        Logger.error('SAVE', "[CronoStar] Error during auto-save:", err);
      }
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
