// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorWizard } from "../src/editor/EditorWizard.js";

describe("EditorWizard", () => {
  let wizard, editor;

  beforeEach(() => {
    editor = {
      _step: 1,
      _deepCheckRanForStep2: false,
      _runDeepChecks: vi.fn(),
      requestUpdate: vi.fn(),
      scrollToTop: vi.fn(),
      _persistCardConfigNow: vi.fn().mockResolvedValue(),
      _dispatchConfigChanged: vi.fn(),
    };
    wizard = new EditorWizard(editor);
  });

  it("should advance to the next step with _nextStep()", () => {
    wizard._nextStep();
    expect(editor._step).toBe(2);
    expect(editor.scrollToTop).toHaveBeenCalled();
    expect(editor.requestUpdate).toHaveBeenCalled();
  });

  it("should perform deep checks when entering step 2", () => {
    editor._step = 1;
    wizard._nextStep(); // goes to 2
    expect(editor._runDeepChecks).toHaveBeenCalled();
    expect(editor._deepCheckRanForStep2).toBe(true);
  });

  it("should not exceed step 5", () => {
    editor._step = 5;
    wizard._nextStep();
    expect(editor._step).toBe(5);
  });

  it("should return to the previous step with _prevStep()", () => {
    editor._step = 2;
    wizard._prevStep();
    expect(editor._step).toBe(1);
    expect(editor.scrollToTop).toHaveBeenCalled();
  });

  it("should not go below step 1", () => {
    editor._step = 1;
    wizard._prevStep();
    expect(editor._step).toBe(1);
  });

  it("should reset deepCheckRan when moving from step 2 to 1", () => {
    editor._step = 2;
    editor._deepCheckRanForStep2 = true;
    wizard._prevStep();
    expect(editor._deepCheckRanForStep2).toBe(false);
  });

  it("should finish the wizard with _finish()", async () => {
    await wizard._finish();
    expect(editor._persistCardConfigNow).toHaveBeenCalled();
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("should handle persistence errors in _finish() without blocking closure", async () => {
    editor._persistCardConfigNow.mockRejectedValue(new Error("fail"));
    await wizard._finish();
    
    // Wait a tick for the internal promise resolution
    await new Promise(r => setTimeout(r, 0));
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("should handle _finish() if _persistCardConfigNow is not defined", () => {
    editor._persistCardConfigNow = null;
    wizard._finish();
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });
});
