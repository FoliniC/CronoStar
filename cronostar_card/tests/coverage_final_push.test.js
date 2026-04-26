// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---
vi.mock("lit", async () => {
  const actual = await vi.importActual("lit");
  return { 
    ...actual, 
    css: (s) => s,
    html: (strings, ...values) => ({ 
      strings, 
      values, 
      __litHtml: true, 
      toString: () => {
        let res = "";
        strings.forEach((s, i) => {
          res += s;
          if (i < values.length) {
            const v = values[i];
            if (typeof v === 'function') res += "[FUNC]";
            else res += String(v ?? "");
          }
        });
        return res;
      }
    })
  };
});

vi.mock("../src/styles.js", () => ({ cardStyles: "" }));
vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual("../src/config.js");
  return {
    ...actual,
    VERSION: "6.8.6",
    extractCardConfig: vi.fn((c) => c),
    validateConfig: vi.fn((c) => c),
  };
});

// Mock Logger
vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return {
    ...actual,
    Logger: {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setEnabled: vi.fn(),
      load: vi.fn(),
    },
    checkIsEditorContext: vi.fn(() => false),
  };
});

import { CronoStarCard } from "../src/core/CronoStar.js";
import { CardLifecycle } from "../src/core/CardLifecycle.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";
import { Logger } from "../src/utils.js";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Final Coverage Push - CronoStar.js", () => {
  let card;
  beforeEach(() => {
    const tag = `card-${Math.random().toString(36).slice(2)}`;
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends CronoStarCard {});
    }
    card = document.createElement(tag);
    Object.defineProperty(card, "updateComplete", {
      get: () => Promise.resolve(true),
      configurable: true,
    });
    card.eventHandlers = {
      showNotification: vi.fn(),
    };
    card.cardLifecycle = {
      setConfig: vi.fn(),
      updated: vi.fn(),
      setHass: vi.fn(),
      connectedCallback: vi.fn(),
      disconnectedCallback: vi.fn(),
      firstUpdated: vi.fn(),
      reinitializeCard: vi.fn(),
      _hass: { states: {}, callService: vi.fn(), fireEvent: vi.fn() }
    };
    card.attachShadow({ mode: "open" });
    
    card.chartManager = {
      isInitialized: vi.fn(() => true),
      resize: vi.fn(),
      chart: { update: vi.fn(), resize: vi.fn() }
    };
  });

  it("covers setConfig initially_collapsed and catch block", () => {
    card.setConfig({ initially_collapsed: true });
    expect(card._showChart).toBe(false);

    card.cardLifecycle.setConfig.mockImplementation(() => { throw new Error("mock error"); });
    card.setConfig({ some: "config" });
    expect(card.eventHandlers.showNotification).toHaveBeenCalled();
  });

  it("covers updated() chartManager branches", async () => {
    card.chartManager.resize = null; 
    card._showChart = true;
    card.updated(new Map([["_showChart", false]]));
    await flushPromises();
    await flushPromises();
    expect(card.chartManager.chart.resize).toHaveBeenCalled();

    card.chartManager.isInitialized.mockReturnValue(false);
    card.updated(new Map([["_showChart", false]]));
    await flushPromises();
    await flushPromises();
    expect(card.cardLifecycle.reinitializeCard).toHaveBeenCalled();
  });

  it("covers disconnectedCallback window listener removal", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    card._handleWizardDoneGlobal = () => {};
    card.disconnectedCallback();
    expect(spy).toHaveBeenCalledWith("cronostar-wizard-done", card._handleWizardDoneGlobal);
  });

  it("covers toggleChart resize on chart", async () => {
    card.chartManager.resize = null;
    vi.spyOn(card, "_deepQuerySelector").mockReturnValue(document.createElement("div"));
    
    card._showChart = false;
    await card.toggleChart();
    expect(card.chartManager.chart.resize).toHaveBeenCalled();
  });
});

describe("Final Coverage Push - CardLifecycle.js", () => {
  let card, lifecycle;
  beforeEach(() => {
    card = {
      config: { global_prefix: "p_", view_mode: "admin" },
      _showChart: true,
      requestUpdate: vi.fn(),
      chartManager: { 
        isInitialized: vi.fn(() => true), 
        resize: vi.fn(), 
        update: vi.fn(),
        updateData: vi.fn(),
        chart: { resize: vi.fn() }
      },
      entityStates: {},
      profileManager: { loadProfile: vi.fn().mockResolvedValue() },
      cardSync: { updateAutomationSync: vi.fn() },
      stateManager: { setData: vi.fn() },
      cronostarReady: true,
      initialLoadComplete: true,
      _cardConnected: true
    };
    lifecycle = new CardLifecycle(card);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers syncChartVisibility non-admin and skipSync", () => {
    card.config.view_mode = "user";
    card._showChart = false;
    lifecycle.setHass({ states: {}, connection: { status: "connected" } });
    expect(card._showChart).toBe(true);
    vi.advanceTimersByTime(100);
    expect(card.chartManager.resize).toHaveBeenCalled();

    card.config.view_mode = "admin";
    card.config.initially_collapsed = true;
    card._manualToggleDone = false;
    card._showChart = false;
    lifecycle.setHass({ 
      states: { "input_boolean.p_show_chart": { state: "on" } },
      connection: { status: "connected" }
    });
    expect(card._showChart).toBe(false);
    
    // To hit the chart.resize() fallback, we need skipSync = false
    card.config.initially_collapsed = false; // Disable skipSync
    card.chartManager.resize = null;
    card._showChart = false;
    lifecycle.setHass({ 
        states: { "input_boolean.p_show_chart": { state: "on" } },
        connection: { status: "connected" }
    });
    vi.advanceTimersByTime(100);
    expect(card.chartManager.chart.resize).toHaveBeenCalled();
  });

  it("covers registerCard profile options fallback", async () => {
    card.profileOptions = [];
    card.stateManager = { setData: vi.fn() };
    card.config = { global_prefix: "p_", target_entity: "c.x" };
    const mockHass = { 
      callWS: vi.fn().mockResolvedValue({ 
        response: {
          available_profiles: ["P1", "P2"],
          entity_states: {}
        }
      }) 
    };
    await lifecycle.registerCard(mockHass);
    expect(card.profileOptions).toEqual(["P1", "P2"]);
  });
});
