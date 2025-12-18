// core/CronoStar.js
import { LitElement } from 'lit';
import { cardStyles } from '../styles.js';
import { VERSION } from '../config.js';

import { StateManager } from '../managers/state_manager.js';
import { ProfileManager } from '../managers/profile_manager.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { ChartManager } from '../managers/chart_manager.js';
import { KeyboardHandler } from '../handlers/keyboard_handler.js';
import { PointerHandler } from '../handlers/pointer_handler.js';
import { Logger } from '../utils.js';
import { LocalizationManager } from '../managers/localization_manager.js';

import { CardLifecycle } from './CardLifecycle.js';
import { CardRenderer } from './CardRenderer.js';
import { CardEventHandlers } from './CardEventHandlers.js';
import { CardSync } from './CardSync.js';

// Assicura che l’editor sia nel bundle
import '../editor/CronoStarEditor.js';

export class CronoStarCard extends LitElement {

  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      isPaused: { type: Boolean },
      selectedProfile: { type: String },
      profileOptions: { type: Array },
      hasUnsavedChanges: { type: Boolean },
      isMenuOpen: { type: Boolean },
      language: { type: String },
      loggingEnabled: { type: Boolean },
      selectedPreset: { type: String },
      missingEntities: { type: Array },
      initialLoadComplete: { type: Boolean },
      cronostarReady: { type: Boolean },
      awaitingAutomation: { type: Boolean },
      outOfSyncDetails: { type: String },
      isDragging: { type: Boolean },
      selectedPoints: { type: Array }, // Explicitly track selected points here too
    };
  }

  static get styles() {
    return cardStyles;
  }

  static getCardType() {
    return 'custom:cronostar-card';
  }

  static getConfigElement() {
    return document.createElement('cronostar-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:cronostar-card',
      preset: 'thermostat',
      hour_base: 'auto',
      logging_enabled: true,
    };
  }

  constructor() {
    super();
    this.config = null;
    this.hourBase = 0;
    this.hourBaseDetermined = false;
    this.isPaused = false;
    this.selectedProfile = '';
    this.profileOptions = [];
    this.hasUnsavedChanges = false;
    this.suppressClickUntil = 0;
    this.isMenuOpen = false;
    this.language = 'en';
    this.loggingEnabled = true;
    this.selectedPreset = 'thermostat';
    this.missingEntities = [];
    this.initialLoadComplete = false;
    this.wasLongPress = false;
    this.cronostarReady = false;
    this.isDragging = false;
    this.awaitingAutomation = false;
    this.outOfSyncDetails = '';
    this._initialized = false;
    this._languageInitialized = false;
    this._cardConnected = false;
    this._unsubProfilesLoaded = null;
    this._readyCheckTimer = null;
    this._syncCheckTimer = null;
    this._lastReadyFlagNotMetLogAt = 0;
    this._lastMissingCount = -1;
    this._readyCheckIntervalMs = 5000;
    this._readyCheckTicks = 0;
    this._readyCheckMaxMs = 60000;
    this.overlaySuppressionUntil = 0;
    this.lastEditAt = 0;
    this.mismatchSince = 0;
    this._startupOverlayState = false;
    this.selectedPoints = []; // Initialize array

    try {
        // Initialize managers in dependency order
        this.localizationManager = new LocalizationManager(this);
        this.stateManager = new StateManager(this);
        this.profileManager = new ProfileManager(this);        
        // Critical: SelectionManager must be ready before ChartManager
        this.selectionManager = new SelectionManager(this);        
        this.chartManager = new ChartManager(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.pointerHandler = new PointerHandler(this);

        this.cardLifecycle = new CardLifecycle(this);
        Logger.log('INIT', `[CronoStar] CardLifecycle initialized successfully (v${VERSION})`);        
        this.cardRenderer = new CardRenderer(this);
        this.eventHandlers = new CardEventHandlers(this);
        this.cardSync = new CardSync(this);

        Logger.setEnabled(true);
        Logger.log('INIT', `[CronoStar] Card constructor completed (v${VERSION})`);
    } catch (e) {
        Logger.error('INIT', '[CronoStar] Error initializing Managers:', e);
        // Fallback to prevent complete crash if one manager fails
        if (!this.cardLifecycle) this.cardLifecycle = new CardLifecycle(this); 
    }
  }

  setConfig(config) {
    try {
      if (!this.cardLifecycle) {
        Logger.error('CONFIG', '[CronoStar] setConfig called but cardLifecycle is not initialized!');
        return;
      }
      this.cardLifecycle.setConfig(config);
    } catch (e) {
      Logger.error('CONFIG', '[CronoStar] Error in CronoStarCard.setConfig:', e);
      this.config = config;
      if (this.eventHandlers) {
        this.eventHandlers.showNotification(
          this.localizationManager ? this.localizationManager.localize(this.language, 'error.config_error') : 'Config Error' + `: ${e.message}`,
          'error',
        );
      }
    }
  }

  updated(changed) {
    super.updated(changed);
    if (this.cardLifecycle) {
      this.cardLifecycle.updated(changed);
    }
  }

  set hass(hass) {
    if (this.cardLifecycle) {
      this.cardLifecycle.setHass(hass);
    }
  }

  get hass() {
    return this.cardLifecycle?.hass;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.cardLifecycle) {
      this.cardLifecycle.connectedCallback();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.cardLifecycle) {
      this.cardLifecycle.disconnectedCallback();
    }
  }

  firstUpdated() {
    super.firstUpdated();
    if (this.cardLifecycle) {
      this.cardLifecycle.firstUpdated();
    }
  }

  render() {
    return this.cardRenderer ? this.cardRenderer.render() : null;
  }

  isEditorContext() {
    return this.cardLifecycle?.isEditorContext() ?? false;
  }

  // --- NEW: wrappers to avoid "handleAddProfile is not a function" if menu calls on card ---
  handleAddProfile() {
    try {
      return this.eventHandlers?.handleAddProfile?.();
    } catch {}
  }

  handleDeleteProfile() {
    try {
      return this.eventHandlers?.handleDeleteProfile?.();
    } catch {}
  }
}  