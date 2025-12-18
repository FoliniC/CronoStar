/**
 * EditorI18n.js - Complete Internationalization for CronoStar Editor
 * Supports: English (en) and Italian (it)
 */

export const I18N = {
  en: {
    // Wizard Steps
    steps: {
      tipo: 'Setup',
      entita: 'Advanced',
      opzioni: 'Options',
      automazione: 'Automation',
      fine: 'Finish'
    },

    // Step Headers
    headers: {
      step1: 'Basic Configuration',
      step2: 'Advanced Configuration',
      step3: 'Display Options',
      step4: 'Automation Setup',
      step5: 'Summary & Verification'
    },

    // Step Descriptions
    descriptions: {
      step1: 'Configure the essential elements: target entity and identification prefix.',
      step2: 'Optional: configure additional entities (pause, profiles) and generate the configuration package.',
      step3: 'Customize the card appearance and value ranges.',
      step4: 'Generate the automation that applies scheduled values every hour.',
      step5: 'Review your configuration and verify the setup.'
    },

    // Preset Definitions
    presets: {
      thermostat: {
        title: 'Thermostat',
        desc: 'Schedule hourly temperatures for heating/cooling',
        icon: '🌡️'
      },
      ev_charging: {
        title: 'EV Charging',
        desc: 'Schedule EV charging power',
        icon: '🔌'
      },
      generic_kwh: {
        title: 'Generic kWh',
        desc: 'Schedule hourly energy limits (0-7 kWh)',
        icon: '⚡'
      },
      generic_temperature: {
        title: 'Generic Temperature',
        desc: 'Schedule generic temperatures (0-40°C)',
        icon: '🌡️'
      },
      generic_switch: {
        title: 'Switch',
        desc: 'Schedule device on/off',
        icon: '💡'
      }
    },

    // Preset Names (for display)
    presetNames: {
      thermostat: 'Thermostat',
      ev_charging: 'EV Charging',
      generic_kwh: 'Generic kWh',
      generic_temperature: 'Generic Temperature',
      generic_switch: 'Switch'
    },

    // Form Fields
    fields: {
      // Step 1 - Basic Config
      apply_entity_label: 'Target Entity',
      apply_entity_desc: 'The entity where scheduled values will be applied (climate, number, or switch).',
      
      // Package Configuration
      package_label: 'Configuration Package',
      package_desc: 'Copy this “Configuration Package” into {path}. If you continue in the wizard, CronoStar will try to create/update the file automatically (when supported by the backend).',
      
      // Optional Features
      enable_pause_label: 'Enable Pause (input_boolean)',
      enable_pause_desc: 'Add a pause switch to temporarily disable the automation',
      enable_profiles_label: 'Enable Multiple Profiles (input_select)',
      enable_profiles_desc: 'Add a profile selector to switch between different schedules',
      
      // Prefix Configuration
      entity_prefix_label: 'Entity Prefix',
      entity_prefix_desc: 'Prefix for entity identification. All CronoStar entities will use this prefix.',
      entity_prefix_hint: 'Must be lowercase letters/numbers/underscores and end with underscore (_).',
      
      // Entity Selectors
      profiles_select_label: 'Profile Selector Entity',
      profiles_select_desc: 'input_select entity that contains the names of saved profiles.',
      pause_entity_label: 'Pause Entity',
      pause_entity_desc: 'input_boolean to temporarily suspend the automation. When ON, scheduled values are not applied.',
      
      // Display Options
      title_label: 'Card Title',
      title_desc: 'Title shown in the card header. If empty, preset name will be used.',
      y_axis_label: 'Y-Axis Label',
      y_axis_desc: 'Custom label for the Y-axis (e.g., Temperature, Power, Energy).',
      unit_label: 'Unit of Measurement',
      unit_desc: 'Display unit (e.g., °C, kW, kWh).',
      
      // Value Ranges
      min_label: 'Minimum Value',
      min_desc: 'Minimum allowed value in the chart.',
      max_label: 'Maximum Value',
      max_desc: 'Maximum allowed value in the chart.',
      step_label: 'Step',
      step_desc: 'Increment for value adjustments.',
      
      // Advanced Options
      interval_label: 'Time Interval',
      interval_desc: 'Select the time resolution. Lower values create more points but require more entities.',
      hour_base_label: 'Hour Numbering',
      hour_base_desc: 'Hour numbering format (0-23 or 1-24). "Auto" detects automatically.',
      logging_label: 'Enable Debug Logging',
      logging_desc: 'Shows detailed logs in browser console for troubleshooting.',
      allow_max_label: 'Allow "Max" Value',
      allow_max_desc: 'Enables a symbolic "Max" value, useful for dynamic solar charging logic.',
      
      // YAML Generation
      helpers_label: 'Entity Helpers',
      helpers_desc: 'CronoStar requires helper entities to store hourly values. Generate and install the package below.'
    },

    // UI Messages
    ui: {
      // Prefix Configuration
      identification_prefix: 'Identification Prefix',
      prefix_description_simple: 'Used to identify all CronoStar entities. Example: "cronostar_" will create input_number.cronostar_current',
      prefix_description: 'Prefix for entity identification. Must end with underscore (_).',
      prefix_hint: 'Must be lowercase letters/numbers/underscores and end with underscore (_).',
      
      // Minimal Configuration
      minimal_config_complete: '✅ Minimal Configuration Complete',
      minimal_config_info: 'With these settings, CronoStar will automatically create:\n• Main entity: {entity}\n• Configuration: {package}\n\nYou can save now or proceed to advanced configuration.',
      minimal_config_needed: 'Complete Required Fields',
      minimal_config_help: 'Configure both the target entity and a valid prefix to proceed.',
      
      // Automatic Entities
      automatic_entities_title: 'Automatic Entity Creation',
      automatic_entities_desc: 'CronoStar will automatically create the main entity {entity} and place all configuration in the package file {package}.',
      
      // Status Messages
      loading_deep_check_results: 'Loading verification results...',
      helpers_check: 'Helper Entities Status',
      all_required_helpers_present: '✅ All required helper entities are present.',
      missing_helpers_count: '⚠️ Missing {count} helper entities. Use the section below to create them.',
      
      // File Operations
      create_file_on_ha: 'Create File (on HA)',
      run_deep_checks_first: 'Run deep checks first to determine the correct directory path',
      
      // Automation Status
      automations_path_not_determined: 'Automations path not determined',
      inline_automation_use_ui: 'Inline automation: use Home Assistant UI',
      automation_created_successfully: '✅ Automation created successfully!',
      yaml_copied_go_to_automations: 'YAML copied. Go to Settings → Automations → Add Automation',
      
      // Misc
      copy: 'Copy',
      cronostar_automation_yaml: 'CronoStar - Automation YAML',
      service_check_setup_not_available: 'Service check_setup not available',
      checks_triggered: '✅ Verification checks triggered',
      waiting_profile_restore: 'Loading profiles...',
      anomalous_operation_watermark: 'Configuration incomplete'
    },

    // Action Buttons
    actions: {
      back: '← Back',
      next: 'Next →',
      save: '✓ Save Configuration',
      save_and_close: '💾 Save & Close',
      advanced_config: '⚙️ Advanced Configuration',
      
      // YAML Operations
      copy_yaml: '📋 Copy YAML',
      copy_package_yaml: '📋 Copy Package YAML',
      download_file: '💾 Download File',
      download_package_file: '💾 Download Package',
      
      // Automation
      create_automation: '✨ Create Automation',
      create_automation_and_reload: '✨ Create & Reload Automation',
      
      // Preview
      show_preview: 'Show YAML Preview',
      
      // Legacy
      copy_helpers_yaml: '📋 Copy Helpers YAML',
      download_helpers_file: '💾 Download Helpers File',
      
      // Verification
      run_quick_checks: '🔍 Run Quick Checks',
      run_deep_checks: '🧠 Run Deep Checks'
    },

    // Step-specific Messages
    step2_msgs: {
      missing_apply: '⚠️ Target entity is required to proceed.',
      apply_ok: '✅ Target entity configured correctly.',
      prefix_ok: '✅ Prefix is valid.',
      prefix_bad: '⚠️ Invalid prefix format. Must be lowercase letters/numbers/underscores ending with "_".'
    },

    // Success/Error Messages
    messages: {
      // Package Operations
      package_yaml_copied: '✅ Package YAML copied to clipboard',
      package_yaml_error: '❌ Error preparing package YAML',
      package_yaml_downloaded: '✅ Package file downloaded successfully',
      
      // General Operations
      cfg_incomplete: '❌ Configuration incomplete',
      yaml_copied: '✅ YAML copied to clipboard',
      yaml_copy_error: '❌ Failed to copy to clipboard',
      file_downloaded: '✅ File downloaded successfully',
      file_download_error: '❌ Failed to download file',
      
      // Automation
      auto_created: '✅ Automation created successfully!',
      auto_error_prefix: '❌ Error: ',
      
      // Helpers (legacy)
      helpers_yaml_copied: '✅ Helpers YAML copied to clipboard',
      helpers_yaml_downloaded: '✅ Helpers file downloaded',
      helpers_yaml_error: '❌ Error preparing helpers YAML',
      
      // Verification
      deep_checks_triggered: '✅ Deep verification checks triggered. See Persistent Notifications for the full report.',
      deep_checks_integration_missing: 'Update the CronoStar integration to enable deep verification checks.',
      
      // Validation
      fix_step_to_proceed: '⚠️ Please fix the issues in this step to proceed.'
    },

    // Automation Configuration
    auto: {
      ready: '✅ Automation Configuration Ready',
      will_apply: 'The automation will apply scheduled values',
      to_entity: 'to entity',
      paused_by: 'Controlled by pause entity:'
    },

    // How-To Instructions
    howto: {
      title: 'How to Install:',
      steps: [
        'Quick: Click "Create & Reload Automation" to add it directly',
        'Manual: Copy YAML and paste in automations.yaml',
        'File: Download file and import via HA UI'
      ]
    },

    // Configuration Summary
    summary: {
      config: 'Card Configuration:',
      preset: 'Preset',
      target: 'Target Entity',
      profiles: 'Profile Selector',
      pause: 'Pause Entity'
    },

    // User Tips
    tips: {
      title: 'Quick Tips:',
      items: [
        'Use Shift + drag to select multiple hours',
        'Use Ctrl/Cmd + A to select all hours',
        'Arrow up/down adjusts selected values',
        'You can change preset later from card settings'
      ]
    },

    // Important Notes
    important: {
      title: 'Important:',
      text: 'Remember to restart Home Assistant after creating or modifying YAML files in packages/ or automations/.'
    },

    // Entity Descriptions by Preset
    entity_desc_by_preset: {
      thermostat: 'Select the climate entity of your thermostat (e.g., climate.living_room)',
      ev_charging: 'Select the number entity controlling charging power (e.g., number.wallbox_power)',
      generic_switch: 'Select the switch to control (e.g., switch.washing_machine)',
      generic_kwh: 'Select the number entity to control (e.g., number.power_limit)',
      generic_temperature: 'Select the number entity to control (e.g., number.generic_temperature)'
    },

    // Verification Checks
    checks: {
      title: 'Configuration Verification',
      quick_ok: '✅ Quick checks passed',
      quick_warn: '⚠️ Quick checks found issues',
      auto_ok: '✅ Automation entity found',
      auto_missing: '⚠️ Automation not found yet',
      deep_hint: 'Deep checks analyze configuration.yaml and includes to locate helpers and automations.',
      location_prefix: 'Location:',
      location_inline_conf: 'inline in configuration.yaml',
      location_include_file: 'included file',
      location_include_dir_named: 'included directory (merge_named)',
      location_include_dir_list: 'included directory (merge_list)',
      location_none: 'section not defined in configuration.yaml',
      location_unknown: 'unknown',
      runtime_total_found_label: 'Runtime total found',
      runtime_prefixed_label: "Runtime matching prefix ('{prefix}')",
      hour_base_label: 'Hour base',
      missing_helpers_label: 'Missing expected helpers',
      automations_title: 'Automations',
      yaml_count_label: 'YAML count',
      storage_count_label: 'Storage count',
      found_by_alias_label: 'Found by alias',
      no_automation_found_label: 'No automation found with expected alias',
      automation_create_where_title: 'Where to create automation',
      default_automation_create_where: 'Default: automations.yaml (or via UI)',
      deep_report_label: 'Deep verification report',
      no_report: 'No report available. Run deep checks to generate a report.',
      expected_alias_label: 'Expected alias',
      expected_auto_id_label: 'Expected automation ID',
      inputs_found_prefix: 'Found',
      inputs_found_suffix: 'input entities',
      inputs_run_deep: 'Run deep checks for detailed location info',
      auto_create_where_prefix: 'Create in'
    },

    // Next Steps Guide
    what_to_do_next: {
      title: 'Next Steps:',
      step1_helpers_button: '1. Click "Copy Package YAML" (Step 2) and create the package file',
      step2_automation_button: '2. Click "Create Automation" (Step 4) or copy the YAML',
      step3_restart: '3. Restart Home Assistant to load new entities',
      step4_save_config: '4. Save the card configuration using Home Assistant’s “Save” button.'
    },

    // Help Dialog
    help: {
      title: 'CronoStar Help & Configuration Info',
      text: 'Use mouse/touch to drag points. Keyboard: Ctrl+A select all, arrows change values, Esc clears selection.'
    }
  },

  // ==========================================
  // ITALIAN TRANSLATIONS
  // ==========================================
  it: {
    // Wizard Steps
    steps: {
      tipo: 'Setup',
      entita: 'Avanzate',
      opzioni: 'Opzioni',
      automazione: 'Automazione',
      fine: 'Fine'
    },

    // Step Headers
    headers: {
      step1: 'Configurazione Base',
      step2: 'Configurazione Avanzata',
      step3: 'Opzioni Visualizzazione',
      step4: 'Setup Automazione',
      step5: 'Riepilogo e Verifica'
    },

    // Step Descriptions
    descriptions: {
      step1: 'Configura gli elementi essenziali: entità di destinazione e prefisso identificativo.',
      step2: 'Opzionale: configura entità aggiuntive (pausa, profili) e genera il package di configurazione.',
      step3: 'Personalizza l\'aspetto della card e gli intervalli di valori.',
      step4: 'Genera l\'automazione che applica i valori programmati ogni ora.',
      step5: 'Rivedi la tua configurazione e verifica il setup.'
    },

    // Preset Definitions
    presets: {
      thermostat: {
        title: 'Termostato',
        desc: 'Programma temperature orarie per riscaldamento/raffrescamento',
        icon: '🌡️'
      },
      ev_charging: {
        title: 'Ricarica EV',
        desc: 'Programma la potenza di ricarica del veicolo elettrico',
        icon: '🔌'
      },
      generic_kwh: {
        title: 'kWh Generici',
        desc: 'Programma limiti energetici orari (0-7 kWh)',
        icon: '⚡'
      },
      generic_temperature: {
        title: 'Temperatura Generica',
        desc: 'Programma temperature generiche (0-40°C)',
        icon: '🌡️'
      },
      generic_switch: {
        title: 'Interruttore',
        desc: 'Programma accensione/spegnimento dispositivi',
        icon: '💡'
      }
    },

    // Preset Names
    presetNames: {
      thermostat: 'Termostato',
      ev_charging: 'Ricarica EV',
      generic_kwh: 'kWh Generici',
      generic_temperature: 'Temperatura Generica',
      generic_switch: 'Interruttore'
    },

    // Form Fields
    fields: {
      // Step 1 - Basic Config
      apply_entity_label: 'Entità di Destinazione',
      apply_entity_desc: 'L\'entità su cui verranno applicati i valori programmati (climate, number o switch).',
      
      // Package Configuration
      package_label: 'Package di Configurazione',
      package_desc: 'Copia questo “Configuration Package” in {path}. Se prosegui nel wizard, CronoStar proverà a creare/aggiornare automaticamente il file (quando il backend lo supporta).',
      
      // Optional Features
      enable_pause_label: 'Abilita Pausa (input_boolean)',
      enable_pause_desc: 'Aggiungi un interruttore pausa per disabilitare temporaneamente l\'automazione',
      enable_profiles_label: 'Abilita Profili Multipli (input_select)',
      enable_profiles_desc: 'Aggiungi un selettore profili per passare tra diversi programmi',
      
      // Prefix Configuration
      entity_prefix_label: 'Prefisso Entità',
      entity_prefix_desc: 'Prefisso per l\'identificazione delle entità. Tutte le entità CronoStar useranno questo prefisso.',
      entity_prefix_hint: 'Deve usare lettere/numeri/underscore minuscoli e terminare con underscore (_).',
      
      // Entity Selectors
      profiles_select_label: 'Entità Selettore Profili',
      profiles_select_desc: 'Entità input_select che contiene i nomi dei profili salvati.',
      pause_entity_label: 'Entità Pausa',
      pause_entity_desc: 'input_boolean per sospendere temporaneamente l\'automazione. Quando è ON, i valori non vengono applicati.',
      
      // Display Options
      title_label: 'Titolo Card',
      title_desc: 'Titolo mostrato nell\'intestazione della card. Se vuoto, usa il nome del preset.',
      y_axis_label: 'Etichetta Asse Y',
      y_axis_desc: 'Etichetta personalizzata per l\'asse Y (es. Temperatura, Potenza, Energia).',
      unit_label: 'Unità di Misura',
      unit_desc: 'Unità visualizzata (es. °C, kW, kWh).',
      
      // Value Ranges
      min_label: 'Valore Minimo',
      min_desc: 'Valore minimo consentito nel grafico.',
      max_label: 'Valore Massimo',
      max_desc: 'Valore massimo consentito nel grafico.',
      step_label: 'Passo',
      step_desc: 'Incremento per la modifica dei valori.',
      
      // Advanced Options
      interval_label: 'Intervallo Temporale',
      interval_desc: 'Seleziona la risoluzione temporale. Valori più bassi creano più punti ma richiedono più entità.',
      hour_base_label: 'Numerazione Ore',
      hour_base_desc: 'Formato numerazione ore (0-23 o 1-24). "Auto" rileva automaticamente.',
      logging_label: 'Abilita Logging Debug',
      logging_desc: 'Mostra log dettagliati nella console del browser per diagnostica.',
      allow_max_label: 'Consenti Valore "Max"',
      allow_max_desc: 'Abilita un valore simbolico "Max", utile per logiche di ricarica solare dinamica.',
      
      // YAML Generation
      helpers_label: 'Entità Helper',
      helpers_desc: 'CronoStar richiede entità helper per memorizzare i valori orari. Genera e installa il package qui sotto.'
    },

    // UI Messages
    ui: {
      // Prefix Configuration
      identification_prefix: 'Prefisso Identificativo',
      prefix_description_simple: 'Usato per identificare tutte le entità CronoStar. Esempio: "cronostar_" creerà input_number.cronostar_current',
      prefix_description: 'Prefisso per l\'identificazione delle entità. Deve terminare con underscore (_).',
      prefix_hint: 'Deve usare lettere/numeri/underscore minuscoli e terminare con underscore (_).',
      
      // Minimal Configuration
      minimal_config_complete: '✅ Configurazione Minima Completata',
      minimal_config_info: 'Con queste impostazioni, CronoStar creerà automaticamente:\n• Entità principale: {entity}\n• Configurazione: {package}\n\nPuoi salvare ora o procedere alla configurazione avanzata.',
      minimal_config_needed: 'Completa i Campi Richiesti',
      minimal_config_help: 'Configura sia l\'entità di destinazione che un prefisso valido per proseguire.',
      
      // Automatic Entities
      automatic_entities_title: 'Creazione Automatica Entità',
      automatic_entities_desc: 'CronoStar creerà automaticamente l\'entità principale {entity} e inserirà tutta la configurazione nel file package {package}.',
      
      // Status Messages
      loading_deep_check_results: 'Caricamento risultati verifica...',
      helpers_check: 'Stato Entità Helper',
      all_required_helpers_present: '✅ Tutte le entità helper necessarie sono presenti.',
      missing_helpers_count: '⚠️ Mancano {count} entità helper. Usa la sezione sottostante per crearle.',
      
      // File Operations
      create_file_on_ha: 'Crea File (su HA)',
      run_deep_checks_first: 'Esegui verifiche approfondite per determinare il percorso corretto',
      
      // Automation Status
      automations_path_not_determined: 'Percorso automazioni non determinato',
      inline_automation_use_ui: 'Automazione inline: usa l\'interfaccia di Home Assistant',
      automation_created_successfully: '✅ Automazione creata con successo!',
      yaml_copied_go_to_automations: 'YAML copiato. Vai in Impostazioni → Automazioni → Aggiungi Automazione',
      
      // Misc
      copy: 'Copia',
      cronostar_automation_yaml: 'CronoStar - YAML Automazione',
      service_check_setup_not_available: 'Servizio check_setup non disponibile',
      checks_triggered: '✅ Verifiche avviate',
      waiting_profile_restore: 'Caricamento profili...',
      anomalous_operation_watermark: 'Configurazione incompleta'
    },

    // Action Buttons
    actions: {
      back: '← Indietro',
      next: 'Avanti →',
      save: '✓ Salva Configurazione',
      save_and_close: '💾 Salva e Chiudi',
      advanced_config: '⚙️ Configurazione Avanzata',
      
      // YAML Operations
      copy_yaml: '📋 Copia YAML',
      copy_package_yaml: '📋 Copia Package YAML',
      download_file: '💾 Scarica File',
      download_package_file: '💾 Scarica Package',
      
      // Automation
      create_automation: '✨ Crea Automazione',
      create_automation_and_reload: '✨ Crea e Ricarica Automazione',
      
      // Preview
      show_preview: 'Mostra Anteprima YAML',
      
      // Legacy
      copy_helpers_yaml: '📋 Copia YAML Helpers',
      download_helpers_file: '💾 Scarica File Helpers',
      
      // Verification
      run_quick_checks: '🔍 Esegui Verifiche Rapide',
      run_deep_checks: '🧠 Esegui Verifiche Approfondite'
    },

    // Step-specific Messages
    step2_msgs: {
      missing_apply: '⚠️ L\'entità di destinazione è obbligatoria per proseguire.',
      apply_ok: '✅ Entità di destinazione configurata correttamente.',
      prefix_ok: '✅ Prefisso valido.',
      prefix_bad: '⚠️ Formato prefisso non valido. Deve essere lettere/numeri/underscore minuscoli terminanti con "_".'
    },

    // Success/Error Messages
    messages: {
      // Package Operations
      package_yaml_copied: '✅ Package YAML copiato negli appunti',
      package_yaml_error: '❌ Errore nella preparazione del package YAML',
      package_yaml_downloaded: '✅ File package scaricato con successo',
      
      // General Operations
      cfg_incomplete: '❌ Configurazione incompleta',
      yaml_copied: '✅ YAML copiato negli appunti',
      yaml_copy_error: '❌ Impossibile copiare negli appunti',
      file_downloaded: '✅ File scaricato con successo',
      file_download_error: '❌ Impossibile scaricare il file',
      
      // Automation
      auto_created: '✅ Automazione creata con successo!',
      auto_error_prefix: '❌ Errore: ',
      
      // Helpers (legacy)
      helpers_yaml_copied: '✅ YAML helpers copiato negli appunti',
      helpers_yaml_downloaded: '✅ File helpers scaricato',
      helpers_yaml_error: '❌ Errore nella preparazione dello YAML helpers',
      
      // Verification
      deep_checks_triggered: '✅ Verifiche approfondite avviate. Vedi Notifiche Persistenti per il report completo.',
      deep_checks_integration_missing: 'Aggiorna l\'integrazione CronoStar per abilitare le verifiche approfondite.',
      
      // Validation
      fix_step_to_proceed: '⚠️ Si prega di correggere gli errori in questo passaggio per proseguire.'
    },

    // Automation Configuration
    auto: {
      ready: '✅ Configurazione Automazione Pronta',
      will_apply: 'L\'automazione applicherà i valori programmati',
      to_entity: 'all\'entità',
      paused_by: 'Controllata dall\'entità pausa:'
    },

    // How-To Instructions
    howto: {
      title: 'Come Installare:',
      steps: [
        'Rapido: Clicca "Crea e Ricarica Automazione" per aggiungerla direttamente',
        'Manuale: Copia YAML e incolla in automations.yaml',
        'File: Scarica file e importa tramite interfaccia HA'
      ]
    },

    // Configuration Summary
    summary: {
      config: 'Configurazione Card:',
      preset: 'Preset',
      target: 'Entità Destinazione',
      profiles: 'Selettore Profili',
      pause: 'Entità Pausa'
    },

    // User Tips
    tips: {
      title: 'Suggerimenti Rapidi:',
      items: [
        'Usa Shift + trascina per selezionare più ore',
        'Usa Ctrl/Cmd + A per selezionare tutte le ore',
        'Frecce su/giù modificano i valori selezionati',
        'Puoi cambiare preset dal menu della card'
      ]
    },

    // Important Notes
    important: {
      title: 'Importante:',
      text: 'Ricorda di riavviare Home Assistant dopo aver creato o modificato file YAML in packages/ o automations/.'
    },

    // Entity Descriptions by Preset
    entity_desc_by_preset: {
      thermostat: 'Seleziona l\'entità climate del tuo termostato (es. climate.soggiorno)',
      ev_charging: 'Seleziona l\'entità number che controlla la potenza di ricarica (es. number.wallbox_power)',
      generic_switch: 'Seleziona lo switch da controllare (es. switch.lavatrice)',
      generic_kwh: 'Seleziona l\'entità number da controllare (es. number.limite_potenza)',
      generic_temperature: 'Seleziona l\'entità number da controllare (es. number.temperatura_generica)'
    },

    // Verification Checks
    checks: {
      title: 'Verifica Configurazione',
      quick_ok: '✅ Verifiche rapide superate',
      quick_warn: '⚠️ Verifiche rapide: problemi rilevati',
      auto_ok: '✅ Entità automazione trovata',
      auto_missing: '⚠️ Automazione non ancora trovata',
      deep_hint: 'Le verifiche approfondite analizzano configuration.yaml e gli include per localizzare helpers e automazioni.',
      location_prefix: 'Posizione:',
      location_inline_conf: 'inline in configuration.yaml',
      location_include_file: 'file incluso',
      location_include_dir_named: 'directory inclusa (merge_named)',
      location_include_dir_list: 'directory inclusa (merge_list)',
      location_none: 'sezione non definita in configuration.yaml',
      location_unknown: 'sconosciuta',
      runtime_total_found_label: 'Totale runtime trovati',
      runtime_prefixed_label: "Runtime corrispondenti al prefisso ('{prefix}')",
      hour_base_label: 'Base oraria',
      missing_helpers_label: 'Helper mancanti previsti',
      automations_title: 'Automazioni',
      yaml_count_label: 'Conteggio YAML',
      storage_count_label: 'Conteggio Storage',
      found_by_alias_label: 'Trovata per alias',
      no_automation_found_label: 'Nessuna automazione trovata con l\'alias previsto',
      automation_create_where_title: 'Dove creare l\'automazione',
      default_automation_create_where: 'Predefinito: automations.yaml (o tramite UI)',
      deep_report_label: 'Report verifiche approfondite',
      no_report: 'Nessun report disponibile. Esegui le verifiche approfondite per generare un report.',
      expected_alias_label: 'Alias atteso',
      expected_auto_id_label: 'ID automazione atteso',
      inputs_found_prefix: 'Trovate',
      inputs_found_suffix: 'entità input',
      inputs_run_deep: 'Esegui verifiche approfondite per info dettagliate sulla posizione',
      auto_create_where_prefix: 'Crea in'
    },

    // Next Steps Guide
    what_to_do_next: {
      title: 'Prossimi Passi:',
      step1_helpers_button: '1. Clicca "Copia Package YAML" (Step 2) e crea il file package',
      step2_automation_button: '2. Clicca "Crea Automazione" (Step 4) o copia lo YAML',
      step3_restart: '3. Riavvia Home Assistant per caricare le nuove entità',
      step4_save_config: '4. Salva la configurazione della card usando il pulsante “Salva” di Home Assistant.'
    },

    // Help Dialog
    help: {
      title: 'Aiuto e Info Configurazione CronoStar',
      text: 'Usa mouse/touch per trascinare i punti. Tastiera: Ctrl+A seleziona tutto, frecce cambiano valori, Esc cancella selezione.'
    }
  }
};

