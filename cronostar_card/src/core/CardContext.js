// cronostar_card/src/core/CardContext.js
/**
 * Centralized context for sharing dependencies
 * Replaces direct `this.card` references
 */

import { EventBus } from './EventBus.js';
import { Logger, checkIsEditorContext } from '../utils.js';

export class CardContext {
  constructor(card) {
    this._card = card;
    this._eventBus = new EventBus();
    this._managers = new Map();
  }

  // Getters for card properties
  get hass() { return this._card.hass; }
  get config() { return this._card.config; }
  get language() { return this._card.language; }
  get selectedPreset() { return this._card.selectedPreset; }
  get selectedProfile() { return this._card.selectedProfile; }
  get hasUnsavedChanges() { return this._card.hasUnsavedChanges; }

  // Setters for card properties
  set hasUnsavedChanges(value) {
    this._card.hasUnsavedChanges = value;
    this._eventBus.emit('unsaved:changes', value);
  }

  set selectedProfile(value) {
    this._card.selectedProfile = value;
    this._eventBus.emit('profile:changed', value);
  }

  // Event bus access
  get events() { return this._eventBus; }

  // Manager registration
  registerManager(name, manager) {
    this._managers.set(name, manager);
    Logger.log('CONTEXT', `Registered manager: ${name}`);
  }

  getManager(name) {
    return this._managers.get(name);
  }

  // Request card update
  requestUpdate() {
    this._card.requestUpdate();
  }

  // Check if in editor context
  isEditorContext() {
    return checkIsEditorContext(this._card);
  }

  // Cleanup
  destroy() {
    this._eventBus.clear();
    this._managers.clear();
  }
}