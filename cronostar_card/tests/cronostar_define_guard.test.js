// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class MockRegistry {
  constructor() {
    this.elements = new Map();
    this.__cronostar_patched__ = false;
  }
  define(name, constructor) {
    if (name === "throw-already-used") throw new Error("already been used");
    if (name === "throw-already-defined") throw new Error("already defined");
    if (name === "throw-error") throw new Error("Unexpected define error");
    this.elements.set(name, constructor);
  }
  get(name) {
    if (name === "throw-error-get") throw new Error("Unexpected get error");
    return this.elements.get(name);
  }
}

describe("cronostar_define_guard", () => {
  let originalRegistry;
  let originalCustomElements;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    originalRegistry = window.CustomElementRegistry;
    originalCustomElements = window.customElements;

    document.body.innerHTML = "";

    window.CustomElementRegistry = MockRegistry;
    window.customElements = new MockRegistry();

    window.CronoStarCard = class extends HTMLElement {};
    window.CronoStarEditor = class extends HTMLElement {};

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../src/core/cronostar_define_guard.js");
  });

  afterEach(() => {
    window.CustomElementRegistry = originalRegistry;
    window.customElements = originalCustomElements;
    delete window.CronoStarCard;
    delete window.CronoStarEditor;
    delete window.anotherRegistry;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("intercepts CustomElementRegistry constructor", () => {
    expect(window.CustomElementRegistry).not.toBe(originalRegistry);
    const newRegistry = new window.CustomElementRegistry();
    expect(newRegistry.__cronostar_patched__).toBe(true);
  });

  it("patches global customElements registry", () => {
    expect(window.customElements.__cronostar_patched__).toBe(true);
  });

  it("get() provides fallback to CronoStar elements", () => {
    const registry = window.customElements;
    expect(registry.get("cronostar-card")).toBe(window.CronoStarCard);
    expect(registry.get("cronostar-card-editor")).toBe(window.CronoStarEditor);
    expect(registry.get("throw-error-get")).toBeUndefined();
  });

  it("falls back to global registry for other elements", () => {
    const globalRegistry = window.customElements;
    const anotherRegistry = new window.CustomElementRegistry();
    globalRegistry.define("ha-icon", class extends HTMLElement {});
    expect(anotherRegistry.get("ha-icon")).toBe(globalRegistry.get("ha-icon"));
  });

  it("returns undefined when global customElements is this itself", () => {
    const registry = window.customElements;
    expect(registry.get("unknown-el")).toBeUndefined();
  });

  it("define() avoids duplicate registrations", () => {
    const registry = window.customElements;
    const myConstructor = class extends HTMLElement {};
    registry.define("my-el", myConstructor);
    registry.define("my-el", class extends HTMLElement {});
    expect(registry.get("my-el")).toBe(myConstructor);
  });

  it("define() ignores when existing === constructor", () => {
    const registry = window.customElements;
    const ctor = class extends HTMLElement {};
    registry.define("same-el", ctor);
    expect(() => registry.define("same-el", ctor)).not.toThrow();
  });

  it("warns when existing constructor differs", () => {
    const registry = window.customElements;
    registry.define("dup-el", class extends HTMLElement {});
    registry.define("dup-el", class extends HTMLElement {});
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("already defined"),
    );
  });

  it("ignores duplicate define error 'already been used'", () => {
    const registry = window.customElements;
    expect(() =>
      registry.define("throw-already-used", class extends HTMLElement {}),
    ).not.toThrow();
  });

  it("ignores duplicate define error 'already defined'", () => {
    const registry = window.customElements;
    expect(() =>
      registry.define("throw-already-defined", class extends HTMLElement {}),
    ).not.toThrow();
  });

  it("rethrows unexpected define errors", () => {
    const registry = window.customElements;
    expect(() => registry.define("throw-error", class {})).toThrow(
      "Unexpected define error",
    );
  });

  it("auto-registers elements after delay", () => {
    const registry = new window.CustomElementRegistry();
    registry.elements.delete("cronostar-card");
    vi.advanceTimersByTime(10);
    expect(registry.get("cronostar-card")).toBe(window.CronoStarCard);
  });

  it("does not auto-register if CronoStar globals are missing", () => {
    delete window.CronoStarCard;
    delete window.CronoStarEditor;
    const registry = new window.CustomElementRegistry();
    vi.advanceTimersByTime(10);
    expect(registry.elements.size).toBe(0);
  });

  it("handles auto-registration errors from get()", () => {
    const registry = new window.CustomElementRegistry();
    registry.get = vi.fn(() => {
      throw new Error("broken get");
    });
    registry.define = vi.fn(() => {
      throw new Error("broken define");
    });
    vi.advanceTimersByTime(10);
    expect(console.warn).toHaveBeenCalledWith(
      "CRONOSTAR: Errore auto-registrazione:",
      expect.any(Error),
    );
  });

  it("handles auto-registration errors from define() after falsy get()", () => {
    const registry = new window.CustomElementRegistry();
    registry.get = vi.fn(() => undefined);
    registry.define = vi.fn(() => {
      throw new Error("broken define");
    });
    vi.advanceTimersByTime(10);
    expect(console.warn).toHaveBeenCalledWith(
      "CRONOSTAR: Errore auto-registrazione:",
      expect.any(Error),
    );
  });

  it("covers second auto-registration branch for editor when card already exists", () => {
    const registry = new window.CustomElementRegistry();
    registry.get = vi.fn((name) => {
      if (name === "cronostar-card") return window.CronoStarCard;
      return undefined;
    });
    registry.define = vi.fn();
    vi.advanceTimersByTime(10);
    expect(registry.define).toHaveBeenCalledWith(
      "cronostar-card-editor",
      window.CronoStarEditor,
    );
  });

  it("periodically scans and patches new registries", () => {
    const fakeRegistry = {
      define: vi.fn(),
      get: vi.fn(),
    };
    window.anotherRegistry = fakeRegistry;
    vi.advanceTimersByTime(500);
    expect(fakeRegistry.__cronostar_patched__).toBe(true);
  });

  it("periodically scans shadow roots", () => {
    const div = document.createElement("div");
    const shadow = div.attachShadow({ mode: "open" });
    shadow.customElements = {
      define: vi.fn(),
      get: vi.fn(),
    };
    document.body.appendChild(div);
    vi.advanceTimersByTime(500);
    expect(shadow.customElements.__cronostar_patched__).toBe(true);
    document.body.removeChild(div);
  });

  it("handles global property access errors during scanning", () => {
    Object.defineProperty(window, "errorProneRegistry", {
      get: () => {
        throw new Error("Oops");
      },
      configurable: true,
    });
    vi.advanceTimersByTime(500);
    delete window.errorProneRegistry;
  });

  it("handles shadowRoot access errors during scanning", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    Object.defineProperty(div, "shadowRoot", {
      get: () => {
        throw new Error("Shadow error");
      },
      configurable: true,
    });
    vi.advanceTimersByTime(500);
    document.body.removeChild(div);
  });

  it("stops scanning after 30 iterations", () => {
    vi.advanceTimersByTime(31 * 500);
    expect(console.log).toHaveBeenCalledWith(
      "CRONOSTAR: Scansione registry completata",
    );
  });

  it("logs registry patching", () => {
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Registry patchato"),
    );
  });

  it("logs final initialization message", () => {
    expect(console.log).toHaveBeenCalledWith(
      "CRONOSTAR: Guard ultra-aggressivo inizializzato",
    );
  });

  it("covers scan branch where object is non-patchable and skipped (line 55)", () => {
    window.nonRegistry = { define: "nope", get: () => {} };
    vi.advanceTimersByTime(500);
    expect(window.nonRegistry.__cronostar_patched__).toBeUndefined();
    delete window.nonRegistry;
  });
});
