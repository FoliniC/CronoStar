export class EditorWizard {
  constructor(editor) {
    this.editor = editor;
  }

  _nextStep() {
    console.log(`[CronoStar Wizard] _nextStep called. Current step: ${this.editor._step}`);
    if (this.editor._step < 5) {
      this.editor._step++;
      console.log(`[CronoStar Wizard] Moving to step: ${this.editor._step}`);
      
      if (this.editor._step === 2) {
          console.log(`[CronoStar Wizard] Checking deep check status... ran=${this.editor._deepCheckRanForStep2}`);
          if (!this.editor._deepCheckRanForStep2) {
            console.log('[CronoStar Wizard] Triggering _runDeepChecks for Step 2');
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
