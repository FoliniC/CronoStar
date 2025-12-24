/** Localization Manager for CronoStar Card */
import { Logger } from '../utils.js';

const TRANSLATIONS = {
  en: {
    ui: {
      title: "CronoStar",
      loading: "Loading…",
      waiting_ha_start: "Waiting for Home Assistant startup…",
      waiting_profile_restore: "Restoring profiles…",
      startup_watermark: "Waiting for backend",
      anomalous_operation_warning: "Warning: some entities are missing or unavailable.",
      anomalous_operation_watermark: "Entities missing",
      create_missing_entities_message: "Missing entities for this preset. Please create the following input_number entities:",
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
      select_preset: "Select preset"
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
      text: "Use mouse/touch to drag points. Keyboard: Ctrl+A select all, arrows change values, Esc clears selection."
    },
    error: {
      chart_init_failed: "Chart initialization failed. See console logs."
    }
  },
  it: {
    ui: {
      title: "CronoStar",
      loading: "Caricamento…",
      waiting_ha_start: "In attesa dell'avvio di Home Assistant…",
      waiting_profile_restore: "Ripristino dei profili in corso…",
      startup_watermark: "Attesa backend",
      anomalous_operation_warning: "Attenzione: alcune entità sono mancanti o non disponibili.",
      anomalous_operation_watermark: "Entità mancanti",
      create_missing_entities_message: "Entità mancanti per questo preset. Si prega di creare le seguenti entità input_number:",
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
      select_preset: "Seleziona preset"
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
      text: "Usa mouse/touch per trascinare i punti. Tastiera: Ctrl+A seleziona tutto, frecce cambiano i valori, Esc cancella la selezione."
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
      waiting_ha_start: "In attesa dell'avvio di Home Assistant…",
      waiting_profile_restore: "Ripristino dei profili in corso…",
      startup_watermark: "Attesa backend",
      anomalous_operation_warning: "Attenzione: alcune entità sono mancanti o non disponibili.",
      anomalous_operation_watermark: "Entità mancanti",
      create_missing_entities_message: "Entità mancanti per questo preset. Si prega di creare le seguenti entità input_number:",
      pause: "Pausa",
      profile: "Profilo",
      unsaved_changes: "Modifiche non salvate",
      reset: "Ripristina",
      apply_now_error: "Errore in Applica Ora",
      apply_now_success: "Applicato correttamente per l'ora {hour}",
      time_label: "Orario",
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
      select_preset: "Seleziona preset"
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
      text: "Usa mouse/touch per trascinare i punti. Tastiera: Ctrl+A seleziona tutto, frecce cambiano i valori, Esc cancella la selezione."
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
