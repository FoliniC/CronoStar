/** 
  * State management for CronoStar Card (Refactored)
  * @module state-manager
  */

import { Logger, safeParseFloat, formatHourString } from '../utils.js';
import { getEffectivePrefix } from '../utils/prefix_utils.js';


export class StateManager {
  constructor(card) {
    this.card = card;
    this.scheduleData = new Array(24).fill(null);
    this.dirtyIndices = new Set();
    this.isLoadingProfile = false;
    this.missingEntities = [];
    this.missingEntitiesLogged = false;
  }

  /**
   * Update schedule data from Home Assistant states
   * @param {Object} hass - Home Assistant object
   * @returns {boolean} True if data changed
   */
  updateFromHass(hass) {
    const newData = [];
    let dataChanged = false;
    const currentMissingEntities = [];

    for (let hour = 0; hour < 24; hour++) {
      const entityId = this.getEntityIdForHour(hour);
      const stateObj = hass.states[entityId];
      let newValue = null;

      if (stateObj) {
        newValue = safeParseFloat(stateObj.state);
        // If entity exists but its state is not a valid number (e.g., 'unavailable'),
        // fall back to a default value to prevent getting stuck in a loading state.
        if (newValue === null) {
            newValue = this.scheduleData[hour] !== null ? this.scheduleData[hour] : this.card.config.min_value;
        }
      } else {
        currentMissingEntities.push(entityId);
        newValue = this.scheduleData[hour] !== null ? this.scheduleData[hour] : this.card.config.min_value;
      }

      if (this.scheduleData[hour] !== newValue) {
        dataChanged = true;
      }
      newData[hour] = newValue;
    }

    // Check if the list of missing entities has changed
    const missingEntitiesChanged = JSON.stringify(this.missingEntities) !== JSON.stringify(currentMissingEntities);
    this.missingEntities = currentMissingEntities;

    if (this.missingEntities.length > 0 && (!this.missingEntitiesLogged || missingEntitiesChanged)) {
      const groupedEntities = this.groupMissingEntities(this.missingEntities);
      Logger.warn('STATE', `[CronoStar] Missing ${this.missingEntities.length} entities:\n\n${groupedEntities}`);
      this.missingEntitiesLogged = true;
    } else if (this.missingEntities.length === 0) {
      this.missingEntitiesLogged = false;
    }

    if (dataChanged && !this.isLoadingProfile) {
      Logger.state("[CronoStar] Schedule data updated. Hours 00-05:", newData.slice(0, 6));
      this.scheduleData = newData;
      return true;
    } else if (dataChanged && this.isLoadingProfile) {
      Logger.state("[CronoStar] Update ignored during profile loading");
      return false;
    }

    return false;
  }

  /**
   * Get entity ID for specific hour
   * @param {number} hour - Hour index (0-23)
   * @returns {string}
   */
  getEntityIdForHour(hour) {
    const effectivePrefix = getEffectivePrefix(this.card.config);
    const hourStr = formatHourString(hour, this.card.hourBase);
    return `input_number.${effectivePrefix}${hourStr}`;
  }

  /**
   * Get hour label
   * @param {number} hour - Hour index
   * @returns {string}
   */
  getHourLabel(hour) {
    return `${formatHourString(hour, this.card.hourBase)}:00`;
  }

  /**
   * Update temperature for specific hour
   * @param {number} hour - Hour index
   * @param {number} value - Temperature value
   */
  updateTemperatureAtHour(hour, value) {
    const entityId = this.getEntityIdForHour(hour);
    Logger.memo(`[CronoStar] set_value -> entity=${entityId} hour=${this.getHourLabel(hour)} value=${value}`);

    this.card.hass.callService("input_number", "set_value", {
      entity_id: entityId,
      value: value,
    });

    this.dirtyIndices.add(hour);
    this.card.hasUnsavedChanges = true;
  }

