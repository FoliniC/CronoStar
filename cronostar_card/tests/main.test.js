// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
globalThis.window.customElements = globalThis.customElements;
if (!globalThis.document) {
  globalThis.document = { head: { innerHTML: "" } };
}

// ─── Mock main.js dependencies ────────────────────────────────────────
vi.mock("../src/core/CronoStar.js", () => ({
  CronoStarCard: class CronoStarCard extends HTMLElement {},
}));
vi.mock("../src/editor/CronoStarEditor.js", () => ({
  CronoStarEditor: class CronoStarEditor extends HTMLElement {},
}));
vi.mock("../src/config.js", () => ({
  VERSION: "TEST_VERSION",
  CARD_CONFIG_PRESETS: { thermostat: {} },
}));

async function loadMain() {
  return import("../src/main.js");
}

describe("main.js", () => {
  beforeEach(() => {
    vi.resetModules();

    delete window.CronoStarCard;
    delete window.CronoStarEditor;
    delete window.ScopedRegistryHost;
    delete globalThis.PRESETS;
    window.customCards = [];

    const registry = new Map();
    globalThis.customElements = {
      define: vi.fn((name, ctor) => registry.set(name, ctor)),
      get: vi.fn((name) => registry.get(name)),
    };
    window.customElements = globalThis.customElements;

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("global registration", () => {
    let getSpy, defineSpy;
    beforeEach(() => {
      getSpy = vi.spyOn(customElements, "get").mockReturnValue(null);
      defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("registers cronostar-card in the global registry", async () => {
      await loadMain();
      expect(defineSpy).toHaveBeenCalledWith("cronostar-card", expect.any(Function));
    });

    it("registers cronostar-card-editor in the global registry", async () => {
      await loadMain();
      expect(defineSpy).toHaveBeenCalledWith("cronostar-card-editor", expect.any(Function));
    });

    it("assigns CronoStarCard to window", async () => {
      await loadMain();
      expect(window.CronoStarCard).toBeDefined();
    });

    it("assigns CronoStarEditor to window", async () => {
      await loadMain();
      expect(window.CronoStarEditor).toBeDefined();
    });

    it("assigns PRESETS to globalThis", async () => {
      await loadMain();
      expect(globalThis.PRESETS).toEqual({ thermostat: {} });
    });

    it("exports CronoStarCard and CronoStarEditor", async () => {
      const mod = await loadMain();
      expect(mod.CronoStarCard).toBeDefined();
      expect(mod.CronoStarEditor).toBeDefined();
    });
  });

  describe("registerInRegistry – branch", () => {
    it("logs 'già registrato' and returns false if registry.get returns something", async () => {
      vi.spyOn(customElements, "define").mockImplementation(() => {});
      vi.spyOn(customElements, "get").mockImplementation((name) => {
        if (name === "cronostar-card" || name === "cronostar-card-editor") {
          return class {};
        }
        return null;
      });

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("già registrato")
      );
    });

    it("tries define even if registry.get throws exception", async () => {
      vi.spyOn(customElements, "get").mockImplementation(() => {
        throw new Error("get failed");
      });
      const defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});

      await loadMain();

      expect(defineSpy).toHaveBeenCalled();
    });

    it("define ok: logs '✅' and returns true", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("✅ \"cronostar-card\" registrato")
      );
    });

    it("define throws 'already been used': logs 'già definito'", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {
        throw new Error("already been used");
      });

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("già definito")
      );
    });

    it("define throws 'already defined': logs 'già definito'", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {
        throw new Error("This name has already defined");
      });

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("già definito")
      );
    });

    it("define throws generic error: calls console.error", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {
        throw new Error("generic unexpected error");
      });

      await loadMain();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("❌"),
        expect.any(Error),
      );
    });

    it("logs 'registry nullo' and returns false if customElements is null", async () => {
      vi.stubGlobal("customElements", null);

      await loadMain();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("registry nullo"),
      );
    });

    it("returns existing registration when customCards already contains legacy type", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});
      window.customCards = [{ type: "custom:cronostar-card", name: "legacy" }];

      await loadMain();

      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0].type).toBe("cronostar-card");
    });
  });

  describe("ScopedRegistryHost absent", () => {
    beforeEach(() => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("logs 'non rilevato' if ScopedRegistryHost does not exist", async () => {
      delete window.ScopedRegistryHost;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });

    it("logs 'non rilevato' if ScopedRegistryHost is null (falsy)", async () => {
      window.ScopedRegistryHost = null;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });

    it("logs 'non rilevato' if ScopedRegistryHost has no prototype", async () => {
      window.ScopedRegistryHost = Object.create(null);
      window.ScopedRegistryHost.prototype = null;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });
  });

  describe("ScopedRegistryHost present", () => {
    let getSpy, defineSpy;

    beforeEach(() => {
      getSpy = vi.spyOn(customElements, "get").mockReturnValue(null);
      defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    async function setupPatchedHost(scopedRegistry, tagName = "MOCK-HOST", origCB = undefined) {
      class MockHost {
        connectedCallback() {
          if (origCB) origCB();
        }
      }
      window.ScopedRegistryHost = MockHost;

      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.tagName = tagName;
      host.ownerDocument = null;

      if (scopedRegistry !== undefined) {
        host.renderRoot = { customElements: scopedRegistry };
      } else {
        host.renderRoot = null;
        host.shadowRoot = null;
      }

      return host;
    }

    it("logs 'ScopedRegistryHost rilevato'", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ScopedRegistryHost rilevato"),
      );
    });

    it("patches connectedCallback in the prototype", async () => {
      class MockHost { connectedCallback() {} }
      const original = MockHost.prototype.connectedCallback;
      window.ScopedRegistryHost = MockHost;
      await loadMain();
      expect(window.ScopedRegistryHost.prototype.connectedCallback).not.toBe(original);
      expect(typeof window.ScopedRegistryHost.prototype.connectedCallback).toBe("function");
    });

    it("registers cronostar-card in the scoped registry (different from global)", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalledWith("cronostar-card", expect.any(Function));
    });

    it("registers cronostar-card-editor in the scoped registry", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalledWith("cronostar-card-editor", expect.any(Function));
    });

    it("uses shadowRoot if renderRoot is null", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = { customElements: scopedReg };
      host.tagName = "MOCK";
      host.ownerDocument = null;

      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalledWith("cronostar-card", expect.any(Function));
    });

    it("uses ownerDocument.customElements if root.customElements is nullish", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = { customElements: null };
      host.shadowRoot = null;
      host.ownerDocument = { customElements: scopedReg };
      host.tagName = "MOCK";

      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalled();
    });

    it("DOES NOT register in scoped if registry === global customElements", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      defineSpy.mockClear();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      host.connectedCallback();
      expect(defineSpy).not.toHaveBeenCalled();
    });

    it("uses 'scoped(<tagname>)' in the log when tagName is defined", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg, "MY-HOST");
      host.connectedCallback();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("my-host"),
      );
    });

    it("uses 'scoped(unknown-host)' in the log when tagName is undefined", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg, undefined);
      host.tagName = undefined;
      host.connectedCallback();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("unknown-host"),
      );
    });

    it("registers ha-elements available globally in the scoped registry", async () => {
      const HaIcon = class extends HTMLElement {};
      getSpy.mockImplementation((name) => (name === "ha-icon" ? HaIcon : null));

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();

      expect(scopedReg.define).toHaveBeenCalledWith("ha-icon", HaIcon);
    });

    it("skips ha-elements not available globally", async () => {
      getSpy.mockReturnValue(null);

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();

      const names = scopedReg.define.mock.calls.map((c) => c[0]);
      expect(names.every((n) => !n.startsWith("ha-"))).toBe(true);
    });

    it("skips ha-elements when customElements.get throws exception in the patched callback", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      customElements.get.mockImplementation((name) => {
        if (name === "ha-icon") throw new Error("ha get failed");
        return null;
      });

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = { customElements: scopedReg };
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      expect(() => host.connectedCallback()).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("errore registrazione in scoped registry"),
        expect.any(Error),
      );
    });

    it("calls origConnected if it existed before patching", async () => {
      const origCB = vi.fn();
      class MockHost {
        connectedCallback() { origCB(); }
      }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      host.connectedCallback();
      expect(origCB).toHaveBeenCalled();
    });

    it("does not call origConnected if it was undefined in the prototype", async () => {
      class MockHost {}
      MockHost.prototype.connectedCallback = undefined;
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      expect(() => host.connectedCallback()).not.toThrow();
    });

    it("catches exceptions in the try block and calls console.error", async () => {
      class MockHost {
        connectedCallback() {}
      }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      Object.defineProperty(host, "renderRoot", {
        get() {
          throw new Error("render error");
        },
        configurable: true,
      });
      host.tagName = "MOCK";

      expect(() => host.connectedCallback()).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("errore registrazione in scoped registry"),
        expect.any(Error),
      );
    });

    it("uses global customElements when ownerDocument is missing", async () => {
      class MockHost {
        connectedCallback() {}
      }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = { customElements: undefined };
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      host.connectedCallback();
      expect(customElements.define).toHaveBeenCalled();
    });
  });

  describe("window.customCards", () => {
    beforeEach(() => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("adds the card if customCards is empty", async () => {
      window.customCards = [];
      await loadMain();
      expect(window.customCards.some((c) => c.type === "cronostar-card")).toBe(true);
    });

    it("the added card has the correct metadata", async () => {
      window.customCards = [];
      await loadMain();
      const card = window.customCards.find((c) => c.type === "cronostar-card");
      expect(card.name).toBe("🌟 CronoStar Card");
      expect(card.preview).toBe(true);
      expect(card.preview_image).toContain("cronostar-preview.png");
      expect(card.thumbnail).toContain("cronostar-logo.png");
    });

    it("updates existing card (type === 'cronostar-card')", async () => {
      window.customCards = [{ type: "cronostar-card", name: "old name" }];
      await loadMain();
      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0].name).toBe("🌟 CronoStar Card");
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Aggiornata"),
      );
    });

    it("updates existing card (type === 'custom:cronostar-card')", async () => {
      window.customCards = [{ type: "custom:cronostar-card", name: "legacy" }];
      await loadMain();
      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0].name).toBe("🌟 CronoStar Card");
    });

    it("initializes customCards if undefined", async () => {
      delete window.customCards;
      await loadMain();
      expect(Array.isArray(window.customCards)).toBe(true);
      expect(window.customCards.some((c) => c.type === "cronostar-card")).toBe(true);
    });

    it("logs '✅ Aggiunto' when the card is new", async () => {
      window.customCards = [];
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Aggiunto a window.customCards"),
      );
    });
  });
});
