// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("lit", () => ({
  html: (strings, ...values) => ({ __litHtml: true, strings, values }),
  css: (strings, ...values) => ({ cssText: strings.join(""), values }),
  LitElement: class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }
    requestUpdate() {}
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
  },
}));

vi.mock("lit/directives/class-map.js", () => ({
  classMap: (classes) =>
    Object.entries(classes)
      .filter(([, active]) => active)
      .map(([name]) => name)
      .join(" "),
}));

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual("../src/config.js");
  return {
    ...actual,
    CARD_CONFIG_PRESETS: {
      thermostat: { title: "Thermostat" },
      boiler: { title: "Boiler" },
    },
    DEFAULT_CONFIG: {
      type: "custom:cronostar-card",
      preset_type: "thermostat",
      logging_enabled: true,
    },
    TIMEOUTS: { editingGraceMs: 5000 },
    VERSION: "TEST_VERSION",
    validateConfig: vi.fn((config = {}) => ({
      preset_type: config.preset_type || "thermostat",
      logging_enabled: true,
      ...config,
    })),
    extractCardConfig: vi.fn((config) => ({ ...config })),
  };
});

vi.mock("../src/editor/EditorI18n.js", () => ({
  EditorI18n: class {
    constructor(editor) {
      this.editor = editor;
    }
    _t(key) {
      return key;
    }
  },
}));

vi.mock("../src/editor/EditorWizard.js", () => ({
  EditorWizard: class {
    constructor(editor) {
      this.editor = editor;
    }
  },
}));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  copyToClipboard: vi.fn(() =>
    Promise.resolve({ success: true, message: "Copied" }),
  ),
  downloadFile: vi.fn(),
  handleInitializeData: vi.fn(),
}));

import { CardEventHandlers } from "../src/core/CardEventHandlers.js";
import { CardLifecycle } from "../src/core/CardLifecycle.js";
import { CardRenderer } from "../src/core/CardRenderer.js";
import { CronoStarEditor } from "../src/editor/CronoStarEditor.js";
import { Logger } from "../src/utils.js";
import { copyToClipboard } from "../src/editor/services/service_handlers.js";

function collectFunctions(template, out = []) {
  if (!template) return out;
  if (typeof template === "function") {
    out.push(template);
    return out;
  }
  if (Array.isArray(template)) {
    template.forEach((item) => collectFunctions(item, out));
    return out;
  }
  if (template.__litHtml) {
    template.values.forEach((value) => collectFunctions(value, out));
  }
  return out;
}

function makeRendererCard(overrides = {}) {
  return {
    language: "en",
    config: {
      global_prefix: "cronostar_thermostat_living_",
      target_entity: "climate.living",
      enabled_entity: "switch.living_enabled",
    },
    selectedPreset: "thermostat",
    selectedProfile: "Default",
    profileOptions: ["Default", "Eco"],
    _showChart: true,
    cronostarReady: true,
    initialLoadComplete: true,
    missingEntities: [],
    awaitingAutomation: false,
    hasUnsavedChanges: false,
    isDragging: false,
    overlaySuppressionUntil: 0,
    contextMenu: null,
    showUnsavedChangesDialog: false,
    pendingProfileChange: null,
    isEditorInternal: false,
    isEditorContext: vi.fn(() => false),
    isExpandedV: false,
    isExpandedH: false,
    updateComplete: Promise.resolve(),
    hass: { callService: vi.fn() },
    requestUpdate: vi.fn(),
    setConfig: vi.fn(),
    handleEditConfig: vi.fn(),
    handleDeleteController: vi.fn(),
    handleAddProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    toggleChart: vi.fn(),
    localizationManager: {
      localize: vi.fn((lang, key) => key),
    },
    cardLifecycle: {
      isEditorContext: vi.fn(() => false),
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
    },
    profileManager: {
      handleProfileSelection: vi.fn(),
    },
    selectionManager: {
      handlePointerMove: vi.fn(),
      handlePointerDown: vi.fn(),
      handlePointerUp: vi.fn(),
    },
    ...overrides,
  };
}