  /**
   * Wait for entity to reach expected numeric state
   * @param {string} entityId - Entity ID
   * @param {number} expectedValue - Expected value
   * @param {number} timeoutMs - Timeout in ms
   * @param {number} tolerance - Acceptable difference
   * @returns {Promise}
   */
  async waitForEntityNumericState(entityId, expectedValue, timeoutMs = 3000, tolerance = 0.001) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const raw = this.card.hass?.states?.[entityId]?.state;
        const current = safeParseFloat(raw);
        if (current !== null && Math.abs(current - expectedValue) <= tolerance) {
          Logger.memo(`[CronoStar] State confirmed -> entity=${entityId}, expected=${expectedValue}, current=${current}`);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          Logger.warn('MEMO', `[CronoStar] Timeout waiting for ${entityId}. Expected: ${expectedValue}, current: ${current}`);
          reject(new Error(`Timeout waiting for ${entityId}`));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  /**
   * Ensure all dirty values are applied to Home Assistant
   * @returns {Promise}
   */
  async ensureValuesApplied() {
    const promises = [];
    Logger.memo("[CronoStar] Ensuring values applied. Dirty indices:", Array.from(this.dirtyIndices));

    for (const hour of Array.from(this.dirtyIndices)) {
      const entityId = this.getEntityIdForHour(hour);
      const expected = this.scheduleData[hour];
      if (expected !== null) {
        Logger.memo(`[CronoStar] Waiting for entity sync -> hour=${this.getHourLabel(hour)}, entity=${entityId}, expected=${expected}`);
        promises.push(
          this.waitForEntityNumericState(entityId, expected, 4000, 0.001)
            .catch(err => Logger.warn('MEMO', `[CronoStar] Wait failed for ${entityId}:`, err))
        );
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
    this.dirtyIndices.clear();
  }

  /**
   * Log persisted values
   * @param {string} context - Context label
   * @param {Array<number>} indices - Hour indices
   */
  logPersistedValues(context, indices) {
    indices.forEach(hour => {
      const entityId = this.getEntityIdForHour(hour);
      const label = this.getHourLabel(hour);
      const value = this.scheduleData[hour];
      Logger.memo(`[CronoStar] ${context} -> hour=${label}, entity=${entityId}, value=${value}`);
    });
  }

  /**
   * Generates YAML definitions for missing input_number entities.
   * Supports output style 'named' (default) or 'list', controlled by config.missing_yaml_style.
   *
   * @param {Array<string>} entities - List of missing entity IDs
   * @returns {string} Concatenated YAML definitions for the missing entities.
   */
  groupMissingEntities(entities) {
    const yamlDefinitions = [];
    const yAxisLabel = this.card.config.y_axis_label || 'Value';
    const unitOfMeasurement = this.card.config.unit_of_measurement || '';
    const style = (this.card.config?.missing_yaml_style || 'named').toLowerCase();
    const useList = style === 'list';

    entities.forEach(entityId => {
      const match = entityId.match(/^input_number\.(.+)_(\d{2})$/);
      if (match) {
        const prefixName = match[1];
        const hour = match[2];
        const entityName = `${prefixName}_${hour}`;
        const header = useList ? `- ${entityName}:` : `${entityName}:`;
        const indent = useList ? '    ' : '  ';
        const yaml = `${header}\n` +
          `${indent}name: ${yAxisLabel} at ${hour}:00\n` +
          `${indent}min: ${this.card.config.min_value}\n` +
          `${indent}max: ${this.card.config.max_value}\n` +
          `${indent}step: ${this.card.config.step_value}\n` +
          `${indent}initial: ${this.card.config.min_value}\n` +
          `${indent}unit_of_measurement: "${unitOfMeasurement}"\n` +
          `${indent}icon: mdi:clock-outline`;
        yamlDefinitions.push(yaml);
      } else {
        yamlDefinitions.push(`# ${entityId} (unrecognized format)`);
      }
    });

    return yamlDefinitions.join('\n\n');
  }

  /**
   * Reset dirty indices
   */
  clearDirty() {
    this.dirtyIndices.clear();
  }

  /**
   * Get schedule data
   * @returns {Array<number>}
   */
  getData() {
    return [...this.scheduleData];
  }

  /**
   * Set schedule data
   * @param {Array<number>} data - New schedule data
   */
  setData(data) {
    this.scheduleData = [...data];
  }
}
