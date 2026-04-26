// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: lit ────────────────────────────────────────────────────────────────
vi.mock("lit", () => ({
  html: (strings, ...values) => ({ strings, values, __litHtml: true }),
}));

// ─── Mock: lit/directives/class-map.js ───────────────────────────────────────
vi.mock("lit/directives/class-map.js", () => ({
  classMap: (obj) => JSON.stringify(obj),
}));

// ─── Mock: ../config.js ───────────────────────────────────────────────────────
vi.mock("../config.js", () => ({
  CARD_CONFIG_PRESETS: { 
    thermostat: { title: "Thermostat" }, 
    boiler: { title: "Boiler" },
    cooling: { title: "Cooling" }
  },
  TIMEOUTS: { editingGraceMs: 5000 },
  VERSION: "1.0.0",
}));

import { CardRenderer } from "../src/core/CardRenderer.js";

// ─── Helper: Serialize lit-html ──────────────────────────────────────────────
function serialize(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "boolean") return "";
  if (typeof node === "function") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(serialize).join("");
  if (node && node.__litHtml) {
    return node.strings.reduce((acc, str, i) => {
      return acc + str + serialize(node.values[i]);
    }, "");
  }
  return "";
}

// ─── Helper: Execute Handlers ────────────────────────────────────────────────
async function executeHandlers(node, eventOverrides = {}) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) await executeHandlers(item, eventOverrides);
    return;
  }
  if (node.__litHtml) {
    for (const val of node.values) {
      if (typeof val === "function") {
        const e = {
          type: "click",
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          target: {
            value: "test-val",
            checked: true,
            classList: { contains: (c) => eventOverrides.classList?.includes(c) || false },
            closest: vi.fn((sel) => {
                if (sel === "ha-select") return e.target;
                if (sel === "mwc-button") return e.target;
                return {
                    open: true,
                    menuOpen: true,
                    blur: vi.fn(),
                    shadowRoot: {
                      querySelector: vi.fn((sel) => {
                        if (sel === "ha-picker-field") return { classList: { remove: vi.fn() } };
                        if (sel === "ha-dropdown" || sel === "mwc-menu") return { open: false, removeAttribute: vi.fn() };
                        return null;
                      })
                    }
                };
            })
          },
          detail: { value: "detail-val", config: { step: 1 } },
          ...eventOverrides
        };
        try {
          const res = val(e);
          if (res instanceof Promise) await res;
        } catch (err) {}
      } else if (val && typeof val === "object") {
        await executeHandlers(val, eventOverrides);
      }
    }
  }
}

// ─── Builder: Mock Card ──────────────────────────────────────────────────────
function buildCardMock(overrides = {}) {
  const card = {
    language: "en",
    config: { target_entity: "climate.test", global_prefix: "cronostar_thermostat_" },
    isEditorInternal: false,
    _wizardInsets: { headerHeight: 60, sidebarWidth: 250 },
    _lastGoodConfig: { target_entity: "climate.old" },
    hass: { callService: vi.fn() },
    isEnabled: true,
    isMenuOpen: false,
    _showChart: false,
    selectedProfile: "Default",
    profileOptions: ["Default", "Eco"],
    selectedPreset: "thermostat",
    loggingEnabled: true,
    initialLoadComplete: false,
    cronostarReady: false,
    missingEntities: [],
    awaitingAutomation: false,
    hasUnsavedChanges: false,
    isDragging: false,
    overlaySuppressionUntil: 0,
    lastEditAt: null,
    isExpandedV: false,
    isExpandedH: false,
    contextMenu: null,
    showUnsavedChangesDialog: false,
    pendingProfileChange: null,
    versionCheckEnabled: false,
    integrationVersion: "1.0.0",
    editorStep: 0,

    requestUpdate: vi.fn(),
    setConfig: vi.fn(),
    handleEditConfig: vi.fn(),
    handleDeleteController: vi.fn(),
    toggleChart: vi.fn(),
    handleAddProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    updateComplete: Promise.resolve(),
    
    isEditorContext: vi.fn(() => false),
    isPickerPreviewContext: vi.fn(() => false),

    localizationManager: {
      localize: vi.fn((lang, key, search, replace) => {
        let text = `[${lang}] ${key}`;
        if (search && replace) text = text.replace(search, replace);
        return text;
      }),
    },
    cardLifecycle: {
      isEditorContext: vi.fn(() => false),
      isPickerPreviewContext: vi.fn(() => false),
      reinitializeCard: vi.fn(),
      registerCard: vi.fn(),
    },
    eventHandlers: {
      toggleMenu: vi.fn(),
      handleApplyNow: vi.fn(),
      handleSelectAll: vi.fn(),
      handleAlignLeft: vi.fn(),
      handleAlignRight: vi.fn(),
      handleHelp: vi.fn(),
      handleLoggingToggle: vi.fn(),
      handlePresetChange: vi.fn(),
      handleLanguageSelect: vi.fn(),
      toggleEnabled: vi.fn(),
      handleCardClick: vi.fn(),
      handleDeleteSelected: vi.fn(),
      handleCopyJson: vi.fn(),
    },
    profileManager: {
      handleProfileSelection: vi.fn(),
      saveProfile: vi.fn(),
      loadProfile: vi.fn(),
      lastLoadedProfile: "Default",
    },
    selectionManager: {
      handlePointerMove: vi.fn(),
      handlePointerDown: vi.fn(),
      handlePointerUp: vi.fn(),
    },
    cardSync: {
      getAwaitingAutomationText: vi.fn(() => "Awaiting Automation..."),
    },
    ...overrides,
  };
  return card;
}

