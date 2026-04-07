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

// ─── Mock delle dipendenze di main.js ────────────────────────────────────────
// I path devono essere relativi al FILE DI TEST (tests/), non a main.js (src/)
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

// ─── Helper: importa main.js con cache pulita ─────────────────────────────────
// Deve essere chiamato all'interno di ogni test DOPO aver configurato i mock
// di customElements, ScopedRegistryHost ecc.
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

  // ─── Sezione 1: registrazione globale (customElements) ───────────────────────
  describe("registrazione globale", () => {
    let getSpy, defineSpy;
    beforeEach(() => {
      getSpy = vi.spyOn(customElements, "get").mockReturnValue(null);
      defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("registra cronostar-card nel registro globale", async () => {
      await loadMain();
      expect(defineSpy).toHaveBeenCalledWith("cronostar-card", expect.any(Function));
    });

    it("registra cronostar-card-editor nel registro globale", async () => {
      await loadMain();
      expect(defineSpy).toHaveBeenCalledWith("cronostar-card-editor", expect.any(Function));
    });

    it("assegna CronoStarCard a window", async () => {
      await loadMain();
      expect(window.CronoStarCard).toBeDefined();
    });

    it("assegna CronoStarEditor a window", async () => {
      await loadMain();
      expect(window.CronoStarEditor).toBeDefined();
    });

    it("assegna PRESETS a globalThis", async () => {
      await loadMain();
      expect(globalThis.PRESETS).toEqual({ thermostat: {} });
    });

    it("esporta CronoStarCard e CronoStarEditor", async () => {
      const mod = await loadMain();
      expect(mod.CronoStarCard).toBeDefined();
      expect(mod.CronoStarEditor).toBeDefined();
    });
  });

  // ─── Sezione 2: branch di registerInRegistry ──────────────────────────────
  describe("registerInRegistry – branch", () => {
    it("log 'già registrato' e ritorna false se registry.get restituisce qualcosa", async () => {
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

    it("tenta define anche se registry.get lancia eccezione", async () => {
      vi.spyOn(customElements, "get").mockImplementation(() => {
        throw new Error("get failed");
      });
      const defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});

      await loadMain();

      expect(defineSpy).toHaveBeenCalled();
    });

    it("define ok: logga '✅' e ritorna true", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("✅ \"cronostar-card\" registrato")
      );
    });

    it("define lancia 'already been used': logga 'già definito'", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {
        throw new Error("already been used");
      });

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("già definito")
      );
    });

    it("define lancia 'already defined': logga 'già definito'", async () => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {
        throw new Error("This name has already defined");
      });

      await loadMain();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("già definito")
      );
    });

    it("define lancia errore generico: chiama console.error", async () => {
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

    it("log 'registry nullo' e ritorna false se customElements è null", async () => {
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

  // ─── Sezione 3: ScopedRegistryHost assente ────────────────────────────────
  describe("ScopedRegistryHost assente", () => {
    beforeEach(() => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("logga 'non rilevato' se ScopedRegistryHost non esiste", async () => {
      delete window.ScopedRegistryHost;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });

    it("logga 'non rilevato' se ScopedRegistryHost è null (falsy)", async () => {
      window.ScopedRegistryHost = null;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });

    it("logga 'non rilevato' se ScopedRegistryHost non ha prototype", async () => {
      window.ScopedRegistryHost = Object.create(null); // oggetto senza prototype
      window.ScopedRegistryHost.prototype = null;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("non rilevato"),
      );
    });
  });

  // ─── Sezione 4: ScopedRegistryHost presente – patch del prototype ─────────
  describe("ScopedRegistryHost presente", () => {
    let getSpy, defineSpy;

    beforeEach(() => {
      getSpy = vi.spyOn(customElements, "get").mockReturnValue(null);
      defineSpy = vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    // ── Helper: crea host con prototype patchato da main.js ──────────────────
    async function setupPatchedHost(scopedRegistry, tagName = "MOCK-HOST", origCB = undefined) {
      class MockHost {
        connectedCallback() {
          if (origCB) origCB();
        }
      }
      if (!origCB) {
        // connectedCallback vuota (fa nulla)
      }
      window.ScopedRegistryHost = MockHost;

      await loadMain();

      // Crea host usando il prototype PATCHATO da main.js, non createElement
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

    it("logga 'ScopedRegistryHost rilevato'", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ScopedRegistryHost rilevato"),
      );
    });

    it("patcha connectedCallback nel prototype", async () => {
      class MockHost { connectedCallback() {} }
      const original = MockHost.prototype.connectedCallback;
      window.ScopedRegistryHost = MockHost;
      await loadMain();
      // Il prototype è stato rimpiazzato
      expect(window.ScopedRegistryHost.prototype.connectedCallback).not.toBe(original);
      expect(typeof window.ScopedRegistryHost.prototype.connectedCallback).toBe("function");
    });

    it("registra cronostar-card nel scoped registry (diverso dal globale)", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalledWith("cronostar-card", expect.any(Function));
    });

    it("registra cronostar-card-editor nel scoped registry", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalledWith("cronostar-card-editor", expect.any(Function));
    });

    it("usa shadowRoot se renderRoot è null", async () => {
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

    it("usa ownerDocument.customElements se root.customElements è nullish", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = { customElements: null }; // null → fallback
      host.shadowRoot = null;
      host.ownerDocument = { customElements: scopedReg };
      host.tagName = "MOCK";

      host.connectedCallback();
      expect(scopedReg.define).toHaveBeenCalled();
    });

    it("NON registra nel scoped se registry === customElements globale", async () => {
      class MockHost { connectedCallback() {} }
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      defineSpy.mockClear();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = null;
      host.ownerDocument = null; // → customElements (globale)
      host.tagName = "MOCK";

      host.connectedCallback();
      // registry === customElements → il blocco if è false → niente registrazione
      expect(defineSpy).not.toHaveBeenCalled();
    });

    it("usa 'scoped(<tagname>)' nel log quando tagName è definito", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg, "MY-HOST");
      host.connectedCallback();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("my-host"),
      );
    });

    it("usa 'scoped(unknown-host)' nel log quando tagName è undefined", async () => {
      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg, undefined);
      host.tagName = undefined; // override esplicito
      host.connectedCallback();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("unknown-host"),
      );
    });

    it("registra ha-elements disponibili globalmente nel scoped registry", async () => {
      const HaIcon = class extends HTMLElement {};
      getSpy.mockImplementation((name) => (name === "ha-icon" ? HaIcon : null));

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();

      expect(scopedReg.define).toHaveBeenCalledWith("ha-icon", HaIcon);
    });

    it("salta ha-elements non disponibili globalmente", async () => {
      getSpy.mockReturnValue(null); // nessun ha-element disponibile

      const scopedReg = { get: vi.fn(() => null), define: vi.fn() };
      const host = await setupPatchedHost(scopedReg);
      host.connectedCallback();

      const names = scopedReg.define.mock.calls.map((c) => c[0]);
      expect(names.every((n) => !n.startsWith("ha-"))).toBe(true);
    });

    it("chiama origConnected se esisteva prima del patch", async () => {
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

    it("non chiama origConnected se era undefined nel prototype", async () => {
      class MockHost {}
      // Forza connectedCallback undefined sul prototype prima del patch
      MockHost.prototype.connectedCallback = undefined;
      window.ScopedRegistryHost = MockHost;
      await loadMain();

      const host = Object.create(window.ScopedRegistryHost.prototype);
      host.renderRoot = null;
      host.shadowRoot = null;
      host.ownerDocument = null;
      host.tagName = "MOCK";

      // Non deve lanciare "origConnected is not a function"
      expect(() => host.connectedCallback()).not.toThrow();
    });

    it("cattura eccezioni nel try block e chiama console.error", async () => {
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

  // ─── Sezione 5: window.customCards ───────────────────────────────────────
  describe("window.customCards", () => {
    beforeEach(() => {
      vi.spyOn(customElements, "get").mockReturnValue(null);
      vi.spyOn(customElements, "define").mockImplementation(() => {});
    });

    it("aggiunge la card se customCards è vuoto", async () => {
      window.customCards = [];
      await loadMain();
      expect(window.customCards.some((c) => c.type === "cronostar-card")).toBe(true);
    });

    it("la card aggiunta ha i metadati corretti", async () => {
      window.customCards = [];
      await loadMain();
      const card = window.customCards.find((c) => c.type === "cronostar-card");
      expect(card.name).toBe("🌟 CronoStar Card");
      expect(card.preview).toBe(true);
      expect(card.preview_image).toContain("cronostar-preview.png");
      expect(card.thumbnail).toContain("cronostar-logo.png");
    });

    it("aggiorna la card esistente (type === 'cronostar-card')", async () => {
      window.customCards = [{ type: "cronostar-card", name: "old name" }];
      await loadMain();
      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0].name).toBe("🌟 CronoStar Card");
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Aggiornata"),
      );
    });

    it("aggiorna la card esistente (type === 'custom:cronostar-card')", async () => {
      window.customCards = [{ type: "custom:cronostar-card", name: "legacy" }];
      await loadMain();
      expect(window.customCards).toHaveLength(1);
      expect(window.customCards[0].name).toBe("🌟 CronoStar Card");
    });

    it("inizializza customCards se undefined", async () => {
      delete window.customCards;
      await loadMain();
      expect(Array.isArray(window.customCards)).toBe(true);
      expect(window.customCards.some((c) => c.type === "cronostar-card")).toBe(true);
    });

    it("logga '✅ Aggiunto' quando la card è nuova", async () => {
      window.customCards = [];
      await loadMain();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Aggiunto a window.customCards"),
      );
    });
  });
});
