// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.window.setTimeout) globalThis.window.setTimeout = setTimeout;
if (!globalThis.window.clearTimeout) globalThis.window.clearTimeout = clearTimeout;
if (!globalThis.HTMLElement) {
  globalThis.HTMLElement = class HTMLElement {};
}
if (!globalThis.ShadowRoot) {
  globalThis.ShadowRoot = class ShadowRoot {};
}
if (!globalThis.customElements) {
  const registry = new Map();
  globalThis.customElements = {
    define: vi.fn((name, ctor) => registry.set(name, ctor)),
    get: vi.fn((name) => registry.get(name)),
  };
}
globalThis.window.customElements = globalThis.customElements;

function createFakeNode(tag = "div") {
  return {
    tagName: String(tag).toUpperCase(),
    style: {},
    children: [],
    appendChild: vi.fn(function (child) {
      this.children.push(child);
      return child;
    }),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    getElementById: vi.fn(() => null),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    focus: vi.fn(),
    innerHTML: "",
    textContent: "",
  };
}

if (!globalThis.document) {
  const head = createFakeNode("head");
  const body = createFakeNode("body");
  globalThis.document = {
    head,
    body,
    createElement: (name) => {
      const Ctor = globalThis.customElements.get(name);
      if (Ctor) return new Ctor();
      const el = createFakeNode(name);
      if (name === "style") el.id = "";
      return el;
    },
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    getElementById: vi.fn((id) => {
      const all = [...head.children, ...body.children];
      return all.find((n) => n.id === id) || null;
    }),
  };
} else {
  if (!globalThis.document.querySelectorAll) globalThis.document.querySelectorAll = () => [];
  if (!globalThis.document.querySelector) globalThis.document.querySelector = () => null;
  if (!globalThis.document.createElement) {
    globalThis.document.createElement = (name) => createFakeNode(name);
  }
  if (!globalThis.document.head) globalThis.document.head = createFakeNode("head");
  if (!globalThis.document.body) globalThis.document.body = createFakeNode("body");
  if (!globalThis.document.getElementById) {
    globalThis.document.getElementById = () => null;
  }
}
if (!globalThis.MutationObserver) {
  globalThis.MutationObserver = class MutationObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };
}
if (!globalThis.window.MutationObserver) {
  globalThis.window.MutationObserver = globalThis.MutationObserver;
}
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
      this.bubbles = !!init.bubbles;
      this.composed = !!init.composed;
    }
  };
}

// Mock dependencies BEFORE importing CronoStarEditor
vi.mock("lit", () => {
  return {
    html: (strings, ...values) => {
      return {
        strings,
        values,
        __litHtml: true,
        toString: () =>
          strings.reduce(
            (acc, s, i) =>
              acc +
              s +
              (i < values.length
                ? typeof values[i] === "function"
                  ? "[FUNC]"
                  : Array.isArray(values[i])
                    ? values[i]
                        .map((v) =>
                          v && typeof v.toString === "function" ? v.toString() : String(v ?? ""),
                        )
                        .join("")
                    : values[i]?.toString?.() ?? String(values[i] ?? "")
                : ""),
            "",
          ),
      };
    },
    css: (s) => ({ cssText: Array.isArray(s) ? s.join("") : String(s) }),
    LitElement: class extends HTMLElement {
      constructor() {
        super();
        this.shadowRoot = {
          querySelectorAll: vi.fn(() => []),
          querySelector: vi.fn(() => null),
          getElementById: vi.fn(() => null),
          appendChild: vi.fn(),
        };
      }
      requestUpdate() {
        if (this.updated) this.updated(new Map());
      }
      updated() {}
      connectedCallback() {}
      disconnectedCallback() {}
      dispatchEvent(event) {
        return true;
      }
      getRootNode() {
        return this.shadowRoot;
      }
    },
  };
});

vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "Thermostat", target_entity: "t", global_prefix: "p_" },
    generic_switch: { title: "Switch" },
    ev_charging: { title: "EV Charging" },
  },
  DEFAULT_CONFIG: {
    type: "custom:cronostar-card",
    preset_type: "thermostat",
    logging_enabled: true,
    meta: { language: "en" },
  },
  validateConfig: vi.fn((c = {}) => ({ ...c, preset_type: c.preset_type || "thermostat" })),
  extractCardConfig: vi.fn((c) => c),
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  normalizePrefix: vi.fn((p) => (p ? (String(p).endsWith("_") ? String(p) : `${p}_`) : "")),
  isValidPrefix: vi.fn((p) => !!p),
  getEffectivePrefix: vi.fn((c) => c?.global_prefix || "p_"),
}));

vi.mock("../src/utils/logger_utils.js", () => ({
  log: vi.fn(),
}));

vi.mock("../src/utils.js", () => ({
  debounce: (fn) => {
    const f = (...args) => fn(...args);
    f.cancel = vi.fn();
    return f;
  },
  Logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../src/editor/EditorI18n.js", () => ({
  EditorI18n: class {
    constructor(editor) {
      this.editor = editor;
      this._t = vi.fn((k) => k);
    }
    _t(k) {
      return k;
    }
  },
}));

vi.mock("../src/editor/EditorWizard.js", () => ({
  EditorWizard: class {
    constructor() {
      this._nextStep = vi.fn();
      this._prevStep = vi.fn();
      this._finish = vi.fn();
    }
  },
}));

vi.mock("../src/editor/steps/Step0Dashboard.js", () => ({
  Step0Dashboard: class {
    render() {
      return { __litHtml: true, strings: ["step0"], values: [] };
    }
  },
}));
vi.mock("../src/editor/steps/Step1Preset.js", () => ({
  Step1Preset: class {
    render() {
      return { __litHtml: true, strings: ["step1"], values: [] };
    }
  },
}));
vi.mock("../src/editor/steps/Step2Entities.js", () => ({
  Step2Entities: class {
    render(v) {
      return { __litHtml: true, strings: ["step2"], values: [v] };
    }
  },
}));
vi.mock("../src/editor/steps/Step3Options.js", () => ({
  Step3Options: class {
    render() {
      return { __litHtml: true, strings: ["step3"], values: [] };
    }
  },
}));
vi.mock("../src/editor/steps/Step4Automation.js", () => ({
  Step4Automation: class {
    render() {
      return { __litHtml: true, strings: ["step4"], values: [] };
    }
  },
}));
vi.mock("../src/editor/steps/Step5Summary.js", () => ({
  Step5Summary: class {
    render(v) {
      return { __litHtml: true, strings: ["step5"], values: [v] };
    }
  },
}));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  copyToClipboard: vi.fn(),
  downloadFile: vi.fn(),
  handleInitializeData: vi.fn(() => Promise.resolve({ message: "Initialized" })),
}));

vi.mock("../src/editor/yaml/yaml_generators.js", () => ({
  buildAutomationTemplate: vi.fn(() => "automation: yaml"),
}));

const { CronoStarEditor: EditorClass } = await import("../src/editor/CronoStarEditor.js");
const { validateConfig, extractCardConfig } = await import("../src/config.js");

function collectFunctions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => collectFunctions(item, out));
    return out;
  }
  if (node.__litHtml) {
    node.values.forEach((v) => {
      if (typeof v === "function") out.push(v);
      else if (v && typeof v === "object") collectFunctions(v, out);
    });
  }
  return out;
}

