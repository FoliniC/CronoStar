import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronoStarEditor } from '../../src/editor/CronoStarEditor.js';

if (!customElements.get('cronostar-card-editor')) {
  customElements.define('cronostar-card-editor', CronoStarEditor);
}

describe('CronoStarEditor', () => {
  let element;
  const mockHass = {
    language: 'en',
    callService: vi.fn(),
    states: {}
  };

  const mockConfig = {
    type: 'custom:cronostar-card',
    preset_type: 'thermostat',
    target_entity: 'climate.test',
    global_prefix: 'test_'
  };

  beforeEach(() => {
    element = document.createElement('cronostar-card-editor');
    element.hass = mockHass;
    element.setConfig(mockConfig);
  });

  it('is defined', () => {
    expect(element).toBeInstanceOf(CronoStarEditor);
  });

  it('should initialize with default values', () => {
    expect(element._step).toBe(0);
    expect(element._language).toBe('en');
  });

  it('should update config and dispatch event', () => {
    const dispatchSpy = vi.spyOn(element, 'dispatchEvent');
    element._updateConfig('title', 'New Title', true);
    expect(element._config.title).toBe('New Title');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'config-changed' }));
  });

  it('should handle reset config', () => {
    global.confirm = vi.fn(() => true);
    element._isEditing = true;
    element._handleResetConfig();
    expect(element._step).toBe(1);
    expect(element._isEditing).toBe(false);
  });

  it('should sanitize config before dispatching', () => {
    const cfg = { type: 'test', nullKey: null, emptyKey: '', validKey: 'value' };
    const sanitized = element._sanitizeConfig(cfg);
    expect(sanitized).toEqual({ type: 'test', validKey: 'value' });
  });
});
