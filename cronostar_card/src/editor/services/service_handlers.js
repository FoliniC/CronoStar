/**
 * Service call handlers for CronoStar Editor
 */
import { getEffectivePrefix } from '../../utils/prefix_utils.js';
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
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return { success: true, message: successMessage };
    }
    // Fallback for non-secure contexts or missing API
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      return { success: true, message: successMessage };
    }
    throw new Error('execCommand copy failed');
  } catch (e) {
    console.warn('Clipboard write failed:', e);
    return { success: false, message: errorMessage };
  }
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

/**
 * Initializes/Sanitizes the data JSON file with a default profile
 * Analyzes existing data and ensures validity (boundary points)
 */
export async function handleInitializeData(hass, config, language) {
  const prefix = getEffectivePrefix(config);
  const preset = config.preset_type || config.preset || 'thermostat';
  const profileName = 'Default';
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
    const rest = { ...src };
    delete rest.entity_prefix;
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