describe("Pragmatic coverage boost - CardRenderer", () => {
  it("closes the rendered profile select including picker and dropdown internals", () => {
    const pickerField = { classList: { remove: vi.fn() } };
    const dropdown = { open: true, removeAttribute: vi.fn() };
    const selectEl = {
      open: true,
      menuOpen: true,
      blur: vi.fn(),
      shadowRoot: {
        querySelector: vi.fn((selector) => {
          if (selector === "ha-picker-field") return pickerField;
          if (selector === "ha-dropdown") return dropdown;
          return null;
        }),
      },
    };
    const event = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      target: {
        value: "Eco",
        checked: true,
        closest: vi.fn((selector) => (selector === "ha-select" ? selectEl : null)),
      },
    };

    const card = makeRendererCard();
    const template = new CardRenderer(card)._renderFullCard("Thermostat");
    collectFunctions(template).forEach((fn) => {
      try {
        fn(event);
      } catch {
        // Some callbacks belong to unrelated controls; this test targets the
        // profile select behavior while traversing the template tree.
      }
    });

    expect(card.profileManager.handleProfileSelection).toHaveBeenCalledWith({
      target: { value: "Eco" },
    });
    expect(selectEl.open).toBe(false);
    expect(selectEl.menuOpen).toBe(false);
    expect(pickerField.classList.remove).toHaveBeenCalledWith("opened");
    expect(dropdown.open).toBe(false);
    expect(dropdown.removeAttribute).toHaveBeenCalledWith("open");
    expect(selectEl.blur).toHaveBeenCalled();
  });

  it("closes the admin profile select including picker and dropdown internals", () => {
    const pickerField = { classList: { remove: vi.fn() } };
    const dropdown = { open: true, removeAttribute: vi.fn() };
    const selectEl = {
      open: true,
      menuOpen: true,
      blur: vi.fn(),
      shadowRoot: {
        querySelector: vi.fn((selector) => {
          if (selector === "ha-picker-field") return pickerField;
          if (selector === "ha-dropdown") return dropdown;
          return null;
        }),
      },
    };
    const event = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      target: {
        value: "Eco",
        checked: true,
        closest: vi.fn((selector) => (selector === "ha-select" ? selectEl : null)),
      },
    };
    const card = makeRendererCard({
      config: {
        global_prefix: "cronostar_thermostat_living_",
        target_entity: "climate.living",
        enabled_entity: "switch.living_enabled",
        view_mode: "admin",
      },
    });

    const template = new CardRenderer(card)._renderAdminBox("Thermostat");
    collectFunctions(template).forEach((fn) => {
      try {
        fn(event);
      } catch {
        // Ignore unrelated controls while traversing the admin template.
      }
    });

    expect(card.profileManager.handleProfileSelection).toHaveBeenCalledWith({
      target: { value: "Eco" },
    });
    expect(selectEl.open).toBe(false);
    expect(selectEl.menuOpen).toBe(false);
    expect(pickerField.classList.remove).toHaveBeenCalledWith("opened");
    expect(dropdown.removeAttribute).toHaveBeenCalledWith("open");
    expect(selectEl.blur).toHaveBeenCalled();
  });

  it("closes the internal full-card editor when config-changed carries _close_wizard", async () => {
    const card = makeRendererCard({ isEditorInternal: true });
    const template = new CardRenderer(card)._renderFullCard("Thermostat");
    const callbacks = collectFunctions(template);

    await callbacks[2]({
      detail: {
        config: {
          target_entity: "climate.updated",
          global_prefix: "p_",
          _close_wizard: true,
        },
      },
    });

    expect(card.setConfig).toHaveBeenCalledWith({
      target_entity: "climate.updated",
      global_prefix: "p_",
    });
    expect(card.isEditorInternal).toBe(false);
    expect(card.isExpandedV).toBe(false);
    expect(card.isExpandedH).toBe(false);
    expect(card.requestUpdate).toHaveBeenCalled();
  });
});

