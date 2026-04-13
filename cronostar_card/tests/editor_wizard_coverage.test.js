// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { EditorWizard } from "../src/editor/EditorWizard.js";

describe("EditorWizard – Branch Coverage", () => {
  it("should cover scrollToTop branch in _nextStep", () => {
    const editor = { 
      _step: 1, 
      scrollToTop: vi.fn(), 
      requestUpdate: vi.fn(), 
      _runDeepChecks: vi.fn() 
    };
    const wizard = new EditorWizard(editor);
    wizard._nextStep();
    expect(editor.scrollToTop).toHaveBeenCalled();
  });

  it("should cover _prevStep decrement branch", () => {
    const editor = { _step: 2, scrollToTop: vi.fn(), requestUpdate: vi.fn(), _deepCheckRanForStep2: true };
    const wizard = new EditorWizard(editor);
    wizard._prevStep();
    expect(editor._step).toBe(1);
    expect(editor._deepCheckRanForStep2).toBe(false);
  });

  it("should cover _finish() else branch", () => {
    const editor = { _dispatchConfigChanged: vi.fn() };
    const wizard = new EditorWizard(editor);
    wizard._finish();
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });
});
