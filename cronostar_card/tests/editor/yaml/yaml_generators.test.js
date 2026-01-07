import { describe, it, expect } from 'vitest';
import { buildAutomationTemplate } from '../../../src/editor/yaml/yaml_generators.js';

describe('yaml_generators', () => {
  it('should build automation template correctly', () => {
    const config = {
      global_prefix: 'test_',
      profiles_select_entity: 'select.test_profiles'
    };
    const template = buildAutomationTemplate(config);
    expect(template).toContain('alias: "CronoStar - Smart Presence & Safety Profile"');
    expect(template).toContain('entity_id: sensor.test_current');
    expect(template).toContain('entity_id: select.test_profiles');
  });

  it('should use default selector if missing in config', () => {
    const config = { global_prefix: 'test_' };
    const template = buildAutomationTemplate(config);
    expect(template).toContain('entity_id: select.test_current_profile');
  });
});