/**
 * LocalizationManager class for easy access to translations
 */
export class EditorI18n {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Get translation for a key path
   * @param {string} path - Dot-notation path to translation (e.g., 'ui.minimal_config_complete')
   * @param {Object} replacements - Optional key-value pairs for placeholder replacement
   * @returns {string|Array|Object} - Translation value
   */
  _t(path, replacements = {}) {
    const lang = this.editor._lang || 'en';
    const parts = path.split('.');
    let obj = I18N[lang] || I18N.en;
    
    // Navigate through the translation object
    for (const part of parts) {
      obj = obj?.[part];
    }
    
    // If not found, try English fallback
    if (obj === undefined) {
      let fallback = I18N.en;
      for (const part of parts) {
        fallback = fallback?.[part];
      }
      obj = fallback;
    }
    
    // If still not found, return the path as fallback
    if (obj === undefined) {
      console.warn(`[EditorI18n] Missing translation: ${path}`);
      return path;
    }
    
    // Handle string replacements
    if (typeof obj === 'string' && Object.keys(replacements).length > 0) {
      let result = obj;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Get preset display name
   * @returns {string}
   */
  _getPresetName() {
    const preset = this.editor._selectedPreset || 'thermostat';
    return this._t(`presetNames.${preset}`);
  }

  /**
   * Localize a preset key (legacy compatibility)
   * @param {string} key - Preset key
   * @returns {string}
   */
  _localizePreset(key) {
    return this._t(`presetNames.${key}`);
  }
}