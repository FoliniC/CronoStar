export class EditorWizard {
  constructor(editor) {
    this.editor = editor;
  }

  _nextStep() {
    if (this.editor._step < 5) {
      this.editor._step++;
      if (this.editor._step === 2 && !this.editor._deepCheckRanForStep2) {
        this.editor._deepCheckRanForStep2 = true;
        this.editor._runDeepChecks();
      }
      this.editor.requestUpdate();
    }
  }

  _prevStep() {
    if (this.editor._step > 1) {
      this.editor._step--;
      if (this.editor._step !== 2) {
        this.editor._deepCheckRanForStep2 = false;
      }
      this.editor.requestUpdate();
    }
  }

  _finish() {
    this.editor._dispatchConfigChanged();
  }
}
