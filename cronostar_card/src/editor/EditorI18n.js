import { log } from '../utils/logger_utils.js'; // NEW: Import log utility

export const I18N = {
  en: {
    steps: {
      tipo: 'Setup',
      entita: 'Advanced',
      opzioni: 'Options',
      automazione: 'Automation',
      fine: 'Finish'
    },
    headers: {
      step0: 'Dashboard',
      step1: 'Basic configuration',
      step1_edit: 'Edit configuration',
      step2: 'Advanced configuration',
      step3: 'Display options',
      step4: 'Automation setup',
      step5: 'Summary & verification'
    },
    descriptions: {
      step0: 'Choose an action: configure a new preset or analyze existing profiles.',
      step1: 'Configure the essential elements: target entity and identification prefix.',
      step2: 'Optional: configure additional entities (pause, profiles) and generate the configuration package.',
      step3: 'Customize the card appearance and value ranges.',
      step4: 'Generate the automation that applies scheduled values every hour.',
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
      // Aliases for legacy keys without underscores
      titlelabel: 'Card title',
      yaxislabel: 'Y-axis label',
      unitlabel: 'Unit of measurement',
      minlabel: 'Minimum value',
      maxlabel: 'Maximum value',
      steplabel: 'Step',
      allowmaxlabel: 'Allow "max" value',
      intervallabel: 'Time interval',
      logginglabel: 'Enable debug logging',
      target_entity_label: 'Target entity',
      target_entity_desc: 'The entity where scheduled values will be applied (climate, number, or switch).',
      package_label: 'Configuration package',
      package_desc: 'Copy this “Configuration package” into {path}. If you continue in the wizard, CronoStar will try to create/update the file automatically (when supported by the backend).',
      enable_pause_label: 'Enable pause (input_boolean)',
      enable_pause_desc: 'Add a pause switch to temporarily disable the automation',
      enable_profiles_label: 'Enable multiple profiles (input_select)',
      enable_profiles_desc: 'Add a profile selector to switch between different schedules',
      title_label: 'Card title',
      y_axis_label: 'Y-axis label',
      unit_label: 'Unit of measurement',
      min_label: 'Minimum value',
      max_label: 'Maximum value',
      step_label: 'Step',
      interval_label: 'Time interval',
      hour_base_label: 'Hour numbering',
      logging_label: 'Enable debug logging',
      allow_max_label: 'Allow "max" value'
    },
    checks: {
      title: 'Configuration check',
      deep_hint: 'Deep checks analyze configuration.yaml and includes to locate helpers and automations.',
      expected_alias_label: 'Expected alias',
      expected_auto_id_label: 'Expected automation ID'
    },
    actions: {
      back: 'Back',
      next: 'Next',
      save: 'Save',
      save_and_create: 'Save & create files',
      advanced_config: 'Advanced configuration',
      copy_yaml: 'Copy YAML',
      download_file: 'Download file',
      create_automation_and_reload: 'Create automation & reload',
      show_preview: 'Show preview',
      run_deep_checks: 'Run deep checks',
      edit_config: 'Edit configuration',
      new_config: 'New configuration',
      analyze_status: 'Analyze status',
      component_info: 'Component Info'
    },
    prompts: {
      reset_confirm: 'Are you sure you want to reset this card? All current settings will be lost.'
    },
    ui: {
      manual_config_title: 'Manual configuration required',
      manual_config_desc: 'If the components above are not READY, ensure your configuration.yaml contains:',
      automatic_entities_desc: 'CronoStar will create the required helper entities automatically when supported.',
      loading_deep_check_results: 'Loading deep check results…',
      card_config_complete: 'Card configuration complete',
      card_config_ready: 'Card configuration ready',
      minimal_config_complete: 'Minimal configuration complete',
      minimal_config_needed: 'Minimal configuration needed',
      minimal_config_help: 'Set target entity and identification prefix to proceed.',
      minimal_config_info_no_package: 'This will create {entity}.',
      identification_prefix: 'Identification prefix',
      prefix_description: 'Used to identify all CronoStar entities.',
      prefix_description_simple: 'Used to identify all CronoStar entities.',
      prefix_hint: 'Must be lowercase letters/numbers/underscores and end with underscore (_).',
      prefix_ok: 'Prefix looks valid.',
      prefix_bad: 'Invalid prefix. Must end with underscore (_).',
      missing_apply: 'Target entity is missing. Please set it in Step 1.',
      final_mod_title: 'Final configuration review',
      final_mod_text: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card and the integration will attempt to automatically create the required automation files.',
      fix_step_to_proceed: 'Please fix fields to proceed.',
      service_check_setup_not_available: 'Deep checks service is not available',
      automatic_entities_title: 'Automatic entities',
      automations_path_not_determined: 'Automations path not determined. Run deep checks first.',
      inline_automation_use_ui: 'Inline automations must be edited via the UI.',
      cronostar_automation_yaml: 'CronoStar automation YAML',
      copy: 'Copy',
      yaml_copied_go_to_automations: 'YAML copied. Go to settings → automations to paste it.',
      switch_off: 'Off',
      switch_on: 'On',
      automation_created_successfully: 'Automation created and reloaded successfully.',
      checks_triggered: 'Checks triggered successfully.',
      entity_selector_unavailable: 'Entity selector (ha-selector) is not available in this context. You can type the entity_id manually.'
    },
    // Root-level fallbacks for legacy keys
    finalmodtitle: 'Final configuration review',
    finalmodtext: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card and the integration will attempt to automatically create the required automation files.'
  },

  it: {
    steps: {
      tipo: 'Setup',
      entita: 'Avanzate',
      opzioni: 'Opzioni',
      automazione: 'Automazione',
      fine: 'Fine'
    },
    headers: {
      step0: 'Dashboard',
      step1: 'Configurazione base',
      step2: 'Configurazione avanzata',
      step3: 'Opzioni visualizzazione',
      step4: 'Setup automazione',
      step5: 'Riepilogo e verifica'
    },
    descriptions: {
      step0: 'Scegli un\'azione: configurare un nuovo preset o analizzare i profili esistenti.',
      step1: 'Configura gli elementi essenziali: entità di destinazione e prefisso identificativo.',
      step2: 'Opzionale: configura entità aggiuntive (pausa, profili) e genera la configurazione.',
      step3: 'Personalizza l\'aspetto della card e gli intervalli di valori.',
      step4: 'Genera l\'automazione che applica i valori programmati ogni ora.',
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
      titlelabel: 'Titolo card',
      yaxislabel: 'Etichetta asse Y',
      unitlabel: 'Unità di misura',
      minlabel: 'Valore minimo',
      maxlabel: 'Valore massimo',
      steplabel: 'Passo',
      allowmaxlabel: 'Consenti valore "max"',
      intervallabel: 'Intervallo temporale',
      logginglabel: 'Enable debug logging',
      enable_logging_label: 'Enable frontend logging',
      enable_logging_desc: 'Enables verbose console logging for debugging frontend issues.',
      target_entity_label: 'Entità di destinazione',
      target_entity_desc: 'L\'entità su cui verranno applicati i valori programmati (climate, number o switch).',
      package_label: 'Package di configurazione',
      package_desc: 'Copia questo “Configuration package” in {path}. Se prosegui nel wizard, CronoStar proverà a creare/aggiornare automaticamente il file (quando il backend lo supporta).',
      enable_pause_label: 'Abilita pausa (input_boolean)',
      enable_pause_desc: 'Aggiungi un interruttore pausa per disabilitare temporaneamente l\'automazione',
      enable_profiles_label: 'Abilita profili multipli (input_select)',
      enable_profiles_desc: 'Aggiungi un selettore profili per passare tra diversi programmi',
      title_label: 'Titolo card',
      y_axis_label: 'Etichetta asse Y',
      unit_label: 'Unità di misura',
      min_label: 'Valore minimo',
      max_label: 'Valore massimo',
      step_label: 'Passo',
      interval_label: 'Intervallo temporale',
      hour_base_label: 'Numerazione ore',
      logging_label: 'Abilita logging debug',
      allow_max_label: 'Consenti valore "max"',
      enable_logging_label: 'Abilita logging frontend', // NEW
      enable_logging_desc: 'Abilita la registrazione dettagliata sulla console per il debug dei problemi del frontend.' // NEW
    },
    checks: {
      title: 'Verifica configurazione',
      deep_hint: 'Le verifiche approfondite analizzano configuration.yaml e gli include per localizzare helpers e automazioni.',
      expected_alias_label: 'Alias atteso',
      expected_auto_id_label: 'ID automazione atteso'
    },
    actions: {
      back: 'Indietro',
      next: 'Avanti',
      save: 'Salva',
      save_and_create: 'Salva & crea file',
      advanced_config: 'Configurazione avanzata',
      copy_yaml: 'Copia YAML',
      download_file: 'Scarica file',
      create_automation_and_reload: 'Crea automazione e ricarica',
      show_preview: 'Mostra anteprima',
      run_deep_checks: 'Esegui verifiche approfondite',
      edit_config: 'Modifica configurazione',
      new_config: 'Nuova configurazione',
      analyze_status: 'Analizza stato',
      component_info: 'Info Componente'
    },
    prompts: {
      reset_confirm: 'Sei sicuro di voler resettare questa card? Tutte le impostazioni correnti andranno perse.'
    },
    ui: {
      manual_config_title: 'Configurazione manuale richiesta',
      manual_config_desc: 'Se i componenti sopra non sono PRONTI, assicurati che il tuo configuration.yaml contenga:',
      automatic_entities_desc: 'CronoStar creerà automaticamente le entità helper necessarie quando supportato.',
      loading_deep_check_results: 'Caricamento risultati verifiche approfondite…',
      card_config_complete: 'Configurazione card completa',
      card_config_ready: 'Card pronta con la configurazione',
      minimal_config_complete: 'Configurazione minima completa',
      minimal_config_needed: 'Configurazione minima necessaria',
      minimal_config_help: 'Imposta entità di destinazione e prefisso identificativo per procedere.',
      minimal_config_info_no_package: 'Questo creerà {entity}.',
      identification_prefix: 'Prefisso identificativo',
      prefix_description: 'Usato per identificare tutte le entità CronoStar.',
      prefix_description_simple: 'Usato per identificare tutte le entità CronoStar.',
      prefix_hint: 'Deve terminare con underscore (_).',
      prefix_ok: 'Prefisso valido.',
      prefix_bad: 'Prefisso non valido. Deve terminare con underscore (_).',
      missing_apply: 'Entità di destinazione mancante. Impostala nel Passo 1.',
      final_mod_title: 'Riepilogo finale configurazione',
      final_mod_text: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace e l\'integrazione tenterà di creare automaticamente i file di automazione necessari.',
      fix_step_to_proceed: 'Correggi i campi per proseguire.',
      service_check_setup_not_available: 'Servizio di verifiche approfondite non disponibile',
      automatic_entities_title: 'Entità automatiche',
      automations_path_not_determined: 'Percorso automazioni non determinato. Esegui prima le verifiche approfondite.',
      inline_automation_use_ui: 'Le automazioni inline vanno modificate dalla UI.',
      cronostar_automation_yaml: 'YAML automazione CronoStar',
      copy: 'Copia',
      yaml_copied_go_to_automations: 'YAML copiato. Vai in impostazioni → automazioni per incollarlo.',
      switch_off: 'Spento',
      switch_on: 'Acceso',
      automation_created_successfully: 'Automazione creata e ricaricata con successo.',
      checks_triggered: 'Verifiche avviate con successo.',
      entity_selector_unavailable: 'Il selector entità (ha-selector) non è disponibile in questo contesto. Puoi inserire l’entity_id manualmente.'
    },
    // Chiavi legacy a livello radice
    finalmodtitle: 'Riepilogo finale configurazione',
    finalmodtext: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace e l\'integrazione tenterà di creare automaticamente i file di automazione necessari.'
  }
};

export class EditorI18n {
  constructor(editor) {
    this.editor = editor;
  }
  _t(path, replacements = {}) {
    // Robust language detection
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
