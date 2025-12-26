/**
 * EditorI18n.js - Complete Internationalization for CronoStar Editor
 * Supports: English (en) and Italian (it)
 */

export const I18N = {
  en: {
    step2_msgs: {
      prefix_ok: 'Prefix looks valid.'
    },
    steps: {
      tipo: 'Setup',
      entita: 'Advanced',
      opzioni: 'Options',
      automazione: 'Automation',
      fine: 'Finish'
    },
    headers: {
      step0: 'Dashboard',  // NUOVO
      step1: 'Basic Configuration',
      step1_edit: 'Edit Configuration',
      step2: 'Advanced Configuration',
      step3: 'Display Options',
      step4: 'Automation Setup',
      step5: 'Summary & Verification'
    },
    descriptions: {
      step0: 'Choose an action: configure a new preset or analyze existing profiles.',  // NUOVO
      step1: 'Configure the essential elements: target entity and identification prefix.',
      step2: 'Optional: configure additional entities (pause, profiles) and generate the configuration package.',
      step3: 'Customize the card appearance and value ranges.',
      step4: 'Generate the automation that applies scheduled values every hour.',
      step5: 'Review your configuration and verify the setup.'
    },
    presetNames: {
      thermostat: 'Thermostat',
      ev_charging: 'EV Charging',
      generic_kwh: 'Generic kWh',
      generic_temperature: 'Generic Temperature',
      generic_switch: 'Switch'
    },
    fields: {
      // Aliases for legacy keys without underscores
      titlelabel: 'Card Title',
      yaxislabel: 'Y-Axis Label',
      unitlabel: 'Unit of Measurement',
      minlabel: 'Minimum Value',
      maxlabel: 'Maximum Value',
      steplabel: 'Step',
      allowmaxlabel: 'Allow "Max" Value',
      intervallabel: 'Time Interval',
      logginglabel: 'Enable Debug Logging',
      target_entity_label: 'Target Entity',
      target_entity_desc: 'The entity where scheduled values will be applied (climate, number, or switch).',
      package_label: 'Configuration Package',
      package_desc: 'Copy this “Configuration Package” into {path}. If you continue in the wizard, CronoStar will try to create/update the file automatically (when supported by the backend).',
      enable_pause_label: 'Enable Pause (input_boolean)',
      enable_pause_desc: 'Add a pause switch to temporarily disable the automation',
      enable_profiles_label: 'Enable Multiple Profiles (input_select)',
      enable_profiles_desc: 'Add a profile selector to switch between different schedules',
      // entity_prefix removed (breaking change): use global_prefix
      title_label: 'Card Title',
      y_axis_label: 'Y-Axis Label',
      unit_label: 'Unit of Measurement',
      min_label: 'Minimum Value',
      min_desc: 'Minimum allowed value in the chart.',
      max_label: 'Maximum Value',
      max_desc: 'Maximum allowed value in the chart.',
      step_label: 'Step',
      step_desc: 'Increment for value adjustments.',
      interval_label: 'Time Interval',
      interval_desc: 'Select the time resolution. Lower values create more points but require more entities.',
      hour_base_label: 'Hour Numbering',
      hour_base_desc: 'Hour numbering format (0-23 or 1-24). "Auto" detects automatically.',
      logging_label: 'Enable Debug Logging',
      logging_desc: 'Shows detailed logs in browser console for troubleshooting.',
      allow_max_label: 'Allow "Max" Value',
      allow_max_desc: 'Enables a symbolic "Max" value, useful for dynamic solar charging logic.'
    },
    checks: {
      title: 'Configuration Check',
      deep_hint: 'Deep checks analyze configuration.yaml and includes to locate helpers and automations.',
      expected_alias_label: 'Expected alias',
      expected_auto_id_label: 'Expected automation ID'
    },
    what_to_do_next: {
      title: 'Next Steps:'
      // Nota: rimosso explicit save configuration step
    },
    actions: {
      back: 'Back',
      next: 'Next',
      save: 'Save',
      save_and_create: 'Save & Create Files',
      advanced_config: 'Advanced Configuration',
      copy_yaml: 'Copy YAML',
      download_file: 'Download File',
      create_automation_and_reload: 'Create Automation & Reload',
      show_preview: 'Show Preview',
      run_deep_checks: 'Run Deep Checks'
    },
    ui: {
      automatic_entities_desc: 'CronoStar will create the required helper entities automatically when supported.',
      loading_deep_check_results: 'Loading deep check results…',
      card_config_complete: 'Card configuration complete',
      card_config_ready: 'Card configuration ready',
      minimal_config_complete: 'Minimal configuration complete',
      minimal_config_needed: 'Minimal configuration needed',
      minimal_config_help: 'Set target entity and identification prefix to proceed.',
      minimal_config_info: 'This will create {entity} and the package file {package}.',
      identification_prefix: 'Identification Prefix',
      // Provide missing legacy key to avoid console warnings
      prefix_description: 'Used to identify all CronoStar entities.',
      prefix_description_simple: 'Used to identify all CronoStar entities.',
      prefix_hint: 'Must be lowercase letters/numbers/underscores and end with underscore (_).',
      final_mod_title: 'Final Configuration Review',
      final_mod_text: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card and the integration will attempt to automatically create the required YAML package and automation files.',
      fix_step_to_proceed: 'Please fix fields to proceed.',
      service_check_setup_not_available: 'Deep checks service is not available',
      automatic_entities_title: 'Automatic Entities',
      automations_path_not_determined: 'Automations path not determined. Run Deep Checks first.',
      inline_automation_use_ui: 'Inline automations must be edited via the UI.',
      cronostar_automation_yaml: 'CronoStar Automation YAML',
      copy: 'Copy',
      yaml_copied_go_to_automations: 'YAML copied. Go to Settings → Automations to paste it.',
      switch_off: 'Off',
      switch_on: 'On',
      automation_created_successfully: 'Automation created and reloaded successfully.',
      checks_triggered: 'Checks triggered successfully.'
    }
    ,
    // Root-level fallbacks for legacy keys
    finalmodtitle: 'Final Configuration Review',
    finalmodtext: 'The wizard has prepared the parameters below. When you click "Save", they will be applied to your Lovelace card and the integration will attempt to automatically create the required YAML package and automation files.'
  },

  it: {
    step2_msgs: {
      prefix_ok: 'Prefisso valido.'
    },
    steps: {
      tipo: 'Setup',
      entita: 'Avanzate',
      opzioni: 'Opzioni',
      automazione: 'Automazione',
      fine: 'Fine'
    },
    headers: {
      step0: 'Dashboard',  // NUOVO
      step1: 'Configurazione Base',
      step2: 'Configurazione Avanzata',
      step3: 'Opzioni Visualizzazione',
      step4: 'Setup Automazione',
      step5: 'Riepilogo e Verifica'
    },
    descriptions: {
      step0: 'Scegli un\'azione: configurare un nuovo preset o analizzare i profili esistenti.',  // NUOVO
      step1: 'Configura gli elementi essenziali: entità di destinazione e prefisso identificativo.',
      step2: 'Opzionale: configura entità aggiuntive (pausa, profili) e genera il package di configurazione.',
      step3: 'Personalizza l\'aspetto della card e gli intervalli di valori.',
      step4: 'Genera l\'automazione che applica i valori programmati ogni ora.',
      step5: 'Rivedi la tua configurazione e verifica il setup.'
    },
    presetNames: {
      thermostat: 'Termostato',
      ev_charging: 'Ricarica EV',
      generic_kwh: 'kWh Generici',
      generic_temperature: 'Temperatura Generica',
      generic_switch: 'Interruttore'
    },
    fields: {
      // Alias per chiavi legacy senza underscore
      titlelabel: 'Titolo Card',
      yaxislabel: 'Etichetta Asse Y',
      unitlabel: 'Unità di Misura',
      minlabel: 'Valore Minimo',
      maxlabel: 'Valore Massimo',
      steplabel: 'Passo',
      allowmaxlabel: 'Consenti Valore "Max"',
      intervallabel: 'Intervallo Temporale',
      logginglabel: 'Abilita Logging Debug',
      target_entity_label: 'Entità di Destinazione',
      target_entity_desc: 'L\'entità su cui verranno applicati i valori programmati (climate, number o switch).',
      package_label: 'Package di Configurazione',
      package_desc: 'Copia questo “Configuration Package” in {path}. Se prosegui nel wizard, CronoStar proverà a creare/aggiornare automaticamente il file (quando il backend lo supporta).',
      enable_pause_label: 'Abilita Pausa (input_boolean)',
      enable_pause_desc: 'Aggiungi un interruttore pausa per disabilitare temporaneamente l\'automazione',
      enable_profiles_label: 'Abilita Profili Multipli (input_select)',
      enable_profiles_desc: 'Aggiungi un selettore profili per passare tra diversi programmi',
      // entity_prefix rimosso (breaking change): usa global_prefix
      title_label: 'Titolo Card',
      y_axis_label: 'Etichetta Asse Y',
      unit_label: 'Unità di Misura',
      min_label: 'Valore Minimo',
      max_label: 'Valore Massimo',
      step_label: 'Passo',
      interval_label: 'Intervallo Temporale',
      interval_desc: 'Valori più bassi creano più punti ma richiedono più entità.',
      hour_base_label: 'Numerazione Ore',
      hour_base_desc: 'Formato numerazione ore (0-23 o 1-24). "Auto" rileva automaticamente.',
      logging_label: 'Abilita Logging Debug',
      logging_desc: 'Mostra log dettagliati nella console.',
      allow_max_label: 'Consenti Valore "Max"',
      allow_max_desc: 'Abilita un valore simbolico "Max".'
    },
    checks: {
      title: 'Verifica Configurazione',
      deep_hint: 'Le verifiche approfondite analizzano configuration.yaml e gli include per localizzare helpers e automazioni.',
      expected_alias_label: 'Alias atteso',
      expected_auto_id_label: 'ID automazione atteso'
    },
    what_to_do_next: {
      title: 'Prossimi Passi:'
      // Rimosso il punto "Salva la configurazione della card" come da richiesta
    },
    actions: {
      back: 'Indietro',
      next: 'Avanti',
      save: 'Salva',
      save_and_create: 'Salva & crea file',
      advanced_config: 'Configurazione Avanzata',
      copy_yaml: 'Copia YAML',
      download_file: 'Scarica File',
      create_automation_and_reload: 'Crea Automazione e Ricarica',
      show_preview: 'Mostra Anteprima',
      run_deep_checks: 'Esegui Verifiche Approfondite'
    },
    ui: {
      automatic_entities_desc: 'CronoStar creerà automaticamente le entità helper necessarie quando supportato.',
      loading_deep_check_results: 'Caricamento risultati verifiche approfondite…',
      card_config_complete: 'Configurazione card completa',
      card_config_ready: 'Card pronta con la configurazione',
      minimal_config_complete: 'Configurazione minima completa',
      minimal_config_needed: 'Configurazione minima necessaria',
      minimal_config_help: 'Imposta entità di destinazione e prefisso identificativo per procedere.',
      minimal_config_info: 'Questo creerà {entity} e il file package {package}.',
      identification_prefix: 'Prefisso Identificativo',
      // Chiave legacy per evitare warning in console
      prefix_description: 'Usato per identificare tutte le entità CronoStar.',
      prefix_description_simple: 'Usato per identificare tutte le entità CronoStar.',
      prefix_hint: 'Deve terminare con underscore (_).',
      final_mod_title: 'Riepilogo finale configurazione',
      final_mod_text: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace e l\'integrazione tenterà di creare automaticamente il file package YAML e l\'automazione necessaria.',
      fix_step_to_proceed: 'Correggi i campi per proseguire.',
      service_check_setup_not_available: 'Servizio di verifiche approfondite non disponibile',
      automatic_entities_title: 'Entità automatiche',
      automations_path_not_determined: 'Percorso automazioni non determinato. Esegui prima le Verifiche Approfondite.',
      inline_automation_use_ui: 'Le automazioni inline vanno modificate dalla UI.',
      cronostar_automation_yaml: 'YAML Automazione CronoStar',
      copy: 'Copia',
      yaml_copied_go_to_automations: 'YAML copiato. Vai in Impostazioni → Automazioni per incollarlo.',
      switch_off: 'Spento',
      switch_on: 'Acceso',
      automation_created_successfully: 'Automazione creata e ricaricata con successo.',
      checks_triggered: 'Verifiche avviate con successo.'
    }
    ,
    // Chiavi legacy a livello radice
    finalmodtitle: 'Riepilogo finale configurazione',
    finalmodtext: 'Il wizard ha preparato i parametri seguenti. Cliccando su "Salva", verranno applicati alla card Lovelace e l\'integrazione tenterà di creare automaticamente il file package YAML e l\'automazione necessaria.'
  }
};

export class EditorI18n {
  constructor(editor) {
    this.editor = editor;
  }
  _t(path, replacements = {}) {
    const lang = this.editor._lang || 'en';
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
      console.warn(`[EditorI18n] Missing translation: ${path}`);
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
