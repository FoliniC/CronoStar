export const I18N = {
  en: {
    steps: { tipo: 'Type', entita: 'Entities', opzioni: 'Options', automazione: 'Automation', fine: 'Finish' },
    headers: {
      step1: 'Select what you want to schedule',
      step2: 'Configure entities',
      step3: 'Advanced options',
      step4: 'Hourly automation',
      step5: 'Configuration completed!'
    },
    descriptions: {
      step1: 'Choose what you want to control with CronoStar. This sets units and the chart defaults.',
      step2: 'Select Home Assistant entities CronoStar will use to store and apply hourly values.',
      step3: 'Customize CronoStar behavior and appearance. All parameters are optional.',
      step4: 'CronoStar generated the automation that will apply scheduled values every hour.',
      step5: 'CronoStar is ready. Here is a summary of your configuration:'
    },
    presets: {
      thermostat: { title: 'Thermostat', desc: 'Schedule hourly temperatures for heating/cooling', icon: '🌡️' },
      ev_charging: { title: 'EV Charging', desc: 'Schedule EV charging power', icon: '🔌' },
      generic_kwh: { title: 'Generic kWh', desc: 'Schedule hourly energy limits (0-7 kWh)', icon: '⚡' },
      generic_temperature: { title: 'Generic Temperature', desc: 'Schedule generic temperatures (0-40°C)', icon: '🌡️' },
      generic_switch: { title: 'Switch', desc: 'Schedule device on/off', icon: '💡' }
    },
    fields: {
      entity_prefix_label: 'Hourly entity prefix (required)',
      entity_prefix_desc: 'Prefix for 24 input_number entities. The card will read input_number.<prefix>HH (HH=00..23 or 01..24). Example: "cronostar_temp_" → input_number.cronostar_temp_00..23',
      entity_prefix_hint: 'Must be lowercase letters/numbers/underscores and end with an underscore (_).',
      apply_entity_label: 'Target entity (required)',
      apply_entity_desc: 'The entity where scheduled values will be applied (climate, number, or switch).',
      profiles_select_label: 'Profiles select (optional)',
      profiles_select_desc: 'input_select that contains the names of saved profiles.',
      pause_entity_label: 'Pause entity (optional)',
      pause_entity_desc: 'input_boolean to temporarily suspend the automation. When ON, scheduled values are not applied.',
      title_label: 'Card title',
      title_desc: 'Title shown in the card header. If empty, preset title will be used.',
      hour_base_label: 'Hour numbering (hour_base)',
      hour_base_desc: 'Defines whether input_numbers use 0-23 or 1-24 numbering. "Auto" detects automatically.',
      logging_label: 'Enable extended logging (debug)',
      logging_desc: 'Shows detailed logs in the browser console for troubleshooting.',
      allow_max_label: 'Allow special "Max" value',
      allow_max_desc: 'Enables a symbolic "Max" value, useful for dynamic solar charging logic.',
      y_axis_label: 'Y-axis label',
      y_axis_desc: 'Custom label for the Y-axis (e.g., Temperature, Power, Energy).',
      unit_label: 'Unit of measurement',
      unit_desc: 'Displayed unit (e.g., °C, kW, kWh).',
      min_label: 'Minimum value',
      min_desc: 'Minimum allowed value in the chart.',
      max_label: 'Maximum value',
      max_desc: 'Maximum allowed value in the chart.',
      step_label: 'Step',
      step_desc: 'Step for value adjustments.',
      helpers_label: 'Hourly values helpers (input_number)',
      helpers_desc: 'CronoStar needs 24 input_number entities (one per hour) using the chosen prefix. Generate their YAML below and add it to configuration.yaml or in packages/.'
    },
    step2_msgs: {
      missing_apply: 'The target entity is required to auto-generate the automation in the next step.',
      apply_ok: 'Great! Target entity configured. Proceed to generate the automation.',
      prefix_ok: 'Prefix looks valid.',
      prefix_bad: 'Invalid prefix format. Please fix it to continue.',
      helpers_ready: 'Helpers YAML generated. Copy or download and add it to HA, then restart.',
      helpers_prefix_missing: 'Please set a valid prefix ending with underscore (e.g., cronostar_switch_).'
    },
    actions: {
      back: '← Back',
      next: 'Next →',
      save: '✓ Save configuration',
      copy_yaml: '📋 Copy YAML',
      download_file: '💾 Download file',
      create_automation: '✨ Create automation',
      show_preview: 'Show YAML preview',
      copy_helpers_yaml: '📋 Copy helpers YAML',
      download_helpers_file: '💾 Download helpers file',
      run_quick_checks: '🔍 Run quick checks',
      run_deep_checks: '🧠 Run deep checks',
      create_automation_and_reload: '✨ Create & Reload Automation'
    },
    auto: {
      ready: '✓ Automation ready!',
      will_apply: 'The automation will apply values for',
      to_entity: 'to entity',
      paused_by: 'It is conditioned by pause entity:'
    },
    howto: {
      title: 'How to proceed:',
      steps:
        [
          'Quick method: click "Create automation" to add it directly in HA',
          'Manual method: copy the YAML and paste it in automations.yaml',
          'File method: download the file and import it via HA UI'
        ]
    },
    summary: {
      config: 'Card configuration:',
      preset: 'Preset',
      target: 'Target entity',
      profiles: 'Profiles select',
      pause: 'Pause entity'
    },
    tips: {
      title: 'Tips:',
      items:
        [
          'Use Shift + drag to select multiple hours',
          'Use Ctrl/Cmd + A to select all hours',
          'Arrow up/down changes selected values',
          'You can change the preset later from the card settings'
        ]
    },
    important: {
      title: 'Important:',
      text: 'Remember to restart Home Assistant if you modified YAML files in packages/ or automations/.'
    },
    presetNames: {
      thermostat: 'Thermostat',
      ev_charging: 'EV Charging',
      generic_kwh: 'Generic kWh',
      generic_temperature: 'Generic Temperature',
      generic_switch: 'Switch'
    },
    entity_desc_by_preset: {
      thermostat: 'Select the climate entity of your thermostat (e.g., climate.living_room)',
      ev_charging: 'Select the number entity controlling charging power (e.g., number.wallbox_power)',
      generic_switch: 'Select the switch to control (e.g., switch.washing_machine)',
      generic_kwh: 'Select the number entity to control (e.g., number.power_limit)',
      generic_temperature: 'Select the number entity to control (e.g., number.generic_temperature)'
    },
    messages: {
      cfg_incomplete: '✗ Incomplete configuration',
      yaml_copied: '✓ YAML copied to clipboard',
      yaml_copy_error: '✗ Copy error',
      file_downloaded: '✓ File downloaded',
      file_download_error: '✗ Download error',
      auto_created: '✓ Automation created successfully!',
      auto_error_prefix: '✗ Error: ',
      helpers_yaml_copied: '✓ Helpers YAML copied to clipboard',
      helpers_yaml_downloaded: '✓ File helpers downloaded',
      helpers_yaml_error: '✗ Errore nella preparazione dello YAML helpers',
      deep_checks_triggered: '✓ Deep checks triggered. See Persistent Notifications for the full report.',
      deep_checks_integration_missing: 'Update the CronoStar integration to expose the "cronostar.check_setup" service for deep checks.',
      fix_step_to_proceed: 'Please fix the issues in this step to proceed.'
    },
    ui: {
      identification_prefix: 'Identification prefix',
      prefix_description: 'Prefix to use for all created entities. Must end with underscore (_).',
      prefix_hint: 'The prefix will automatically update if you change the selected type.',
      loading_deep_check_results: 'Loading deep check results...',
      helpers_check: 'Helpers Check',
      all_required_helpers_present: 'All required helpers are present.',
      missing_helpers_count: 'Missing {count} helpers. Use the section below to create them.',
      create_file_on_ha: 'Create File (on HA)',
      run_deep_checks_first: 'Run deep checks first to determine the correct directory path',
      automations_path_not_determined: 'Automations path not determined',
      inline_automation_use_ui: 'Inline automation: use Home Assistant UI',
      automation_created_successfully: '✓ Automation created successfully!',
      yaml_copied_go_to_automations: 'YAML copied. Go to Settings → Automations',
      copy: 'Copy',
      cronostar_automation_yaml: 'CronoStar - Automation YAML',
      service_check_setup_not_available: 'Service check_setup not available',
      checks_triggered: '✓ Checks triggered'
    },
    checks: {
      title: 'Setup verification',
      quick_ok: '✓ Quick checks passed',
      quick_warn: '⚠️ Quick checks found issues',
      auto_ok: 'Automation entity found in Home Assistant.',
      auto_missing: 'Automation entity not found yet.',
      deep_hint: 'Deep checks read configuration.yaml and includes to locate helpers and automations.',
      location_prefix: 'Location:',
      location_inline_conf: 'inline in configuration.yaml',
      location_include_file: 'included file',
      location_include_dir_named: 'included directory (merge_named)',
      location_include_dir_list: 'included directory (merge_list)',
      location_none: 'sezione non definita in configuration.yaml',
      location_unknown: 'sconosciuta',
      runtime_total_found_label: 'Runtime total found',
      runtime_prefixed_label: 'Runtime matching prefix (\'{prefix}\')',
      hour_base_label: 'Hour base',
      missing_helpers_label: 'Missing expected helpers',
      automations_title: 'Automations',
      yaml_count_label: 'YAML count',
      storage_count_label: 'Storage count',
      found_by_alias_label: 'Trovato per alias',
      no_automation_found_label: 'Nessuna automazione trovata con l\'alias previsto',
      automation_create_where_title: 'Where to create automation',
      default_automation_create_where: 'Default: automations.yaml (or via UI)',
      deep_report_label: 'Report verifiche approfondite',
      no_report: 'Nessun report disponibile. Esegui le verifiche approfondite per generare un report.',
      expected_alias_label: 'Alias atteso',
      expected_auto_id_label: 'ID automazione atteso'
    }
  },
  it: {
    steps: { tipo: 'Tipo', entita: 'Entità', opzioni: 'Opzioni', automazione: 'Automazione', fine: 'Fine' },
    headers: {
      step1: 'Seleziona cosa vuoi programmare',
      step2: 'Configura le entità',
      step3: 'Opzioni avanzate',
      step4: 'Automazione oraria',
      step5: 'Configurazione completata!'
    },
    descriptions: {
      step1: 'Scegli cosa vuoi controllare con CronoStar. Questa scelta imposta unità e valori predefiniti del grafico.',
      step2: 'Seleziona le entità di Home Assistant che CronoStar userà per memorizzare e applicare i valori orari.',
      step3: 'Personalizza il comportamento e l\'aspetto di CronoStar. Tutti i parametri sono opzionali.',
      step4: 'CronoStar ha generato l\'automazione che applicherà i valori programmati ogni ora.',
      step5: 'CronoStar è pronto. Ecco un riepilogo della configurazione:'
    },
    presets: {
      thermostat: { title: 'Termostato', desc: 'Programma temperature orarie per riscaldamento/raffrescamento', icon: '🌡️' },
      ev_charging: { title: 'Ricarica EV', desc: 'Programma la potenza di ricarica del veicolo elettrico', icon: '🔌' },
      generic_kwh: { title: 'kWh Generici', desc: 'Programma limiti energetici orari (0-7 kWh)', icon: '⚡' },
      generic_temperature: { title: 'Temperatura Generica', desc: 'Programma temperature generiche (0-40°C)', icon: '🌡️' },
      generic_switch: { title: 'Interruttore', desc: 'Programma accensione/spegnimento dispositivi', icon: '💡' }
    },
    fields: {
      entity_prefix_label: 'Prefisso entità orarie (obbligatorio)',
      entity_prefix_desc: 'Prefisso per 24 entità input_number. La card leggerà input_number.<prefisso>HH (HH=00..23 o 01..24). Esempio: "cronostar_temp_" → input_number.cronostar_temp_00..23',
      entity_prefix_hint: 'Deve usare lettere/numeri/underscore minuscoli e terminare con underscore (_).',
      apply_entity_label: 'Entità di destinazione (obbligatoria)',
      apply_entity_desc: 'Entità su cui applicare i valori (climate, number o switch).',
      profiles_select_label: 'Selettore profili (opzionale)',
      profiles_select_desc: 'input_select che contiene i nomi dei profili salvati.',
      pause_entity_label: 'Entità pausa (opzionale)',
      pause_entity_desc: 'input_boolean per sospendere temporaneamente l\'automazione. Quando è ON, i valori non vengono applicati.',
      title_label: 'Titolo della card',
      title_desc: 'Testo mostrato nell\'intestazione della card. Se vuoto, usa il titolo del preset.',
      hour_base_label: 'Numerazione ore (hour_base)',
      hour_base_desc: 'Definisce se gli input_number usano 0-23 o 1-24. "Auto" rileva automaticamente.',
      logging_label: 'Abilita logging esteso (debug)',
      logging_desc: 'Mostra log dettagliati nella console del browser per diagnosticare problemi.',
      allow_max_label: 'Consenti valore speciale "Max"',
      allow_max_desc: 'Abilita un valore "Max", utile per logiche di ricarica solare dinamica.',
      y_axis_label: 'Etichetta asse Y',
      y_axis_desc: 'Etichetta personalizzata dell\'asse Y (es. Temperatura, Potenza, Energia).',
      unit_label: 'Unità di misura',
      unit_desc: 'Unità visualizzata (es: °C, kW, kWh).',
      min_label: 'Valore minimo',
      min_desc: 'Valore minimo consentito nel grafico.',
      max_label: 'Valore massimo',
      max_desc: 'Valore massimo consentito nel grafico.',
      step_label: 'Passo',
      step_desc: 'Incremento per la modifica dei valori.',
      helpers_label: 'Helper orari (input_number)',
      helpers_desc: 'CronoStar necessita di 24 entità input_number (una per ora) con il prefisso scelto. Genera lo YAML qui sotto e aggiungilo in configuration.yaml o in packages/.'
    },
    step2_msgs: {
      missing_apply: 'L\'entità di destinazione è obbligatoria per generare automaticamente l\'automazione nel prossimo passaggio.',
      apply_ok: 'Perfetto! Entità di destinazione configurata. Procedi per generare l\'automazione.',
      prefix_ok: 'Prefisso valido.',
      prefix_bad: 'Formato prefisso non valido. Correggi per proseguire.',
      helpers_ready: 'Helpers YAML generato. Copialo o scaricalo, aggiungilo in HA e riavvia.',
      helpers_prefix_missing: 'Imposta un prefisso valido che termini con underscore (es: cronostar_switch_).'
    },
    actions: {
      back: '← Indietro',
      next: 'Avanti →',
      save: '✓ Salva configurazione',
      copy_yaml: '📋 Copia YAML',
      download_file: '💾 Scarica file',
      create_automation: '✨ Crea automazione',
      show_preview: 'Mostra anteprima YAML',
      copy_helpers_yaml: '📋 Copia YAML helpers',
      download_helpers_file: '💾 Scarica file helpers',
      run_quick_checks: '🔍 Esegui verifiche rapide',
      run_deep_checks: '🧠 Esegui verifiche approfondite',
      create_automation_and_reload: '✨ Crea e Ricarica Automazione'
    },
    auto: {
      ready: '✓ Automazione pronta!',
      will_apply: 'L\'automazione applicherà i valori di',
      to_entity: 'all\'entità',
      paused_by: 'È condizionata dall\'entità pausa:'
    },
    howto: {
      title: 'Come procedere:',
      steps:
        [
          'Metodo rapido: clicca "Crea automazione" per aggiungerla direttamente in HA',
          'Metodo manuale: copia lo YAML e incollalo in automations.yaml',
          'Metodo file: scarica il file e importalo dall\'interfaccia di HA'
        ]
    },
    summary: {
      config: 'Configurazione card:',
      preset: 'Preset',
      target: 'Entità destinazione',
      profiles: 'Selettore profili',
      pause: 'Entità pausa'
    },
    tips: {
      title: 'Suggerimenti:',
      items:
        [
          'Usa Shift + drag per selezionare più ore',
          'Usa Ctrl/Cmd + A per selezionare tutte le ore',
          'Le frecce su/giù modificano i valori selezionati',
          'Puoi cambiare preset dal menu della card in qualsiasi momento'
        ]
    },
    important: {
      title: 'Importante:',
      text: 'Ricorda di riavviare Home Assistant se hai modificato file YAML in packages/ o automations/.'
    },
    presetNames: {
      thermostat: 'Termostato',
      ev_charging: 'Ricarica EV',
      generic_kwh: 'kWh Generici',
      generic_temperature: 'Temperatura Generica',
      generic_switch: 'Interruttore'
    },
    entity_desc_by_preset: {
      thermostat: 'Seleziona l\'entità climate del tuo termostato (es: climate.soggiorno)',
      ev_charging: 'Seleziona l\'entità number che controlla la potenza di ricarica (es: number.wallbox_power)',
      generic_switch: 'Seleziona lo switch da controllare (es: switch.lavatrice)',
      generic_kwh: 'Seleziona l\'entità number da controllare (es: number.limite_potenza)',
      generic_temperature: 'Seleziona l\'entità number da controllare (es: number.temperatura_generica)'
    },
    messages: {
      cfg_incomplete: '✗ Configurazione incompleta',
      yaml_copied: '✓ YAML copiato negli appunti',
      yaml_copy_error: '✗ Errore nella copia',
      file_downloaded: '✓ File scaricato',
      file_download_error: '✗ Errore nel download',
      auto_created: '✓ Automazione creata con successo!',
      auto_error_prefix: '✗ Errore: ',
      helpers_yaml_copied: '✓ YAML helpers copiato negli appunti',
      helpers_yaml_downloaded: '✓ File helpers scaricato',
      helpers_yaml_error: '✗ Errore nella preparazione dello YAML helpers',
      deep_checks_triggered: '✓ Verifiche approfondite avviate. Vedi Notifiche Persistenti per il report completo.',
      deep_checks_integration_missing: 'Aggiorna l\'integrazione CronoStar affinché esponga il servizio "cronostar.check_setup" per le verifiche approfondite.',
      fix_step_to_proceed: 'Si prega di correggere gli errori in questo passaggio per proseguire.'
    },
    ui: {
      identification_prefix: 'Prefisso identificativo',
      prefix_description: 'Prefisso da utilizzare per tutte le entità create. Deve terminare con underscore (_).',
      prefix_hint: 'Il prefisso si aggiornerà automaticamente se cambi il tipo selezionato.',
      loading_deep_check_results: 'Caricamento risultati verifiche approfondite...',
      helpers_check: 'Verifica Helpers',
      all_required_helpers_present: 'Tutti gli helper necessari sono presenti.',
      missing_helpers_count: 'Mancano {count} helper. Usa la sezione sottostante per crearli.',
      create_file_on_ha: 'Crea File (su HA)',
      run_deep_checks_first: 'Esegui verifiche approfondite per determinare il percorso corretto',
      automations_path_not_determined: 'Percorso automazioni non determinato',
      inline_automation_use_ui: 'Automazione inline: usa la UI di Home Assistant',
      automation_created_successfully: '✓ Automazione creata con successo!',
      yaml_copied_go_to_automations: 'YAML copiato. Vai in Impostazioni → Automazioni',
      copy: 'Copia',
      cronostar_automation_yaml: 'CronoStar - YAML Automazione',
      service_check_setup_not_available: 'Servizio check_setup non disponibile',
      checks_triggered: '✓ Verifiche avviate'
    },
    checks: {
      title: 'Verifica setup',
      quick_ok: '✓ Verifiche rapide superate',
      quick_warn: '⚠️ Verifiche rapide: problemi rilevati',
      auto_ok: 'Entità automazione trovata in Home Assistant.',
      auto_missing: 'Entità automazione non trovata.',
      deep_hint: 'Le verifiche approfondite leggono configuration.yaml e gli include per localizzare helpers e automazioni.',
      location_prefix: 'Posizione:',
      location_inline_conf: 'inline in configuration.yaml',
      location_include_file: 'file incluso',
      location_include_dir_named: 'directory inclusa (merge_named)',
      location_include_dir_list: 'directory inclusa (merge_list)',
      location_none: 'sezione non definita in configuration.yaml',
      location_unknown: 'sconosciuta',
      runtime_total_found_label: 'Totale runtime trovati',
      runtime_prefixed_label: 'Runtime corrispondenti al prefisso (\'{prefix}\')',
      hour_base_label: 'Base oraria',
      missing_helpers_label: 'Helper mancanti previsti',
      automations_title: 'Automazioni',
      yaml_count_label: 'Conteggio YAML',
      storage_count_label: 'Conteggio Storage',
      found_by_alias_label: 'Trovato per alias',
      no_automation_found_label: 'Nessuna automazione trovata con l\'alias previsto',
      automation_create_where_title: 'Dove creare l\'automazione',
      default_automation_create_where: 'Predefinito: automations.yaml file o tramite UI (Impostazioni → Automazioni)',
      deep_report_label: 'Report verifiche approfondite',
      no_report: 'Nessun report disponibile. Esegui le verifiche approfondite per generare un report.',
      expected_alias_label: 'Alias atteso',
      expected_auto_id_label: 'ID automazione atteso'
    }
  }
};

export class EditorI18n {
  constructor(editor) {
    this.editor = editor;
  }

  _t(path) {
    const lang = this.editor._lang;
    const sec = path.split('.');
    let obj = I18N[lang];
    for (const p of sec) obj = obj?.[p];
    if (obj !== undefined) return obj; // Return if found (can be string, array, function)

    let en = I18N.en;
    for (const p of sec) en = en?.[p];
    if (en !== undefined) return en; // Return if found in English (can be string, array, function)

    return path; // Default to path if not found anywhere
  }

  _localizePreset(key) {
    const t = (k) => this._t(k);
    switch (key) {
      case 'thermostat': return t('preset.thermostat');
      case 'ev_charging': return t('preset.ev_charging');
      case 'generic_kwh': return t('preset.generic_kwh');
      case 'generic_temperature': return t('preset.generic_temperature');
      case 'generic_switch': return t('preset.generic_switch');
      default: return key;
    }
  }

  _getPresetName() {
    return I18N[this.editor._lang].presetNames[this.editor._selectedPreset] || this.editor._selectedPreset;
  }
}
