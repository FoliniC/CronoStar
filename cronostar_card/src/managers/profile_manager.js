// cronostar_card/src/managers/ProfileManager.js
/**
 * Profile management for loading and saving schedules
 * Handles profile operations and sync with backend
 */

import { Logger } from '../utils.js';
import { Events } from '../core/EventBus.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';

export class ProfileManager {
  constructor(context) {
    this.context = context;
    this.lastLoadedProfile = '';
    this._isLoading = false;
  }

  /**
   * Load a profile
   * @param {string} profileName - Profile name
   * @returns {Promise<void>}
   */
  async loadProfile(profileName) {
    if (this._isLoading) {
      Logger.warn('PROFILE', 'Load already in progress');
      return;
    }

    this._isLoading = true;
    const effectivePrefix = getEffectivePrefix(this.context.config);

    Logger.load(`=== LOAD PROFILE START === Profile: '${profileName}', Prefix: '${effectivePrefix}'`);

    try {
      const presetType = this.context.selectedPreset || 'thermostat';

      const result = await this.context.hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'load_profile',
        service_data: {
          profile_name: profileName,
          preset_type: presetType,
          global_prefix: effectivePrefix
        },
        return_response: true
      });

      const responseData = result?.response;

      if (!responseData || responseData.error) {
        Logger.warn('PROFILE', `Profile '${profileName}' not found or error:`, responseData?.error);
        return;
      }

      // Update config from metadata
      if (responseData.meta) {
        this._updateConfigFromMeta(responseData.meta);
      }

      // Load schedule
      const schedule = responseData.schedule || [];
      const stateManager = this.context.getManager('state');

      if (stateManager) {
        stateManager.setData(schedule, true); // Skip history
      }

      this.lastLoadedProfile = profileName;
      this.context.hasUnsavedChanges = false;

      this.context.events.emit(Events.PROFILE_LOADED, {
        name: profileName,
        schedule
      });

