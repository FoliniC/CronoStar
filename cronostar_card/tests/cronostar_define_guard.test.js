// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class MockRegistry {
  constructor() {
    this.elements = new Map();
    this.__cronostar_patched__ = false;
  }
  define(name, constructor) {
    if (name === "throw-already-used") throw new Error("already been used");
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

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    originalRegistry = window.CustomElementRegistry;
    
    // Clear the document body to avoid issues with querySelectorAll during scans
    document.body.innerHTML = "";
    
    window.CustomElementRegistry = MockRegistry;
    
    // Mock customElements
    window.customElements = new MockRegistry();

    // Mock dei componenti globali
    window.CronoStarCard = class extends HTMLElement {};
    window.CronoStarEditor = class extends HTMLElement {};
    
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Import the guard - it executes automatically because it's an IIFE
    await import("../src/core/cronostar_define_guard.js");
  });

  afterEach(() => {
    window.CustomElementRegistry = originalRegistry;
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
    
    // Test unexpected error in get
    expect(registry.get("throw-error-get")).toBeUndefined();
  });
  
  it("dovrebbe fallback al registro globale se l'istanza è diversa", () => {
    const globalRegistry = window.customElements;
    const anotherRegistry = new window.CustomElementRegistry();
    globalRegistry.define("ha-icon", class extends HTMLElement {});
    expect(anotherRegistry.get("ha-icon")).toBe(globalRegistry.get("ha-icon"));
  });

  it("dovrebbe gestire define() evitando doppie registrazioni", () => {
    const registry = window.customElements;
    const myConstructor = class extends HTMLElement {};
    registry.define("my-el", myConstructor);
    registry.define("my-el", class extends HTMLElement {});
    expect(registry.get("my-el")).toBe(myConstructor);
  });
  
  it("dovrebbe gestire errori ignorabili in define", () => {
    const registry = window.customElements;
    const c1 = class extends HTMLElement {};
    expect(() => registry.define("throw-already-used", c1)).not.toThrow();
  });

  it("dovrebbe rilanciare errori inaspettati in define", () => {
    const registry = window.customElements;
    expect(() => registry.define("throw-error", class {})).toThrow("Unexpected define error");
  });

  it("dovrebbe auto-registrare i componenti dopo un delay", () => {
    const registry = new window.CustomElementRegistry();
    registry.elements.delete("cronostar-card");
    vi.advanceTimersByTime(10);
    expect(registry.get("cronostar-card")).toBe(window.CronoStarCard);
  });
  
  it("dovrebbe scansionare periodicamente nuovi registry", () => {
    const fakeRegistry = {
        define: vi.fn(),
        get: vi.fn()
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
        get: vi.fn()
    };
    document.body.appendChild(div);
    vi.advanceTimersByTime(500);
    expect(shadow.customElements.__cronostar_patched__).toBe(true);
    document.body.removeChild(div);
  });
  
  it("dovrebbe gestire errori nel loop di scansione", () => {
    Object.defineProperty(window, "errorProneRegistry", {
        get: () => { throw new Error("Oops"); },
        configurable: true
    });
    vi.advanceTimersByTime(500);
    delete window.errorProneRegistry;
  });
  
  it("dovrebbe gestire errori nell'accesso agli shadow root", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      Object.defineProperty(div, "shadowRoot", {
          get: () => { throw new Error("Shadow error"); },
          configurable: true
      });
      vi.advanceTimersByTime(500);
      document.body.removeChild(div);
  });

  it("dovrebbe smettere di scansionare dopo 30 iterazioni", () => {
    vi.advanceTimersByTime(31 * 500);
    expect(console.log).toHaveBeenCalledWith("CRONOSTAR: Scansione registry completata");
  });
});
