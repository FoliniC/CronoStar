/**
 * Service call handlers for CronoStar Editor
 */

import { 
  getEffectivePrefix,
  getAliasWithPrefix
} from '../../utils/prefix_utils.js';
import {
  buildHelpersFilename,
  buildAutomationFilename
} from '../../utils/filename_utils.js';
import {
  escapeHtml
} from '../../utils/editor_utils.js';
import { buildAutomationYaml, buildInputNumbersYaml } from '../yaml/yaml_generators.js';
import { I18N } from '../EditorI18n.js';

/**
 * Simple localize function for service handlers
 */
function localize(lang, key, search, replace) {
  const parts = key.split('.');
  let obj = I18N[lang] || I18N.en;
  for (const p of parts) obj = obj?.[p];
  let value = typeof obj === 'string' ? obj : key;
  if (search && typeof search === 'object') {
    Object.keys(search).forEach((needle) => {
      value = value.replace(needle, search[needle]);
    });
  }
  if (replace && typeof replace === 'object') {
    Object.keys(replace).forEach((needle) => {
      value = value.replace(needle, replace[needle]);
    });
  }
  return value;
}

/**
 * Handles copying YAML to clipboard
 */
export async function copyToClipboard(text, successMessage, errorMessage) {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: successMessage };
  } catch (e) {
    console.warn('Clipboard write failed:', e);
    return { success: false, message: errorMessage };
  }
}

/**
 * Handles downloading a file
 */
export function downloadFile(filename, content, successMessage, errorMessage) {
  try {
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true, message: successMessage };
  } catch (e) {
    console.error('File download failed:', e);
    return { success: false, message: errorMessage };
  }
}

/**
 * Creates a YAML file on the Home Assistant server
 */
export async function createYamlFile(hass, filePath, content) {
  if (!hass?.services?.cronostar?.create_yaml_file) {
    throw new Error('Service cronostar.create_yaml_file not available');
  }
  
  await hass.callService("cronostar", "create_yaml_file", {
    file_path: filePath,
    content: content
  });
}

/**
 * Handles creating helpers YAML file
 */
