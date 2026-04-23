export class EditorWizard {
  constructor(editor) {
    this.editor = editor;
  }

  _nextStep() {
    if (this.editor._step < 5) {
      this.editor._step++;
      if (typeof this.editor.scrollToTop === "function")
        this.editor.scrollToTop();

      if (this.editor._step === 2) {
        if (!this.editor._deepCheckRanForStep2) {
          this.editor._deepCheckRanForStep2 = true;
          this.editor._runDeepChecks();
        }
      }
      this.editor.requestUpdate();
    }
  }

  _prevStep() {
    if (this.editor._step > 1) {
      this.editor._step--;
      if (typeof this.editor.scrollToTop === "function")
        this.editor.scrollToTop();
      if (this.editor._step !== 2) {
        this.editor._deepCheckRanForStep2 = false;
      }
      this.editor.requestUpdate();
    }
  }

  _finish() {
    // Force immediate persist before closing
    if (this.editor._persistCardConfigNow) {
      this.editor
        ._persistCardConfigNow()
        .then(() => {
          this.editor._dispatchConfigChanged(true);
        })
        .catch((err) => {
          console.error("[Wizard] Persist on finish failed:", err);
          this.editor._dispatchConfigChanged(true);
        });
    } else {
      this.editor._dispatchConfigChanged(true);
    }
  }
}