describe("Pragmatic coverage boost - CronoStarEditor", () => {
  let editor;
  const tagName = "cronostar-editor-pragmatic-coverage";

  beforeAll(() => {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, CronoStarEditor);
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    editor = document.createElement(tagName);
    editor.hass = {
      language: "en",
      callService: vi.fn(() => Promise.resolve()),
      states: {},
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks the Home Assistant save button found by walking the editor DOM", () => {
    const click = vi.fn();
    vi.spyOn(editor, "querySelector").mockImplementation((selector) =>
      selector === "mwc-button[slot='primaryAction']" ? { click } : null,
    );

    editor._clickHASaveButton();
    vi.advanceTimersByTime(300);

    expect(click).toHaveBeenCalled();
  });

  it("falls back to deep search when the save button is outside the editor subtree", () => {
    const click = vi.fn();
    vi.spyOn(editor, "querySelector").mockReturnValue(null);
    vi.spyOn(editor, "_deepQuerySelector").mockImplementation((selector) =>
      selector === "mwc-button[slot='primaryAction']" ? { click } : null,
    );

    editor._clickHASaveButton();
    vi.advanceTimersByTime(300);

    expect(click).toHaveBeenCalled();
  });

  it("finds an element inside a nested shadow root during deep query", () => {
    const target = document.createElement("button");
    target.className = "save";
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.appendChild(target);
    document.body.appendChild(host);

    expect(editor._deepQuerySelector(".save")).toBe(target);
  });

  it("keeps local core config when Home Assistant sends a not-configured fallback", () => {
    editor._config = {
      target_entity: "climate.local",
      global_prefix: "local_",
      preset_type: "thermostat",
      meta: { language: "en" },
      not_configured: false,
    };
    editor._step = 0;

    editor.setConfig({
      not_configured: true,
      meta: { language: "it", source: "ha" },
    });

    expect(editor._config.target_entity).toBe("climate.local");
    expect(editor._config.global_prefix).toBe("local_");
    expect(editor._config.not_configured).toBe(false);
    expect(editor._config.meta).toEqual({ language: "it", source: "ha" });
  });

  it("uses the explicit incoming step when config supplies one", () => {
    editor._config = {
      target_entity: "climate.local",
      global_prefix: "local_",
      preset_type: "thermostat",
      not_configured: false,
    };
    editor._step = 0;

    editor.setConfig({
      target_entity: "climate.local",
      global_prefix: "local_",
      step: 4,
    });

    expect(editor._step).toBe(4);
  });

  it("clears a pending debounce timer before immediate config dispatch", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const listener = vi.fn();
    editor.addEventListener("config-changed", listener);
    editor._initialized = true;
    editor._isEditing = false;
    editor._step = 2;
    editor._config = {
      target_entity: "climate.local",
      global_prefix: "local_",
      preset_type: "thermostat",
      meta: { language: "en" },
    };
    editor._debounceTimer = setTimeout(() => {}, 1000);

    editor._dispatchConfigChanged(true);

    expect(clearSpy).toHaveBeenCalledWith(editor._debounceTimer);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.config.step).toBe(2);
  });
});

