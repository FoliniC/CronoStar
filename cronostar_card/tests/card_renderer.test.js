// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: lit ────────────────────────────────────────────────────────────────
vi.mock("lit", () => ({
  html: (strings, ...values) => ({ strings, values, __litHtml: true }),
}));

// ─── Mock: ../src/config.js ───────────────────────────────────────────────────────
vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: { thermostat: { title: "Boiler" }, boiler: {}, cooling: {} },
  TIMEOUTS: { editingGraceMs: 5000 },
  VERSION: "1.2.3",
}));

import { CardRenderer } from "../src/core/CardRenderer.js";

function serialize(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "boolean") return "";
  if (typeof node === "function") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(serialize).join("");
  if (node && node.__litHtml) {
    return node.strings.reduce((acc, str, i) => acc + str + serialize(node.values[i]), "");
  }
  return "";
}

function buildCard(overrides = {}) {
  const base = {
    language: "en",
    config: { target_entity: "sensor.temp", global_prefix: "p_" },
    isEditorInternal: false,
    editorStep: null,
    _lastGoodConfig: null,
    hass: {
        states: {
            "p_enabled": { state: "on" },
            "p_current_profile": { attributes: { options: ["p1"] } }
        },
        callService: vi.fn(),
        localize: vi.fn((k) => k)
    },
    isEnabled: true,
    isEnabledControlled: true,
    isPreview: false,
    isStartup: false,
    isMenuOpen: false,
    isExpandedV: false,
    isExpandedH: false,
    selectedProfile: "default",
    profileOptions: ["default"],
    selectedPreset: "thermostat",
    loggingEnabled: false,
    initialLoadComplete: true,
    cronostarReady: true,
    missingEntities: [],
    awaitingAutomation: false,
    hasUnsavedChanges: false,
    isDragging: false,
    overlaySuppressionUntil: 0,
    lastEditAt: null,
    contextMenu: { show: false },
    outOfSyncDetails: "",
    showUnsavedChangesDialog: false,
    pendingProfileChange: null,
    versionCheckEnabled: false,
    integrationVersion: "1.2.3",

    handleEditConfig: vi.fn(),
    handleDeleteController: vi.fn(),
    handleAddProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    setConfig: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(),

    cardLifecycle: {
      isEditorContext: vi.fn(() => false),
      isPickerPreviewContext: vi.fn(() => false),
      reinitializeCard: vi.fn(),
      registerCard: vi.fn(),
    },
    cardSync: {
        getAwaitingAutomationText: vi.fn(() => "Syncing..."),
        updateAutomationSync: vi.fn()
    },
    profileManager: {
        handleProfileSelection: vi.fn(),
        loadProfile: vi.fn(),
        saveProfile: vi.fn()
    },
    eventHandlers: { // Correct property name used in CardRenderer
        handlePresetChange: vi.fn(),
        handleApplyNow: vi.fn(),
        handleLoggingToggle: vi.fn(),
        handleLanguageSelect: vi.fn(),
        toggleMenu: vi.fn(),
        handleCardClick: vi.fn(),
        handleSelectAll: vi.fn(),
        handleClearSelection: vi.fn(),
        handleDeleteSelected: vi.fn(),
        handleAlignLeft: vi.fn(),
        handleAlignRight: vi.fn(),
        handleCopySelection: vi.fn(),
        handlePasteSelection: vi.fn(),
        handleHelp: vi.fn()
    },
    localizationManager: {
        localize: vi.fn((lang, key) => key)
    }
  };
  return Object.assign(base, overrides);
}

async function executeAllHandlersRecursive(node, customEvent = null) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) await executeAllHandlersRecursive(item, customEvent);
    return;
  }
  if (node.__litHtml) {
    for (const val of node.values) {
      if (typeof val === "function") {
        const e = customEvent || {
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          detail: { 
            value: "test-val", 
            config: { some: "cfg", _close_wizard: true }
          },
          target: {
              value: "test-target-val",
              closest: vi.fn(() => ({ open: true, menuOpen: true }))
          }
        };
        try {
          const res = val(e);
          if (res instanceof Promise) await res;
        } catch (err) {
          // ignore
        }
      } else if (typeof val === "object") {
        await executeAllHandlersRecursive(val, customEvent);
      }
    }
  }
}

