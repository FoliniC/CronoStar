/** Localization Manager for CronoStar Card */
import { Logger } from '../utils.js';

const TRANSLATIONS = {
  en: {
    ui: {
      title: "CronoStar",
      loading: "Loading…",
      loading_data: "Loading schedule data…",
      starting_backend: "Starting backend services…",
      waiting_ha_start: "Waiting for Home Assistant startup…",
      waiting_profile_restore: "Restoring profiles…",
      startup_watermark: "Waiting for backend",
      anomalous_operation_warning: "Warning: some entities are missing or unavailable.",
      anomalous_operation_watermark: "Entities missing",
      create_missing_entities_message: "Missing entities for this preset. Please create the following input_number entities:",
      missing_entities: "Missing entities",
      check_configuration: "Check configuration",
      retry: "Retry",
      automation_enabled: "Automation enabled",
      select_profile: "Select profile",
      pause: "Pause",
      profile: "Profile",
      unsaved_changes: "Unsaved changes",
      reset: "Reset",
      apply_now_error: "Apply Now error",
      apply_now_success: "Applied successfully for hour {hour}",
      time_label: "Time",
      hours_label: "Hours",
      temperature_label: "Temperature"
    },
    menu: {
      language: "Language",
      select_all: "Select all",
      align_left: "Align Left",
      align_right: "Align Right",
      apply_now: "Apply now",
      add_profile: "Add profile",
      delete_profile: "Delete profile",
      help: "Help",
      enable_logging: "Enable logging",
      select_preset: "Select preset",
      delete_selected: "Delete selected",
      close_menu: "Close"
    },
    preset: {
      thermostat: "Thermostat",
      ev_charging: "EV Charging",
      generic_kwh: "Generic kWh",
      generic_temperature: "Generic Temperature",
      generic_switch: "Generic Switch"
    },
    prompt: {
      add_profile_name: "Enter new profile name",
      delete_profile_confirm: "Delete profile '{profile}'?"
    },
    notify: {
      add_profile_success: "Profile '{profile}' created",
      add_profile_error: "Error creating profile '{profile}': {error}",
      delete_profile_success: "Profile '{profile}' deleted",
      delete_profile_error: "Error deleting profile '{profile}': {error}"
    },
    help: {
      title: "CronoStar Help",
      text: "Use mouse/touch to drag points. Keyboard: Ctrl+A select all, arrows change values, Esc clears selection.",
      mouse_manual: "Mouse Usage:\n- Add Points: Left-click on empty space\n- Selection: Click on a point\n- Multiple Selection: Ctrl/Cmd + Click or Selection Box (drag on empty area)\n- Adjust Values: Drag point up/down\n- Delete: Right-click on a point\n- Alignment: Alt + Left/Right Click\n- Zoom: Wheel/Pinch on X-axis (bottom) or Y-axis (left)\n- Pan: Click and drag on axes",
      keyboard_manual: "Keyboard Usage:\n- Arrows: UP/DOWN (value), LEFT/RIGHT (move/align)\n- Modifiers: Ctrl/Cmd (Fine), Shift (Snap)\n- Shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+A (Select All), Alt+Q (Insert), Alt+W (Delete), Esc (Deselect), Enter (Apply)"
    },
    error: {
      chart_init_failed: "Chart initialization failed. See console logs.",
      config_error: "Configuration error",
      initialization_failed: "Card initialization failed",
      reinitialization_failed: "Card reinitialization failed",
      first_update_failed: "First update failed",
      chart_rendering_failed: "Chart rendering failed"
    }
  },
  it: {
    ui: {
      title: "CronoStar",
      loading: "Caricamento…",
      loading_data: "Caricamento dati programma…",
      starting_backend: "Avvio servizi backend…",
      waiting_ha_start: "In attesa dell'avvio di Home Assistant…",
      waiting_profile_restore: "Ripristino dei profili in corso…",
      startup_watermark: "Attesa backend",
      anomalous_operation_warning: "Attenzione: alcune entità sono mancanti o non disponibili.",
      anomalous_operation_watermark: "Entità mancanti",
      create_missing_entities_message: "Entità mancanti per questo preset. Si prega di creare le seguenti entità input_number:",
      missing_entities: "Entità mancanti",
      check_configuration: "Verifica configurazione",
      retry: "Riprova",
      automation_enabled: "Automazione abilitata",
      select_profile: "Seleziona profilo",
      pause: "Pausa",
      profile: "Profilo",
      unsaved_changes: "Modifiche non salvate",
      reset: "Ripristina",
      apply_now_error: "Errore in Applica Ora",
      apply_now_success: "Applicato correttamente per l'ora {hour}",
      time_label: "Orario",
      hours_label: "Ore",
      temperature_label: "Temperatura"
    },
    menu: {
      language: "Lingua",
      select_all: "Seleziona tutto",
      align_left: "Allinea a Sinistra",
      align_right: "Allinea a Destra",
      apply_now: "Applica ora",
      add_profile: "Aggiungi profilo",
      delete_profile: "Elimina profilo",
      help: "Aiuto",
      enable_logging: "Abilita log",
      select_preset: "Seleziona preset",
      delete_selected: "Elimina selezionati",
      close_menu: "Chiudi"
    },
    preset: {
      thermostat: "Termostato",
      ev_charging: "Ricarica EV",
      generic_kwh: "kWh generico",
      generic_temperature: "Temperatura generica",
      generic_switch: "Interruttore generico"
    },
    prompt: {
      add_profile_name: "Inserisci il nome del nuovo profilo",
      delete_profile_confirm: "Eliminare il profilo '{profile}'?"
    },
    notify: {
      add_profile_success: "Profilo '{profile}' creato",
      add_profile_error: "Errore nella creazione del profilo '{profile}': {error}",
      delete_profile_success: "Profilo '{profile}' eliminato",
      delete_profile_error: "Errore nell'eliminazione del profilo '{profile}': {error}"
    },
    help: {
      title: "Aiuto CronoStar",
      text: "Usa mouse/touch per trascinare i punti. Tastiera: Ctrl+A seleziona tutto, frecce cambiano i valori, Esc cancella la selezione.",
      mouse_manual: "Utilizzo Mouse:\n- Aggiungi Punti: Click sinistro su spazio vuoto\n- Selezione: Click su un punto\n- Selezione Multipla: Ctrl/Cmd + Click o Box di selezione (trascina su area vuota)\n- Regola Valori: Trascina il punto su/giù\n- Elimina: Click destro su un punto\n- Allineamento: Alt + Click Sinistro/Destro\n- Zoom: Rotella/Pinch su asse X (fondo) o Y (sinistra)\n- Pan: Trascina sugli assi",
      keyboard_manual: "Utilizzo Tastiera:\n- Frecce: SU/GIÙ (valore), SINISTRA/DESTRA (sposta/allinea)\n- Modificatori: Ctrl/Cmd (Fine), Shift (Snap)\n- Scorciatoie: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+A (Tutto), Alt+Q (Inserisci), Alt+W (Elimina), Esc (Deseleziona), Invio (Applica)"
    },
    error: {
      chart_init_failed: "Inizializzazione grafico fallita. Vedi i log della console.",
      config_error: "Errore di configurazione",
      initialization_failed: "Inizializzazione card fallita",
      reinitialization_failed: "Reinizializzazione card fallita",
      first_update_failed: "Primo aggiornamento fallito",
      chart_rendering_failed: "Errore nel rendering del grafico"
    }
  }
};

export class LocalizationManager {
  localize(lang, key, search, replace) {
    try {
      const parts = key.split('.');
      let obj = TRANSLATIONS[lang] || TRANSLATIONS.en;
      for (const p of parts) {
        obj = obj?.[p];
      }
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
    } catch (e) {
      Logger.warn('I18N', `[Localization] Missing key '${key}' for lang '${lang}'`);
      return key;
    }
  }
}