export async function handleCreateHelpersYaml(hass, config, deepReport, language) {
  const effectivePrefix = getEffectivePrefix(config);
  const filename = buildHelpersFilename(effectivePrefix);
  const source = deepReport?.input_number?.source || 'unknown';
  const inputNumberDir = deepReport?.input_number?.full_path;
  
  if (!inputNumberDir || source === 'none') {
    throw new Error(localize(language, 'ui.run_deep_checks_first'));
  }
  
  const content = buildInputNumbersYaml(config, source);
  const fullPath = `${inputNumberDir}/${filename}`;
  
  await createYamlFile(hass, fullPath, content);
  
  return {
    success: true,
    message: `✓ File created: ${fullPath}`
  };
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Handles creating automation YAML file
 */
export async function handleCreateAutomationYaml(hass, config, deepReport, language) {
  const effectivePrefix = getEffectivePrefix(config);
  const filename = buildAutomationFilename(effectivePrefix);
  const autoSource = deepReport?.automation?.source || 'unknown';
  const autoDir = deepReport?.automation?.full_path;
  
  if (!autoSource || !autoDir || autoSource === 'none') {
    throw new Error(localize(language, 'ui.automations_path_not_determined'));
  }
  
  const style = autoSource === 'inline' ? 'inline' : 'list';
  const content = buildAutomationYaml(config, style);
  
  if (autoSource === 'include_dir_list') {
    const fullPath = `${autoDir}/${filename}`;
    await createYamlFile(hass, fullPath, content);
    return {
      success: true,
      message: `✓ File created: ${fullPath}`
    };
  } else if (autoSource === 'include_file') {
    await createYamlFile(hass, autoDir, `\n# ==== CronoStar Automation ====`, true);
    return {
      success: true,
      message: `✓ Appended to: ${autoDir}`
    };
  } else if (autoSource === 'inline') {
    throw new Error(localize(language, 'ui.inline_automation_use_ui'));
  }
  
  throw new Error('Unknown automation source');
}

/**
 * Handles creating and reloading automation
 */
export async function handleCreateAndReloadAutomation(hass, config, deepReport, language) {
  // Check if backend service is available
  const hasCreateFile = !!hass?.services?.cronostar?.create_yaml_file;
  const deepOk = !!deepReport?.automation?.source;
  
  if (hasCreateFile && deepOk) {
    // Use backend path
    await handleCreateAutomationYaml(hass, config, deepReport, language);
    
    // Reload automations
    try {
      await hass.callService('automation', 'reload', {});
    } catch (e) {
      console.warn('automation.reload failed:', e);
    }
    
    return {
      success: true,
      message: localize(language, 'ui.automation_created_successfully')
    };
  }
  
  // Fallback: open in new tab with YAML
  const style = deepReport?.automation?.source === 'inline' ? 'inline' : 'list';
  const yaml = buildAutomationYaml(config, style);
  
  try {
    await navigator.clipboard.writeText(yaml);
  } catch (e) {
    console.warn('Clipboard write failed:', e);
  }
  
  // Open YAML preview window
  const w = window.open('', '_blank');
  if (w) {
    const doc = w.document;
    doc.open();
    doc.write(`<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>CronoStar Automation YAML</title>
<style>
  body{font-family:system-ui;padding:16px;}
  pre{background:#f5f5f5;border:1px solid #ddd;padding:12px;white-space:pre-wrap;}
  button{padding:6px 10px;margin-right:8px;}
</style>
<body>
  <h2>${localize(language, 'ui.cronostar_automation_yaml')}</h2>
  <button onclick="navigator.clipboard.writeText(document.getElementById('yaml').innerText)">
    ${localize(language, 'ui.copy')}
  </button>
  <pre id="yaml">${escapeHtml(yaml)}</pre>
</body>
</html>`);
    doc.close();
  }
  
  // Navigate to automations UI
  navigateToAutomationsUI();
  
  return {
    success: true,
    message: localize(language, 'ui.yaml_copied_go_to_automations')
  };
}

/**
 * Navigates to the automations UI
 */
function navigateToAutomationsUI() {
  const path = '/config/automation/dashboard';
  
  try {
    // Try dispatching navigation event
    const event = new CustomEvent('hass-navigate', {
      detail: { path },
      bubbles: true,
      composed: true
    });
    document.dispatchEvent(event);
    
    // Fallback to window.open after a delay
    setTimeout(() => {
      if (!location.pathname.includes('/config/automation')) {
        window.open(path, '_blank');
      }
    }, 300);
  } catch {
    window.open(path, '_blank');
  }
}

/**
 * Initializes the data JSON file by saving a default profile
 */
export async function handleInitializeData(hass, config, language) {
  const prefix = getEffectivePrefix(config);
  const minVal = config.min_value ?? 0;
  
  // Create a flat schedule array based on interval
  const interval = config.interval_minutes || 60;
  const numPoints = Math.floor(1440 / interval);
  const defaultSchedule = Array(numPoints).fill(minVal).map((v, i) => ({
    index: i,
    time: minutesToTime(i * interval),
    value: v
  }));
  
  const preset = config.preset || 'thermostat';
  const profileName = "Comfort"; // Default initial profile
  
  if (!hass) throw new Error("Home Assistant not connected");
  
  try {
    await hass.callService("cronostar", "save_profile", {
      profile_name: profileName,
      preset_type: preset,
      schedule: defaultSchedule,
      global_prefix: prefix
    });
    
    return {
      success: true,
      message: localize(language, 'ui.checks_triggered').replace('Checks', 'Data Init') // Reusing string or simplistic success msg
    };
  } catch (e) {
    throw new Error("Failed to initialize data: " + e.message);
  }
}

/**
 * Runs deep checks service
 */
export async function runDeepChecks(hass, config, language) {
  if (!hass?.services?.cronostar?.check_setup) {
    throw new Error(localize(language, 'ui.service_check_setup_not_available'));
  }
  
  const effectivePrefix = getEffectivePrefix(config);
  const alias = getAliasWithPrefix(effectivePrefix, language);
  const interval = config.interval_minutes || 60;
  const expected_count = Math.floor(1440 / interval);
  
  await hass.callService('cronostar', 'check_setup', {
    prefix: effectivePrefix,
    hour_base: config.hour_base === '1' || config.hour_base === 1 ? 1 : 0,
    alias: alias,
    expected_count: expected_count
  });
  
  return {
    success: true,
    message: localize(language, 'ui.checks_triggered')
  };
}

