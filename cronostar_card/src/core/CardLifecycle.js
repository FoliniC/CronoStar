import { Logger, checkIsEditorContext } from '../utils.js';
import { validateConfig, VERSION, extractCardConfig } from '../config.js';

export class CardLifecycle {
  constructor(card) {
    this.card = card;
    this.hasRegistered = false;

    // Observer per visibilitÃ  (conservato)
    this._visibilityObserver = null;
    this._lastVisible = null;

    // Spam guards
    this.loggedProfileSelectEntityMissing = false;
    this.loggedPauseEntityMissing = false;

    if (typeof window !== 'undefined') {
      if (!window.cronostarpausewarned) window.cronostarpausewarned = new Set();
    }
  }

  setConfig(config) {
    Logger.log('CONFIG', 'CronoStar setConfig config received:', config);

    // Close menu when configuration changes
    this.card.isMenuOpen = false;

    try {
      this.card.config = validateConfig(config);
      Logger.log('CONFIG', 'CronoStar setConfig validated config:', this.card.config);

      this.card.loggingEnabled = this.card.config.logging_enabled !== false;
      Logger.setEnabled(this.card.loggingEnabled);
      Logger.log('LOG', 'CronoStar Logging enabled:', this.card.loggingEnabled);

      this.card.selectedPreset = this.card.config.preset_type || this.card.config.preset;

      // Honor preview hints in config
      if (config && (config.preview === true || config.isPreview === true)) {
        this.card.isPreview = true;
        this.card.isPickerPreview = true;
        Logger.log('PREVIEW', 'CronoStar preview hint detected in config; forcing preview mode');
      }

      const hourBaseConfig = this.card.config.hour_base;
      if (typeof hourBaseConfig === 'object') {
        this.card.hourBase = hourBaseConfig.value;
        this.card.hourBaseDetermined = hourBaseConfig.determined;
      } else {
        this.card.hourBase = 0;
        this.card.hourBaseDetermined = true;
      }

      // Apply language from config.meta.language if present
      try {
        const cfgLang = this.card.config?.meta?.language || config?.meta?.language;
        if (cfgLang && this.card.language !== cfgLang) {
          this.card.language = cfgLang;
          this.card.languageInitialized = true;
          Logger.log('LANG', `CronoStar setConfig applied language from meta: ${cfgLang}`);
        }
      } catch (e) {
        Logger.warn('LANG', 'CronoStar setConfig language application failed:', e);
      }
    } catch (e) {
      Logger.error('CONFIG', 'CronoStar Error in setConfig:', e);
      this.card.eventHandlers?.showNotification?.(
        this.card.localizationManager?.localize?.(this.card.language, 'error.configerror', e.message) ||
        `Config error: ${e.message}`,
        'error',
      );
    }
  }

  updated(changed) {
    if (changed.has('config')) {
      try {
        if (this.card.chartManager?.isInitialized()) {
          this.card.chartManager.recreateChartOptions();

          const chart = this.card.chartManager.getChart?.();
          if (chart && chart.options?.scales?.y) {
            chart.options.scales.y.min = this.card.config.min_value;
            chart.options.scales.y.max = this.card.config.max_value;
            chart.update();
          }
          this.card.chartManager.updateChartLabels?.();
        }
      } catch (e) {
        Logger.warn('UPDATE', 'CronoStar updated(config) chart refresh failed:', e);
      }
    }

    // ✅ FIX: Hide preview immediately in Step 0
    this._updatePreviewVisibility();
  }

