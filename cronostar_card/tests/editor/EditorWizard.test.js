import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorWizard } from '../../src/editor/EditorWizard.js';

describe('EditorWizard', () => {
  let mockEditor;
  let wizard;

  beforeEach(() => {
    mockEditor = {
      _step: 1,
      _deepCheckRanForStep2: false,
      requestUpdate: vi.fn(),
      _runDeepChecks: vi.fn(),
      _dispatchConfigChanged: vi.fn(),
      _persistCardConfigNow: vi.fn().mockResolvedValue()
    };
    wizard = new EditorWizard(mockEditor);
  });

  it('should move to next step', () => {
    wizard._nextStep();
    expect(mockEditor._step).toBe(2);
    expect(mockEditor.requestUpdate).toHaveBeenCalled();
  });

  it('should trigger deep checks when moving to step 2', () => {
    mockEditor._step = 1;
    wizard._nextStep();
    expect(mockEditor._step).toBe(2);
    expect(mockEditor._runDeepChecks).toHaveBeenCalled();
    expect(mockEditor._deepCheckRanForStep2).toBe(true);
  });

  it('should move to previous step', () => {
    mockEditor._step = 2;
    wizard._prevStep();
    expect(mockEditor._step).toBe(1);
    expect(mockEditor.requestUpdate).toHaveBeenCalled();
  });

  it('should reset deep check flag when moving back from step 2', () => {
    mockEditor._step = 2;
    mockEditor._deepCheckRanForStep2 = true;
    wizard._prevStep();
    expect(mockEditor._step).toBe(1);
    expect(mockEditor._deepCheckRanForStep2).toBe(false);
  });

  it('should call dispatchConfigChanged on finish', async () => {
    wizard._finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockEditor._dispatchConfigChanged).toHaveBeenCalledWith(true);
  });
});
