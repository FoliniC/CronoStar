// cronostar_card/src/core/EventBus.js
/**
 * Centralized event bus for component communication
 * Reduces coupling between managers and card
 */

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to event
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);

    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from event
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   */
  off(event, callback) {
    const callbacks = this._listeners.get(event);
    if (!callbacks) return;

    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Emit event with data
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const callbacks = this._listeners.get(event);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`EventBus error in ${event}:`, error);
      }
    });
  }

  /**
   * Clear all listeners
   */
  clear() {
    this._listeners.clear();
  }
}

// Event constants
export const Events = {
  // State events
  STATE_CHANGED: 'state:changed',
  SCHEDULE_UPDATED: 'schedule:updated',
  POINT_ADDED: 'point:added',
  POINT_REMOVED: 'point:removed',
  POINT_UPDATED: 'point:updated',

  // Selection events
  SELECTION_CHANGED: 'selection:changed',
  SELECTION_CLEARED: 'selection:cleared',

  // Profile events
  PROFILE_LOADED: 'profile:loaded',
  PROFILE_SAVED: 'profile:saved',
  PROFILE_CHANGED: 'profile:changed',

  // Chart events
  CHART_READY: 'chart:ready',
  CHART_UPDATED: 'chart:updated',
  CHART_DESTROYED: 'chart:destroyed',

  // UI events
  CONFIG_CHANGED: 'config:changed',
  UNSAVED_CHANGES: 'unsaved:changes',
  PRESET_CHANGED: 'preset:changed'
};