  setHass(hass) {
    if (!hass) {
      Logger.warn('HASS', 'CronoStar Received null hass object');
      return;
    }

    try {
      this._hass = hass;
      const card = this.card;

      this._refreshContextFlags();

      if (card.isPreview || card.preview === true || card._preview === true || this.isPickerPreviewContext()) {
        if (!card.languageInitialized && hass.language) {
          card.language = hass.language;
          card.languageInitialized = true;
          Logger.log('LANG', 'CronoStar (Preview) Language initialized to:', card.language);
        }
        return;
      }

      if (!card.languageInitialized && hass.language) {
        card.language = hass.language;
        card.languageInitialized = true;
        Logger.log('LANG', 'CronoStar Language initialized to:', card.language);
      }

      // If meta.language exists, prefer it over hass.language
      try {
        const metaLang = card.config?.meta?.language;
        if (metaLang && card.language !== metaLang) {
          card.language = metaLang;
          card.languageInitialized = true;
          Logger.log('LANG', `CronoStar setHass applied language from config meta: ${metaLang}`);
        }
      } catch (e) {
        Logger.warn('LANG', 'CronoStar setHass meta language application failed:', e);
      }

      const inEditor = this.isEditorContext();

      if (!card.cronostarReady) {
        if (hass.services?.cronostar?.apply_now || hass.services?.cronostar?.applynow) {
          Logger.log('LOAD', 'CronoStar Backend service found, considering it ready.');
          card.cronostarReady = true;
          card.requestUpdate();
        }
      }

      const hasService = hass.services?.cronostar && (hass.services.cronostar.register_card || hass.services.cronostar.registercard);

      if (!this.hasRegistered && !this._isRegistering && hasService && card.config?.global_prefix) {
        this._isRegistering = true;
        Logger.log('LOAD', 'CronoStar starting registration with prefix:', card.config.global_prefix);

        this.registerCard(hass)
          .then(() => { this.hasRegistered = true; })
          .catch((e) => { Logger.warn('LOAD', 'CronoStar register_card call failed:', e); })
          .finally(() => { this._isRegistering = false; });
      }

      if (card.config?.enabled_entity && !card.config.not_configured) {
        const enabledId = card.config.enabled_entity;
        const enabledStateObj = hass.states[enabledId];
        if (enabledStateObj) {
          card.isEnabled = enabledStateObj.state === 'on';
          this.loggedPauseEntityMissing = false;
        } else {
          let alreadyWarnedGlobally = false;
          if (typeof window !== 'undefined' && window.cronostarpausewarned instanceof Set) {
            alreadyWarnedGlobally = window.cronostarpausewarned.has(enabledId);
          }
          if (!this.loggedPauseEntityMissing && !alreadyWarnedGlobally) {
            Logger.warn('HASS', 'CronoStar Enabled entity not found:', enabledId);
            if (typeof window !== 'undefined' && window.cronostarpausewarned instanceof Set) {
              window.cronostarpausewarned.add(enabledId);
            }
            this.loggedPauseEntityMissing = true;
          }
        }
      }

      if (card.config?.profiles_select_entity && !card.config.not_configured) {
        const selId = card.config.profiles_select_entity;
        const selObj = hass.states[selId];
        if (selObj) {
          this.loggedProfileSelectEntityMissing = false;
          const newProfile = selObj.state;
          const newOptions = selObj.attributes?.options;

          if (JSON.stringify(card.profileOptions) !== JSON.stringify(newOptions)) {
            card.profileOptions = newOptions;
            Logger.log('HASS', 'CronoStar Profile options updated:', newOptions?.length, 'profiles');
          }

          if (newProfile && newProfile !== card.selectedProfile) {
            card.selectedProfile = newProfile;
            Logger.log('HASS', 'CronoStar Selected profile updated:', newProfile);

            if (!card.hasUnsavedChanges && card.initialLoadComplete) {
              card.profileManager?.loadProfile?.(newProfile).catch((e) => {
                Logger.warn('LOAD', 'Profile load failed:', e);
              });
            }
          }
        } else if (!this.loggedProfileSelectEntityMissing) {
          Logger.warn('HASS', 'CronoStar Profile select entity not found:', selId);
          this.loggedProfileSelectEntityMissing = true;
        }
      }

      if (!inEditor) {
        card.cardSync?.updateAutomationSync?.(hass);
        if (!card.syncCheckTimer) {
          card.syncCheckTimer = setInterval(() => {
            if (!card._cardConnected) return;
            card.cardSync?.updateAutomationSync?.(hass);

            if (card.chartManager?.isInitialized()) {
              card.chartManager.update('none');
            }
          }, 5000);
        }
      }
    } catch (err) {
      Logger.error('HASS', 'CronoStar Error in setHass:', err);
    }
  }

