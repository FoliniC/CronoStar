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
            else if (typeof v === "function") result += "[FUNC]";
            else result += String(v ?? "");
          }
        });
        return result;
      }
    };
  },
}));

vi.mock("../src/editor/yaml/yaml_generators.js", () => ({
  buildAutomationTemplate: vi.fn(() => "mock-yaml")
}));

function collectFunctions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => collectFunctions(item, out));
    return out;
  }
  if (node.__litHtml) {
    node.values.forEach((v) => {
      if (typeof v === "function") out.push(v);
      else if (v && typeof v === "object") collectFunctions(v, out);
    });
  }
  return out;
}

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

  it("renders default view using provided automation yaml when available", () => {
    editor._automationYaml = "provided-yaml";
    const res = step.render();
    expect(res.toString()).toContain("provided-yaml");
  });

  it("renders default view in IT", () => {
    editor._language = "it";
    const res = step.render();
    expect(res.toString()).toContain("CronoStar applica automaticamente la pianificazione!");
  });

  it("toggles LLM prompt view", () => {
    let res = step.render();
    const funcs = collectFunctions(res);
    const toggleFunc = funcs[1];
    toggleFunc();
    expect(editor._showLlmPrompt).toBe(true);
    expect(editor.requestUpdate).toHaveBeenCalled();

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

  it("renders LLM prompt with fallback values when config is sparse", () => {
    editor._showLlmPrompt = true;
    editor._config = {};
    const res = step.render();
    const text = res.toString();
    expect(text).toContain("your_entity");
    expect(text).toContain("thermostat");
    expect(text).toContain("cronostar_");
  });

  it("handles copy to clipboard in default view", () => {
    const res = step.render();
    const funcs = collectFunctions(res);
    const copyFunc = funcs[0];
    copyFunc();
    expect(editor.serviceHandlers.copyToClipboard).toHaveBeenCalledWith("mock-yaml", expect.any(String), expect.any(String));
  });

  it("handles back and copy in LLM view", () => {
    editor._showLlmPrompt = true;
    const res = step.render();
    const funcs = collectFunctions(res);

    funcs[0]();
    expect(editor._showLlmPrompt).toBe(false);

    editor._showLlmPrompt = true;
    const res2 = step.render();
    const funcs2 = collectFunctions(res2);
    funcs2[1]();
    expect(editor.serviceHandlers.copyToClipboard).toHaveBeenCalledTimes(1);
  });
});
