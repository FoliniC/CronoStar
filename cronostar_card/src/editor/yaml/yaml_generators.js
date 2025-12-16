/**
 * YAML generation functions for CronoStar Editor
 */


import { normalizePrefix, getAliasWithPrefix } from '../../utils/prefix_utils.js';
import { getHoursList } from '../../utils/editor_utils.js';
/**
 * Builds the automation YAML
 */
export function buildAutomationYaml(config, style = 'list') {
  const applyEntity = config.apply_entity;
  const pauseEntity = config.pause_entity;
  const profilesSelect = config.profiles_select_entity || '';
  const interval = config.interval_minutes || 60;
  
  const rawPrefix = normalizePrefix(config.global_prefix || config.entity_prefix || 'cronostar_');
  const idBase = rawPrefix.replace(/_+$/, '');
  const id = `${idBase}_apply`;
  
  const alias = getAliasWithPrefix(rawPrefix, 'en');
  
  const activeProfileTextEntity = getActiveProfileTextEntity(config.preset);
  const domain = (applyEntity || '').split('.')[0];

  const lines = [];
  
  if (style === 'inline') {
    lines.push('automation:');
  }
  
  const indent = style === 'inline' ? '  ' : '';
  
  lines.push(`${indent}- alias: "${alias}"`);
  lines.push(`${indent}  id: ${id}`);
  lines.push(`${indent}  description: "Generato automaticamente da CronoStar Editor"`);
  lines.push(`${indent}  mode: restart`);
  lines.push(`${indent}  trigger:`);
  
  if (interval === 60) {
    lines.push(`${indent}    - platform: time_pattern`);
    lines.push(`${indent}      minutes: "0"`);
  } else {
    lines.push(`${indent}    - platform: time_pattern`);
    lines.push(`${indent}      minutes: "/${interval}"`);
  }
  
  lines.push(`${indent}    - platform: event`);
  lines.push(`${indent}      event_type: cronostar_profiles_loaded`);
  
  if (pauseEntity) {
    lines.push(`${indent}  condition:`);
    lines.push(`${indent}    - condition: state`);
    lines.push(`${indent}      entity_id: ${pauseEntity}`);
    lines.push(`${indent}      state: "off"`);
  } else {
    lines.push(`${indent}  condition: []`);
  }
  
  lines.push(`${indent}  action:`);
  lines.push(`${indent}    - variables:`);
  lines.push(`${indent}        prefix: "${rawPrefix}"`);
  lines.push(`${indent}        target_entity: "${applyEntity}"`);
  
  if (interval === 60) {
    // Legacy hourly logic
    lines.push(`${indent}        hour: "{{ now().hour }}"`);
    lines.push(`${indent}        hh: "{{ '%02d'|format(now().hour) }}"`);
    lines.push(`${indent}        schedule_entity: "input_number.{{ prefix }}{{ hh }}"`);
  } else {
    // Interval logic
    lines.push(`${indent}        interval: ${interval}`);
    lines.push(`${indent}        current_total_minutes: "{{ now().hour * 60 + now().minute }}"`);
    lines.push(`${indent}        idx: "{{ (current_total_minutes / interval) | int }}"`);
    lines.push(`${indent}        suffix: "{{ '%02d'|format(idx) }}"`);
    lines.push(`${indent}        schedule_entity: "input_number.{{ prefix }}{{ suffix }}"`);
  }
  
  lines.push(`${indent}        schedule_value: "{{ states(schedule_entity) | float(0) }}"`);
  
  if (profilesSelect && activeProfileTextEntity) {
    lines.push(`${indent}        profiles_select: "${profilesSelect}"`);
    lines.push(`${indent}        active_profile_text_entity: "${activeProfileTextEntity}"`);
    lines.push(`${indent}    - if:`);
    lines.push(`${indent}        - condition: template`);
    lines.push(`${indent}          value_template: "{{ profiles_select is defined and profiles_select != '' }}"`);
    lines.push(`${indent}      then:`);
    lines.push(`${indent}        - service: input_text.set_value`);
    lines.push(`${indent}          target:`);
    lines.push(`${indent}            entity_id: "{{ active_profile_text_entity }}"`);
    lines.push(`${indent}          data:`);
    lines.push(`${indent}            value: "{{ states(profiles_select) }}"`);
    lines.push(`${indent}      else: []`);
  }
  
  lines.push(`${indent}    - choose:`);
  lines.push(`${indent}        - conditions:`);
  lines.push(`${indent}            - condition: template`);
  lines.push(`${indent}              value_template: "{{ '${domain}' == 'climate' }}"`);
  lines.push(`${indent}          sequence:`);
  lines.push(`${indent}            - service: climate.set_temperature`);
  lines.push(`${indent}              target:`);
  lines.push(`${indent}                entity_id: ${applyEntity}`);
  lines.push(`${indent}              data:`);
  lines.push(`${indent}                temperature: "{{ schedule_value }}"`);
  
  lines.push(`${indent}        - conditions:`);
  lines.push(`${indent}            - condition: template`);
  lines.push(`${indent}              value_template: "{{ '${domain}' == 'number' }}"`);
  lines.push(`${indent}          sequence:`);
  lines.push(`${indent}            - service: number.set_value`);
  lines.push(`${indent}              target:`);
  lines.push(`${indent}                entity_id: ${applyEntity}`);
  lines.push(`${indent}              data:`);
  lines.push(`${indent}                value: "{{ schedule_value }}"`);
  
  lines.push(`${indent}        - conditions:`);
  lines.push(`${indent}            - condition: template`);
  lines.push(`${indent}              value_template: "{{ '${domain}' == 'switch' }}"`);
  lines.push(`${indent}          sequence:`);
  lines.push(`${indent}            - choose:`);
  lines.push(`${indent}                - conditions:`);
  lines.push(`${indent}                    - condition: template`);
  lines.push(`${indent}                      value_template: "{{ schedule_value | int == 1 }}"`);
  lines.push(`${indent}                  sequence:`);
  lines.push(`${indent}                    - service: switch.turn_on`);
  lines.push(`${indent}                      target:`);
  lines.push(`${indent}                        entity_id: ${applyEntity}`);
  lines.push(`${indent}              default:`);
  lines.push(`${indent}                - service: switch.turn_off`);
  lines.push(`${indent}                  target:`);
  lines.push(`${indent}                    entity_id: ${applyEntity}`);

  return lines.join('\n');
}