  connectedCallback() {
    try {
      this.card._cardConnected = true;
      this._refreshContextFlags();
      Logger.log('LIFECYCLE', `CronoStar connectedCallback - Element added to DOM. context: ${this.isEditorContext() ? 'EDITOR' : 'CARD'}`);

      if (this.isPickerPreviewContext()) {
        if (!this.card.isPreview) this.card.isPreview = true;
        this.card.isPickerPreview = true;
        Logger.log('PREVIEW', 'CronoStar detected card picker preview context; enabling image-only preview');
      }

      // Canvas size check deferred
      try {
        if (!this.isEditorContext()) {
          const doCanvasCheck = () => {
            try {
              const canvas = this.card.shadowRoot?.getElementById('myChart');
              if (!canvas) {
                setTimeout(doCanvasCheck, 100);
                return;
              }
              const rect = canvas.getBoundingClientRect();
              const w = Math.round(rect?.width || 0);
              const h = Math.round(rect?.height || 0);
              Logger.log('LIFECYCLE', `CronoStar canvas check: ${w}x${h}`);
              const chartReady = !!(this.card.chartManager?.isInitialized?.() && this.card.chartManager?.getChart?.());
              if (w === 0 || h === 0 || !chartReady) {
                Logger.log('LIFECYCLE', `CronoStar chart not ready (size=${w}x${h}, ready=${chartReady}); rebuilding`);
                this.reinitializeCard();
              } else {
                try { this.card.chartManager?.update?.('none'); } catch (e) { /* ignore */ }
              }
            } catch (err) {
              Logger.warn('LIFECYCLE', 'Canvas check error:', err);
            }
          };

          try { this.card.updateComplete?.then(() => setTimeout(doCanvasCheck, 0)); } catch (e) { /* ignore */ }
          requestAnimationFrame(() => setTimeout(doCanvasCheck, 0));
        }
      } catch (e) {
        Logger.warn('LIFECYCLE', 'Canvas size check failed:', e);
      }

      if (this.card.initialLoadComplete) {
        Logger.log('LIFECYCLE', 'CronoStar Reconnected - scheduling reinitialization');
        requestAnimationFrame(() => this.reinitializeCard());
      }
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in connectedCallback:', e);
    }
  }

  disconnectedCallback() {
    try {
      this.card._cardConnected = false;
      Logger.log('LIFECYCLE', `CronoStar disconnectedCallback - Element REMOVED from DOM. context: ${this.isEditorContext() ? 'EDITOR' : 'CARD'}`);

      if (this.card.syncCheckTimer) {
        clearInterval(this.card.syncCheckTimer);
        this.card.syncCheckTimer = null;
      }
      this.cleanupCard();
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in disconnectedCallback:', e);
    }
  }

  _refreshContextFlags() {
    try {
      const inPicker = this.isPickerPreviewContext();
      const inEditor = this.isEditorContext();
      if (inPicker && !this.card.isPreview) {
        this.card.isPreview = true;
      }
      this.card.isPickerPreview = inPicker;
      this.card.isEditor = inEditor;
    } catch (e) {
      Logger.warn('LIFECYCLE', 'CronoStar _refreshContextFlags error:', e);
    }
  }