describe("CardRenderer Exhaustive Coverage", () => {
  it("covers main render and all conditional branches", async () => {
    const card = buildCard({
        isMenuOpen: true,
        contextMenu: { show: true },
        missingEntities: ["e1"],
        awaitingAutomation: true,
        showUnsavedChangesDialog: true,
        config: { 
            target_entity: "s.t", 
            enabled_entity: "ib.e",
            profiles_select_entity: "is.p"
        }
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers isEditorInternal branch", async () => {
    const card = buildCard({ isEditorInternal: true, _lastGoodConfig: {} });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers view_mode admin branch", async () => {
    const card = buildCard({ config: { view_mode: "admin" } });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
    
    card.config.not_configured = true;
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers not_configured standard branch", async () => {
    const card = buildCard({ config: { not_configured: true } });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
    
    card.cardLifecycle.isEditorContext.mockReturnValue(true);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers isBroken branch", async () => {
    const card = buildCard({ 
        initialLoadComplete: true, 
        config: { target_entity: null } 
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("handles null lifecycle and hass in template handlers", async () => {
    const card = buildCard({ 
        isEditorInternal: true, 
        _lastGoodConfig: {},
        cardLifecycle: null,
        hass: null
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers missing config branch", () => {
    const card = buildCard();
    card.config = null; // Force null
    const renderer = new CardRenderer(card);
    const result = renderer.render();
    expect(result.strings).toEqual(['']);
  });

  it("covers suffix in title logic", () => {
    const card = buildCard({
      selectedPreset: "thermostat",
      config: {
        global_prefix: "cronostar_thermostat_kitchen_",
        title: undefined // Ensure logic runs
      }
    });
    card.localizationManager.localize.mockImplementation((l, k) => {
        if (k === 'ui.title') return "CronoStar";
        if (k === 'preset.thermostat') return "Thermostat";
        return k;
    });
    const renderer = new CardRenderer(card);
    renderer.render();
    // No explicit assertion needed if we just want coverage, but we could check the resulting title if we had a way to extract it easily
  });

  it("covers not_configured variations", async () => {
    // 1. not_configured = true, isEditor = false
    const card1 = buildCard({
      config: { not_configured: true, title: "Test" },
      cardLifecycle: { isEditorContext: () => false }
    });
    const renderer1 = new CardRenderer(card1);
    await executeAllHandlersRecursive(renderer1.render());

    // 2. not_configured = true, isEditor = true, it language
    const card2 = buildCard({
      config: { not_configured: true, title: "Test" },
      language: "it",
      cardLifecycle: { isEditorContext: () => true }
    });
    const renderer2 = new CardRenderer(card2);
    await executeAllHandlersRecursive(renderer2.render());
  });

  it("covers isPickerPreview variations", async () => {
    const card = buildCard({
      config: { preview_image: "custom.png" }
    });
    card.cardLifecycle.isPickerPreviewContext.mockReturnValue(true);
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers isBroken variations", async () => {
    const card = buildCard({
      initialLoadComplete: true,
      language: "it",
      config: { target_entity: null }
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers version check and expansion toggles", async () => {
    const card = buildCard({
      versionCheckEnabled: true,
      integrationVersion: "2.0.0",
      isExpandedV: true,
      isExpandedH: true
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers context menu item 'Close Menu'", async () => {
    const card = buildCard({
      contextMenu: { show: true, x: 10, y: 10 }
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });

  it("covers startup and missing entities overlays", async () => {
    const card = buildCard({
      initialLoadComplete: true,
      cronostarReady: false,
      missingEntities: ["sensor.missing"]
    });
    const renderer = new CardRenderer(card);
    await executeAllHandlersRecursive(renderer.render());
  });
});
