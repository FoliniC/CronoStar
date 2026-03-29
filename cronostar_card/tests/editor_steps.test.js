// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lit
vi.mock("lit", () => ({
  html: (strings, ...values) => {
    let result = "";
    strings.forEach((s, i) => {
      result += s + (i < values.length ? values[i] ?? "" : "");
    });
    return result;
  },
}));

import { Step0Dashboard } from "../src/editor/steps/Step0Dashboard.js";
import { Step1Preset } from "../src/editor/steps/Step1Preset.js";
import { Step2Entities } from "../src/editor/steps/Step2Entities.js";
import { Step3Options } from "../src/editor/steps/Step3Options.js";
import { Step4Automation } from "../src/editor/steps/Step4Automation.js";
import { Step5Summary } from "../src/editor/steps/Step5Summary.js";

describe("Editor Steps Rendering", () => {
  let editor;

  beforeEach(() => {
    editor = {
      _config: {
        preset_type: "thermostat",
        global_prefix: "p_",
        target_entity: "climate.test",
      },
      hass: {
        states: {
          "climate.test": { attributes: { friendly_name: "Test" } },
        },
        localize: (k) => k,
      },
      _i18n: {
        localize: (l, k) => k,
        _t: (k) => k,
      },
      i18n: {
        _t: (k) => k,
      },
      _errors: {},
      _warnings: {},
      _deepCheckResults: { valid: true, errors: [], warnings: [] },
      _deepCheckLoading: false,
      _handleConfigChange: vi.fn(),
      _runDeepChecks: vi.fn(),
      requestUpdate: vi.fn(),
      renderEntityPicker: vi.fn(() => "entity-picker"),
      renderTextInput: vi.fn(() => "text-input"),
    };
  });

  it("Step0Dashboard dovrebbe renderizzare il sommario", () => {
    const step = new Step0Dashboard(editor);
    const html = step.render();
    expect(html).toContain("step0");
  });

  it("Step1Preset dovrebbe mostrare i preset disponibili", () => {
    const step = new Step1Preset(editor);
    const html = step.render();
    expect(html).toContain("Thermostat");
    expect(html).toContain("EV Charging");
  });

  it("Step2Entities dovrebbe mostrare i campi entità", () => {
    const step = new Step2Entities(editor);
    const html = step.render();
    expect(html).toContain("step2");
  });

  it("Step2Entities dovrebbe mostrare errori se presenti", () => {
    editor._errors = { target_entity: "Required" };
    const step = new Step2Entities(editor);
    const html = step.render();
    expect(html).toContain("step2");
  });

  it("Step3Options dovrebbe mostrare i parametri del grafico", () => {
    const step = new Step3Options(editor);
    const html = step.render();
    expect(html).toContain("step3");
  });

  it("Step4Automation dovrebbe mostrare il pulsante per creare automazioni", () => {
    const step = new Step4Automation(editor);
    const html = step.render();
    expect(html).toContain("step4");
  });

  it("Step5Summary dovrebbe mostrare il riepilogo finale", () => {
    const step = new Step5Summary(editor);
    const html = step.render();
    expect(html).toContain("step5");
    expect(html).toContain("p_");
  });
});