/**
 * Builds the input_number helpers YAML
 */
export function buildInputNumbersYaml(config, source = 'unknown') {
  const prefix = normalizePrefix(config.global_prefix || config.entity_prefix || 'cronostar_');
  const min = Number.isFinite(config.min_value) ? config.min_value : 0;
  const max = Number.isFinite(config.max_value) ? config.max_value : 100;
  const step = Number.isFinite(config.step_value) ? config.step_value : 1;
  const uom = (config.unit_of_measurement || '').trim();
  const presetName = getPresetDisplayName(config.preset);
  
  const lines = [];
  lines.push('# ===============================================');
  lines.push(`# CronoStar Helpers (${presetName})`);
  lines.push(`# Prefix: ${prefix}`);
  lines.push('# Place this file in packages/ or merge under input_number: in configuration.yaml');
  lines.push('# Then restart Home Assistant.');
  lines.push('# ===============================================');
  
  const isList = source === 'include_dir_list';
  const isInline = source === 'inline';
  
  if (isInline) {
    lines.push('input_number:');
  }
  
  // Add the "Current Value" entity
  const currentKey = `${prefix}current`;
  if (isList) {
    lines.push(`- ${currentKey}:`);
    lines.push(`    name: "CronoStar ${presetName} Current Value"`);
    lines.push(`    min: ${min}`);
    lines.push(`    max: ${max}`);
    lines.push(`    step: ${step}`);
    if (uom) lines.push(`    unit_of_measurement: "${uom}"`);
    lines.push(`    mode: box`);
    lines.push(`    icon: mdi:target`);
  } else {
    const keyIndent = isInline ? '  ' : '';
    const propIndent = isInline ? '    ' : '  ';
    lines.push(`${keyIndent}${currentKey}:`);
    lines.push(`${propIndent}name: "CronoStar ${presetName} Current Value"`);
    lines.push(`${propIndent}min: ${min}`);
    lines.push(`${propIndent}max: ${max}`);
    lines.push(`${propIndent}step: ${step}`);
    if (uom) lines.push(`${propIndent}unit_of_measurement: "${uom}"`);
    lines.push(`${propIndent}mode: box`);
    lines.push(`${propIndent}icon: mdi:target`);
  }
  
  return lines.join('\n');
}

/**
 * Gets the active profile text entity for a preset
 */
function getActiveProfileTextEntity(preset) {
  const map = {
    thermostat: 'input_text.cronostar_active_profile_thermostat',
    ev_charging: 'input_text.cronostar_active_profile_ev_charging',
    generic_switch: 'input_text.cronostar_active_profile_generic_switch',
    generic_kwh: 'input_text.cronostar_active_profile_generic_kwh',
    generic_temperature: 'input_text.cronostar_active_profile_generic_temperature'
  };
  return map[preset] || '';
}

/**
 * Gets the display name for a preset
 */
function getPresetDisplayName(preset) {
  const map = {
    thermostat: 'Thermostat',
    ev_charging: 'EV Charging',
    generic_kwh: 'Generic kWh',
    generic_temperature: 'Generic Temperature',
    generic_switch: 'Generic Switch'
  };
  return map[preset] || preset;
}
