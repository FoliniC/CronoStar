// core/CronoStar.js - FIXED VERSION
import { LitElement } from 'lit';
import { cardStyles } from '../styles.js';
import { VERSION, extractCardConfig } from '../config.js';

import { StateManager } from '../managers/state_manager.js';
import { ProfileManager } from '../managers/profile_manager.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { ChartManager } from '../managers/chart_manager.js';
import { KeyboardHandler } from '../handlers/keyboard_handler.js';
import { PointerHandler } from '../handlers/pointer_handler.js';
import { Logger, checkIsEditorContext } from '../utils.js';
import { LocalizationManager } from '../managers/localization_manager.js';

import { CardLifecycle } from './CardLifecycle.js';
import { CardRenderer } from './CardRenderer.js';
import { CardEventHandlers } from './CardEventHandlers.js';
import { CardSync } from './CardSync.js';
import { CardContext } from './CardContext.js';

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
      selectedPoints: { type: Array },
      isPreview: { type: Boolean },
      previewData: { type: Array },
      cardId: { type: String },
      isExpandedV: { type: Boolean },
      isExpandedH: { type: Boolean },
      contextMenu: { type: Object },
      modificationCounter: { type: Number },
      globalSettings: { type: Object },
    };
  }

  static get styles() {
    return cardStyles;
  }

  static getConfigElement() {
    return document.createElement('cronostar-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:cronostar-card',
      preset_type: 'thermostat',
      global_prefix: 'cronostar_thermostat_',
      target_entity: 'climate.climatizzazione_appartamento',
      hour_base: 'auto',
      logging_enabled: true,
      not_configured: true,
    };
  }

  getCardSize() {
    return 6;
  }

  // Prevent HA from trying to use our card color in history charts
  shouldUpdate(changedProps) {
    // Don't update if being rendered in a history context
    if (this._isInHistoryContext()) {
      return false;
    }
    return super.shouldUpdate(changedProps);
  }

  _isInHistoryContext() {
    try {
      let el = this;
      while (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === 'state-history-chart-timeline' ||
          tag === 'ha-chart-base' ||
          tag === 'hui-history-graph-card') {
          return true;
        }
        el = el.parentElement || el.parentNode || el.host;
      }
      return false;
    } catch {
      return false;
    }
  }

  constructor() {
    super();
    this.config = null;
    this.hourBase = 0;
    this.hourBaseDetermined = false;
    this.isPaused = false;
    this.showUnsavedChangesDialog = false;
    this.pendingProfileChange = null;
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
    this.selectedPoints = [];
    this.isPreview = false;
    this.previewData = null;
    this.cardId = "";
    this.isExpandedV = false;
    this.isExpandedH = false;
    this.contextMenu = { show: false, x: 0, y: 0 };
    this.modificationCounter = 0;
    this.globalSettings = {
      keyboard: {
        ctrl: { horizontal: 1, vertical: 0.1 },
        shift: { horizontal: 30, vertical: 1.0 },
        alt: { horizontal: 60, vertical: 5.0 }
      }
    };

    try {
      this.cardContext = new CardContext(this);

      this.localizationManager = new LocalizationManager(this);

      this.stateManager = new StateManager(this.cardContext);
      this.cardContext.registerManager('state', this.stateManager);

      this.profileManager = new ProfileManager(this.cardContext);
      this.cardContext.registerManager('profile', this.profileManager);

      this.selectionManager = new SelectionManager(this.cardContext);
      this.cardContext.registerManager('selection', this.selectionManager);

      this.chartManager = new ChartManager(this.cardContext);
      this.cardContext.registerManager('chart', this.chartManager);

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
      if (!this.cardLifecycle) this.cardLifecycle = new CardLifecycle(this);
    }
  }

  setConfig(config) {
    try {
      // Semantic check to avoid redundant updates
      if (this.config) {
        const cleanOld = { ...this.config };
        const cleanNew = { ...config };
        if (JSON.stringify(cleanOld) === JSON.stringify(cleanNew)) {
          return;
        }
      }

      // Close menu immediately when configuration changes (typically entering editor)
      this.isMenuOpen = false;

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

    if (this.isPreview) {
      this.initialLoadComplete = true;
      this.cronostarReady = true;
    }

    if (changed.has('previewData') && this.previewData) {
      Logger.log('PREVIEW', '[CronoStar] Applying previewData', this.previewData);

      // Explicitly remove container_meta if it leaked through from backend
      if (this.previewData.container_meta) {
        delete this.previewData.container_meta;
      }

      const isFullObject = !Array.isArray(this.previewData) && typeof this.previewData === 'object';
      const schedule = isFullObject ? this.previewData.schedule : this.previewData;

      if (this.stateManager && schedule) {
        this.stateManager.setData(schedule);
        this.hasUnsavedChanges = false;
      }

      // Se vengono passati metadati nel previewData, aggiorna la configurazione locale
      const meta = this.previewData.meta;
      if (isFullObject && meta) {
        const cleanMeta = extractCardConfig(meta);
        this.config = { ...this.config, ...cleanMeta };
        // Apply language from meta if provided in preview
        if (meta.language) {
          this.language = meta.language;
          this.languageInitialized = true;
          Logger.log('LANG', `[CronoStar] previewData applied language: ${meta.language}`);
        }
      }

      if (this.chartManager && this.chartManager.isInitialized()) {
        this.chartManager.updateData(schedule || []);
        this.chartManager.recreateChartOptions();
      }
    }
  }

  // ✅ FIX: Setter now only delegates to CardLifecycle
  set hass(hass) {
    if (this.cardLifecycle) {
      this.cardLifecycle.setHass(hass);
    }
  }

  // ✅ FIX: Getter reads from CardLifecycle's internal storage
  get hass() {
    return this.cardLifecycle?._hass;
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
    return checkIsEditorContext(this);
  }

  // Wrappers for menu handlers
  handleAddProfile() {
    try {
      return this.eventHandlers?.handleAddProfile?.();
    } catch (e) { /* ignore */ }
  }

  handleDeleteProfile() {
    try {
      return this.eventHandlers?.handleDeleteProfile?.();
    } catch (e) { /* ignore */ }
  }
}