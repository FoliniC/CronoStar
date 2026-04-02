// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step4Automation } from "../src/editor/steps/Step4Automation.js";

// Mock lit
vi.mock("lit", () => ({
  html: (strings, ...values) => {
    return { 
      strings, 
      values, 
      __litHtml: true, 
      toString: () => {
        let result = "";
        strings.forEach((s, i) => {
          result += s;
          if (i < values.length) {
            const v = values[i];
            if (v && v.__litHtml) result += v.toString();
            else if (typeof v === 'function') result += "[FUNC]";
            else result += String(v ?? "");
          }
        });
        return result;
      } 
    };
  },
}));

// FIXED Mock path
vi.mock("../src/editor/yaml/yaml_generators.js", () => ({
  buildAutomationTemplate: vi.fn(() => "mock-yaml")
}));

describe("Step4Automation", () => {
  let editor;
  let step;

  beforeEach(() => {
    vi.clearAllMocks();
    editor = {
      _automationYaml: "",
      _config: { global_prefix: "p_", target_entity: "climate.x" },
      _language: "en",
      i18n: { _t: vi.fn(k => k) },
      requestUpdate: vi.fn(),
      serviceHandlers: { copyToClipboard: vi.fn() }
    };
    step = new Step4Automation(editor);
  });

  it("renders default view in EN", () => {
    const res = step.render();
    expect(res.toString()).toContain("CronoStar automatically applies the schedule!");
    expect(res.toString()).toContain("mock-yaml");
  });

  it("renders default view in IT", () => {
    editor._language = "it";
    const res = step.render();
    expect(res.toString()).toContain("CronoStar applica automaticamente la pianificazione!");
  });

  it("toggles LLM prompt view", () => {
    let res = step.render();
    // Generate AI Prompt is usually the last button
    const funcs = res.values.filter(v => typeof v === "function");
    const toggleFunc = funcs[1]; // 0 is copy, 1 is toggle
    toggleFunc();
    expect(editor._showLlmPrompt).toBe(true);
    expect(editor.requestUpdate).toHaveBeenCalled();

    // Now render LLM view
    res = step.render();
    expect(res.toString()).toContain("AI Assistant Prompt");
    expect(res.toString()).toContain("Act as a Home Assistant expert");
  });

  it("renders LLM prompt view in IT", () => {
    editor._showLlmPrompt = true;
    editor._language = "it";
    const res = step.render();
    expect(res.toString()).toContain("Prompt per AI Assistant");
    expect(res.toString()).toContain("Agisci come un esperto di Home Assistant");
  });

  it("handles copy to clipboard in both views", () => {
    // Default view copy
    const res1 = step.render();
    const copyFunc1 = res1.values.find(v => typeof v === "function");
    copyFunc1();
    expect(editor.serviceHandlers.copyToClipboard).toHaveBeenCalledWith("mock-yaml", expect.any(String), expect.any(String));

    // LLM view copy
    editor._showLlmPrompt = true;
    const res2 = step.render();
    const allFuncs = [];
    const findFuncs = (node) => {
      if (node.values) node.values.forEach(v => {
        if (typeof v === 'function') allFuncs.push(v);
        else if (v && v.__litHtml) findFuncs(v);
      });
    };
    findFuncs(res2);
    // In _renderLlmPromptView, 0 is Back, 1 is Copy
    allFuncs[1]();
    expect(editor.serviceHandlers.copyToClipboard).toHaveBeenCalledTimes(2);
  });
});
