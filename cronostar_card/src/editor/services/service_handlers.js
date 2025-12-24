/**
 * Service call handlers for CronoStar Editor
 */
import { getEffectivePrefix, getAliasWithPrefix } from '../../utils/prefix_utils.js';
import { buildHelpersFilename, buildAutomationFilename } from '../../utils/filename_utils.js';
import { escapeHtml } from '../../utils/editor_utils.js';
import { buildAutomationYaml, buildInputNumbersYaml } from '../yaml/yaml_generators.js';
import { I18N } from '../EditorI18n.js';
import { Logger } from '../../utils.js';

function localize(lang, key, search, replace) {
  const parts = key.split('.');
  let obj = I18N[lang] || I18N.en;
  for (const p of parts) obj = obj?.[p];
  let value = typeof obj === 'string' ? obj : key;
  if (search && typeof search === 'object') Object.keys(search).forEach((needle) => { value = value.replace(needle, search[needle]); });
  if (replace && typeof replace === 'object') Object.keys(replace).forEach((needle) => { value = value.replace(needle, replace[needle]); });
  return value;
}

export async function copyToClipboard(text, successMessage, errorMessage) {
  try { await navigator.clipboard.writeText(text); return { success: true, message: successMessage }; }
  catch (e) { console.warn('Clipboard write failed:', e); return { success: false, message: errorMessage }; }
}

export function downloadFile(filename, content, successMessage, errorMessage) {
  try {
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true, message: successMessage };
  } catch (e) { console.error('File download failed:', e); return { success: false, message: errorMessage }; }
}

export async function createYamlFile(hass, filePath, content, append = false) {
  if (!hass?.services?.cronostar?.create_yaml_file) throw new Error('Service cronostar.create_yaml_file not available');
  await hass.callService('cronostar', 'create_yaml_file', { file_path: filePath, content, append });
}

/**
 * Helpers YAML file creation
 */