describe("Pragmatic coverage boost - lifecycle and event handlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger, "log").mockImplementation(() => {});
    vi.spyOn(Logger, "warn").mockImplementation(() => {});
    vi.spyOn(Logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resizes the underlying chart when admin visibility sync turns the chart on", () => {
    const resize = vi.fn();
    const card = {
      config: {
        view_mode: "admin",
        global_prefix: "p_",
        initially_collapsed: false,
      },
      _showChart: false,
      _manualToggleDone: false,
      requestUpdate: vi.fn(),
      chartManager: {
        isInitialized: vi.fn(() => true),
        chart: { resize },
      },
      cardSync: { updateAutomationSync: vi.fn() },
      stateManager: { setData: vi.fn() },
      profileManager: { loadProfile: vi.fn(() => Promise.resolve()) },
    };

    new CardLifecycle(card).setHass({
      states: { "input_boolean.p_show_chart": { state: "on" } },
      services: {},
      config: { state: "RUNNING" },
      language: "en",
    });
    vi.advanceTimersByTime(50);

    expect(card._showChart).toBe(true);
    expect(resize).toHaveBeenCalled();
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("uses the chart manager resize method when available during visibility sync", () => {
    const resize = vi.fn();
    const card = {
      config: {
        view_mode: "admin",
        global_prefix: "p_",
        initially_collapsed: false,
      },
      _showChart: false,
      _manualToggleDone: false,
      requestUpdate: vi.fn(),
      chartManager: {
        isInitialized: vi.fn(() => true),
        resize,
        chart: { resize: vi.fn() },
      },
      cardSync: { updateAutomationSync: vi.fn() },
      stateManager: { setData: vi.fn() },
      profileManager: { loadProfile: vi.fn(() => Promise.resolve()) },
    };

    new CardLifecycle(card).setHass({
      states: { "input_boolean.p_show_chart": { state: "on" } },
      services: {},
      config: { state: "RUNNING" },
      language: "en",
    });
    vi.advanceTimersByTime(50);

    expect(resize).toHaveBeenCalled();
    expect(card.chartManager.chart.resize).not.toHaveBeenCalled();
  });

  it("ignores a profile state bounce during the manual selection grace period", () => {
    const loadProfile = vi.fn(() => Promise.resolve());
    const card = {
      config: {
        global_prefix: "p_",
        profiles_select_entity: "select.profile",
      },
      selectedProfile: "Day",
      profileOptions: ["Day", "Night"],
      lastEditAt: Date.now(),
      hasUnsavedChanges: false,
      initialLoadComplete: true,
      requestUpdate: vi.fn(),
      cardSync: { updateAutomationSync: vi.fn() },
      stateManager: { setData: vi.fn() },
      profileManager: { loadProfile },
      chartManager: { isInitialized: vi.fn(() => false) },
    };

    new CardLifecycle(card).setHass({
      states: {
        "select.profile": {
          state: "Night",
          attributes: { options: ["Day", "Night"] },
        },
      },
      services: {},
      config: { state: "RUNNING" },
      language: "en",
    });

    expect(card.selectedProfile).toBe("Day");
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("focuses the chart when a card click closes the open menu", () => {
    const focus = vi.fn();
    const card = {
      isMenuOpen: true,
      keyboardHandler: { enable: vi.fn() },
      shadowRoot: {
        querySelector: vi.fn((selector) =>
          selector === ".chart-container" ? { focus } : null,
        ),
      },
      isEditorContext: vi.fn(() => false),
      requestUpdate: vi.fn(),
    };
    const handlers = new CardEventHandlers(card);

    handlers.handleCardClick({
      target: { closest: vi.fn(() => null) },
    });

    expect(card.isMenuOpen).toBe(false);
    expect(card.keyboardHandler.enable).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("includes drag snap metadata when applying the current profile immediately", async () => {
    const showNotification = vi
      .spyOn(CardEventHandlers.prototype, "showNotification")
      .mockImplementation(() => {});
    const card = {
      language: "en",
      isMenuOpen: true,
      cronostarReady: true,
      selectedPreset: "thermostat",
      selectedProfile: "Default",
      hasUnsavedChanges: true,
      config: {
        global_prefix: "p_",
        target_entity: "climate.test",
        drag_snap: { default: 15, shift: 60 },
      },
      keyboardHandler: { enable: vi.fn() },
      localizationManager: { localize: vi.fn((lang, key) => key) },
      stateManager: {
        getData: vi.fn(() => [{ time: "08:00", value: 20 }]),
      },
      profileManager: { lastLoadedProfile: "Default" },
      cardSync: {
        scheduleAutomationOverlaySuppression: vi.fn(),
        updateAutomationSync: vi.fn(),
      },
      requestUpdate: vi.fn(),
      hass: {
        callService: vi.fn(() => Promise.resolve()),
      },
    };

    await new CardEventHandlers(card).handleApplyNow();

    expect(card.hass.callService).toHaveBeenNthCalledWith(
      1,
      "cronostar",
      "save_profile",
      expect.objectContaining({
        meta: expect.objectContaining({
          drag_snap: { default: 15, shift: 60 },
        }),
      }),
    );
    expect(card.hasUnsavedChanges).toBe(false);
    expect(showNotification).toHaveBeenCalledWith("ui.apply_now_success", "success");
  });

  it("focuses the chart after deleting the selected profile", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const focus = vi.fn();
    const card = {
      language: "en",
      isMenuOpen: true,
      selectedPreset: "thermostat",
      selectedProfile: "Night",
      profileOptions: ["Day", "Night"],
      config: {
        global_prefix: "p_",
        profiles_select_entity: "select.profile",
      },
      keyboardHandler: { enable: vi.fn() },
      localizationManager: { localize: vi.fn((lang, key) => key) },
      profileManager: { loadProfile: vi.fn(() => Promise.resolve()) },
      stateManager: {
        _initializeScheduleData: vi.fn(),
        getData: vi.fn(() => []),
      },
      chartManager: {
        isInitialized: vi.fn(() => false),
        updateData: vi.fn(),
      },
      shadowRoot: {
        querySelector: vi.fn((selector) =>
          selector === ".chart-container" ? { focus } : null,
        ),
      },
      isEditorContext: vi.fn(() => false),
      requestUpdate: vi.fn(),
      hass: { callService: vi.fn(() => Promise.resolve()) },
    };
    vi.spyOn(CardEventHandlers.prototype, "showNotification").mockImplementation(
      () => {},
    );

    await new CardEventHandlers(card).handleDeleteProfile();

    expect(card.isMenuOpen).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(card.requestUpdate).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("resets the help dialog copy button label after a successful copy", async () => {
    const card = {
      language: "en",
      config: { global_prefix: "p_", target_entity: "climate.test" },
      localizationManager: {
        localize: vi.fn((lang, key, fallback) => fallback || key),
      },
    };
    const handlers = new CardEventHandlers(card);

    handlers.handleHelp();
    const copyButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Copy technical details"),
    );

    await copyButton.onclick();
    expect(copyToClipboard).toHaveBeenCalled();
    expect(copyButton.textContent).toBe("Copied");

    vi.advanceTimersByTime(2000);
    expect(copyButton.textContent).toContain("Copy technical details");
  });
});
