import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step5Summary } from '../../../src/editor/steps/Step5Summary.js';
import { handleInitializeData } from '../../../src/editor/services/service_handlers.js';

vi.mock('../../../src/editor/services/service_handlers.js', () => ({
  handleInitializeData: vi.fn()
}));

describe('Step5Summary', () => {
  let mockEditor;
  let step;

  beforeEach(() => {
    mockEditor = {
      _config: { 
        preset_type: 'thermostat',
        target_entity: 'climate.test',
        global_prefix: 'test_',
        min_value: 15,
        max_value: 30,
        step_value: 0.5
      },
      i18n: { _t: vi.fn(k => k) },
      hass: {},
      _language: 'en',
      showToast: vi.fn()
    };
    step = new Step5Summary(mockEditor);
  });

  it('should call handleSaveAll', async () => {
    handleInitializeData.mockResolvedValue({ message: 'Success' });
    await step.handleSaveAll();
    expect(handleInitializeData).toHaveBeenCalled();
    expect(mockEditor.showToast).toHaveBeenCalledWith('Success');
  });

  it('should render summary', () => {
    const result = step.render();
    expect(result.strings[0]).toContain('step-content');
  });
});
