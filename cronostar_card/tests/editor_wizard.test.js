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

  it("dovrebbe avanzare allo step successivo con _nextStep()", () => {
    wizard._nextStep();
    expect(editor._step).toBe(2);
    expect(editor.scrollToTop).toHaveBeenCalled();
    expect(editor.requestUpdate).toHaveBeenCalled();
  });

  it("dovrebbe eseguire deep checks quando entra nello step 2", () => {
    editor._step = 1;
    wizard._nextStep(); // va a 2
    expect(editor._runDeepChecks).toHaveBeenCalled();
    expect(editor._deepCheckRanForStep2).toBe(true);
  });

  it("non dovrebbe superare lo step 5", () => {
    editor._step = 5;
    wizard._nextStep();
    expect(editor._step).toBe(5);
  });

  it("dovrebbe tornare allo step precedente con _prevStep()", () => {
    editor._step = 2;
    wizard._prevStep();
    expect(editor._step).toBe(1);
    expect(editor.scrollToTop).toHaveBeenCalled();
  });

  it("non dovrebbe scendere sotto lo step 1", () => {
    editor._step = 1;
    wizard._prevStep();
    expect(editor._step).toBe(1);
  });

  it("dovrebbe resettare deepCheckRan quando esce dallo step 2 verso l'1", () => {
    editor._step = 2;
    editor._deepCheckRanForStep2 = true;
    wizard._prevStep();
    expect(editor._deepCheckRanForStep2).toBe(false);
  });

  it("dovrebbe terminare il wizard con _finish()", async () => {
    await wizard._finish();
    expect(editor._persistCardConfigNow).toHaveBeenCalled();
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("dovrebbe gestire errori di persistenza in _finish() senza bloccare la chiusura", async () => {
    editor._persistCardConfigNow.mockRejectedValue(new Error("fail"));
    await wizard._finish();
    
    // Aspettiamo un tick per la risoluzione della promise interna
    await new Promise(r => setTimeout(r, 0));
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });

  it("dovrebbe gestire _finish() se _persistCardConfigNow non è definito", () => {
    editor._persistCardConfigNow = null;
    wizard._finish();
    expect(editor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });
});
