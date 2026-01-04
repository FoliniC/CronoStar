import { log } from '../utils/logger_utils.js';

export const I18N = {
  en: {
    steps: {
      tipo: 'Setup',
      entita: 'Advanced',
      opzioni: 'Options',
      fine: 'Finish'
    },
    headers: {
      step0: 'Dashboard',
      step1: 'Basic configuration',
      step1_edit: 'Edit configuration',
      step2: 'Advanced configuration',
      step3: 'Display options',
      step4: 'Automation template',
      step5: 'Summary & verification'
    },
    descriptions: {
      step0: 'Choose an action2222: configure a new preset or analyze existing profiles.',
      step1: 'Configure the essential elements: target entity and identification prefix.',
      step2: 'Optional: configure additional entities (pause, profiles).',
      step3: 'Customize the card appearance and value ranges.',
      step4: 'Use this template to create an automation that applies your schedule.',
      step5: 'Review your configuration and verify the setup.'
    },
    presetNames: {
      thermostat: 'Thermostat',
      ev_charging: 'EV charging',
      generic_kwh: 'Generic kWh',
      generic_temperature: 'Generic temperature',
      generic_switch: 'Generic switch'
    },
    fields: {
      title_label: 'Card Title',
      y_axis_label: 'Y-Axis Label',
      unit_label: 'Unit of Measurement',
      min_label: 'Minimum Value',
      max_label: 'Maximum Value',
      step_label: 'Step Value',
      allow_max_label: 'Allow "Max" Value',
      interval_label: 'Time Interval',
      logging_label: 'Enable Debug Logging',
      enable_logging_label: 'Enable Debug Logging',
      enable_logging_desc: 'Show debug messages in the browser console',
      target_entity_label: 'Target Entity',
      target_entity_desc: 'The entity where scheduled values will be applied (climate, number, or switch).',
      package_label: 'Configuration Package',
      package_desc: 'Copy this “Configuration Package” into {path}. If you continue in the wizard, CronoStar will try to create/update the file automatically (when supported by the backend).',
      enable_pause_label: 'Enable Pause (input_boolean)',
      enable_pause_desc: 'Add a pause switch to temporarily disable the automation',
      enable_profiles_label: 'Enable Multiple Profiles (input_select)',
      enable_profiles_desc: 'Add a profile selector to switch between different schedules',
      keyboard_modifiers_title: 'Keyboard Movement Modifiers',
      keyboard_modifiers_desc: 'Configure how points move when using keyboard arrow keys with modifiers.',
      ctrl_label: 'Ctrl (Precision)',
      shift_label: 'Shift (Snap)',
      alt_label: 'Alt (Fast)',
      horizontal_step: 'Horizontal (min)',
      vertical_step: 'Vertical (unit)',
      language_label: 'Editor Language',
      language_desc: 'Select the language for the editor UI.'
    },
    actions: {
      back: 'Back',
      next: 'Next',
      save: 'Save',
      save_and_close: 'Save & Close',
      advanced_config: 'Advanced configuration',
      show_preview: 'Show preview',
      edit_config: 'Edit configuration',
      edit_config_desc: 'Modify the current parameters of this card',
      new_config: 'New configuration',
      new_config_desc: 'Create a configuration from scratch for this card',
      analyze_status: 'Analyze status',
      analyze_status_desc: 'View all existing files and profiles',
      component_info: 'Component Info'
    },
    prompts: {
      reset_confirm: 'Are you sure you want to reset this card? All current settings will be lost.'
    },
    notify: {
      language_saved: 'Language preference saved!',
      language_save_error: 'Error saving language preference: {error}'
    },
    ui: {
      card_config_complete: 'Card configuration complete',
      card_config_ready: 'Card configuration ready',
      minimal_config_complete: 'Minimal configuration complete',
      minimal_config_needed: 'Minimal configuration needed',
      minimal_config_help: 'Set target entity and identification prefix to proceed.',
      identification_prefix: 'Identification prefix',
      prefix_description: 'Used to identify all CronoStar entities.',
      prefix_description_simple: 'Used to identify all CronoStar entities.',
      prefix_hint: 'Must be lowercase letters/numbers/underscores and end with underscore (_).',
      prefix_ok: 'Prefix looks valid.',
      prefix_bad: 'Invalid prefix. Must end with underscore (_).',
      final_mod_title: 'Final configuration review',
      final_mod_text: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card.'
    },
    finalmodtitle: 'Final configuration review',
    finalmodtext: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card.'
  },

  it: {
    steps: {
      tipo: 'Setup',
      entita: 'Avanzate',
      opzioni: 'Opzioni',
      fine: 'Fine'
    },
    headers: {
      step0: 'Dashboard',
      step1: 'Configurazione base',
      step1_edit: 'Modifica configurazione',
      step2: 'Configurazione avanzata',
      step3: 'Opzioni visualizzazione',
      step4: 'Template automazione',
      step5: 'Riepilogo e verifica'
    },
    descriptions: {
      step0: 'Scegli un\'azione: configurare un nuovo preset o analizzare i profili esistenti.',
      step1: 'Configura gli elementi essenziali: entità di destinazione e prefisso identificativo.',
      step2: 'Opzionale: configura entità aggiuntive (pausa, profili).',
      step3: 'Personalizza l\'aspetto della card e gli intervalli di valori.',
      step4: 'Usa questo template per creare l\'automazione che applica il programma.',
      step5: 'Rivedi la tua configurazione e verifica il setup.'
    },
    presetNames: {
      thermostat: 'Termostato',
      ev_charging: 'Ricarica EV',
      generic_kwh: 'kWh generici',
      generic_temperature: 'Temperatura generica',
      generic_switch: 'Generic switch'
    },
    fields: {
      title_label: 'Titolo della Card',
      y_axis_label: 'Etichetta Asse Y',
      unit_label: 'Unità di Misura',
      min_label: 'Valore Minimo',
      max_label: 'Valore Massimo',
      step_label: 'Valore Step',
      allow_max_label: 'Consenti valore "Max"',
      interval_label: 'Intervallo Temporale',
      logging_label: 'Abilita logging frontend',
      enable_logging_label: 'Abilita logging frontend',
      enable_logging_desc: 'Mostra messaggi di debug nella console del browser',
      target_entity_label: 'Entità di Destinazione',
      target_entity_desc: 'L\'entità da controllare con questa programmazione (es. climate.salotto).',
      package_label: 'Package di configurazione',
      package_desc: 'Copia questo “Configuration package” in {path}. Se prosegui nel wizard, CronoStar proverà a creare/aggiornare automaticamente il file (quando il backend lo supporta).',
      enable_pause_label: 'Abilita Interruttore Pausa',
      enable_profiles_label: 'Abilita Selettore Profili',
      keyboard_modifiers_title: 'Modificatori Movimento Tastiera',
      keyboard_modifiers_desc: 'Configura come i punti si spostano usando le frecce della tastiera con i tasti modificatori.',
      ctrl_label: 'Ctrl (Precisione)',
      shift_label: 'Shift (Snap)',
      alt_label: 'Alt (Veloce)',
      horizontal_step: 'Orizzontale (min)',
      vertical_step: 'Verticale (unità)',
      language_label: 'Lingua Editor',
      language_desc: 'Seleziona la lingua per l\'interfaccia dell\'editor.'
    },
    actions: {
      back: 'Indietro',
      next: 'Avanti',
      save: 'Salva',
      save_and_close: 'Salva e Chiudi',
      advanced_config: 'Configurazione avanzata',
      show_preview: 'Mostra anteprima',
      edit_config: 'Modifica configurazione',
      edit_config_desc: 'Modifica i parametri attuali di questa card',
      new_config: 'Nuova configurazione',
      new_config_desc: 'Crea una configurazione da zero per questa card',
      analyze_status: 'Analizza stato',
      analyze_status_desc: 'Visualizza tutti i file e i profili esistenti',
      component_info: 'Info Componente'
    },
    prompts: {
      reset_confirm: 'Sei sicuro di voler resettare questa card? Tutte le impostazioni correnti andranno perse.'
    },
    notify: {
      language_saved: 'Preferenza lingua salvata!',
      language_save_error: 'Errore nel salvataggio della lingua: {error}'
    },
    ui: {
      card_config_complete: 'Configurazione card completa',
      card_config_ready: 'Card pronta con la configurazione',
      minimal_config_complete: 'Configurazione minima completa',
      minimal_config_needed: 'Configurazione minima necessaria',
      minimal_config_help: 'Imposta entità di destinazione e prefisso identificativo per procedere.',
      identification_prefix: 'Prefisso identificativo',
      prefix_description: 'Usato per identificare tutte le entità CronoStar.',
      prefix_description_simple: 'Usato per identificare tutte le entità CronoStar.',
      prefix_hint: 'Deve terminare con underscore (_).',
      prefix_ok: 'Prefisso valido.',
      prefix_bad: 'Prefisso non valido. Deve terminare con underscore (_).',
      final_mod_title: 'Riepilogo finale configurazione',
      final_mod_text: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace.'
    },
    finalmodtitle: 'Riepilogo finale configurazione',
    finalmodtext: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace.'
  }
};

export class EditorI18n {
  constructor(editor) {
    this.editor = editor;
  }
  _t(path, replacements = {}) {
    let lang = 'en';
    if (typeof this.editor === 'string') {
      lang = this.editor;
    } else if (this.editor) {
      lang = this.editor._language || this.editor._lang || 'en';
    }

    const parts = path.split('.');
    let obj = I18N[lang] || I18N.en;
    for (const part of parts) {
      obj = obj?.[part];
    }
    if (obj === undefined) {
      let fallback = I18N.en;
      for (const part of parts) fallback = fallback?.[part];
      obj = fallback;
    }
    if (obj === undefined) {
      log('warn', this.editor._config.logging, `[EditorI18n] Missing translation: ${path}`);
      return path;
    }
    if (typeof obj === 'string' && Object.keys(replacements).length > 0) {
      let result = obj;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
      }
      return result;
    }
    return obj;
  }
  _getPresetName() {
    const preset = this.editor._selectedPreset || 'thermostat';
    return this._t(`presetNames.${preset}`);
  }
  _localizePreset(key) {
    return this._t(`presetNames.${key}`);
  }
}
