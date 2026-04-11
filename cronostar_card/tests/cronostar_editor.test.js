// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { CronoStarEditor as EditorClass } from "../src/editor/CronoStarEditor.js";
import { DEFAULT_CONFIG, CARD_CONFIG_PRESETS } from "../src/config.js";

// Mock Lit since we are in a unit test environment
vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
  return {
    ...actual,
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
        this.attachShadow({ mode: "open" });
      }
      requestUpdate() {
        if (this.updated) this.updated(new Map());
      }
      updated() {}
      connectedCallback() {}
      disconnectedCallback() {}
      dispatchEvent() {
        return true;
      }
      getRootNode() {
        return this.shadowRoot || this;
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

describe("CronoStarEditor - Final Push", () => {
  let editor;

  beforeAll(() => {
    if (!customElements.get("cronostar-card-editor-final-push")) {
      customElements.define("cronostar-card-editor-final-push", EditorClass);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    editor = document.createElement("cronostar-card-editor-final-push");
    editor.hass = {
      language: "en",
      states: { "sensor.test": { state: "on" } },
      callService: vi.fn(() => Promise.resolve()),
    };
    
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    if (editor) {
        editor.disconnectedCallback();
    }
    vi.unstubAllGlobals();
  });

  it("covers basic methods", async () => {
    editor._initialized = true;
    editor.setConfig({ target_entity: "x", global_prefix: "p_", meta: { language: "it" } });
    editor.updated(new Map([["step", 0], ["hass", null]]));
    editor.connectedCallback();

    editor._handleLocalUpdate("target_entity", "sensor.test");
    editor._handleResetConfig();

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

    await editor._saveMetadata();
    await editor._saveGlobalSettings({ opt: 1 });

    editor._applyShadowDomFix();
    editor._updatePreviewVisibility();
    editor._updateConfig("logging_enabled", false, true);
  });

  it("covers _applyShadowDomFix MutationObserver", () => {
    vi.useFakeTimers();
    let observerCallback;
    const mockObserver = class {
        constructor(cb) { observerCallback = cb; }
        observe() {}
        disconnect() {}
    };
    vi.stubGlobal("MutationObserver", mockObserver);
    
    editor._contrastObserver = null;
    editor._applyShadowDomFix();
    
    const vaadinEl = {
      tagName: "VAADIN-COMBO-BOX-OVERLAY",
      shadowRoot: {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        appendChild: vi.fn(),
      },
    };
    vi.spyOn(document, "querySelectorAll").mockReturnValue([vaadinEl]);
    
    observerCallback();
    expect(vaadinEl.shadowRoot.appendChild).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("covers _updatePreviewVisibility styleEl branches", () => {
    editor._step = 0;
    editor._updatePreviewVisibility();
    const styleGlobal = document.head.querySelector("#cronostar-editor-style-global");
    expect(styleGlobal).not.toBeNull();
    expect(styleGlobal.textContent).toContain("preview");

    editor._step = 1;
    editor._updatePreviewVisibility();
    expect(styleGlobal.textContent).toBe("");
  });

  it("covers _renderTextInput change and input handlers", () => {
    const dispatchSpy = vi.spyOn(editor, "_dispatchConfigChanged");
    const localUpdateSpy = vi.spyOn(editor, "_handleLocalUpdate");
    const tpl = editor._renderTextInput("k", "v");
    const handlers = collectFunctions(tpl);
    
    handlers[0]({ target: { value: 'new' } });
    expect(localUpdateSpy).toHaveBeenCalledWith("k", "new");

    handlers[1]();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("covers _renderWizardSteps jump", () => {
    editor._step = 2;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[5](); 
    expect(editor._step).toBe(5);
  });

  it("covers _handleNextClick and _handleFinishClick directly", async () => {
    editor._step = 1;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    editor._handleNextClick();
    expect(editor.wizard._nextStep).toHaveBeenCalled();

    editor._step = 5;
    editor.hass = { callService: vi.fn() };
    await editor._handleFinishClick();
    expect(editor.wizard._finish).toHaveBeenCalled();
  });

  it("covers _renderStepContent error filtering (line 1318)", () => {
    editor._step = 2;
    editor._config.target_entity = "sensor.found";
    editor._config.validation = {
      valid: false,
      errors: ["Target entity sensor.found not found"]
    };
    editor.hass = { states: { "sensor.found": { state: "on" } } };
    const res = editor._renderStepContent();
    expect(res.toString()).not.toContain("sensor.found");
  });

  it("covers updated() lifecycle", () => {
    editor.step = 3;
    editor.updated(new Map([["step", 2]]));
    expect(editor._step).toBe(3);

    editor._config.meta = {};
    editor._language = "en";
    const fakeCard = { language: "it" };
    vi.spyOn(editor.shadowRoot, 'querySelector').mockImplementation((sel) => sel === "cronostar-card" ? fakeCard : null);
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("it");
  });

  it("covers all wizard actions branches", () => {
    // Step 1 valid
    editor._step = 1;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    editor._renderWizardActions();

    // Step 1 invalid
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    editor._renderWizardActions();

    // Step 2
    editor._step = 2;
    editor._renderWizardActions();

    // Step 5
    editor._step = 5;
    editor._renderWizardActions();

    // Default branch
    editor._step = 99;
    editor._renderWizardActions();
  });

  it("covers _renderStep default branch", () => {
    editor._step = 99;
    const res = editor._renderStep({});
    expect(res.toString()).toContain("Unknown Step");
  });

  it("covers _updateSaveButtonVisibility branches", () => {
    editor._step = 1;
    editor._updateSaveButtonVisibility();
    let style = document.getElementById("cronostar-editor-save-button-hide");
    expect(style.textContent).toContain("display: none");

    editor._step = 4;
    editor._updateSaveButtonVisibility();
    expect(style.textContent).toBe("");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Line 344: this.dispatchEvent() inside the _debouncedDispatch callback
  // ─────────────────────────────────────────────────────────────────────────
  it("L344: _debouncedDispatch callback body executes via non-immediate dispatch", () => {
    editor._initialized = true;
    editor._step = 2;           // > 0 → bypasses the step===0 guard
    editor._isEditing = false;
    editor._config.target_entity = null;

    const dispatchSpy = vi.spyOn(editor, "dispatchEvent");
    editor._dispatchConfigChanged(false);

    expect(dispatchSpy).toHaveBeenCalled();
    const evt = dispatchSpy.mock.calls.find(c => c[0]?.type === "config-changed");
    expect(evt).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Line 394: if (!this.hass) return;  in _saveGlobalSettings
  // ─────────────────────────────────────────────────────────────────────────
  it("L394: _saveGlobalSettings returns early when hass is falsy", async () => {
    editor.hass = null;
    await expect(editor._saveGlobalSettings({ a: 1 })).resolves.toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Line 408: cardEl.globalSettings = settings;
  // ─────────────────────────────────────────────────────────────────────────
  it("L408: cardEl.globalSettings is assigned when host exposes the property", async () => {
    const host = { globalSettings: null };
    vi.spyOn(editor, "getRootNode").mockReturnValue({ host });

    editor.hass = { callService: vi.fn(() => Promise.resolve()) };
    editor.showToast = vi.fn();

    await editor._saveGlobalSettings({ brightness: 70 });
    expect(host.globalSettings).toEqual({ brightness: 70 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lines 411 + 417: catch block in _saveGlobalSettings (log + showToast)
  // ─────────────────────────────────────────────────────────────────────────
  it("L411+417: _saveGlobalSettings catch block calls log() and showToast()", async () => {
    const err = new Error("permission denied");
    editor.hass = { callService: vi.fn(() => Promise.reject(err)) };
    editor.showToast = vi.fn();

    await editor._saveGlobalSettings({ x: 1 });
    const { log } = await import("../src/utils/logger_utils.js");
    expect(log).toHaveBeenCalled();
    expect(editor.showToast).toHaveBeenCalledWith(`✗ ${err.message}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Line 422: const lang = this._language || "en";  in handleShowHelp()
  // ─────────────────────────────────────────────────────────────────────────
  it("L422: handleShowHelp() executes its body", () => {
    editor._language = "it";
    expect(() => editor.handleShowHelp()).not.toThrow();
    editor._language = "";
    expect(() => editor.handleShowHelp()).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lines 438-460: updated() hass block — all branches
  // ─────────────────────────────────────────────────────────────────────────
  it("L438-450: updated() hass block – card language adoption via shadowRoot", () => {
    editor._config.meta = {};
    editor._language = "en";

    const fakeCard = { language: "fr" };
    vi.spyOn(editor.shadowRoot, "querySelector").mockImplementation(
      (sel) => sel === "cronostar-card" ? fakeCard : null
    );

    editor.hass = { language: "en", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("fr");
  });

  it("L451-458: updated() hass block – hass.language fallback when no card found", () => {
    editor._config.meta = {};
    editor._language = "en";

    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);

    editor.hass = { language: "de-DE", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("de");
  });

  it("L454-no-update: updated() hass block – hass.language matches, no i18n rebuild", () => {
    editor._config.meta = {};
    editor._language = "es";

    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);

    const i18nBefore = editor.i18n;
    editor.hass = { language: "es-ES", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("es");
    expect(editor.i18n).toBe(i18nBefore);
  });

  it("L451-hass-no-language: updated() hass.language is falsy → currentLang = 'en'", () => {
    editor._config.meta = {};
    editor._language = "fr";

    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);

    editor.hass = { language: "", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("en");
  });

  it("L400: _saveGlobalSettings shows italian toast when language is 'it'", async () => {
    editor._language = "it";
    editor.hass = { callService: vi.fn(() => Promise.resolve()) };
    editor.showToast = vi.fn();
    vi.spyOn(editor, "getRootNode").mockReturnValue({ host: null });

    await editor._saveGlobalSettings({ opt: 1 });
    expect(editor.showToast).toHaveBeenCalledWith("Impostazioni globali salvate");
  });
});
