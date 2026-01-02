/**  
 * SharedDataManager - Manages shared data for CronoStar Card  
 * Uses JSON files in the /config/cronostar/ directory  
 * @module shared-data-manager  
 */

import { Logger } from '../utils.js';

export class SharedDataManager {
  constructor(card) {
    this.card = card;
    this.baseUrl = '/local/cronostar_profiles';
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 second cache  
  }

  /**  
   * Generates the filename for a profile container
   * Standard: cronostar_<preset>_<prefix>_data.json
   * @param {string} profileName - Ignored in new standard
   * @param {string} presetType - Preset type (temp, ev, switch, etc.)  
   * @returns {string} Filename  
   */
  getProfileFilename(profileName, presetType = null) {
    const type = presetType || this.getPresetType();
    const prefix = (this.card.config?.global_prefix || 'cronostar_').replace(/_+$/, '');
    return `cronostar_${type}_${prefix}_data.json`;
  }

  /**  
   * Gets the preset type from the configuration  
   * @returns {string}  
   */
  getPresetType() {
    const prefix = this.card.config?.global_prefix || 'cronostar_';
    const match = prefix.match(/^cronostar_([^_]+)_$/);
    return match ? match[1] : 'temp';
  }

  /**  
   * Slugifies a string for use in filenames  
   * @param {string} str - String to slugify  
   * @returns {string}  
   */
  slugify(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**  
   * Constructs the URL for a profile  
   * @param {string} profileName - Profile name  
   * @returns {string}  
   */
  getProfileUrl(profileName) {
    const filename = this.getProfileFilename(profileName);
    return `${this.baseUrl}/${filename}`;
  }

  /**  
   * Loads profile data  
   * @param {string} profileName - Profile name  
   * @returns {Promise<Object|null>}  
   */
  async loadProfile(profileName) {
    const url = this.getProfileUrl(profileName);
    const cacheKey = `profile_${profileName}`;

    // Check cache  
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      Logger.log('CACHE', `[SharedDataManager] Using cached profile: ${profileName}`);
      return cached.data;
    }

    Logger.log('LOAD', `[SharedDataManager] Loading profile from: ${url}`);

    try {
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(url + cacheBuster, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          Logger.log('LOAD', `[SharedDataManager] Profile not found: ${profileName}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate data structure  
      if (!this.validateProfileData(data)) {
        Logger.warn('LOAD', `[SharedDataManager] Invalid profile data structure`);
        return null;
      }

      // Update cache  
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      Logger.log('LOAD', `[SharedDataManager] Profile loaded successfully: ${profileName}`);
      return data;

    } catch (error) {
      Logger.error('LOAD', `[SharedDataManager] Error loading profile: ${error.message}`);
      return null;
    }
  }

  /**  
   * Validates the profile data structure  
   * @param {Object} data - Data to validate  
   * @returns {boolean}  
   */
  validateProfileData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check for schedule array with 24 elements  
    if (data.schedule) {
      if (!Array.isArray(data.schedule) || data.schedule.length !== 24) {
        return false;
      }
      return true;
    }

    // Fallback: simple array of 24 elements  
    if (Array.isArray(data) && data.length === 24) {
      return true;
    }

    return false;
  }

  /**  
   * Extracts the schedule array from profile data  
   * @param {Object|Array} data - Profile data  
   * @returns {Array<number>}  
   */
  extractSchedule(data) {
    if (!data) return null;

    if (data.schedule && Array.isArray(data.schedule)) {
      return data.schedule.map(v => parseFloat(v) || 0);
    }

    if (Array.isArray(data) && data.length === 24) {
      return data.map(v => parseFloat(v) || 0);
    }

    return null;
  }

  /**  
   * Saves a profile using the HA service  
   * @param {string} profileName - Profile name  
   * @param {Array<number>} schedule - Array of 24 values  
   * @param {Object} metadata - Additional metadata  
   * @returns {Promise<boolean>}  
   */
  async saveProfile(profileName, schedule, metadata = {}) {
    if (!this.card.hass) {
      Logger.error('SAVE', '[SharedDataManager] Home Assistant not available');
      return false;
    }

    const filename = this.getProfileFilename(profileName);
    const presetType = this.getPresetType();

    const profileData = {
      version: 1,
      profile_name: profileName,
      preset_type: presetType,
      global_prefix: this.card.config?.global_prefix || '',
      unit_of_measurement: this.card.config?.unit_of_measurement || '',
      min_value: this.card.config?.min_value || 0,
      max_value: this.card.config?.max_value || 100,
      step_value: this.card.config?.step_value || 1,
      saved_at: new Date().toISOString(),
      schedule: schedule,
      ...metadata
    };

    Logger.log('SAVE', `[SharedDataManager] Saving profile: ${profileName}`);

    try {
      const scriptName = (this.card.config?.save_script || 'script.cronostar_save_profile')
        .replace('script.', '');

      await this.card.hass.callService('script', scriptName, {
        profile_name: profileName,
        filename: filename,
        preset_type: presetType,
        global_prefix: this.card.config?.global_prefix || '',
        hour_base: this.card.hourBase || 0,
        profile_data: JSON.stringify(profileData),
      });

      // Invalidate cache for this profile  
      this.cache.delete(`profile_${profileName}`);

      Logger.log('SAVE', `[SharedDataManager] Profile saved successfully: ${profileName}`);
      return true;

    } catch (error) {
      Logger.error('SAVE', `[SharedDataManager] Error saving profile: ${error.message}`);
      return false;
    }
  }

  /**  
   * Checks if a profile exists  
   * @param {string} profileName - Profile name  
   * @returns {Promise<boolean>}  
   */
  async profileExists(profileName) {
    const url = this.getProfileUrl(profileName);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store'
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**  
   * Lists all available profiles for the current preset  
   * @returns {Promise<Array<string>>}  
   */
  async listProfiles() {
    // This functionality requires a server-side endpoint  
    // For now, it returns profiles from input_select  
    if (!this.card.hass || !this.card.config?.profiles_select_entity) {
      return [];
    }

    const selectEntity = this.card.hass.states[this.card.config.profiles_select_entity];
    if (!selectEntity || !selectEntity.attributes?.options) {
      return [];
    }

    return selectEntity.attributes.options;
  }

  /**  
   * Clears the cache  
   */
  clearCache() {
    this.cache.clear();
    Logger.log('CACHE', '[SharedDataManager] Cache cleared');
  }

  /**  
   * Invalidates a specific profile in the cache  
   * @param {string} profileName - Profile name  
   */
  invalidateProfile(profileName) {
    this.cache.delete(`profile_${profileName}`);
    Logger.log('CACHE', `[SharedDataManager] Cache invalidated for: ${profileName}`);
  }
}  