describe("CronoStarEditor - Comprehensive", () => {
  let editor;

  beforeAll(() => {
    if (!customElements.get("cronostar-card-editor-final-merged")) {
      customElements.define("cronostar-card-editor-final-merged", EditorClass);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    editor = document.createElement("cronostar-card-editor-final-merged");
    editor.hass = {
      language: "en",
      states: { "sensor.test": { state: "on" } },
      callService: vi.fn(() => Promise.resolve()),
    };
    Object.defineProperty(editor, "shadowRoot", {
      value: {
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        getElementById: vi.fn(() => null),
        appendChild: vi.fn(),
      },
      configurable: true,
    });
    document.head.children = [];
    document.body.children = [];
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.head.appendChild = vi.fn(function (child) {
      this.children.push(child);
      return child;
    });
    document.body.appendChild = vi.fn(function (child) {
      this.children.push(child);
      return child;
    });
    document.getElementById = vi.fn((id) => {
      const all = [...document.head.children, ...document.body.children];
      return all.find((n) => n.id === id) || null;
    });
    document.querySelectorAll = vi.fn(() => []);
    document.querySelector = vi.fn(() => null);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exercises all branches and methods", async () => {
    editor._initialized = true;

    editor._ignoreInboundUntil = Date.now() + 10000;
    editor.setConfig({ target_entity: "new" });
    editor._ignoreInboundUntil = 0;
    editor.setConfig({
      target_entity: "x",
      global_prefix: "p_",
      meta: { language: "it" },
    });
    editor.setConfig({ preset_type: "thermostat" });
    editor.setConfig(null);

    editor.updated(new Map([["step", 0], ["hass", null]]));
    editor.connectedCallback();
    editor.disconnectedCallback();

    editor._handleLocalUpdate("enabled_entity", "ib.x");
    editor._handleLocalUpdate("profiles_select_entity", "is.x");
    editor._handleLocalUpdate("target_entity", "sensor.test");

    vi.stubGlobal("confirm", () => false);
    editor._isEditing = true;
    editor._handleResetConfig();
    vi.stubGlobal("confirm", () => true);
    editor._handleResetConfig();

    vi.stubGlobal("customElements", { get: (tag) => tag === "ha-selector" });
    editor.renderEntityPicker("target_entity", "v");

    vi.stubGlobal("customElements", { get: (tag) => tag === "ha-entity-picker" });
    editor.renderEntityPicker("target_entity", "v");

    vi.stubGlobal("customElements", { get: () => false });
    editor.renderEntityPicker("target_entity", "v");
    editor.renderTextInput("key", "val", "place");

    for (let s = 0; s <= 5; s++) {
      editor._step = s;
      editor._config.validation = { valid: false, errors: ["err"] };
      editor.render();
      editor._renderWizardSteps();
      editor._renderWizardActions();
    }

    editor._step = 1;
    editor._config.global_prefix = "";
    editor._handleNextClick();
    expect(editor._showStepError).toBe(true);

    editor._step = 5;
    await editor._handleFinishClick({ force: true });

    const { handleInitializeData } = await import("../src/editor/services/service_handlers.js");
    handleInitializeData.mockRejectedValueOnce(new Error("Init failed"));
    await editor._handleFinishClick({ force: true });

    editor._config.global_prefix = "p_";
    await editor._saveMetadata();
    await editor._saveGlobalSettings({ opt: 1 });

    editor._applyShadowDomFix();
    editor._updatePreviewVisibility();
    editor._renderButton({ label: "T", click: () => {}, raised: true });

    editor._updateConfig("logging_enabled", false, true);

    editor.hass.callService.mockRejectedValueOnce(new Error("Save fail"));
    await editor._saveMetadata();

    await editor._saveGlobalSettings({ test: 1 });
  });

  it("covers constructor defaults and public wrappers", () => {
    expect(editor._step).toBe(0);
    expect(editor._language).toBe("en");
    expect(editor._pickerLoaded).toBe(false);
    expect(editor._dashboardView).toBe("choice");

    const btn1 = editor.renderButton("X", () => {}, false, false);
    const btn2 = editor.renderButton("Y", () => {}, true, true);
    expect(btn1.__litHtml).toBe(true);
    expect(btn2.__litHtml).toBe(true);
  });

  it("covers updated() with hass language adoption and config language change", () => {
    editor._config = { meta: {}, logging_enabled: true };
    editor._language = "it";
    editor.hass = { language: "fr-FR" };
    editor.language = "de";
    editor.updated(new Map([["hass", {}], ["config", {}], ["language", "it"]]));
    expect(editor._language).toBe("de");
  });

  it("covers updated() card language adoption branch", () => {
    const cardEl = { language: "it" };
    editor.shadowRoot.querySelector = vi.fn(() => cardEl);
    editor._config = { meta: null, logging_enabled: true };
    editor._language = "en";
    editor.hass = { language: "fr-FR" };
    editor.updated(new Map([["hass", {}]]));
    expect(editor._language).toBe("it");
  });

  it("covers updated() hass fallback language branch", () => {
    editor.shadowRoot.querySelector = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    editor._config = { meta: null, logging_enabled: true };
    editor._language = "en";
    editor.hass = { language: "fr-FR" };
    editor.updated(new Map([["hass", {}]]));
    expect(editor._language).toBe("fr");
  });

  it("covers updated() when _step changes and calls _dispatchConfigChanged", () => {
    editor._step = 2;
    editor._dispatchConfigChanged = vi.fn();
    editor.updated(new Map([["_step", 1]]));
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("covers _updateSaveButtonVisibility hide/show branches", () => {
    editor._step = 2;
    editor._updateSaveButtonVisibility();
    const created = document.head.children.find((n) => n.id === "cronostar-editor-save-button-hide");
    expect(created).toBeTruthy();

    editor._step = 5;
    editor._updateSaveButtonVisibility();
    expect(created.textContent).toBe("");
  });

  it("covers _updateSaveButtonVisibility catch branch", () => {
    const originalHead = document.head;
    Object.defineProperty(document, "head", {
      get() {
        throw new Error("head fail");
      },
      configurable: true,
    });
    expect(() => editor._updateSaveButtonVisibility()).not.toThrow();
    Object.defineProperty(document, "head", {
      value: originalHead,
      configurable: true,
      writable: true,
    });
  });

  it("covers _updatePreviewVisibility step 0 and non-0 branches", () => {
    editor._step = 0;
    editor.getRootNode = vi.fn(() => editor.shadowRoot);
    editor.shadowRoot.appendChild = vi.fn(function (child) {
      document.body.children.push(child);
      return child;
    });
    editor.shadowRoot.getElementById = vi.fn(() => null);

    editor._updatePreviewVisibility();

    editor._step = 2;
    const styleEl = { id: "cronostar-editor-style", textContent: "x" };
    const appendSpy = vi.spyOn(editor.shadowRoot, "appendChild");
    editor.shadowRoot.getElementById = vi.fn(() => styleEl);
    document.getElementById = vi.fn(() => styleEl);

    expect(() => editor._updatePreviewVisibility()).not.toThrow();
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it("covers _updatePreviewVisibility invalid root and catch branch", () => {
    editor.getRootNode = vi.fn(() => null);
    expect(() => editor._updatePreviewVisibility()).not.toThrow();

    editor.getRootNode = vi.fn(() => {
      throw new Error("root fail");
    });
    expect(() => editor._updatePreviewVisibility()).not.toThrow();
  });

  it("covers _applyShadowDomFix injection and observer setup", () => {
    const nestedShadowHost = {
      shadowRoot: {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        appendChild: vi.fn(),
      },
      tagName: "ha-entity-picker",
    };
    const host = {
      shadowRoot: {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        appendChild: vi.fn(),
      },
      tagName: "ha-select",
    };
    editor.shadowRoot.querySelectorAll = vi.fn(() => [host, nestedShadowHost]);
    document.querySelectorAll = vi.fn(() => [host]);

    editor._applyShadowDomFix();
    expect(editor._contrastObserver).toBeTruthy();
    expect(editor._contrastInterval).toBeTruthy();
    expect(host.shadowRoot.appendChild).toHaveBeenCalled();
    expect(nestedShadowHost.shadowRoot.appendChild).toHaveBeenCalled();
  });

  it("covers _applyShadowDomFix recursive child handling", () => {
    const childShadow = { querySelectorAll: vi.fn(() => []), querySelector: vi.fn(() => null), appendChild: vi.fn() };
    const child = { shadowRoot: childShadow, tagName: "ha-textfield" };
    const parentShadow = {
      querySelectorAll: vi.fn(() => [child]),
      querySelector: vi.fn(() => null),
      appendChild: vi.fn(),
    };
    const parent = { shadowRoot: parentShadow, tagName: "ha-selector" };
    editor.shadowRoot.querySelectorAll = vi.fn(() => [parent]);
    document.querySelectorAll = vi.fn(() => []);
    editor._applyShadowDomFix();
    expect(parentShadow.appendChild).toHaveBeenCalled();
    expect(childShadow.appendChild).toHaveBeenCalled();
  });

  it("covers disconnectedCallback cleanup", () => {
    editor._contrastObserver = { disconnect: vi.fn() };
    editor._contrastInterval = setInterval(() => {}, 1000);
    editor.disconnectedCallback();
    expect(editor._contrastObserver.disconnect).toHaveBeenCalled();
  });

  it("covers _renderWizardSteps empty branch", () => {
    editor._step = 0;
    const tpl = editor._renderWizardSteps();
    expect(tpl.__litHtml).toBe(true);
  });

  it("covers _renderWizardSteps clickable logic", () => {
    editor._step = 3;
    editor._canGoNext = vi.fn(() => true);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[0]();
    expect(editor._step).toBe(0);
  });

  it("covers setConfig merge branches and language anti-revert branch", () => {
    editor._config = { not_configured: false, target_entity: "old", global_prefix: "old_", meta: {} };
    editor._step = 2;
    editor._language = "it";
    editor.hass = { language: "en-US" };
    editor.setConfig({ target_entity: "new", global_prefix: "new_", meta: {} });
    expect(editor._config.target_entity).toBe("old");

    editor._step = 0;
    editor.setConfig({ meta: {} });
    expect(editor._language).toBe("it");
  });

  it("covers setConfig initial adoption branch", () => {
    editor._config = { not_configured: true };
    editor.setConfig({ preset_type: "ev_charging", global_prefix: "x_" });
    expect(editor._config.preset_type).toBe("ev_charging");
  });

  it("covers setConfig catch branch", () => {
    validateConfig.mockImplementationOnce(() => {
      throw new Error("broken validate");
    });
    editor.setConfig({ x: 1 });
    expect(editor._config.x).toBe(1);
  });

  it("covers _sanitizeConfig branches", () => {
    const a = editor._sanitizeConfig({
      target_entity: "sensor.x",
      global_prefix: "p_",
      test_empty: "",
      type: "",
    });
    expect(a.not_configured).toBe(false);
    expect(a.type).toBe("custom:cronostar-card");
    expect(a.test_empty).toBeUndefined();

    const b = editor._sanitizeConfig({ not_configured: true });
    expect(b.not_configured).toBe(true);
  });

  it("covers _dispatchConfigChanged guard branches and bubbling event", () => {
    editor.dispatchEvent = vi.fn();
    editor._initialized = false;
    editor._dispatchConfigChanged(true);
    expect(editor.dispatchEvent).not.toHaveBeenCalled();

    editor._initialized = true;
    editor._config = { target_entity: null };
    editor._isEditing = true;
    editor._dispatchConfigChanged(true);
    expect(editor.dispatchEvent).not.toHaveBeenCalled();

    editor._isEditing = false;
    editor._step = 0;
    editor._dispatchConfigChanged(false);
    expect(editor.dispatchEvent).not.toHaveBeenCalled();

    editor._step = 2;
    editor._config = { target_entity: "sensor.x", global_prefix: "p_" };
    editor._dispatchConfigChanged(true);
    expect(editor.dispatchEvent).toHaveBeenCalled();
  });

  it("covers _persistCardConfigNow and showToast", () => {
    editor.dispatchEvent = vi.fn();
    expect(editor._persistCardConfigNow()).resolves.toBeUndefined();
    editor.showToast("hello");
    expect(editor.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "hass-notification",
      }),
    );
  });

  it("covers _renderStep for all cases", () => {
    for (let s = 0; s <= 5; s++) {
      editor._step = s;
      const out = editor._renderStep({ valid: true, errors: [] });
      expect(out.__litHtml).toBe(true);
    }
    editor._step = 99;
    expect(editor._renderStep({}).__litHtml).toBe(true);
  });

  it("covers _renderStepContent filtering logic", () => {
    editor._step = 2;
    editor._config = {
      target_entity: "sensor.new",
      validation: {
        valid: false,
        errors: [
          "Target entity sensor.old not found",
          "Target entity sensor.new not found",
          "Other error",
        ],
      },
    };
    editor.hass = { states: { "sensor.new": { state: "1" } } };
    const tpl = editor._renderStepContent();
    expect(tpl.__litHtml).toBe(true);
  });

  it("covers _handleLocalUpdate and metadata save branch", () => {
    editor._config = { type: "custom:cronostar-card" };
    editor._saveMetadata = vi.fn();
    editor._handleLocalUpdate("enabled_entity", "switch.x");
    expect(editor._saveMetadata).toHaveBeenCalled();

    editor._handleLocalUpdate("other_key", "x");
    expect(editor._config.other_key).toBe("x");
  });

  it("covers renderEntityPicker fallback empty when no hass", () => {
    editor.hass = null;
    const tpl = editor.renderEntityPicker("k", "v");
    expect(tpl.__litHtml).toBe(true);
  });

  it("covers renderEntityPicker handlers for selector and picker", () => {
    editor.hass = { language: "en" };

    vi.stubGlobal("customElements", { get: (tag) => tag === "ha-selector" });
    let tpl = editor.renderEntityPicker("target_entity", "v");
    let handlers = collectFunctions(tpl);
    handlers[0]({ detail: { value: "entity.one" } });

    vi.stubGlobal("customElements", { get: (tag) => tag === "ha-entity-picker" });
    tpl = editor.renderEntityPicker("enabled_entity", "v");
    handlers = collectFunctions(tpl);
    handlers[0]({ detail: { value: "" } });
  });

  it("covers _renderTextInput handlers", () => {
    editor._handleLocalUpdate = vi.fn();
    editor._dispatchConfigChanged = vi.fn();
    const tpl = editor._renderTextInput("key", "val", "place");
    const handlers = collectFunctions(tpl);
    handlers[0]({ target: { value: "new" } });
    handlers[1]();
    expect(editor._handleLocalUpdate).toHaveBeenCalledWith("key", "new");
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("covers _renderButton outlined and raised branches", () => {
    expect(editor._renderButton({ label: "A", click: () => {}, outlined: true }).__litHtml).toBe(true);
    expect(editor._renderButton({ label: "B", click: () => {}, outlined: false }).__litHtml).toBe(true);
  });

  it("covers _updateConfig branches including preset merge and metadata save", () => {
    editor._dispatchConfigChanged = vi.fn();
    editor._saveMetadata = vi.fn();
    editor._config = { type: "custom:cronostar-card", entity_prefix: "legacy", validation: { valid: false } };

    editor._updateConfig("target_entity", "sensor.new", true);
    expect(editor._config.validation.valid).toBe(true);

    editor._updateConfig("preset_type", "generic_switch", false);
    expect(editor._selectedPreset).toBe("generic_switch");

    editor._updateConfig("enabled_entity", "switch.new", false);
    expect(editor._saveMetadata).toHaveBeenCalled();
  });

  it("covers _handleNextClick success branch", () => {
    editor._canGoNext = vi.fn(() => true);
    editor._dispatchConfigChanged = vi.fn();
    editor.wizard._nextStep = vi.fn();
    editor._handleNextClick();
    expect(editor.wizard._nextStep).toHaveBeenCalled();
  });

  it("covers _handleFinishClick next-step fallback