// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.HTMLElement) {
  globalThis.HTMLElement = class HTMLElement {};
}
if (!globalThis.customElements) {
  const registry = new Map();
  globalThis.customElements = {
    define: vi.fn((name, ctor) => registry.set(name, ctor)),
    get: vi.fn((name) => registry.get(name)),
  };
}
if (!globalThis.document) {
  globalThis.document = {
    head: { innerHTML: "" },
    createElement: (name) => {
      const Ctor = globalThis.customElements.get(name);
      return Ctor ? new Ctor() : { tagName: String(name).toUpperCase() };
    },
  };
}

// Mock dependencies BEFORE importing CronoStarEditor
vi.mock("lit", () => {
  return {
    html: (strings, ...values) => {
      return { strings, values, __litHtml: true, toString: () => strings.join("[VAL]") };
    },
    css: (s) => s,
    LitElement: class extends HTMLElement {
      constructor() {
        super();
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
    }
  };
});

vi.mock("../src/config.js", () => ({
  CARD_CONFIG_PRESETS: {
    thermostat: { title: "Thermostat", target_entity: "t", global_prefix: "p_" },
    generic_switch: { title: "Switch" }
  },
  DEFAULT_CONFIG: {
    type: "custom:cronostar-card",
    preset_type: "thermostat",
    logging_enabled: true,
    meta: { language: "en" }
  },
  validateConfig: vi.fn(c => ({ ...c, preset_type: c.preset_type || "thermostat" })),
  extractCardConfig: vi.fn(c => c)
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  normalizePrefix: vi.fn(p => p),
  isValidPrefix: vi.fn((p) => !!p),
  getEffectivePrefix: vi.fn(c => c.global_prefix || "p_"),
  normalizePrefixWithDefault: vi.fn(p => p)
}));

vi.mock("../src/utils/logger_utils.js", () => ({
  log: vi.fn()
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
    warn: vi.fn()
  }
}));

vi.mock("../src/editor/EditorI18n.js", () => ({
  EditorI18n: class {
    constructor() { this._t = vi.fn(k => k); }
    _t(k) { return k; }
  }
}));

vi.mock("../src/editor/EditorWizard.js", () => ({
  EditorWizard: class {
    constructor() {
      this._nextStep = vi.fn();
      this._prevStep = vi.fn();
      this._finish = vi.fn();
    }
  }
}));

// Mock steps
vi.mock("../src/editor/steps/Step0Dashboard.js", () => ({ Step0Dashboard: class { render() { return { __litHtml: true, values: [] }; } } }));
vi.mock("../src/editor/steps/Step1Preset.js", () => ({ Step1Preset: class { render() { return { __litHtml: true, values: [] }; } } }));
vi.mock("../src/editor/steps/Step2Entities.js", () => ({ Step2Entities: class { render(v) { return { __litHtml: true, values: [v] }; } } }));
vi.mock("../src/editor/steps/Step3Options.js", () => ({ Step3Options: class { render() { return { __litHtml: true, values: [] }; } } }));
vi.mock("../src/editor/steps/Step4Automation.js", () => ({ Step4Automation: class { render() { return { __litHtml: true, values: [] }; } } }));
vi.mock("../src/editor/steps/Step5Summary.js", () => ({ Step5Summary: class { render(v) { return { __litHtml: true, values: [v] }; } } }));

vi.mock("../src/editor/services/service_handlers.js", () => ({
  copyToClipboard: vi.fn(),
  downloadFile: vi.fn(),
  handleInitializeData: vi.fn(() => Promise.resolve({ message: "Initialized" }))
}));

vi.mock("../src/editor/yaml/yaml_generators.js", () => ({
  buildAutomationTemplate: vi.fn(() => "automation: yaml")
}));

// NOW import CronoStarEditor
const { CronoStarEditor: EditorClass } = await import("../src/editor/CronoStarEditor.js");

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
      callService: vi.fn(() => Promise.resolve())
    };
    Object.defineProperty(editor, 'shadowRoot', {
      value: {
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        getElementById: vi.fn(() => null),
        appendChild: vi.fn()
      },
      configurable: true
    });
    document.head.innerHTML = "";
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  async function runAllHandlers(node, customEvent = null) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) await runAllHandlers(item, customEvent);
    } else if (node.__litHtml) {
      for (const val of node.values) {
        if (typeof val === "function") {
          const e = customEvent || {
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            key: "Enter",
            target: { tagName: "INPUT", value: "test", closest: vi.fn(() => ({ blur: vi.fn() })) },
            detail: { value: "test", config: { target_entity: "new", _close_wizard: true } }
          };
          try { await val(e); } catch(e) {}
        } else {
          await runAllHandlers(val, customEvent);
        }
      }
    }
  }

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
    await runAllHandlers(editor.renderEntityPicker("target_entity", "v"));
    vi.stubGlobal("customElements", { get: (tag) => tag === "ha-entity-picker" });
    await runAllHandlers(editor.renderEntityPicker("target_entity", "v"));
    vi.stubGlobal("customElements", { get: () => false });
    await runAllHandlers(editor.renderEntityPicker("target_entity", "v"));
    await runAllHandlers(editor.renderTextInput("key", "val", "place"));

    for (let s = 0; s <= 5; s++) {
      editor._step = s;
      editor._config.validation = { valid: false, errors: ["err"] };
      await runAllHandlers(editor.render());
      await runAllHandlers(editor._renderWizardSteps());
      await runAllHandlers(editor._renderWizardActions());
    }

    editor._step = 1;
    editor._config.global_prefix = "";
    editor._handleNextClick();
    expect(editor._showStepError).toBe(true);

    editor._step = 5;
    await editor._handleFinishClick({ force: true });

    const { handleInitializeData } = await import(
      "../src/editor/services/service_handlers.js"
    );
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
});
