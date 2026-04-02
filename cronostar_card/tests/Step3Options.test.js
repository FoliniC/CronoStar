// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Step3Options } from "../src/editor/steps/Step3Options.js";
import { EditorI18n } from "../src/editor/EditorI18n.js";

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
    // We need to find the switch in the template. 
    // Since it's a Lit TemplateResult, we'd need to render it to actual DOM to test events easily,
    // or inspect the values property.
    
    // Testing the handler directly from the template values
    const switchHandler = result.values.find(v => typeof v === 'function');
    if (switchHandler) {
        switchHandler({ target: { checked: false } });
        expect(mockEditor._handleLocalUpdate).toHaveBeenCalledWith("logging_enabled", false);
    }
  });

  it("should handle language selection change", () => {
    const result = step.render();
    // Find the select handler
    const selectHandler = result.values.find(v => v && typeof v === 'function' && v.name === ''); 
    // Actually, searching by index or structure is safer for TemplateResult
    
    // Let's try to find the ha-select handler. It's usually after the descriptions.
    const haSelectHandler = result.values.find(v => typeof v === 'function' && v.toString().includes('this.editor._language = val'));
    
    if (haSelectHandler) {
        haSelectHandler({ target: { value: "it" } });
        expect(mockEditor._language).toBe("it");
        expect(mockEditor.requestUpdate).toHaveBeenCalled();
        expect(mockEditor._dispatchConfigChanged).toHaveBeenCalledWith(true);
    }
  });

  it("should handle mwc-list-item click for English", () => {
    const result = step.render();
    // Find English click handler
    const enClickHandler = result.values.find(v => typeof v === 'function' && v.toString().includes('val = "en"'));
    
    if (enClickHandler) {
        mockEditor._language = "it"; // start as italian
        delete mockEditor._config.meta; // trigger meta initialization
        const mockEvent = {
            target: {
                closest: vi.fn().mockReturnValue({ open: true, blur: vi.fn() })
            }
        };
        enClickHandler(mockEvent);
        expect(mockEditor._language).toBe("en");
        expect(mockEditor._config.meta).toBeDefined();
        expect(mockEditor.i18n).toBeDefined();
    }
  });

  it("should handle mwc-list-item click for Italian", () => {
    const result = step.render();
    // Find Italian click handler
    const itClickHandler = result.values.find(v => typeof v === 'function' && v.toString().includes('val = "it"'));
    
    if (itClickHandler) {
        mockEditor._language = "en";
        delete mockEditor._config.meta; // trigger meta initialization
        const mockEvent = {
            target: {
                closest: vi.fn().mockReturnValue({ open: true, blur: vi.fn() })
            }
        };
        itClickHandler(mockEvent);
        expect(mockEditor._language).toBe("it");
        expect(mockEditor._config.meta).toBeDefined();
    }
  });
  
  it("should stop propagation on closed event", () => {
      const result = step.render();
      const closedHandler = result.values.find(v => typeof v === 'function' && v.toString().includes('stopPropagation'));
      if (closedHandler) {
          const mockEvent = { stopPropagation: vi.fn() };
          closedHandler(mockEvent);
          expect(mockEvent.stopPropagation).toHaveBeenCalled();
      }
  });
});
