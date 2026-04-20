// CronoStar Panel - Main Entry point
// Handles dashboard management and controller discovery

class CronoStarPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass       = null;
    this._controllers = [];
    this._virtualControllers = []; // For controllers being created
    this._cards      = new Map();   // entry_id → <cronostar-card>
    this._loaded     = false;
  }

  // ──────────────────────────────────────────────────────────────────
  // HA lifecycle hooks
  // ──────────────────────────────────────────────────────────────────

  /** Home Assistant updates this property on every state change. */
  set hass(hass) {
    this._hass = hass;

    // Propagate hass to all already rendered cards
    this._cards.forEach(card => { card.hass = hass; });

    // First call: load controllers from backend
    if (!this._loaded) {
      this._loaded = true;
      this._loadControllers();
    }
  }

  /** HA passes panel configuration (from panel_custom). */
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
      console.error('[CronoStar Panel] Error loading controllers:', err);
      this._renderError(err.message ?? 'Unknown error');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Navigation / Actions
  // ──────────────────────────────────────────────────────────────────

  _addVirtualController() {
    // Adds a "phantom" controller to the list to start its configuration
    const virtualId = `virtual_${Date.now()}`;
    this._virtualControllers.push({
      entry_id: virtualId,
      title: 'New Controller',
      isVirtual: true,
      data: {
        not_configured: true,
        preset_type: 'thermostat',
        title: 'New CronoStar Controller'
      }
    });
    
    // Force re-rendering
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
        
        // If it's a real controller (not virtual), go to the integrations list
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
          <span>Loading controllers…</span>
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
          <span>Error: ${message}</span>
          <button class="action-btn" id="retry">Retry</button>
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

    // Wait for <cronostar-card> to be defined before instantiating it
    try {
      await customElements.whenDefined('cronostar-card');
    } catch (_) {
      // If timeout expires, try anyway
    }

    // Merge real and virtual controllers
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
        <p>No controllers configured.</p>
        <button class="action-btn" id="empty-add-btn">
          <ha-icon icon="mdi:plus"></ha-icon> Add Controller
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

          // If virtual, force not_configured flag
          if (ctrl.isVirtual) {
            cardConfig.not_configured = true;
          }

          card.setConfig(cardConfig);
          this._cards.set(ctrl.entry_id, card);
          wrapper.appendChild(card);
        } catch (e) {
          wrapper.innerHTML = `<div class="state-box error">Error loading card: ${e.message}</div>`;
        }
        grid.appendChild(wrapper);
      }
      container.appendChild(grid);
    }
    this.shadowRoot.appendChild(container);
  }

  static _headerHTML() {
    return `
      <div class="header">
        <div class="header-main">
          <img src="/cronostar_card/cronostar-logo.png" alt="CronoStar">
          <div class="header-text">
            <h1>CronoStar Dash</h1>
            <p>Schedule Management</p>
          </div>
        </div>
        <button class="action-btn primary" id="header-add-btn">
           <ha-icon icon="mdi:plus"></ha-icon> Add New
        </button>
      </div>
    `;
  }

  static _styles() {
    return `
      <style>
        :host {
          display: block;
          background-color: var(--primary-background-color);
          min-height: 100vh;
          font-family: var(--paper-font-body1_-_font-family, 'Roboto', 'Noto', sans-serif);
          color: var(--primary-text-color);
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 16px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--divider-color);
        }
        .header-main {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-main img {
          height: 48px;
          width: auto;
        }
        .header-text h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 500;
        }
        .header-text p {
          margin: 4px 0 0 0;
          font-size: 14px;
          color: var(--secondary-text-color);
        }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
          gap: 24px;
        }
        .card-wrapper {
          position: relative;
          min-height: 300px;
        }
        .state-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 32px;
          text-align: center;
          background: var(--card-background-color);
          border-radius: 12px;
          border: 1px solid var(--divider-color);
          box-shadow: var(--ha-card-box-shadow, 0 2px 2px 0 rgba(0,0,0,0.14), 0 1px 5px 0 rgba(0,0,0,0.12), 0 3px 1px -2px rgba(0,0,0,0.2));
        }
        .state-box.error {
          border-color: var(--error-color);
          color: var(--error-color);
        }
        .state-box ha-icon {
          --mdc-icon-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .state-box p {
          font-size: 18px;
          margin-bottom: 24px;
          color: var(--secondary-text-color);
        }
        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid var(--divider-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          background-color: var(--secondary-background-color);
          color: var(--primary-text-color);
        }
        .action-btn.primary {
          background-color: var(--primary-color);
          color: var(--text-primary-color, white);
        }
        .action-btn:hover {
          opacity: 0.9;
        }
        @media (max-width: 600px) {
          .cards-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
  }
}

customElements.define('cronostar-panel', CronoStarPanel);
