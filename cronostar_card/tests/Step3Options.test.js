// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step3Options } from "../src/editor/steps/Step3Options.js";
import { EditorI18n } from "../src/editor/EditorI18n.js";

function collectFunctions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => collectFunctions(item, out));
    return out;
  }
  if (node.values) {
    node.values.forEach((v) => {
      if (typeof v === "function") out.push(v);
      else if (v && typeof v === "object") collectFunctions(v, out);
    });
  }
  return out;
}

describe("Step3Options", () => {
  let step;
  let mockEditor;

  beforeEach(() => {
    mockEditor = {
      _config: {
        preset_type: "thermostat",
        title: "Test Title",
        logging_enabled: true,
      },
      _language: "en",
      i18n: new EditorI18n({ _language: "en" }),
      renderTextInput: vi.fn((key, value) => value),
      _handleLocalUpdate: vi.fn(),
      requestUpdate: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
    };
    step = new Step3Options(mockEditor);
  });

  it("should render successfully", () => {
    const result = step.render();
    expect(result).toBeDefined();
    expect(mockEditor.renderTextInput).toHaveBeenCalledWith("title", "Test Title");
  });

  it("should use default title if config title is missing", () => {
    mockEditor._config.title = "";
    step.render();
    expect(mockEditor.renderTextInput).toHaveBeenCalledWith("title", "CronoStar Thermostat");
  });

  it("should handle logging switch change", () => {
    const result = step.render();
    const handlers = collectFunctions(result);
    const loggingHandler = handlers[0];

    loggingHandler({ target: { checked: false } });
    expect(mockEditor._handleLocalUpdate).toHaveBeenCalledWith("logging_enabled", false);
  });

  it("should handle language selection change from ha-select", () => {
    const result = step.render();
    const handlers = collectFunctions(result);
    const selectHandler = handlers[1];

    selectHandler({ target: { value: "it" } });
    expect(mockEditor._language).toBe("it");
    expect(mockEditor.requestUpdate).toHaveBeenCalled();
    expect(mockEditor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("should ignore ha-select language selection when value is unchanged", () => {
    const result = step.render();
    const handlers = collectFunctions(result);
    const selectHandler = handlers[1];

    selectHandler({ target: { value: "en" } });
    expect(mockEditor.requestUpdate).not.toHaveBeenCalled();
    expect(mockEditor._dispatchConfigChanged).not.toHaveBeenCalled();
  });

  it("should handle mwc-list-item click for English", () => {
    mockEditor._language = "it";
    delete mockEditor._config.meta;

    const result = step.render();
    const handlers = collectFunctions(result);
    const enClickHandler = handlers[3];

    const blur = vi.fn();
    const mockSelect = { open: true, blur, menuOpen: true };
    const mockEvent = {
      target: {
        closest: vi.fn(() => mockSelect),
      },
    };

    enClickHandler(mockEvent);
    expect(mockEditor._language).toBe("en");
    expect(mockEditor._config.meta).toBeDefined();
    expect(mockEditor.i18n).toBeDefined();
    expect(mockSelect.open).toBe(false);
    expect(mockSelect.menuOpen).toBe(false);
    expect(blur).toHaveBeenCalled();
  });

  it("should handle mwc-list-item click for English without menuOpen property", () => {
    mockEditor._language = "it";

    const result = step.render();
    const handlers = collectFunctions(result);
    const enClickHandler = handlers[3];

    const blur = vi.fn();
    const mockSelect = { open: true, blur };
    const mockEvent = {
      target: {
        closest: vi.fn(() => mockSelect),
      },
    };

    enClickHandler(mockEvent);
    expect(mockSelect.open).toBe(false);
    expect(blur).toHaveBeenCalled();
  });

  it("should ignore English click when already selected", () => {
    mockEditor._language = "en";
    const result = step.render();
    const handlers = collectFunctions(result);
    const enClickHandler = handlers[3];

    const blur = vi.fn();
    const mockSelect = { open: true, blur, menuOpen: true };
    const mockEvent = {
      target: {
        closest: vi.fn(() => mockSelect),
      },
    };

    enClickHandler(mockEvent);
    expect(mockEditor._dispatchConfigChanged).not.toHaveBeenCalled();
    expect(mockSelect.open).toBe(false);
    expect(mockSelect.menuOpen).toBe(false);
  });

  it("should handle mwc-list-item click for English when closest returns null", () => {
    mockEditor._language = "it";

    const result = step.render();
    const handlers = collectFunctions(result);
    const enClickHandler = handlers[3];

    const mockEvent = {
      target: {
        closest: vi.fn(() => null),
      },
    };

    enClickHandler(mockEvent);
    expect(mockEditor._language).toBe("en");
  });

  it("should handle mwc-list-item click for Italian", () => {
    mockEditor._language = "en";
    delete mockEditor._config.meta;

    const result = step.render();
    const handlers = collectFunctions(result);
    const itClickHandler = handlers[4];

    const blur = vi.fn();
    const mockSelect = { open: true, blur, menuOpen: true };
    const mockEvent = {
      target: {
        closest: vi.fn(() => mockSelect),
      },
    };

    itClickHandler(mockEvent);
    expect(mockEditor._language).toBe("it");
    expect(mockEditor._config.meta).toBeDefined();
    expect(mockSelect.open).toBe(false);
    expect(mockSelect.menuOpen).toBe(false);
  });

  it("should stop propagation on closed event", () => {
    const result = step.render();
    const handlers = collectFunctions(result);
    const closedHandler = handlers[2];

    const mockEvent = { stopPropagation: vi.fn() };
    closedHandler(mockEvent);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });
});
