// tests/setup.js – CronoStar test bootstrap
import { vi } from "vitest";

// ─── ResizeObserver ───────────────────────────────────────────────────────────
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;

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
    measureText: vi.fn(() => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })),
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
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
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

// ─── Custom Elements ─────────────────────────────────────────────────────────
// Registra elementi stub per impedire "Invalid constructor" quando il codice sorgente
// chiama customElements.define() o quando i test istanziano componenti Lit.
const registerStub = (name) => {
  if (!customElements.get(name)) {
    try {
      customElements.define(
        name,
        class extends HTMLElement {
          connectedCallback() {}
          disconnectedCallback() {}
          attributeChangedCallback() {}
        },
      );
    } catch {
      /* già registrato o errore non bloccante */
    }
  }
};

[
  // Componenti CronoStar
  "cronostar-card",
  "cronostar-card-editor",
  // Componenti Home Assistant
  "ha-card",
  "ha-icon",
  "ha-icon-button",
  "ha-switch",
  "ha-select",
  "ha-circular-progress",
  "ha-dialog",
  // MWC / MDC
  "mwc-button",
  "mwc-list-item",
  // Contesti editor HA (usati in checkIsEditorContext)
  "hui-card-preview",
  "hui-card-editor",
  "hui-dialog-edit-card",
  "hui-edit-view",
  "hui-edit-card",
  "hui-card-options",
  // Contesti history chart (usati in _isInHistoryContext)
  "state-history-chart-timeline",
  "ha-chart-base",
  "hui-history-graph-card",
].forEach(registerStub);

// ─── window.confirm / window.alert ───────────────────────────────────────────
// jsdom non implementa questi; li stub-iamo per default a false/noop
if (typeof window !== "undefined") {
  window.confirm = window.confirm ?? vi.fn(() => false);
  window.alert = window.alert ?? vi.fn();
}
