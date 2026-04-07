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

  it("dovrebbe intercettare il costruttore di CustomElementRegistry", () => {
    expect(window.CustomElementRegistry).not.toBe(originalRegistry);
    const newRegistry = new window.CustomElementRegistry();
    expect(newRegistry.__cronostar_patched__).toBe(true);
  });

  it("dovrebbe patchare il registro globale customElements", () => {
    expect(window.customElements.__cronostar_patched__).toBe(true);
  });

  it("dovrebbe fornire fallback nel metodo get()", () => {
    const registry = window.customElements;
    expect(registry.get("cronostar-card")).toBe(window.CronoStarCard);
    expect(registry.get("cronostar-card-editor")).toBe(window.CronoStarEditor);

    expect(registry.get("throw-error-get")).toBeUndefined();
  });

  it("dovrebbe fallback al registro globale se l'istanza è diversa", () => {
    const globalRegistry = window.customElements;
    const anotherRegistry = new window.CustomElementRegistry();
    globalRegistry.define("ha-icon", class extends HTMLElement {});
    expect(anotherRegistry.get("ha-icon")).toBe(globalRegistry.get("ha-icon"));
  });

  it("dovrebbe restituire undefined se global customElements è this stesso", () => {
    const registry = window.customElements;
    expect(registry.get("unknown-el")).toBeUndefined();
  });

  it("dovrebbe gestire define() evitando doppie registrazioni", () => {
    const registry = window.customElements;
    const myConstructor = class extends HTMLElement {};
    registry.define("my-el", myConstructor);
    registry.define("my-el", class extends HTMLElement {});
    expect(registry.get("my-el")).toBe(myConstructor);
  });

  it("dovrebbe gestire existing === constructor nel define", () => {
    const registry = window.customElements;
    const ctor = class extends HTMLElement {};
    registry.define("same-el", ctor);
    expect(() => registry.define("same-el", ctor)).not.toThrow();
  });

  it("dovrebbe loggare warning quando existing è diverso", () => {
    const registry = window.customElements;
    registry.define("dup-el", class extends HTMLElement {});
    registry.define("dup-el", class extends HTMLElement {});
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("already defined"),
    );
  });

  it("dovrebbe gestire errori ignorabili in define", () => {
    const registry = window.customElements;
    const c1 = class extends HTMLElement {};
    expect(() => registry.define("throw-already-used", c1)).not.toThrow();
  });

  it("dovrebbe gestire anche 'already defined' come errore ignorabile", () => {
    const registry = window.customElements;
    expect(() =>
      registry.define("throw-already-defined", class extends HTMLElement {}),
    ).not.toThrow();
  });

  it("dovrebbe rilanciare errori inaspettati in define", () => {
    const registry = window.customElements;
    expect(() => registry.define("throw-error", class {})).toThrow(
      "Unexpected define error",
    );
  });

  it("dovrebbe auto-registrare i componenti dopo un delay", () => {
    const registry = new window.CustomElementRegistry();
    registry.elements.delete("cronostar-card");
    vi.advanceTimersByTime(10);
    expect(registry.get("cronostar-card")).toBe(window.CronoStarCard);
  });

  it("dovrebbe non auto-registrare se window.CronoStarCard/Editor mancano", () => {
    delete window.CronoStarCard;
    delete window.CronoStarEditor;
    const registry = new window.CustomElementRegistry();
    vi.advanceTimersByTime(10);
    expect(registry.elements.size).toBe(0);
  });

  it("dovrebbe gestire errori in auto-registrazione", () => {
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

  it("dovrebbe scansionare periodicamente nuovi registry", () => {
    const fakeRegistry = {
      define: vi.fn(),
      get: vi.fn(),
    };
    window.anotherRegistry = fakeRegistry;
    vi.advanceTimersByTime(500);
    expect(fakeRegistry.__cronostar_patched__).toBe(true);
  });

  it("dovrebbe scansionare i shadow root", () => {
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

  it("dovrebbe gestire errori nel loop di scansione", () => {
    Object.defineProperty(window, "errorProneRegistry", {
      get: () => {
        throw new Error("Oops");
      },
      configurable: true,
    });
    vi.advanceTimersByTime(500);
    delete window.errorProneRegistry;
  });

  it("dovrebbe gestire errori nell'accesso agli shadow root", () => {
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

  it("dovrebbe smettere di scansionare dopo 30 iterazioni", () => {
    vi.advanceTimersByTime(31 * 500);
    expect(console.log).toHaveBeenCalledWith(
      "CRONOSTAR: Scansione registry completata",
    );
  });

  it("dovrebbe loggare il patch del registry", () => {
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Registry patchato"),
    );
  });

  it("dovrebbe loggare il messaggio finale di init", () => {
    expect(console.log).toHaveBeenCalledWith(
      "CRONOSTAR: Guard ultra-aggressivo inizializzato",
    );
  });
});
