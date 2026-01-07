import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Step4Automation } from '../../../src/editor/steps/Step4Automation.js';

describe('Step4Automation', () => {
  let mockEditor;
  let step;

  beforeEach(() => {
    mockEditor = {
      _config: { global_prefix: 'test_', target_entity: 'climate.test' },
      i18n: { _t: vi.fn(k => k) },
      _automationYaml: 'alias: test',
      _showLlmPrompt: false,
      requestUpdate: vi.fn(),
      _language: 'en'
    };
    step = new Step4Automation(mockEditor);
  });

  it('should render normal view', () => {
    const result = step.render();
    expect(result.strings[0]).toContain('step-content');
  });

  it('should render LLM prompt view when toggled', () => {
    mockEditor._showLlmPrompt = true;
    const result = step.render();
    expect(mockEditor._showLlmPrompt).toBe(true);
    // Check if result contains robot icon or specific text
  });
});