  cleanupCard() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar Cleaning up card resources');

      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas) this.card.pointerHandler?.detachListeners?.(canvas);

      const chartContainer = this.card.shadowRoot?.querySelector('.chart-container');
      if (chartContainer) this.card.keyboardHandler?.detachListeners?.(chartContainer);

      this.card.chartManager?.destroy?.();
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in cleanupCard:', e);
    }
  }

  isEditorContext() {
    return checkIsEditorContext(this.card);
  }

  isPickerPreviewContext() {
    try {
      let el = this.card;
      while (el) {
        if (el.tagName) {
          const tag = el.tagName.toLowerCase();
          // Home Assistant Picker containers
          if (tag === 'hui-card-picker' || tag === 'hui-section-card-picker') {
            return true;
          }
          // If we found the editor or a standard preview, we are NOT in the picker list
          if (tag === 'hui-card-preview' || tag === 'hui-card-editor' || tag === 'hui-dialog-edit-card') {
            return false;
          }
        }
        el = el.parentElement || el.parentNode || el.host;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  firstUpdated() {
    try {
      Logger.log('LIFECYCLE', `CronoStar firstUpdated called (picker=${this.isPickerPreviewContext() ? 'yes' : 'no'}, editor=${this.isEditorContext() ? 'yes' : 'no'})`);

      if (this.isPickerPreviewContext() || this.card.isPickerPreview === true) {
        Logger.log('PREVIEW', 'CronoStar in picker preview: skipping chart and listeners');
        return;
      }

      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas && typeof this.card.chartManager?.initChart === 'function') {
        this.card.chartManager.initChart(canvas);
      }

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (container) {
        this.card.keyboardHandler?.attachListeners?.(container);
      }
      if (canvas) {
        this.card.pointerHandler?.attachListeners?.(canvas);
      }

      this.card.cardSync?.updateAutomationSync?.(this.card.hass);
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in firstUpdated:', e);
    }
  }

  reinitializeCard() {
    try {
      Logger.log('LIFECYCLE', 'CronoStar reinitializeCard starting');

      const canvas = this.card.shadowRoot?.getElementById('myChart');
      if (canvas) {
        try { this.card.chartManager?.destroy?.(); } catch (e) { /* ignore */ }
        if (typeof this.card.chartManager?.initChart === 'function') {
          this.card.chartManager.initChart(canvas);
        }
      }

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (container) {
        try { this.card.keyboardHandler?.detachListeners?.(container); } catch (e) { /* ignore */ }
        this.card.keyboardHandler?.attachListeners?.(container);
      }

      if (canvas) {
        try { this.card.pointerHandler?.detachListeners?.(canvas); } catch (e) { /* ignore */ }
        this.card.pointerHandler?.attachListeners?.(canvas);
      }

      this.card.requestUpdate();
      Logger.log('LIFECYCLE', 'CronoStar reinitializeCard done');
    } catch (e) {
      Logger.error('LIFECYCLE', 'CronoStar Error in reinitializeCard:', e);
    }
  }

  async registerCard(hass) {
    if (this.card.isPreview || this.card.preview === true || this.card._preview === true || !this.card.config?.global_prefix) {
      if (!this.card.config?.global_prefix) {
        Logger.log('LOAD', 'CronoStar attempting registration but global_prefix is missing; skipping for now.');
      }
      return;
    }
    try {
      const cardId = this.card.cardId || `cronostar-${this.card.config.global_prefix.replace(/_+$/, '')}`;
      this.card.cardId = cardId;

      const cfg = this.card.config || {};
      const serviceData = {
        card_id: cardId,
        version: VERSION,
        preset: cfg.preset_type || 'thermostat',
        global_prefix: cfg.global_prefix,
        selected_profile: this.card.selectedProfile
      };

      Logger.log('LOAD', 'CronoStar registering card with service data:', serviceData);

      const result = (await hass.callWS({
        type: 'call_service',
        domain: 'cronostar',
        service: 'register_card',
        service_data: serviceData,
        return_response: true,
      })) || {};

      const response = result?.response ?? result;
      Logger.log('LOAD', 'CronoStar register_card response:', response);

      // Capture global settings
      if (response?.settings) {
        this.card.globalSettings = response.settings;
        Logger.log('LOAD', '[CronoStar] Global settings updated:', this.card.globalSettings);
      }

      // Capture preset defaults and apply if not configured
      if (response?.preset_defaults && this.card.config?.not_configured) {
        Logger.log('LOAD', '[CronoStar] Applying preset defaults:', response.preset_defaults);
        this.card.config = { ...this.card.config, ...response.preset_defaults };
      }

      const profileData = response?.profile_data;

      // Robust profile name extraction
      let returnedProfileName = profileData?.profile_name || response?.profile_name;

      if (returnedProfileName) {
        Logger.log('LOAD', `[CronoStar] Profile name detected in response: "${returnedProfileName}"`);
        this.card.selectedProfile = returnedProfileName;
        if (this.card.profileManager) {
          this.card.profileManager.lastLoadedProfile = returnedProfileName;
        }
      } else if (this.card.selectedProfile) {
        returnedProfileName = this.card.selectedProfile;
        Logger.log('LOAD', `[CronoStar] No profile name in response, retaining current: "${returnedProfileName}"`);
      } else {
        returnedProfileName = 'Default';
        this.card.selectedProfile = 'Default';
        Logger.log('LOAD', '[CronoStar] No profile name found anywhere, defaulting to "Default"');
      }

      if (profileData?.meta) {
        const cleanMeta = extractCardConfig(profileData.meta);
        this.card.config = { ...this.card.config, ...cleanMeta };
        Logger.log('LOAD', 'CronoStar updated card config from register_card metadata');

        // Explicitly apply language from profile meta
        try {
          const lang = profileData.meta.language;
          if (lang) {
            this.card.language = lang;
            this.card.languageInitialized = true;
            if (!this.card.config.meta) this.card.config.meta = {};
            this.card.config.meta.language = lang;
            Logger.log('LANG', `[CronoStar] register_card applied language from profile meta: ${lang}`);
          }
        } catch (e) {
          Logger.warn('LANG', 'CronoStar failed to apply language from register_card meta:', e);
        }
      }

      const rawSchedule = profileData?.schedule;
      let scheduleValues = [];

      if (response && !response.error && rawSchedule && Array.isArray(rawSchedule)) {
        scheduleValues = rawSchedule;

        const sample = scheduleValues.slice(0, 5);
        Logger.log('LOAD', `CronoStar (Chart) Parsed schedule: length=${scheduleValues.length}, sample=${JSON.stringify(sample)}`);

        Logger.log('LOAD', `CronoStar (Success) Profile data processed for '${returnedProfileName}'. Points: ${scheduleValues.length}`);
      } else {
        try {
          const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
          const hasNoData = !Array.isArray(this.card.stateManager?.scheduleData) || this.card.stateManager.scheduleData.length === 0;
          if (isSwitch && hasNoData && this.card.profileManager?.loadProfile) {
            const name = returnedProfileName || 'Default';
            Logger.log('LOAD', `[CronoStar] Fallback load_profile for switch: '${name}'`);
            try {
              await this.card.profileManager.loadProfile(name);
            } catch (e) {
              Logger.warn('LOAD', `Fallback load_profile failed for '${name}':`, e);
            }
          }
        } catch (e) { /* ignore */ }
      }

      this.card.stateManager.setData(scheduleValues);

      if (this.card.chartManager?.isInitialized()) {
        this.card.chartManager.updateData(scheduleValues);
      }

      this.card.hasUnsavedChanges = false;
      Logger.load(`CronoStar ✅ Profile '${returnedProfileName}' loaded to memory successfully.`);
      Logger.load("[CronoStar] === LOAD PROFILE END ===");

      this.card.initialLoadComplete = true;
      this.card.cronostarReady = true;

      if (response?.entity_states) {
        this.card.entityStates = response.entity_states;
      }

      this.card.requestUpdate();

      this.hasRegistered = true;
    } catch (e) {
      Logger.warn('LOAD', 'CronoStar register_card failed:', e);
    }
  }

  // ✅ NEW: Aggressively hide preview in Step 0
  _updatePreviewVisibility() {
    try {
      // Detect if we're in Step 0 (either from config or editor state)
      const step = this.card.config?.step;
      const shouldHide = (step === 0 || step === '0');

      let styleEl = document.getElementById('cronostar-editor-style');

      if (shouldHide) {
        Logger.log('PREVIEW', `[LIFECYCLE] Hiding preview for Step ${step}`);

        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'cronostar-editor-style';
          document.head.appendChild(styleEl);
        }

        // ✅ ULTRA-AGGRESSIVE CSS: Force display:none on ALL preview containers
        styleEl.textContent = `
          /* CronoStar: Aggressively hide preview in Step 0 */
          
          /* Primary targets */
          .element-preview,
          .preview,
          hui-card-preview,
          hui-card-preview-overlay {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            z-index: -9999 !important;
          }

          /* Nested children */
          .element-preview *,
          .preview *,
          hui-card-preview *,
          hui-card-preview-overlay * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Expand editor to full width */
          .element-editor,
          .editor,
          hui-card-editor {
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 auto !important;
          }

          /* Force single column layout */
          .elements,
          .content {
            grid-template-columns: 1fr !important;
            display: block !important;
          }

          /* Hide any cronostar-card instances in preview contexts */
          .element-preview cronostar-card,
          .preview cronostar-card,
          hui-card-preview cronostar-card {
            display: none !important;
          }
        `;

        this._previewWasHidden = true;
      } else if (styleEl) {
        if (this._previewWasHidden) {
          Logger.log('PREVIEW', `[EDITOR] Restoring preview for Step ${step || 'N/A'}`);
        }
        styleEl.textContent = '';
        this._previewWasHidden = false;
      }
    } catch (e) {
      Logger.warn('PREVIEW', 'Error in _updatePreviewVisibility:', e);
    }
  }
}