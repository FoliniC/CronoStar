/**
 * YAML template generation for CronoStar manual setup
 */
import { getEffectivePrefix } from '../../utils/prefix_utils.js';

export function buildAutomationTemplate(config) {
  const prefix = getEffectivePrefix(config);
  const preset = config.preset_type || config.preset || 'thermostat';
  const target = config.target_entity || 'your_entity_id';
  const selector = config.profiles_select_entity || `select.${prefix}current_profile`;

  return `
alias: "CronoStar - Apply ${prefix.replace(/_+$/, '')}"
description: "Apply scheduled values to ${target}"
mode: restart
trigger:
  - trigger: time_pattern
    minutes: "/1"
  - trigger: event
    event_type: cronostar_profiles_loaded
action:
  - action: cronostar.apply_now
    data:
      target_entity: "${target}"
      preset_type: "${preset}"
      global_prefix: "${prefix}"
      profile_name: "{{ states('${selector}') or 'Default' }}"
`.trim();
}
