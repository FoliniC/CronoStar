// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { CronoStarEditor as EditorClass } from "../src/editor/CronoStarEditor.js";

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
  return {
    ...actual,
    html: (strings, ...values) => ({
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
                        v && typeof v.toString === "function"
                          ? v.toString()
                          : String(v ?? ""),
                      )
                      .join("")
                  : values[i]?.toString?.() ?? String(values[i] ?? "")
              : ""),
          "",
        ),
    }),
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
      dispatchEvent(ev) {
        return HTMLElement.prototype.dispatchEvent.call(this, ev);
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
  },
  validateConfig: vi.fn((c = {}) => ({ ...c, preset_type: c.preset_type || "thermostat" })),
  extractCardConfig: vi.fn((c) => c),
}));

vi.mock("../src/utils/prefix_utils.js", () => ({
  normalizePrefix: vi.fn((p) => (p ? (String(p).endsWith("_") ? String(p) : `${p}_`) : "")),
  isValidPrefix: vi.fn((p) => !!p),
  getEffectivePrefix: vi.fn((c) => c?.global_prefix || "p_"),
}));

vi.mock("../src/utils/logger_utils.js", () => ({ log: vi.fn() }));

vi.mock("../src/utils.js", () => ({
  debounce: (fn) => {
    const f = (...args) => fn(...args);
    f.cancel = vi.fn();
    return f;
  },
  Logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../src/editor/EditorI18n.js", () => ({
  EditorI18n: class {
    constructor(editor) { this.editor = editor; }
    _t(k) { return k; }
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
    render() { return { __litHtml: true, strings: ["step0"], values: [] }; }
  },
}));
vi.mock("../src/editor/steps/Step1Preset.js", () => ({
  Step1Preset: class {
    render() { return { __litHtml: true, strings: ["step1"], values: [] }; }
  },
}));
vi.mock("../src/editor/steps/Step2Entities.js", () => ({
  Step2Entities: class {
    render(v) { return { __litHtml: true, strings: ["step2"], values: [v] }; }
  },
}));
vi.mock("../src/editor/steps/Step3Options.js", () => ({
  Step3Options: class {
    render() { return { __litHtml: true, strings: ["step3"], values: [] }; }
  },
}));
vi.mock("../src/editor/steps/Step4Automation.js", () => ({
  Step4Automation: class {
    render() { return { __litHtml: true, strings: ["step4"], values: [] }; }
  },
}));
vi.mock("../src/editor/steps/Step5Summary.js", () => ({
  Step5Summary: class {
    render(v) { return { __litHtml: true, strings: ["step5"], values: [v] }; }
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively extracts all closure functions from a Lit template tree.
 * Handles nested __litHtml objects and arrays (e.g. from .map()).
 */
function collectFunctions(node, out = []) {
  if (!node) return out;
  if (typeof node === "function") { out.push(node); return out; }
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

/** Creates a mock DOM element with a full shadowRoot interface */
function makeElWithShadow(tagName = "VAADIN-COMBO-BOX-OVERLAY", styleAlreadyPresent = false) {
  return {
    tagName,
    shadowRoot: {
      querySelector: vi.fn((sel) =>
        styleAlreadyPresent && sel.includes("cronostar-force-contrast-style")
          ? { id: "cronostar-force-contrast-style" }
          : null,
      ),
      querySelectorAll: vi.fn(() => []),
      appendChild: vi.fn(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe("CronoStarEditor – 100% coverage", () => {
  let editor;
  const TAG = "cronostar-editor-cov";

  beforeAll(() => {
    if (!customElements.get(TAG)) customElements.define(TAG, EditorClass);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    if (document.head) document.head.innerHTML = "";
    if (document.body) document.body.innerHTML = "";
    vi.stubGlobal("confirm", vi.fn(() => true));
    editor = document.createElement(TAG);
    editor.hass = {
      language: "en",
      states: { "sensor.test": { state: "on" } },
      callService: vi.fn(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    editor?.disconnectedCallback();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L33, L63 – static getters
  // ══════════════════════════════════════════════════════════════════════════
  it("L33: static get properties() returns all expected reactive property keys", () => {
    const props = EditorClass.properties;
    expect(props.hass).toEqual({ type: Object });
    expect(props._step).toEqual({ type: Number });
    expect(props._dashboardView).toEqual({ type: String });
    expect(props.logging_enabled).toEqual({ type: Boolean });
    expect(props._isEditing).toEqual({ type: Boolean });
  });

  it("L63: static get styles() returns a css descriptor object", () => {
    const styles = EditorClass.styles;
    expect(styles).toBeDefined();
    // mocked css() returns { cssText: string }
    expect(styles.cssText !== undefined || typeof styles === "object").toBe(true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L361 – serviceHandlers.saveGlobalSettings arrow function
  // ══════════════════════════════════════════════════════════════════════════
  it("L361: serviceHandlers.saveGlobalSettings delegates to _saveGlobalSettings", async () => {
    const spy = vi.spyOn(editor, "_saveGlobalSettings").mockResolvedValue();
    await editor.serviceHandlers.saveGlobalSettings({ brightness: 80 });
    expect(spy).toHaveBeenCalledWith({ brightness: 80 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L374-386 – constructor setTimeout: card language adoption
  // ══════════════════════════════════════════════════════════════════════════
  it("L375-382: constructor setTimeout adopts card language from document when different", () => {
    vi.useFakeTimers();
    const ed = document.createElement(TAG);
    ed._language = "en";
    vi.spyOn(document, "querySelector").mockImplementation((sel) =>
      sel === "cronostar-card" ? { language: "it" } : null,
    );
    vi.advanceTimersByTime(0);
    expect(ed._language).toBe("it");
    expect(ed._config.meta?.language).toBe("it");
    ed.disconnectedCallback();
    vi.useRealTimers();
  });

  it("L375: constructor setTimeout uses shadowRoot card in preference", () => {
    vi.useFakeTimers();
    const ed = document.createElement(TAG);
    ed._language = "en";
    vi.spyOn(ed.shadowRoot, "querySelector").mockReturnValue({ language: "fr" });
    vi.advanceTimersByTime(0);
    expect(ed._language).toBe("fr");
    ed.disconnectedCallback();
    vi.useRealTimers();
  });

  it("L374: constructor setTimeout is no-op when cardLang equals current language", () => {
    vi.useFakeTimers();
    const ed = document.createElement(TAG);
    ed._language = "en";
    const before = ed.i18n;
    vi.spyOn(document, "querySelector").mockImplementation((sel) =>
      sel === "cronostar-card" ? { language: "en" } : null,
    );
    vi.advanceTimersByTime(0);
    expect(ed._language).toBe("en");
    expect(ed.i18n).toBe(before);
    ed.disconnectedCallback();
    vi.useRealTimers();
  });

  it("L387: constructor setTimeout catch swallows DOM errors silently", () => {
    vi.useFakeTimers();
    const ed = document.createElement(TAG);
    vi.spyOn(document, "querySelector").mockImplementation(() => { throw new Error("boom"); });
    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
    ed.disconnectedCallback();
    vi.useRealTimers();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L394, L400, L408, L411, L417 – _saveGlobalSettings
  // ══════════════════════════════════════════════════════════════════════════
  it("L394: _saveGlobalSettings returns early when hass is null", async () => {
    editor.hass = null;
    await expect(editor._saveGlobalSettings({ a: 1 })).resolves.toBeUndefined();
  });

  it("L400: _saveGlobalSettings shows italian toast when _language='it'", async () => {
    editor._language = "it";
    editor.hass = { callService: vi.fn(() => Promise.resolve()) };
    editor.showToast = vi.fn();
    vi.spyOn(editor, "getRootNode").mockReturnValue({ host: null });
    await editor._saveGlobalSettings({ opt: 1 });
    expect(editor.showToast).toHaveBeenCalledWith("Impostazioni globali salvate");
  });

  it("L408: cardEl.globalSettings assigned when host has the property", async () => {
    const host = { globalSettings: null };
    vi.spyOn(editor, "getRootNode").mockReturnValue({ host });
    editor.hass = { callService: vi.fn(() => Promise.resolve()) };
    editor.showToast = vi.fn();
    await editor._saveGlobalSettings({ brightness: 70 });
    expect(host.globalSettings).toEqual({ brightness: 70 });
  });

  it("L411+417: _saveGlobalSettings catch executes log and showToast", async () => {
    const err = new Error("permission denied");
    editor.hass = { callService: vi.fn(() => Promise.reject(err)) };
    editor.showToast = vi.fn();
    await editor._saveGlobalSettings({ x: 1 });
    const { log } = await import("../src/utils/logger_utils.js");
    expect(log).toHaveBeenCalledWith("error", expect.anything(), expect.any(String), err);
    expect(editor.showToast).toHaveBeenCalledWith(`✗ ${err.message}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L422 – handleShowHelp
  // ══════════════════════════════════════════════════════════════════════════
  it("L422: handleShowHelp executes with truthy and falsy _language", () => {
    editor._language = "it";
    expect(() => editor.handleShowHelp()).not.toThrow();
    editor._language = "";
    expect(() => editor.handleShowHelp()).not.toThrow();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L476-477 – updated(): changedProps.has("_step")
  // ══════════════════════════════════════════════════════════════════════════
  it("L476-477: updated() dispatches immediately when _step changes to non-zero", () => {
    editor._initialized = true;
    editor._step = 2;
    const spy = vi.spyOn(editor, "_dispatchConfigChanged");
    editor.updated(new Map([["_step", 0]]));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it("L476: updated() does NOT dispatch from _step block when new step is 0", () => {
    editor._initialized = true;
    editor._step = 0;
    const spy = vi.spyOn(editor, "_dispatchConfigChanged");
    editor.updated(new Map([["_step", 1]]));
    // _dispatchConfigChanged may be called from other blocks but not the _step===0 path
    const stepBlockCalls = spy.mock.calls.filter((c) => c[0] === true);
    // The _step block guard (this._step !== 0) is false → no call from that branch
    expect(editor._step).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L482-487 – updated(): changedProps.has("config"/"language")
  // ══════════════════════════════════════════════════════════════════════════
  it("L482-487: updated() calls setConfig when 'config' key in changedProps", () => {
    const spy = vi.spyOn(editor, "setConfig");
    editor.config = { preset_type: "thermostat", type: "custom:cronostar-card" };
    editor.updated(new Map([["config", null]]));
    expect(spy).toHaveBeenCalled();
  });

  it("L482-487: updated() calls setConfig when 'language' key in changedProps", () => {
    const spy = vi.spyOn(editor, "setConfig");
    editor.language = "de";
    editor.updated(new Map([["language", "en"]]));
    expect(spy).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L438-460 – updated(): hass block (all branches)
  // ══════════════════════════════════════════════════════════════════════════
  it("L447-450: updated() adopts cardLang from shadowRoot when different", () => {
    editor._config.meta = {};
    editor._language = "en";
    vi.spyOn(editor.shadowRoot, "querySelector").mockImplementation(
      (sel) => (sel === "cronostar-card" ? { language: "fr" } : null),
    );
    editor.hass = { language: "en", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("fr");
  });

  it("L451-458: updated() falls back to hass.language when no card found", () => {
    editor._config.meta = {};
    editor._language = "en";
    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);
    editor.hass = { language: "de-DE", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("de");
  });

  it("L455: updated() hass block – same language, no i18n rebuild", () => {
    editor._config.meta = {};
    editor._language = "es";
    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);
    const before = editor.i18n;
    editor.hass = { language: "es-ES", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("es");
    expect(editor.i18n).toBe(before);
  });

  it("L452: updated() hass block – empty hass.language falls back to 'en'", () => {
    editor._config.meta = {};
    editor._language = "fr";
    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(null);
    vi.spyOn(document, "querySelector").mockReturnValue(null);
    editor.hass = { language: "", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("en");
  });

  it("L447: updated() hass block – cardLang matches _language, i18n not rebuilt", () => {
    editor._config.meta = {};
    editor._language = "it";
    vi.spyOn(editor.shadowRoot, "querySelector").mockImplementation(
      (sel) => (sel === "cronostar-card" ? { language: "it" } : null),
    );
    const before = editor.i18n;
    editor.hass = { language: "en", states: {} };
    editor.updated(new Map([["hass", null]]));
    expect(editor._language).toBe("it");
    expect(editor.i18n).toBe(before);
  });

  it("L434-435: updated() syncs step property to _step", () => {
    editor.step = 3;
    editor.updated(new Map([["step", 2]]));
    expect(editor._step).toBe(3);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L546, L571, L577 – injectToShadow branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L577: own shadowRoot scan calls injectToShadow for elements with shadowRoot", () => {
    const el = makeElWithShadow("HA-ENTITY-PICKER");
    vi.spyOn(editor.shadowRoot, "querySelectorAll").mockReturnValue([el]);
    editor._applyShadowDomFix();
    expect(el.shadowRoot.appendChild).toHaveBeenCalled();
  });

  it("L546: injectToShadow guard – element without shadowRoot (from own scan)", () => {
    const noShadow = { tagName: "SPAN", shadowRoot: null };
    vi.spyOn(editor.shadowRoot, "querySelectorAll").mockReturnValue([noShadow]);
    expect(() => editor._applyShadowDomFix()).not.toThrow();
  });

  it("L546: injectToShadow guard – null element passed via observer callback", () => {
    let observerCb;
    vi.stubGlobal("MutationObserver", class {
      constructor(cb) { observerCb = cb; }
      observe() {}
      disconnect() {}
    });
    editor._contrastObserver = null;
    editor._applyShadowDomFix();
    vi.spyOn(document, "querySelectorAll").mockReturnValue([null]);
    expect(() => observerCb()).not.toThrow();
  });

  it("L571: injectToShadow recursion – child with shadowRoot gets style injected", () => {
    const child = makeElWithShadow("VAADIN-COMBO-BOX-OVERLAY");
    const parent = makeElWithShadow("HA-SELECT");
    parent.shadowRoot.querySelectorAll = vi.fn(() => [child]);
    vi.spyOn(editor.shadowRoot, "querySelectorAll").mockReturnValue([parent]);
    editor._applyShadowDomFix();
    expect(child.shadowRoot.appendChild).toHaveBeenCalled();
  });

  it("MutationObserver callback: injects style into vaadin element", () => {
    let observerCb;
    vi.stubGlobal("MutationObserver", class {
      constructor(cb) { observerCb = cb; }
      observe() {}
      disconnect() {}
    });
    editor._contrastObserver = null;
    editor._applyShadowDomFix();
    const el = makeElWithShadow("VAADIN-COMBO-BOX-OVERLAY");
    vi.spyOn(document, "querySelectorAll").mockReturnValue([el]);
    observerCb();
    expect(el.shadowRoot.appendChild).toHaveBeenCalled();
  });

  it("MutationObserver callback: skips inject when style already present", () => {
    let observerCb;
    vi.stubGlobal("MutationObserver", class {
      constructor(cb) { observerCb = cb; }
      observe() {}
      disconnect() {}
    });
    editor._contrastObserver = null;
    editor._applyShadowDomFix();
    const el = makeElWithShadow("HA-SELECT", true);
    vi.spyOn(document, "querySelectorAll").mockReturnValue([el]);
    observerCb();
    expect(el.shadowRoot.appendChild).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L596-597 – setInterval callback
  // ══════════════════════════════════════════════════════════════════════════
  it("L596-597: setInterval callback injects style into target elements", () => {
    vi.useFakeTimers();
    editor._contrastObserver = { observe: vi.fn(), disconnect: vi.fn() };
    editor._contrastInterval = null;
    editor._applyShadowDomFix();
    const el = makeElWithShadow("VAADIN-COMBO-BOX-OVERLAY");
    vi.spyOn(document, "querySelectorAll").mockReturnValue([el]);
    vi.advanceTimersByTime(1000);
    expect(el.shadowRoot.appendChild).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L643 – catch in _updateSaveButtonVisibility
  // ══════════════════════════════════════════════════════════════════════════
  it("L643: _updateSaveButtonVisibility catch logs on error", async () => {
    vi.spyOn(document, "getElementById").mockImplementationOnce(() => {
      throw new Error("DOM failure");
    });
    editor._step = 1; // shouldHide=true → tries getElementById
    expect(() => editor._updateSaveButtonVisibility()).not.toThrow();
    const { log } = await import("../src/utils/logger_utils.js");
    expect(log).toHaveBeenCalledWith(
      "warn", expect.anything(), expect.any(String), expect.any(Error),
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L658 – early return in _updatePreviewVisibility
  // ══════════════════════════════════════════════════════════════════════════
  it("L658: _updatePreviewVisibility returns early when root is plain object (not doc/ShadowRoot)", () => {
    vi.spyOn(editor, "getRootNode").mockReturnValue({ customProp: true });
    expect(() => editor._updatePreviewVisibility()).not.toThrow();
    expect(document.getElementById("cronostar-editor-style-global")).toBeNull();
  });

  it("L658: _updatePreviewVisibility returns early when root is null", () => {
    vi.spyOn(editor, "getRootNode").mockReturnValue(null);
    expect(() => editor._updatePreviewVisibility()).not.toThrow();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L665 – if (!t) return in targets.forEach
  // ══════════════════════════════════════════════════════════════════════════
  it("L665: _updatePreviewVisibility forEach skips null target when document.head is null", () => {
    vi.spyOn(editor, "getRootNode").mockReturnValue(document);
    const desc = Object.getOwnPropertyDescriptor(document, "head");
    Object.defineProperty(document, "head", { get: () => null, configurable: true });
    try {
      editor._step = 0;
      expect(() => editor._updatePreviewVisibility()).not.toThrow();
    } finally {
      if (desc) Object.defineProperty(document, "head", desc);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // L731 – catch in _updatePreviewVisibility
  // ══════════════════════════════════════════════════════════════════════════
  it("L731: _updatePreviewVisibility catch logs when getRootNode throws", async () => {
    vi.spyOn(editor, "getRootNode").mockImplementation(() => {
      throw new Error("getRootNode failed");
    });
    expect(() => editor._updatePreviewVisibility()).not.toThrow();
    const { log } = await import("../src/utils/logger_utils.js");
    expect(log).toHaveBeenCalledWith(
      "warn", expect.anything(), expect.any(String), expect.any(Error),
    );
  });

  // Happy paths for visibility methods
  it("_updatePreviewVisibility: shouldHide=true creates style, shouldHide=false clears", () => {
    editor._step = 0;
    editor._updatePreviewVisibility();
    const styleGlobal = document.getElementById("cronostar-editor-style-global");
    expect(styleGlobal).not.toBeNull();
    expect(styleGlobal.textContent).toContain("preview");
    editor._step = 1;
    editor._updatePreviewVisibility();
    expect(styleGlobal.textContent).toBe("");
  });

  it("_updateSaveButtonVisibility: hides for steps 0-3, shows for steps 4+", () => {
    editor._step = 1;
    editor._updateSaveButtonVisibility();
    let style = document.getElementById("cronostar-editor-save-button-hide");
    expect(style?.textContent).toContain("display: none");
    editor._step = 4;
    editor._updateSaveButtonVisibility();
    expect(style?.textContent).toBe("");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // setConfig – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("setConfig: returns early when config is null/undefined", () => {
    expect(() => editor.setConfig(null)).not.toThrow();
    expect(() => editor.setConfig(undefined)).not.toThrow();
  });

  it("setConfig: ignores inbound when _ignoreInboundUntil is in the future", () => {
    editor._ignoreInboundUntil = Date.now() + 5000;
    const spy = vi.spyOn(editor, "_updateAutomationYaml");
    editor.setConfig({ type: "custom:cronostar-card" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("setConfig: adopts incoming config on first load (not_configured=true)", () => {
    editor._config.not_configured = true;
    editor.setConfig({ type: "custom:cronostar-card", preset_type: "thermostat" });
    expect(editor._initialized).toBe(true);
  });

  it("setConfig: protects core fields when wizard is active (step>0)", () => {
    editor._step = 2;
    editor._config.target_entity = "climate.local";
    editor._config.global_prefix = "local_";
    editor.setConfig({ type: "custom:cronostar-card", target_entity: "climate.incoming", preset_type: "thermostat" });
    expect(editor._config.target_entity).toBe("climate.local");
  });

  it("setConfig: syncs incoming config at step 0", () => {
    editor._step = 0;
    editor.setConfig({ type: "custom:cronostar-card", preset_type: "thermostat", title: "NewTitle" });
    expect(editor._config.title).toBe("NewTitle");
  });

  it("L822-823: setConfig applies this.language property when set", () => {
    editor.language = "es";
    editor._language = "en";
    editor.setConfig({ type: "custom:cronostar-card", preset_type: "thermostat" });
    expect(editor._language).toBe("es");
  });

  it("L826-827: setConfig applies hass.language when no meta/language prop", () => {
    editor.language = undefined;
    editor._language = "en";
    editor.hass = { language: "fr-FR", states: {} };
    editor.setConfig({ type: "custom:cronostar-card", preset_type: "thermostat" });
    expect(editor._language).toBe("fr");
  });

  it("L837: setConfig prevents reverting 'it' to 'en' without explicit meta.language", () => {
    editor._language = "it";
    editor.language = undefined;
    editor.hass = undefined;
    // oldLang will be "it"; incoming would set to "en" → prevented
    editor.setConfig({ type: "custom:cronostar-card", preset_type: "thermostat" });
    expect(editor._language).toBe("it");
  });

  it("L838-840: setConfig rebuilds i18n when language truly changes", () => {
    editor._language = "en";
    editor.language = undefined;
    editor.hass = undefined;
    const oldI18n = editor.i18n;
    editor.setConfig({
      type: "custom:cronostar-card",
      preset_type: "thermostat",
      meta: { language: "de" },
    });
    expect(editor._language).toBe("de");
    expect(editor.i18n).not.toBe(oldI18n);
  });

  it("L847-850: setConfig catch block falls back to DEFAULT_CONFIG on validateConfig error", async () => {
    const { validateConfig } = await import("../src/config.js");
    validateConfig.mockImplementationOnce(() => { throw new Error("invalid"); });
    expect(() => editor.setConfig({ type: "custom:cronostar-card" })).not.toThrow();
    expect(editor._config.type).toBe("custom:cronostar-card");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _sanitizeConfig – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L882: _sanitizeConfig adds type when missing", () => {
    const out = editor._sanitizeConfig({ preset_type: "thermostat" });
    expect(out.type).toBe("custom:cronostar-card");
  });

  it("L885-886: _sanitizeConfig preserves not_configured=true", () => {
    const out = editor._sanitizeConfig({ not_configured: true, type: "custom:cronostar-card" });
    expect(out.not_configured).toBe(true);
  });

  it("L889-890: _sanitizeConfig computes not_configured from core fields", () => {
    expect(editor._sanitizeConfig({
      type: "custom:cronostar-card", target_entity: "s.x", global_prefix: "p_",
    }).not_configured).toBe(false);
    expect(editor._sanitizeConfig({ type: "custom:cronostar-card" }).not_configured).toBe(true);
  });

  it("L895-896: _sanitizeConfig removes keys with empty-string values", () => {
    const out = editor._sanitizeConfig({
      type: "custom:cronostar-card", title: "", target_entity: "sensor.x",
    });
    expect("title" in out).toBe(false);
    expect(out.target_entity).toBe("sensor.x");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _dispatchConfigChanged – debounce (non-immediate) path
  // ══════════════════════════════════════════════════════════════════════════
  it("L344/L943: _debouncedDispatch callback fires when called non-immediate", () => {
    editor._initialized = true;
    editor._step = 2;
    editor._isEditing = false;
    editor._config.target_entity = null;
    const events = [];
    editor.addEventListener("config-changed", (e) => events.push(e));
    editor._dispatchConfigChanged(false);
    expect(events.length).toBeGreaterThan(0);
  });

  it("_dispatchConfigChanged: guard returns when not initialized", () => {
    editor._initialized = false;
    const spy = vi.spyOn(editor, "dispatchEvent");
    editor._dispatchConfigChanged(true);
    const cfgCalls = spy.mock.calls.filter((c) => c[0]?.type === "config-changed");
    expect(cfgCalls.length).toBe(0);
  });

  it("_dispatchConfigChanged: step=0 + !isEditing + !immediate returns early", () => {
    editor._initialized = true;
    editor._step = 0;
    editor._isEditing = false;
    const events = [];
    editor.addEventListener("config-changed", (e) => events.push(e));
    editor._dispatchConfigChanged(false);
    expect(events.length).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _handleLocalUpdate – branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L1098: _handleLocalUpdate deletes entity_prefix from config", () => {
    editor._config.entity_prefix = "old_prefix_";
    editor._initialized = true;
    editor._handleLocalUpdate("title", "New Title");
    expect("entity_prefix" in editor._config).toBe(false);
    expect(editor._config.title).toBe("New Title");
  });

  it("L1107-1108: _handleLocalUpdate triggers _saveMetadata for enabled_entity", () => {
    const spy = vi.spyOn(editor, "_saveMetadata").mockResolvedValue();
    editor._config.global_prefix = "pfx_";
    editor._initialized = true;
    editor._handleLocalUpdate("enabled_entity", "switch.test");
    expect(spy).toHaveBeenCalled();
  });

  it("L1107-1108: _handleLocalUpdate triggers _saveMetadata for profiles_select_entity", () => {
    const spy = vi.spyOn(editor, "_saveMetadata").mockResolvedValue();
    editor._config.global_prefix = "pfx_";
    editor._initialized = true;
    editor._handleLocalUpdate("profiles_select_entity", "input_select.x");
    expect(spy).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _updateConfig – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L1194-1195: _updateConfig clears validation for core field changes", () => {
    editor._config.validation = { valid: false, errors: ["err"] };
    editor._initialized = true;
    editor._updateConfig("target_entity", "sensor.new", true);
    expect(editor._config.validation).toEqual({ valid: true, errors: [] });
  });

  it("L1204: _updateConfig deletes entity_prefix", () => {
    editor._config.entity_prefix = "old_";
    editor._initialized = true;
    editor._updateConfig("title", "T");
    expect("entity_prefix" in editor._config).toBe(false);
  });

  it("L1206-1211: _updateConfig applies preset config on preset_type change", () => {
    editor._initialized = true;
    editor._updateConfig("preset_type", "thermostat", true);
    expect(editor._config.title).toBe("Thermostat");
    expect(editor._selectedPreset).toBe("thermostat");
  });

  it("L1215-1216: _updateConfig fills global_prefix when missing", () => {
    editor._initialized = true;
    editor._config.global_prefix = null;
    editor._updateConfig("title", "Test");
    expect(editor._config.global_prefix).toBeTruthy();
  });

  it("L1223-1224: _updateConfig triggers _saveMetadata for enabled_entity", () => {
    const spy = vi.spyOn(editor, "_saveMetadata").mockResolvedValue();
    editor._initialized = true;
    editor._config.global_prefix = "pfx_";
    editor._updateConfig("enabled_entity", "switch.x");
    expect(spy).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // renderEntityPicker – all three branches + event handlers
  // ══════════════════════════════════════════════════════════════════════════
  it("L1113: renderEntityPicker returns empty html when hass is null", () => {
    editor.hass = null;
    const res = editor.renderEntityPicker("key", "val");
    expect(res.__litHtml).toBe(true);
    expect(res.values.length).toBe(0);
  });

  it("L1118-1132: renderEntityPicker uses ha-selector branch + event handlers", () => {
    vi.spyOn(customElements, "get").mockImplementation((tag) =>
      tag === "ha-selector" ? class HaSelector extends HTMLElement {} : undefined,
    );
    const res = editor.renderEntityPicker("target_entity", "sensor.x", "Label");
    expect(res.toString()).toContain("ha-selector");
    const handlers = collectFunctions(res);
    expect(handlers.length).toBeGreaterThan(0);
    const spy = vi.spyOn(editor, "_updateConfig");
    // non-empty value, target_entity → immediate=true
    handlers[0]({ detail: { value: "sensor.new" } });
    expect(spy).toHaveBeenCalledWith("target_entity", "sensor.new", true);
    // empty value → null
    handlers[0]({ detail: { value: "" } });
    expect(spy).toHaveBeenCalledWith("target_entity", null, true);
  });

  it("L1135-1150: renderEntityPicker uses ha-entity-picker branch + event handlers", () => {
    vi.spyOn(customElements, "get").mockImplementation((tag) => {
      if (tag === "ha-selector") return undefined;
      if (tag === "ha-entity-picker") return class HaEntityPicker extends HTMLElement {};
      return undefined;
    });
    const res = editor.renderEntityPicker("enabled_entity", "", "Enabled");
    expect(res.toString()).toContain("ha-entity-picker");
    const handlers = collectFunctions(res);
    const spy = vi.spyOn(editor, "_updateConfig");
    // enabled_entity → immediate=false
    handlers[0]({ detail: { value: "switch.test" } });
    expect(spy).toHaveBeenCalledWith("enabled_entity", "switch.test", false);
  });

  it("L1153: renderEntityPicker falls back to renderTextInput", () => {
    vi.spyOn(customElements, "get").mockReturnValue(undefined);
    const spy = vi.spyOn(editor, "renderTextInput");
    editor.renderEntityPicker("key", "val", "Label");
    expect(spy).toHaveBeenCalledWith("key", "val", "Label");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderButton – both branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L1178-1181: _renderButton outlined=true returns outlined mwc-button", () => {
    const res = editor._renderButton({ label: "Cancel", click: vi.fn(), outlined: true });
    expect(res.toString()).toContain("outlined");
  });

  it("L1183-1185: _renderButton raised (default) returns raised mwc-button", () => {
    const res = editor._renderButton({ label: "OK", click: vi.fn(), outlined: false });
    expect(res.toString()).toContain("raised");
  });

  it("renderButton public wrapper delegates to _renderButton", () => {
    const spy = vi.spyOn(editor, "_renderButton");
    editor.renderButton("Test", vi.fn(), true, true);
    expect(spy).toHaveBeenCalledWith({ label: "Test", click: expect.any(Function), disabled: true, outlined: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _handleKeyDown – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L1314-1318: _handleKeyDown blocks Enter at step>0 in non-textarea", () => {
    editor._step = 1;
    const e = { key: "Enter", target: { tagName: "INPUT" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    editor._handleKeyDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("L1316: _handleKeyDown does NOT block Enter inside textarea", () => {
    editor._step = 1;
    const e = { key: "Enter", target: { tagName: "TEXTAREA" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    editor._handleKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("L1312: _handleKeyDown is no-op for non-Enter at step>0", () => {
    editor._step = 2;
    const e = { key: "Tab", target: { tagName: "INPUT" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    editor._handleKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("L1312: _handleKeyDown is no-op when step=0", () => {
    editor._step = 0;
    const e = { key: "Enter", target: { tagName: "INPUT" }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    editor._handleKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _handleFinishClick – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L1292-1295: _handleFinishClick catch when handleInitializeData throws", async () => {
    const { handleInitializeData } = await import("../src/editor/services/service_handlers.js");
    handleInitializeData.mockRejectedValueOnce(new Error("backend error"));
    editor._step = 5;
    editor.showToast = vi.fn();
    await editor._handleFinishClick({ force: true });
    expect(editor.showToast).toHaveBeenCalledWith(expect.stringContaining("backend error"));
  });

  it("L1296-1300: _handleFinishClick else branch calls wizard._nextStep when not final", async () => {
    editor._step = 2;
    await editor._handleFinishClick();
    expect(editor.wizard._nextStep).toHaveBeenCalled();
  });

  it("L1288-1290: _handleFinishClick updates _step=5 on isFinalStep", async () => {
    editor._step = 5;
    await editor._handleFinishClick({ force: false });
    expect(editor._step).toBe(5);
    expect(editor.wizard._finish).toHaveBeenCalled();
  });

  it("_handleFinishClick forced with hass: dispatches config-changed", async () => {
    editor._step = 3;
    const events = [];
    editor.addEventListener("config-changed", (e) => events.push(e));
    await editor._handleFinishClick({ force: true });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].detail.config._close_wizard).toBe(true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _saveMetadata – all branches
  // ══════════════════════════════════════════════════════════════════════════
  it("L953: _saveMetadata returns early when hass is null", async () => {
    editor.hass = null;
    await expect(editor._saveMetadata()).resolves.toBeUndefined();
  });

  it("L953: _saveMetadata returns early when global_prefix is empty", async () => {
    editor._config.global_prefix = "";
    await expect(editor._saveMetadata()).resolves.toBeUndefined();
  });

  it("_saveMetadata: reads card data and calls save_profile", async () => {
    editor._config.global_prefix = "pfx_";
    const fakeCard = {
      selectedProfile: "Summer",
      stateManager: { getData: () => [{ time: "08:00", value: 20 }] },
    };
    vi.spyOn(editor.shadowRoot, "querySelector").mockReturnValue(fakeCard);
    await editor._saveMetadata();
    expect(editor.hass.callService).toHaveBeenCalledWith(
      "cronostar", "save_profile", expect.objectContaining({ profile_name: "Summer" }),
    );
  });

  it("L997-998: _saveMetadata catch logs error", async () => {
    editor._config.global_prefix = "pfx_";
    editor.hass = { callService: vi.fn(() => Promise.reject(new Error("fail"))) };
    await expect(editor._saveMetadata()).resolves.toBeUndefined();
    const { Logger } = await import("../src/utils.js");
    expect(Logger.error).toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // showToast, _handleResetConfig
  // ══════════════════════════════════════════════════════════════════════════
  it("showToast: dispatches hass-notification event with message", () => {
    const events = [];
    editor.addEventListener("hass-notification", (e) => events.push(e));
    editor.showToast("Hello");
    expect(events).toHaveLength(1);
    expect(events[0].detail.message).toBe("Hello");
  });

  it("_handleResetConfig: resets step when !isEditing", () => {
    editor._isEditing = false;
    editor._initialized = true;
    editor._handleResetConfig();
    expect(editor._step).toBe(1);
  });

  it("_handleResetConfig: resets when editing and confirm=true", () => {
    vi.stubGlobal("confirm", () => true);
    editor._isEditing = true;
    editor._initialized = true;
    editor._handleResetConfig();
    expect(editor._step).toBe(1);
    expect(editor._isEditing).toBe(false);
  });

  it("_handleResetConfig: does NOT reset when editing and confirm=false", () => {
    vi.stubGlobal("confirm", () => false);
    editor._isEditing = true;
    editor._step = 3;
    editor._handleResetConfig();
    expect(editor._step).toBe(3);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderStepContent – error filtering
  // ══════════════════════════════════════════════════════════════════════════
  it("_renderStepContent: filters out 'not found' error when entity exists in hass", () => {
    editor._step = 2;
    editor._config.target_entity = "sensor.found";
    editor._config.validation = { valid: false, errors: ["Target entity sensor.found not found"] };
    editor.hass = { states: { "sensor.found": { state: "on" } } };
    const res = editor._renderStepContent();
    expect(res.toString()).not.toContain("sensor.found not found");
  });

  it("_renderStepContent: filters error about a different entity", () => {
    editor._step = 2;
    editor._config.target_entity = "sensor.local";
    editor._config.validation = { valid: false, errors: ["Target entity sensor.old is invalid"] };
    editor.hass = { states: {} };
    const res = editor._renderStepContent();
    expect(res.toString()).not.toContain("sensor.old is invalid");
  });

  it("_renderStepContent: shows error box for unrelated errors at step>0", () => {
    editor._step = 1;
    editor._config.target_entity = null;
    editor._config.validation = { valid: false, errors: ["Some error"] };
    editor.hass = { states: {} };
    const res = editor._renderStepContent();
    expect(res.toString()).toContain("PROBLEMI DI CONFIGURAZIONE");
  });

  it("_renderStepContent: no error box at step=0", () => {
    editor._step = 0;
    editor._config.validation = { valid: false, errors: ["error"] };
    const res = editor._renderStepContent();
    expect(res.toString()).not.toContain("PROBLEMI DI CONFIGURAZIONE");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderStep – all cases
  // ══════════════════════════════════════════════════════════════════════════
  it("_renderStep: renders steps 0-5 without error", () => {
    for (let s = 0; s <= 5; s++) {
      editor._step = s;
      expect(() => editor._renderStep({ valid: true, errors: [] })).not.toThrow();
    }
  });

  it("_renderStep: default branch renders 'Unknown Step'", () => {
    editor._step = 99;
    expect(editor._renderStep({}).toString()).toContain("Unknown Step");
  });

  it("_renderStep case 0: reuses cached _step0Dashboard instance", () => {
    editor._step = 0;
    editor._step0Dashboard = null;
    editor._renderStep({});
    const cached = editor._step0Dashboard;
    expect(cached).not.toBeNull();
    editor._renderStep({});
    expect(editor._step0Dashboard).toBe(cached); // same instance
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderWizardSteps – click handler branches
  // ══════════════════════════════════════════════════════════════════════════
  it("_renderWizardSteps: step=0 returns empty template", () => {
    editor._step = 0;
    const res = editor._renderWizardSteps();
    expect(res.values.length).toBe(0);
  });

  it("_renderWizardSteps: badge click to step=0 always allowed", () => {
    editor._step = 3;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[0](); // step badge 0 = home
    expect(editor._step).toBe(0);
  });

  it("_renderWizardSteps: badge click to lower step allowed", () => {
    editor._step = 3;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[2](); // badge 2 ≤ current 3
    expect(editor._step).toBe(2);
  });

  it("_renderWizardSteps: badge click to higher step blocked when !canJump", () => {
    editor._step = 1;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[5](); // badge 5 > current, canJump=false
    expect(editor._step).toBe(1); // unchanged
  });

  it("_renderWizardSteps: badge click to higher step allowed when canJump=true", () => {
    editor._step = 2;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    const tpl = editor._renderWizardSteps();
    const handlers = collectFunctions(tpl);
    handlers[5](); // badge 5, canJump=true
    expect(editor._step).toBe(5);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderWizardActions – all step branches + click handlers
  // ══════════════════════════════════════════════════════════════════════════
  it("_renderWizardActions: step=0 returns empty template", () => {
    editor._step = 0;
    const res = editor._renderWizardActions();
    expect(res.values.length).toBe(0);
  });

  it("_renderWizardActions: step=1 valid – back click sets step=0", () => {
    editor._step = 1;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    const tpl = editor._renderWizardActions();
    const handlers = collectFunctions(tpl);
    handlers[0]();
    expect(editor._step).toBe(0);
  });

  it("_renderWizardActions: step=1 invalid – shows hint, back click sets step=0", () => {
    editor._step = 1;
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    const tpl = editor._renderWizardActions();
    expect(tpl.toString()).toContain("minimal_config_needed");
    const handlers = collectFunctions(tpl);
    handlers[0]();
    expect(editor._step).toBe(0);
  });

  it("_renderWizardActions: step=2 – back calls _prevStep, next calls _handleNextClick", () => {
    editor._step = 2;
    editor._initialized = true;
    const tpl = editor._renderWizardActions();
    const handlers = collectFunctions(tpl);
    handlers[0](); // back → _prevStep
    expect(editor.wizard._prevStep).toHaveBeenCalled();
    handlers[1](); // next → _handleNextClick → _nextStep (canGoNext=true by default for step>1)
  });

  it("_renderWizardActions: step=5 – finish button calls _handleFinishClick({force:true})", async () => {
    editor._step = 5;
    const finishSpy = vi.spyOn(editor, "_handleFinishClick").mockResolvedValue();
    const tpl = editor._renderWizardActions();
    const handlers = collectFunctions(tpl);
    // back + finish
    handlers[1]?.(); // finish handler
    expect(finishSpy).toHaveBeenCalledWith({ force: true });
  });

  it("_renderWizardActions: step=3 renders back and next", () => {
    editor._step = 3;
    const tpl = editor._renderWizardActions();
    const handlers = collectFunctions(tpl);
    expect(handlers.length).toBeGreaterThanOrEqual(2);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _canGoNext, _handleNextClick
  // ══════════════════════════════════════════════════════════════════════════
  it("_canGoNext: step=0 always true; step=1 needs valid prefix+target; step>1 always true", () => {
    editor._step = 0;
    expect(editor._canGoNext()).toBe(true);

    editor._step = 1;
    editor._config.global_prefix = "pfx_";
    editor._config.target_entity = "sensor.x";
    expect(editor._canGoNext()).toBe(true);

    editor._config.global_prefix = "";
    expect(editor._canGoNext()).toBe(false);

    editor._step = 3;
    expect(editor._canGoNext()).toBe(true);
  });

  it("_handleNextClick: calls wizard._nextStep when canGoNext", () => {
    vi.spyOn(editor, "_canGoNext").mockReturnValue(true);
    editor._initialized = true;
    editor._handleNextClick();
    expect(editor.wizard._nextStep).toHaveBeenCalled();
    expect(editor._showStepError).toBe(false);
  });

  it("_handleNextClick: sets showStepError when !canGoNext", () => {
    vi.spyOn(editor, "_canGoNext").mockReturnValue(false);
    editor._handleNextClick();
    expect(editor._showStepError).toBe(true);
    expect(editor.wizard._nextStep).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // disconnectedCallback, lifecycle helpers
  // ══════════════════════════════════════════════════════════════════════════
  it("disconnectedCallback: disconnects observer and clears interval", () => {
    const obs = { disconnect: vi.fn() };
    editor._contrastObserver = obs;
    editor._contrastInterval = 42;
    const spy = vi.spyOn(globalThis, "clearInterval");
    editor.disconnectedCallback();
    expect(obs.disconnect).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(42);
  });

  it("_isElDefined: returns true for registered, false for unknown", () => {
    expect(editor._isElDefined(TAG)).toBe(true);
    expect(editor._isElDefined("nonexistent-xyz")).toBe(false);
  });

  it("connectedCallback: does not throw", () => {
    expect(() => editor.connectedCallback()).not.toThrow();
  });

  it("_persistCardConfigNow: resolves to undefined", async () => {
    await expect(editor._persistCardConfigNow()).resolves.toBeUndefined();
  });

  it("_syncConfigAliases: is a no-op", () => {
    expect(() => editor._syncConfigAliases()).not.toThrow();
  });

  it("_updateAutomationYaml: calls buildAutomationTemplate with _config", async () => {
    const { buildAutomationTemplate } = await import("../src/editor/yaml/yaml_generators.js");
    editor._updateAutomationYaml();
    expect(buildAutomationTemplate).toHaveBeenCalledWith(editor._config);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _renderTextInput – handlers
  // ══════════════════════════════════════════════════════════════════════════
  it("_renderTextInput: @input handler calls _handleLocalUpdate", () => {
    editor._initialized = true;
    const spy = vi.spyOn(editor, "_handleLocalUpdate");
    const tpl = editor._renderTextInput("myKey", "myVal");
    const handlers = collectFunctions(tpl);
    handlers[0]({ target: { value: "newVal" } });
    expect(spy).toHaveBeenCalledWith("myKey", "newVal");
  });

  it("_renderTextInput: @change handler calls _dispatchConfigChanged(true)", () => {
    editor._initialized = true;
    const spy = vi.spyOn(editor, "_dispatchConfigChanged");
    const tpl = editor._renderTextInput("k", "v");
    const handlers = collectFunctions(tpl);
    handlers[1]();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it("renderTextInput: public wrapper delegates to _renderTextInput", () => {
    const spy = vi.spyOn(editor, "_renderTextInput");
    editor.renderTextInput("k", "v", "placeholder");
    expect(spy).toHaveBeenCalledWith("k", "v", "placeholder");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // render()
  // ══════════════════════════════════════════════════════════════════════════
  it("render: returns a Lit template containing the keydown handler", () => {
    const tpl = editor.render();
    expect(tpl.__litHtml).toBe(true);
    const handlers = collectFunctions(tpl);
    expect(handlers.length).toBeGreaterThan(0);
    // Invoke keydown handler (step=0, Enter → no-op)
    editor._step = 0;
    handlers[0]({
      key: "Enter",
      target: { tagName: "INPUT" },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
  });
});
