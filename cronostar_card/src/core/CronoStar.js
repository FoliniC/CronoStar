// core/CronoStar.js - FIXED VERSION
import { LitElement } from "lit";
import { cardStyles } from "../styles.js";
import { VERSION, extractCardConfig } from "../config.js";

import { StateManager } from "../managers/state_manager.js";
import { ProfileManager } from "../managers/profile_manager.js";
import { SelectionManager } from "../managers/selection_manager.js";
import { ChartManager } from "../managers/chart_manager.js";
import { KeyboardHandler } from "../handlers/keyboard_handler.js";
import { PointerHandler } from "../handlers/pointer_handler.js";
import { Logger, checkIsEditorContext } from "../utils.js";
import { LocalizationManager } from "../managers/localization_manager.js";

import { CardLifecycle } from "./CardLifecycle.js";
import { CardRenderer } from "./CardRenderer.js";
import { CardEventHandlers } from "./CardEventHandlers.js";
import { CardSync } from "./CardSync.js";
import { CardContext } from "./CardContext.js";

import "../editor/CronoStarEditor.js";

export class CronoStarCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      isEnabled: { type: Boolean },
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
      isStartup: { type: Boolean },
      isEditorInternal: { type: Boolean },
      editorStep: { type: Number },
      integrationVersion: { type: String },
      versionCheckEnabled: { type: Boolean },
      _showChart: { type: Boolean },
    };
  }

  static get styles() {
    return cardStyles;
  }

  static getConfigElement() {
    return document.createElement("cronostar-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:cronostar-card",
      preset_type: "thermostat",
      global_prefix: "cronostar_thermostat_",
      target_entity: "climate.climatizzazione_appartamento",
      hour_base: "auto",
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
        if (
          tag === "state-history-chart-timeline" ||
          tag === "ha-chart-base" ||
          tag === "hui-history-graph-card"
        ) {
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
    console.log("[CRONOSTAR] [INIT] Card constructor started");
    this.config = null;
    this.hourBase = 0;
    this.hourBaseDetermined = false;
    this.isEnabled = true;
    this.showUnsavedChangesDialog = false;
    this.pendingProfileChange = null;
    this.profileOptions = [];
    this.hasUnsavedChanges = false;
    this.suppressClickUntil = 0;
    this.isMenuOpen = false;
    this.language = "en";
    this.loggingEnabled = true;
    this.selectedPreset = "thermostat";
    this.missingEntities = [];
    this.initialLoadComplete = false;
    this.wasLongPress = false;
    this.cronostarReady = false;
    this.isDragging = false;
    this.awaitingAutomation = false;
    this.outOfSyncDetails = "";
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
    this._showChart = false;
    this._manualToggleDone = false;
    this.previewData = null;
    this.cardId = "";
    this.isExpandedV = false;
    this.isExpandedH = false;
    this.isStartup = true;
    this.isEditorInternal = false;
    this.editorStep = 0;
    this.contextMenu = { show: false, x: 0, y: 0 };
    this.modificationCounter = 0;
    this._backendMetaCache = null;
    this.globalSettings = {
      keyboard: {
        def: { horizontal: 5, vertical: 0.5 },
        ctrl: { horizontal: 1, vertical: 0.1 },
        shift: { horizontal: 30, vertical: 1.0 },
        alt: { horizontal: 60, vertical: 5.0 },
      },
    };

    try {
      this.cardContext = new CardContext(this);

      this.localizationManager = new LocalizationManager(this);

      this.stateManager = new StateManager(this.cardContext);
      this.cardContext.registerManager("state", this.stateManager);

      this.profileManager = new ProfileManager(this.cardContext);
      this.cardContext.registerManager("profile", this.profileManager);

      this.selectionManager = new SelectionManager(this.cardContext);
      this.cardContext.registerManager("selection", this.selectionManager);

      this.chartManager = new ChartManager(this.cardContext);
      this.cardContext.registerManager("chart", this.chartManager);

      this.keyboardHandler = new KeyboardHandler(this);
      this.pointerHandler = new PointerHandler(this);

      this.cardLifecycle = new CardLifecycle(this);
      Logger.log(
        "INIT",
        `[CronoStar] CardLifecycle initialized successfully (v${VERSION})`,
      );
      this.cardRenderer = new CardRenderer(this);
      this.eventHandlers = new CardEventHandlers(this);
      this.cardSync = new CardSync(this);

      // ✅ GLOBAL LISTENER: Catch wizard done from anywhere
      this._handleWizardDoneGlobal = (ev) => {
        if (this.isEditorInternal) {
          console.info("[CronoStar Card] Received global finish signal. Closing editor.");
          this.isEditorInternal = false;
          this.requestUpdate();
        }
      };
      window.addEventListener("cronostar-wizard-done", this._handleWizardDoneGlobal);

      Logger.setEnabled(true);
      Logger.log(
        "INIT",
        `[CronoStar] Card constructor completed (v${VERSION})`,
      );
    } catch (e) {
      Logger.error("INIT", "[CronoStar] Error initializing Managers:", e);
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
        Logger.error(
          "CONFIG",
          "[CronoStar] setConfig called but cardLifecycle is not initialized!",
        );
        return;
      }
      this.cardLifecycle.setConfig(config);
      
      // ✅ INITIAL COLLAPSE LOGIC: 
      // If initially_collapsed is true, force hide.
      // Otherwise, default to visible (standard card behavior) unless already manually toggled.
      if (config && config.initially_collapsed === true) {
          this._showChart = false;
          Logger.log("INIT", "[CronoStar] setConfig: initially_collapsed detected, forcing chart hidden");
      } else if (!this._manualToggleDone) {
          this._showChart = true;
          Logger.log("INIT", "[CronoStar] setConfig: standard mode, defaulting chart to visible");
      }
    } catch (e) {
      Logger.error(
        "CONFIG",
        "[CronoStar] Error in CronoStarCard.setConfig:",
        e,
      );
      this.config = config;
      if (this.eventHandlers) {
        this.eventHandlers.showNotification(
          this.localizationManager
            ? this.localizationManager.localize(
                this.language,
                "error.config_error",
              )
            : "Config Error" + `: ${e.message}`,
          "error",
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

    if (changed.has("previewData") && this.previewData) {
      Logger.log(
        "PREVIEW",
        "[CronoStar] Applying previewData",
        this.previewData,
      );

      // Explicitly remove container_meta if it leaked through from backend
      if (this.previewData.container_meta) {
        delete this.previewData.container_meta;
      }

      const isFullObject =
        !Array.isArray(this.previewData) &&
        typeof this.previewData === "object";
      const schedule = isFullObject
        ? this.previewData.schedule
        : this.previewData;

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
          Logger.log(
            "LANG",
            `[CronoStar] previewData applied language: ${meta.language}`,
          );
        }
      }

      if (this.chartManager && this.chartManager.isInitialized()) {
        this.chartManager.updateData(schedule || []);
        this.chartManager.recreateChartOptions();
      }
    }

    // Gestisce inizializzazione o ridimensionamento se la visibilità viene attivata
    if (changed.has("_showChart") && this._showChart) {
      this.updateComplete.then(() => {
        const isInit = this.chartManager?.isInitialized();
        if (isInit) {
          Logger.log("UI", "Chart already initialized and connected, resizing...");
          if (typeof this.chartManager.resize === 'function') {
            this.chartManager.resize();
          } else if (this.chartManager.chart && typeof this.chartManager.chart.resize === 'function') {
            this.chartManager.chart.resize();
          }
          this.chartManager.chart?.update("none");
        } else {
          Logger.log("UI", "Chart not initialized or canvas detached, triggering reinitializeCard...");
          if (this.cardLifecycle) {
            this.cardLifecycle.reinitializeCard();
          }
        }
      });
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
    if (this._handleWizardDoneGlobal) {
      window.removeEventListener("cronostar-wizard-done", this._handleWizardDoneGlobal);
    }
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

    this.updateComplete.then(() => {
      if (
        this._showChart &&
        this.chartManager &&
        !this.chartManager.isInitialized()
      ) {
        Logger.log("INIT", "firstUpdated: Initializing chart...");
        this.cardLifecycle.reinitializeCard();
      }
    });
  }

  _deepQuerySelector(selector, root = this.shadowRoot) {
    if (!root) return null;
    const found = root.querySelector(selector);
    if (found) return found;

    // Scansiona ricorsivamente i figli
    const elements = root.querySelectorAll('*');
    for (const el of elements) {
      if (el.shadowRoot) {
        const foundInShadow = this._deepQuerySelector(selector, el.shadowRoot);
        if (foundInShadow) return foundInShadow;
      }
    }
    return null;
  }

  async toggleChart() {
    // Toggle state directly (avoids issues if container is not in DOM yet)
    this._showChart = !this._showChart;
    this._manualToggleDone = true;

    // Synchronize with Home Assistant if a corresponding visibility entity exists
    if (this.hass && this.config?.global_prefix) {
      const showChartId = this.config.show_chart_entity || `input_boolean.${this.config.global_prefix}show_chart`;
      if (this.hass.states[showChartId]) {
        const domain = showChartId.split('.')[0] || 'input_boolean';
        this.hass.callService(domain, this._showChart ? "turn_on" : "turn_off", {
          entity_id: showChartId
        });
      }
    }

    Logger.log("UI", "toggleChart: State forced to:", this._showChart);

    this.requestUpdate();
    await this.updateComplete;

    // Ricalcola il container dopo l'update per forzare display e resize
    const newContainer = this._deepQuerySelector(".chart-container");
    if (newContainer) {
        newContainer.style.display = this._showChart ? 'block' : 'none';

        if (this._showChart && this.chartManager?.isInitialized()) {
            Logger.log("UI", "Resizing chart...");
            if (typeof this.chartManager.resize === 'function') {
                this.chartManager.resize();
            } else if (this.chartManager.chart && typeof this.chartManager.chart.resize === 'function') {
                this.chartManager.chart.resize();
            }
            this.chartManager.chart?.update('none');
        }
    }
  }
  render() {
    const isEditor = this.isEditorContext();
    const isPreview = this.isPreview;
    const isWaitingForData =
      !isEditor && !isPreview && !this.initialLoadComplete;

    if (isWaitingForData && !this._loggedWait) {
      Logger.info("UI", "Render: Waiting for data overlay active", {
        initialLoadComplete: this.initialLoadComplete,
      });
      this._loggedWait = true;
    } else if (!isWaitingForData && this._loggedWait) {
      Logger.info("UI", "Render: Data loaded, hiding overlay", {
        initialLoadComplete: this.initialLoadComplete,
      });
      this._loggedWait = false;
    }

    return this.cardRenderer ? this.cardRenderer.render() : null;
  }

  isEditorContext() {
    return checkIsEditorContext(this);
  }

  // Wrappers for menu handlers
  handleAddProfile() {
    try {
      return this.eventHandlers?.handleAddProfile?.();
    } catch (e) {
      /* ignore */
    }
  }

  handleDeleteProfile() {
    try {
      return this.eventHandlers?.handleDeleteProfile?.();
    } catch (e) {
      /* ignore */
    }
  }

  handleEditConfig(step = 0) {
    Logger.info("UI", "Opening internal wizard. Saving config backup.");
    this._lastGoodConfig = this.config
      ? JSON.parse(JSON.stringify(this.config))
      : null;
    this.isMenuOpen = false;
    this.editorStep = step;
    this.isEditorInternal = true;
    
    // Measure actual HA chrome bounds so the wizard sits flush with the
    // content area regardless of sidebar state (collapsed / hidden / wide).
    this._wizardInsets = this._calcContentAreaInsets();

    // Auto-expand for full area usage
    this.isExpandedV = true;
    this.isExpandedH = true;
    
    this.requestUpdate();
  }

  /**
   * Traverse the HA Shadow DOM to measure the real pixel offsets of the
   * content area (header height + sidebar width).  Falls back to sensible
   * defaults if any element is not yet available.
   * @returns {{ sidebarWidth: number, headerHeight: number }}
   */
  _calcContentAreaInsets() {
    try {
      const haRoot = document.querySelector("home-assistant");
      const haMain = haRoot?.shadowRoot?.querySelector("home-assistant-main");
      const haMainShadow = haMain?.shadowRoot;

      // ── Header height ──────────────────────────────────────────────────
      const appBar =
        haMainShadow?.querySelector("ha-top-app-bar-fixed") ||
        haMainShadow?.querySelector("app-header") ||
        haMainShadow?.querySelector(".header");
      const headerHeight = appBar
        ? Math.round(appBar.getBoundingClientRect().height)
        : 56;

      // ── Sidebar width ──────────────────────────────────────────────────
      const drawer =
        haMainShadow?.querySelector("ha-drawer") ||
        haMainShadow?.querySelector("mwc-drawer");
      let sidebarWidth = 0;
      if (drawer) {
        const sidebar =
          drawer.shadowRoot?.querySelector("ha-sidebar") ||
          drawer.querySelector("ha-sidebar");
        const measuredEl = sidebar || drawer;
        const rect = measuredEl.getBoundingClientRect();
        // Only count as visible if it occupies horizontal space on the left
        if (rect.width > 0 && rect.left === 0) {
          sidebarWidth = Math.round(rect.width);
        }
      }

      Logger.log(
        "UI",
        `[CronoStar] Wizard insets – header: ${headerHeight}px, sidebar: ${sidebarWidth}px`,
      );
      return { sidebarWidth, headerHeight };
    } catch (e) {
      Logger.warn("UI", "[CronoStar] _calcContentAreaInsets failed, using defaults:", e);
      return { sidebarWidth: 0, headerHeight: 56 };
    }
  }

  handleCreateController() {
    // We use console.error to BE ABSOLUTELY SURE it appears in the console regardless of filters
    console.error("[CRONOSTAR] [FORCE-LOG] Triggering config flow v6.8.6");
    
    const eventData = { 
      domain: "cronostar",
      modal: true
    };
    
    console.error("[CRONOSTAR] [FORCE-LOG] Event Data:", eventData);
    
    try {
      const event = new CustomEvent("show-config-flow", {
        bubbles: true,
        composed: true,
        detail: eventData
      });
      
      console.error("[CRONOSTAR] [FORCE-LOG] Dispatching to window, document, card and home-assistant...");
      window.dispatchEvent(event);
      document.dispatchEvent(event);
      this.dispatchEvent(event);
      
      const ha = document.querySelector("home-assistant");
      if (ha) {
        ha.dispatchEvent(event);
      }

      // Standard HA fireEvent pattern if available on this
      if (this.hass && typeof this.hass.fireEvent === 'function') {
         console.error("[CRONOSTAR] [FORCE-LOG] Using hass.fireEvent...");
         this.hass.fireEvent("show-config-flow", eventData);
      }

      console.error("[CRONOSTAR] [FORCE-LOG] All events dispatched.");
    } catch (e) {
      console.error("[CRONOSTAR] [FORCE-LOG] CRITICAL ERROR:", e);
    }
  }

  async handleDeleteController() {
    const isIt = this.language === "it";
    const prefix = this.config?.global_prefix;
    const preset = this.config?.preset_type || "thermostat";

    const confirmMsg = isIt
      ? `Sei sicuro di voler eliminare definitivamente il controller '${prefix}' e tutti i suoi profili? Questa azione rimuoverà anche le entità associate.`
      : `Are you sure you want to permanently delete the controller '${prefix}' and all its profiles? This will also remove associated entities.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      await this.hass.callService("cronostar", "delete_controller", {
        global_prefix: prefix,
        preset_type: preset,
      });

      if (this.eventHandlers) {
        this.eventHandlers.showNotification(
          isIt
            ? "Controller eliminato con successo"
            : "Controller deleted successfully",
          "success",
        );
      }

      // Ricarica la pagina per aggiornare la dashboard YAML
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      Logger.error("UI", "Failed to delete controller:", e);
      if (this.eventHandlers) {
        this.eventHandlers.showNotification(
          (isIt ? "Errore eliminazione: " : "Delete failed: ") + e.message,
          "error",
        );
      }
    }
  }
}
