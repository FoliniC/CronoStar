// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function createTestDocument() {
  const createElement = (tagName) => {
    const element = {
      tagName: String(tagName || "").toUpperCase(),
      style: {},
      children: [],
      parentElement: null,
      isConnected: true,
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 300,
        height: 150,
      })),
    };
    return element;
  };

  return {
    createElement,
    head: { innerHTML: "" },
  };
}

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.window.addEventListener) globalThis.window.addEventListener = vi.fn();
if (!globalThis.window.removeEventListener) globalThis.window.removeEventListener = vi.fn();
if (!globalThis.document) {
  globalThis.document = createTestDocument();
} else {
  if (!globalThis.document.createElement)
    globalThis.document.createElement = createTestDocument().createElement;
  if (!globalThis.document.head) globalThis.document.head = { innerHTML: "" };
}
if (!globalThis.customElements) {
  const registry = new Map();
  globalThis.customElements = {
    define: vi.fn((name, ctor) => registry.set(name, ctor)),
    get: vi.fn((name) => registry.get(name)),
  };
}
globalThis.window.customElements = globalThis.customElements;

describe("chart_manager.test placeholder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // no-op
  });

  it("sanity check", () => {
    expect(globalThis.window).toBeDefined();
    expect(globalThis.document).toBeDefined();
    expect(globalThis.customElements).toBeDefined();
  });
});
