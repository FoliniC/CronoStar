// tests/setup.js – CronoStar test bootstrap
import { vi } from "vitest";

// ─── ResizeObserver ───────────────────────────────────────────────────────────
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;

// ─── Ensure window/customElements exist in all test environments ─────────────
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

if (typeof globalThis.customElements === "undefined") {
  const registry = new Map();
  globalThis.customElements = {
    define: vi.fn((name, ctor) => {
      if (!registry.has(name)) {
        registry.set(name, ctor);
      }
    }),
    get: vi.fn((name) => registry.get(name)),
  };
}

if (typeof globalThis.window.customElements === "undefined") {
  globalThis.window.customElements = globalThis.customElements;
}

// ─── Canvas (Chart.js needs all of these) ─────────────────────────────────────
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    measureText: vi.fn(() => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    transform: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    canvas: { width: 300, height: 150 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    lineDashOffset: 0,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "ltr",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: "rgba(0,0,0,0)",
  });
}

// ─── Custom Elements ─────────────────────────────────────────────────