      Logger.load(`✅ Profile '${profileName}' loaded successfully`);

    } catch (err) {
      Logger.error('PROFILE', `Error loading profile '${profileName}':`, err);
      throw err;
    } finally {
      this._isLoading = false;
      Logger.load('=== LOAD PROFILE END ===');
    }
  }

  /**
   * Save current profile
   * @param {string} profileName - Profile name (optional)
   * @returns {Promise<void>}
   */
  async saveProfile(profileName = this.lastLoadedProfile) {
    if (!profileName) {
      Logger.warn('PROFILE', 'No profile specified for save');
      throw new Error('No profile specified');
    }

    const presetType = this.context.selectedPreset || 'thermostat';
    const effectivePrefix = getEffectivePrefix(this.context.config);

    Logger.save(`=== SAVE PROFILE START === Profile: '${profileName}', Preset: ${presetType}`);

    try {
      const stateManager = this.context.getManager('state');
      if (!stateManager) {
        throw new Error('StateManager not available');
      }

      // Build schedule
      const schedule = this._buildSchedulePayload(stateManager.getData());

      // Save via backend
      await this.context.hass.callService('cronostar', 'save_profile', {
        profile_name: profileName,
        preset_type: presetType,
        schedule: schedule,
        global_prefix: effectivePrefix,
        meta: this._buildMetaPayload()
      });

      this.lastLoadedProfile = profileName;
      this.context.hasUnsavedChanges = false;

      this.context.events.emit(Events.PROFILE_SAVED, {
        name: profileName,
        schedule
      });

      Logger.save(`✅ Profile '${profileName}' saved successfully`);

    } catch (err) {
      Logger.error('PROFILE', `Error saving profile '${profileName}':`, err);
      throw err;
    } finally {
      Logger.save('=== SAVE PROFILE END ===');
    }
  }

  /**
   * Handle profile selection from UI
   * @param {Event} event - Selection event
   */
  async handleProfileSelection(event) {
    const newProfile = event?.target?.value || event?.detail?.value || '';

    if (!newProfile || newProfile === this.context.selectedProfile) {
      return;
    }

    const previousProfile = this.lastLoadedProfile || this.context.selectedProfile;

    // Check for unsaved changes
    if (this.context.hasUnsavedChanges && previousProfile) {
      this._showUnsavedDialog(newProfile);
      return;
    }

    // Load new profile
    this.context.selectedProfile = newProfile;

    // Update input_select entity
    this._updateProfileSelector(newProfile);

    // Snapshot selection before load
    const selectionManager = this.context.getManager('selection');
    if (selectionManager) {
      selectionManager.snapshotSelection();
    }

    try {
      await this.loadProfile(newProfile);

      // Restore selection
      if (selectionManager) {
        selectionManager.restoreSelection();
      }
    } catch (err) {
      Logger.error('PROFILE', 'Error during profile selection:', err);
    }
  }

  /**
   * Show unsaved changes dialog
   * @private
   * @param {string} newProfile - Profile to switch to
   */
  _showUnsavedDialog(newProfile) {
    // Signal to card to show dialog
    this.context._card.showUnsavedChangesDialog = true;
    this.context._card.pendingProfileChange = newProfile;
    this.context.requestUpdate();
  }

  /**
   * Update profile selector entity
   * @private
   * @param {string} profileName - Profile name
   */
  _updateProfileSelector(profileName) {
    const selectorEntity = this.context.config?.profiles_select_entity;

    if (selectorEntity) {
      this.context.hass.callService('input_select', 'select_option', {
        entity_id: selectorEntity,
        option: profileName
      }).catch(() => {
        // Ignore errors (entity might not exist)
      });
    }
  }

  /**
   * Build schedule payload for backend
   * @private
   * @param {Array} rawData - Raw schedule data
   * @returns {Array} Normalized schedule
   */
  _buildSchedulePayload(rawData) {
    const stateManager = this.context.getManager('state');

    return rawData
      .map(point => ({
        time: String(point.time),
        value: Number(point.value)
      }))
      .filter(point =>
        /^\d{2}:\d{2}$/.test(point.time) &&
        Number.isFinite(point.value)
      )
      .sort((a, b) => {
        const aMin = stateManager.timeToMinutes(a.time);
        const bMin = stateManager.timeToMinutes(b.time);
        return aMin - bMin;
      });
  }

  /**
   * Build metadata payload
   * @private
   * @returns {Object} Metadata
   */
  _buildMetaPayload() {
    const config = this.context.config || {};
    const meta = { ...config };

    // Remove deprecated/internal keys
    delete meta.entity_prefix;
    delete meta.step;

    // Ensure global_prefix is set
    if (!meta.global_prefix) {
      meta.global_prefix = getEffectivePrefix(config);
    }

    // Include language preference from card/config if available
    try {
      const lang = this.context._card?.language || this.context.config?.meta?.language || this.context.config?.language;
      if (lang) {
        meta.language = lang;
      }
    } catch { /* ignore */ }

    // Persist actual chart-used values so other cards can tailor theirs when loading this profile
    const chartKeys = [
      'y_axis_label',
      'unit_of_measurement',
      'min_value',
      'max_value',
      'step_value',
      'allow_max_value',
      'drag_snap'
    ];
    const chartMeta = {};
    chartKeys.forEach(k => { if (config[k] !== undefined) chartMeta[k] = config[k]; });
    Object.assign(meta, chartMeta);

    return meta;
  }

  /**
   * Update config from metadata
   * @private
   * @param {Object} meta - Metadata
   */
  _updateConfigFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return;

    // Extract only card config keys
    const cardKeys = [
      'title', 'y_axis_label', 'unit_of_measurement',
      'min_value', 'max_value', 'step_value',
      'allow_max_value', 'target_entity', 'drag_snap'
    ];

    cardKeys.forEach(key => {
      if (meta[key] !== undefined) {
        this.context._card.config[key] = meta[key];
      }
    });

    // Apply language from meta to card and config
    if (meta.language) {
      try {
        this.context._card.language = meta.language;
        // Guard against hass overriding language on next setHass
        this.context._card.languageInitialized = true;
        if (!this.context._card.config.meta) this.context._card.config.meta = {};
        this.context._card.config.meta.language = meta.language;
        Logger.log('LANG', `Applied language from profile meta: ${meta.language}`);
      } catch (e) {
        Logger.warn('LANG', 'Failed to apply language from meta:', e);
      }
    }
  }

  /**
   * Reset to last loaded state
   * @returns {Promise<void>}
   */
  async resetChanges() {
    const profileToReload = this.lastLoadedProfile || this.context.selectedProfile;

    if (!profileToReload) {
      Logger.warn('PROFILE', 'No profile to reload');
      return;
    }

    const selectionManager = this.context.getManager('selection');
    if (selectionManager) {
      selectionManager.snapshotSelection();
    }

    try {
      await this.loadProfile(profileToReload);

      if (selectionManager) {
        selectionManager.restoreSelection();
      }
    } catch (err) {
      Logger.error('PROFILE', 'Error reloading profile:', err);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
    }
  }
}