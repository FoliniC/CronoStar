/**
 * YAML template generation for CronoStar manual setup
 */
import { getEffectivePrefix } from '../../utils/prefix_utils.js';

export function buildAutomationTemplate(config) {
  const prefix = getEffectivePrefix(config);
  const preset = config.preset_type || config.preset || 'thermostat';
  const target = config.target_entity || 'your_entity_id';
  const selector = config.profiles_select_entity || `select.${prefix}current_profile`;

  const currentSensor = `sensor.${prefix}current`;

  return `
alias: "CronoStar - Smart Presence & Safety Profile"
description: "Switch CronoStar profile based on occupancy or safety threshold."
triggers:
  - trigger: state
    entity_id: zone.home
    to: "0"
    id: "away"
  - trigger: numeric_state
    entity_id: zone.home
    above: 0
    id: "home"
  - trigger: numeric_state
    entity_id: ${currentSensor}
    below: 13
    id: "safety"
actions:
  - choose:
      - conditions:
          - condition: trigger
            id: "away"
        sequence:
          - action: select.select_option
            target:
              entity_id: ${selector}
            data:
              option: "Away"
      - conditions:
          - or:
              - condition: trigger
                id: "home"
              - condition: trigger
                id: "safety"
        sequence:
          - action: select.select_option
            target:
              entity_id: ${selector}
            data:
              option: "Default"
`.trim();
}