describe("CardRenderer Exhaustive Boost", () => {
  it("covers render() base cases and title logic", () => {
    const card = buildCardMock({ config: null });
    const renderer = new CardRenderer(card);
    expect(serialize(renderer.render())).toBe("");

    card.config = { title: "Title" };
    renderer.render();

    card.config.title = undefined;
    card.config.global_prefix = "cronostar_thermostat_kitchen_";
    renderer.render();

    card.config.view_mode = "admin";
    renderer.render();
  });

  describe("_renderAdminBox", () => {
    it("covers isEditorInternal branches", async () => {
        const card = buildCardMock({ isEditorInternal: true });
        const renderer = new CardRenderer(card);
        let template = renderer._renderAdminBox("Admin");
        
        await executeHandlers(template); // Close button
        await executeHandlers(template, { type: "cronostar-wizard-done", detail: { config: { n: "c" } } });
        await executeHandlers(template, { type: "config-changed", detail: { config: { _close_wizard: true } } });
        expect(card.isEditorInternal).toBe(false);
    });

    it("covers not_configured and valid/invalid branches", async () => {
        const card = buildCardMock({ config: { not_configured: true }, language: "it" });
        const renderer = new CardRenderer(card);
        await executeHandlers(renderer._renderAdminBox("Admin"));

        card.config.not_configured = false;
        card.config.validation = { valid: false, errors: ["Err"] };
        renderer._renderAdminBox("Admin");
        
        card.config.validation.valid = true;
        card.isMenuOpen = true;
        card._showChart = true;
        await executeHandlers(renderer._renderAdminBox("Admin"));
    });

    it("covers all click handlers and select logic", async () => {
        const card = buildCardMock({ _showChart: true, profileOptions: ["P1"], config: { enabled_entity: "e" } });
        const renderer = new CardRenderer(card);
        const template = renderer._renderAdminBox("Admin");
        await executeHandlers(template);
        await executeHandlers(template, { type: "change", target: { value: "P1", closest: vi.fn(() => ({ open: true, blur: vi.fn() })) } });
    });
  });

  describe("_renderFullCard", () => {
    it("covers isEditorInternal branches (600-603 etc)", async () => {
        const card = buildCardMock({ isEditorInternal: true });
        const renderer = new CardRenderer(card);
        const template = renderer._renderFullCard("Title");
        
        await executeHandlers(template); // Close
        await executeHandlers(template, { type: "cronostar-wizard-done", detail: { config: { n: "c" } } });
        
        card.isEditorInternal = true;
        await executeHandlers(template, { type: "config-changed", detail: { config: { _close_wizard: true } } });
        expect(card.isEditorInternal).toBe(false);

        await executeHandlers(template, { type: "config-changed", detail: { config: { old: "cfg" } } });
    });

    it("covers not_configured and picker preview", () => {
        const card = buildCardMock({ config: { not_configured: true } });
        const renderer = new CardRenderer(card);
        card.cardLifecycle.isEditorContext.mockReturnValue(true);
        renderer._renderFullCard("Title");

        card.config.not_configured = false;
        card.cardLifecycle.isPickerPreviewContext.mockReturnValue(true);
        renderer._renderFullCard("Title");
        
        card.config.preview_image = "img.png";
        renderer._renderFullCard("Title");
    });

    it("covers broken state and expansion", async () => {
        const card = buildCardMock({ config: { target_entity: null }, initialLoadComplete: true, language: "it" });
        const renderer = new CardRenderer(card);
        await executeHandlers(renderer._renderFullCard("Title"));

        card.config.target_entity = "e";
        const template = renderer._renderFullCard("Title");
        await executeHandlers(template);
        expect(card.isExpandedV).toBe(true);
        
        card.isExpandedV = true;
        await executeHandlers(renderer._renderFullCard("Title"));
    });

    it("covers menu, context menu and overlays", async () => {
        const card = buildCardMock({ 
            isMenuOpen: true, 
            contextMenu: { show: true, x: 0, y: 0 }, 
            versionCheckEnabled: true, 
            integrationVersion: "2.0.0",
            initialLoadComplete: true,
            cronostarReady: true,
            awaitingAutomation: true,
            missingEntities: ["e1"]
        });
        const renderer = new CardRenderer(card);
        const template = renderer._renderFullCard("Title");
        await executeHandlers(template);
        
        card.initialLoadComplete = false;
        renderer._renderFullCard("Title");
        
        card.initialLoadComplete = true;
        card.cronostarReady = false;
        renderer._renderFullCard("Title");
    });

    it("covers unsaved changes and controls", async () => {
        const card = buildCardMock({ 
            showUnsavedChangesDialog: true, 
            language: "it", 
            isStartup: true,
            _showChart: true,
            config: { enabled_entity: "e" }
        });
        const renderer = new CardRenderer(card);
        const template = renderer._renderFullCard("Title");
        
        await executeHandlers(template); // Save
        await executeHandlers(template, { classList: ["discard-btn"] }); // Discard
        await executeHandlers(template); // Cancel
        
        await executeHandlers(template); // Automation switch
        await executeHandlers(template, { type: "change", target: { value: "P1", closest: vi.fn(() => ({ open: true, blur: vi.fn() })) } }); // Profile select
    });
  });
});
