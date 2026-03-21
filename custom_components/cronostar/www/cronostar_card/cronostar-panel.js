/**
 * CronoStar Sidebar Panel
 *
 * Web component registrato come pannello nella sidebar di Home Assistant.
 * Carica via WebSocket la lista dei controller CronoStar configurati
 * e istanzia una cronostar-card per ciascuno.
 *
 * Supporta l'aggiunta di "Virtual Controllers" per permettere la configurazione
 * direttamente dal pannello anche se la dashboard è in modalità YAML o non modificabile.
 *
 * Percorso atteso: /cronostar_card/cronostar-panel.js
 */

class CronoStarPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass       = null;
    this._controllers = [];
    this._virtualControllers = []; // Per i controller in fase di creazione
    this._cards      = new Map();   // entry_id → <cronostar-card>
    this._loaded     = false;
  }

  // ──────────────────────────────────────────────────────────────────
  // HA lifecycle hooks
  // ──────────────────────────────────────────────────────────────────

  /** Home Assistant aggiorna questa proprietà ad ogni cambio di stato. */
  set hass(hass) {
    this._hass = hass;

    // Propaga hass a tutte le card già renderizzate
    this._cards.forEach(card => { card.hass = hass; });

    // Prima chiamata: carica i controller dal backend
    if (!this._loaded) {
      this._loaded = true;
      this._loadControllers();
    }
  }

  /** HA passa la configurazione del pannello (da panel_custom). */
  set panel(panel) {
    this._panelConfig = panel?.config ?? {};
  }

  // ──────────────────────────────────────────────────────────────────
  // Data loading
  // ──────────────────────────────────────────────────────────────────

  async _loadControllers() {
    this._renderLoading();
    try {
      const result = await this._hass.callWS({ type: 'cronostar/get_controllers' });
      this._controllers = result.controllers ?? [];
      await this._renderControllers();
    } catch (err) {
      console.error('[CronoStar Panel] Errore caricamento controller:', err);
      this._renderError(err.message ?? 'Errore sconosciuto');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Navigation / Actions
  // ──────────────────────────────────────────────────────────────────

  _addVirtualController() {
    // Aggiunge un controller "fantasma" alla lista per avviarne la configurazione
    const virtualId = `virtual_${Date.now()}`;
    this._virtualControllers.push({
      entry_id: virtualId,
      title: 'Nuovo Controller',
      isVirtual: true,
      data: {
        not_configured: true,
        preset_type: 'thermostat',
        title: 'Nuovo Controller CronoStar'
      }
    });
    
    // Forza il re-rendering
    this._renderControllers();
  }

  connectedCallback() {
    this.shadowRoot.addEventListener('hass-edit-card', (ev) => {
      ev.stopPropagation();
      const card = ev.composedPath().find(el => el.tagName === 'CRONOSTAR-CARD');
      
      let targetPath = '/config/integrations/dashboard/add?domain=cronostar';

      if (card) {
        let foundId = null;
        for (const [id, c] of this._cards.entries()) {
          if (c === card) { foundId = id; break; }
        }
        
        // Se è un controller reale (non virtuale), vai alla lista integrazioni
        if (foundId && !foundId.startsWith('virtual_')) {
           console.log('[CronoStarPanel] Editing existing controller:', foundId);
           targetPath = '/config/integrations/integration/cronostar';
        } else {
           console.log('[CronoStarPanel] Creating new controller');
        }
      }

      window.history.pushState(null, '', targetPath);
      window.dispatchEvent(new CustomEvent('location-changed', {
        bubbles: true,
        composed: true,
      }));
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────────────────────────────

  _renderLoading() {
    this.shadowRoot.innerHTML = `
      ${CronoStarPanel._styles()}
      <div class="container">
        ${CronoStarPanel._headerHTML()}
        <div class="state-box">
          <div class="spinner"></div>
          <span>Caricamento controller…</span>
        </div>
      </div>
    `;
  }

  _renderError(message) {
    this.shadowRoot.innerHTML = `
      ${CronoStarPanel._styles()}
      <div class="container">
        ${CronoStarPanel._headerHTML()}
        <div class="state-box error">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
          <span>Errore: ${message}</span>
          <button class="action-btn" id="retry">Riprova</button>
        </div>
      </div>
    `;
    this.shadowRoot.getElementById('retry')
      ?.addEventListener('click', () => {
        this._loaded = false;
        this._hass && this._loadControllers();
      });
  }

  async _renderControllers() {
    this._cards.clear();

    // Attende che <cronostar-card> sia definito prima di istanziarlo
    try {
      await customElements.whenDefined('cronostar-card');
    } catch (_) {
      // Se il timeout scade, proviamo comunque
    }

    // Unisce controller reali e virtuali
    const allControllers = [...this._virtualControllers, ...this._controllers];

    // Reset shadow root
    this.shadowRoot.innerHTML = CronoStarPanel._styles();

    const container = document.createElement('div');
    container.className = 'container';
    container.innerHTML = CronoStarPanel._headerHTML();

    // Attach header button listener
    const headerAddBtn = container.querySelector('#header-add-btn');
    if (headerAddBtn) {
      headerAddBtn.addEventListener('click', () => this._addVirtualController());
    }

    if (allControllers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'state-box';
      empty.innerHTML = `
        <ha-icon icon="mdi:thermostat-off"></ha-icon>
        <p>Nessun controller configurato.</p>
        <button class="action-btn" id="empty-add-btn">
          <ha-icon icon="mdi:plus"></ha-icon> Aggiungi Controller
        </button>
      `;
      container.appendChild(empty);
      
      // Attach empty state button listener
      setTimeout(() => {
        const emptyBtn = this.shadowRoot.getElementById('empty-add-btn');
        if (emptyBtn) emptyBtn.addEventListener('click', () => this._addVirtualController());
      }, 0);

    } else {
      const grid = document.createElement('div');
      grid.className = 'cards-grid';

      for (const ctrl of allControllers) {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';

        try {
          const card = document.createElement('cronostar-card');
          card.hass = this._hass;
          
          const cardConfig = {
            type:                 'custom:cronostar-card',
            preset_type:          ctrl.data.preset_type,
            global_prefix:        ctrl.data.global_prefix,
            target_entity:        ctrl.data.target_entity,
            title:                ctrl.data.title || ctrl.title,
            min_value:            ctrl.data.min_value,
            max_value:            ctrl.data.max_value,
            step_value:           ctrl.data.step_value,
            unit_of_measurement:  ctrl.data.unit_of_measurement,
            y_axis_label:         ctrl.data.y_axis_label,
            allow_max_value:      ctrl.data.allow_max_value,
            logging_enabled:      ctrl.data.logging_enabled,
            language:             ctrl.data.language,
          };

          // Se è virtuale, forza il flag not_configured
          if (ctrl.isVirtual) {
            cardConfig.not_configured = true;
          }

          card.setConfig(cardConfig);

          this._cards.set(ctrl.entry_id, card);
          wrapper.appendChild(card);
        } catch (err) {
          console.error(`[CronoStar Panel] Errore card "${ctrl.title}":`, err);
          wrapper.innerHTML = `
            <div class="card-error">
              <ha-icon icon="mdi:alert"></ha-icon>
              <span>Impossibile caricare: ${ctrl.title}</span>
            </div>
          `;
        }

        grid.appendChild(wrapper);
      }

      container.appendChild(grid);
    }

    this.shadowRoot.appendChild(container);
  }

  // ──────────────────────────────────────────────────────────────────
  // Static helpers
  // ──────────────────────────────────────────────────────────────────

  static _headerHTML() {
    return `
      <div class="panel-header">
        <div class="header-left">
          <img src="/cronostar_card/cronostar-logo.png" class="header-logo" alt="CronoStar">
          <span class="header-title">CronoStar</span>
        </div>
        <button class="action-btn" id="header-add-btn">
          <ha-icon icon="mdi:plus"></ha-icon>
          <span class="btn-text">Nuovo Controller</span>
        </button>
      </div>
    `;
  }

  static _styles() {
    return `
      <style>
        :host {
          display: block;
          min-height: 100%;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
          box-sizing: border-box;
        }

        *, *::before, *::after { box-sizing: inherit; }

        .container {
          max-width: 960px;
          margin: 0 auto;
          padding: 16px 16px 40px;
        }

        /* ── Header ── */
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0 16px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--divider-color);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-logo {
          height: 36px;
          width: auto;
        }

        .header-title {
          font-size: 1.5em;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: var(--primary-text-color);
        }

        /* ── Buttons ── */
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .action-btn:hover {
          opacity: 0.85;
        }

        .action-btn ha-icon {
          --mdc-icon-size: 20px;
        }

        @media (max-width: 480px) {
          .btn-text { display: none; }
          .action-btn { padding: 8px; }
        }

        /* ── Card grid ── */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
          gap: 16px;
        }

        .card-wrapper {
          width: 100%;
        }

        cronostar-card {
          display: block;
        }

        /* ── States (loading / empty / error) ── */
        .state-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 64px 24px;
          text-align: center;
          color: var(--secondary-text-color);
        }

        .state-box ha-icon {
          --mdc-icon-size: 56px;
          opacity: 0.45;
        }

        .state-box p {
          margin: 0;
          line-height: 1.5;
          font-size: 1.1em;
        }

        .state-box.error {
          color: var(--error-color, #db4437);
        }

        .state-box.error ha-icon {
          opacity: 0.7;
        }

        /* ── Spinner ── */
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--divider-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ── Inline card error ── */
        .card-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: var(--error-color, #db4437);
          color: #fff;
          border-radius: 8px;
          font-size: 0.9em;
          opacity: 0.85;
        }

        /* ── Responsive: singola colonna su schermi stretti ── */
        @media (max-width: 560px) {
          .cards-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
  }
}

if (!customElements.get('cronostar-panel')) {
  customElements.define('cronostar-panel', CronoStarPanel);
}