export async function handleCreateHelpersYaml(hass, config, deepReport, language) {
  // Force deep check to determine include paths if possible
  try { await runDeepChecks(hass, config, language); } catch { }
  const effectivePrefix = getEffectivePrefix(config);
  const filename = buildHelpersFilename(effectivePrefix);
  // Always generate a proper package file with headers and place it under 'packages'
  const content = buildInputNumbersYaml(config, true);
  const fullPath = `packages/${filename}`;
  await createYamlFile(hass, fullPath, content, false);
  return { success: true, message: `✓ File created: ${fullPath}` };
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Automation YAML file creation
 */
export async function handleCreateAutomationYaml(hass, config, deepReport, language) {
  // Force deep check to determine include paths if possible
  try { await runDeepChecks(hass, config, language); } catch { }
  const effectivePrefix = getEffectivePrefix(config);
  const filename = buildAutomationFilename(effectivePrefix);
  const autoSource = deepReport?.automation?.source || 'unknown';
  const autoDir = deepReport?.automation?.full_path;
  if (!autoSource || !autoDir || autoSource === 'none') throw new Error(localize(language, 'ui.automations_path_not_determined'));
  const style = autoSource === 'inline' ? 'inline' : 'list';
  const content = buildAutomationYaml(config, style);
  if (autoSource === 'include_dir_list') {
    const fullPath = `${autoDir}/${filename}`;
    await createYamlFile(hass, fullPath, content);
    return { success: true, message: `✓ File created: ${fullPath}` };
  } else if (autoSource === 'include_file') {
    await createYamlFile(hass, autoDir, `\n# ==== CronoStar Automation ====`, true);
    return { success: true, message: `✓ Appended to: ${autoDir}` };
  } else if (autoSource === 'inline') {
    throw new Error(localize(language, 'ui.inline_automation_use_ui'));
  }
  throw new Error('Unknown automation source');
}

/**
 * Create and reload automation
 */
export async function handleCreateAndReloadAutomation(hass, config, deepReport, language) {
  // Ensure deep checks run before attempting creation
  try { await runDeepChecks(hass, config, language); } catch { }
  const hasCreateFile = !!hass?.services?.cronostar?.create_yaml_file;
  const deepOk = !!deepReport?.automation?.source;
  if (hasCreateFile && deepOk) {
    await handleCreateAutomationYaml(hass, config, deepReport, language);
    try { await hass.callService('automation', 'reload', {}); } catch (e) { console.warn('automation.reload failed:', e); }
    return { success: true, message: localize(language, 'ui.automation_created_successfully') };
  }
  const style = deepReport?.automation?.source === 'inline' ? 'inline' : 'list';
  const yaml = buildAutomationYaml(config, style);
  // Do not open a new window; just copy YAML to clipboard and inform the user
  try { await navigator.clipboard.writeText(yaml); } catch (e) { console.warn('Clipboard write failed:', e); }
  return { success: true, message: localize(language, 'ui.yaml_copied_go_to_automations') };
}

/**
 * Deep checks service call (exported for editor)
 */
export async function runDeepChecks(hass, config, language) {
  if (!hass?.services?.cronostar?.check_setup) {
    throw new Error(localize(language, 'ui.service_check_setup_not_available'));
  }
  const effectivePrefix = getEffectivePrefix(config);
  const alias = getAliasWithPrefix(effectivePrefix, language);
  await hass.callService('cronostar', 'check_setup', {
    prefix: effectivePrefix,
    hour_base: config.hour_base === '1' || config.hour_base === 1 ? 1 : 0,
    alias: alias,
  });
  return { success: true, message: localize(language, 'ui.checks_triggered') };
}

/**
 * Initializes/Sanitizes the data JSON file with a default profile
 * Analyzes existing data and ensures validity (boundary points)
 */
export async function handleInitializeData(hass, config, language) {
  const prefix = getEffectivePrefix(config);
  const preset = config.preset || 'thermostat';
  const profileName = 'Comfort';
  const minVal = config.min_value ?? 0;

  if (!hass) throw new Error('Home Assistant not connected');

  let schedule = [];
  let isNew = false;

  // 1. Try to load existing profile
  try {
    const result = await hass.callWS({
      type: 'call_service',
      domain: 'cronostar',
      service: 'load_profile',
      service_data: {
        profile_name: profileName,
        preset_type: preset,
        global_prefix: prefix
      },
      return_response: true,
    });
    
    const resp = result?.response ?? result;
    if (resp?.schedule && Array.isArray(resp.schedule)) {
      schedule = resp.schedule;
      Logger.log('INIT', `Loaded existing profile '${profileName}' for analysis/correction`);
    } else {
      isNew = true;
    }
  } catch (e) {
    isNew = true;
    Logger.log('INIT', `Profile '${profileName}' not found, initializing fresh default`);
  }

  // 2. If new or failed to load, start with default point
  if (isNew || schedule.length === 0) {
    schedule = [{ time: '00:00', value: minVal }];
  }

  // 3. Analyze and Correct (ensure boundary points for sparse mode)
  // Ensure we have a point at 00:00
  if (!schedule.some(p => p.time === '00:00')) {
    const firstVal = schedule.length > 0 ? schedule[0].value : minVal;
    schedule.unshift({ time: '00:00', value: firstVal });
  }
  // Ensure we have a point at 23:59
  if (!schedule.some(p => p.time === '23:59')) {
    const lastVal = schedule[schedule.length - 1].value;
    schedule.push({ time: '23:59', value: lastVal });
  }
  
  // Sort by time to ensure integrity
  schedule.sort((a, b) => {
    const ta = String(a.time).split(':').map(Number);
    const tb = String(b.time).split(':').map(Number);
    return (ta[0] * 60 + ta[1]) - (tb[0] * 60 + tb[1]);
  });

  // 4. Save back with updated meta
  const safeMeta = (() => {
    const src = (config && typeof config === 'object') ? config : {};
    const { entity_prefix, ...rest } = src;
    if (!rest.global_prefix && prefix) rest.global_prefix = prefix;
    return rest;
  })();

  await hass.callService('cronostar', 'save_profile', {
    profile_name: profileName,
    preset_type: preset,
    schedule: schedule,
    global_prefix: prefix,
    meta: safeMeta,
  });

  return { 
    success: true, 
    message: isNew ? '✓ Default profile initialized' : '✓ Existing profile analyzed and corrected' 
  };
}

/**
 * One-click save: JSON profile + YAML package + YAML automation (+reload)
 */
export async function handleSaveAll(hass, config, deepReport, language) {
  const messages = [];
  // Force deep check at the start to try to discover paths
  try {
    const checks = await runDeepChecks(hass, config, language);
    messages.push(checks.message);
  } catch (e) {
    messages.push(`✗ Deep Checks: ${e.message}`);
  }
  const effectivePrefix = getEffectivePrefix(config);
  const packageFilename = buildHelpersFilename(effectivePrefix);
  const automationFilename = buildAutomationFilename(effectivePrefix);

  // Analyze and correct data instead of skipping
  try {
    const init = await handleInitializeData(hass, config, language);
    messages.push(init.message);
  } catch (e) {
    messages.push(`✗ Data Analysis: ${e.message}`);
  }

  try {
    const pkg = await handleCreateHelpersYaml(hass, config, deepReport, language);
    messages.push(pkg.message);
  } catch (e) {
    messages.push(`✗ Package (${packageFilename}): ${e.message}`);
  }

  try {
    const auto = await handleCreateAndReloadAutomation(hass, config, deepReport, language);
    messages.push(auto.message);
  } catch (e) {
    messages.push(`✗ Automation (${automationFilename}): ${e.message}`);
  }

  return { success: true, message: messages.join('\n') };
}
