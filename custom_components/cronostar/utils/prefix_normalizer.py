import re

PRESETS_CONFIG = {
    "thermostat": {
        "input_text": "input_text.cronostar_active_profile_thermostat",
        "profiles_select": "input_select.cronostar_temp_profiles",
        "current_value_entity": "input_number.cronostar_temp_current",
        "file_tag": "thermostat"
    },
    "ev_charging": {
        "input_text": "input_text.cronostar_active_profile_ev_charging",
        "profiles_select": "input_select.cronostar_ev_profiles",
        "current_value_entity": "input_number.cronostar_ev_current",
        "file_tag": "ev_charging"
    },
    "generic_switch": {
        "input_text": "input_text.cronostar_active_profile_generic_switch",
        "profiles_select": "input_select.cronostar_switch_profiles",
        "current_value_entity": "input_number.cronostar_switch_current",
        "file_tag": "switch"
    },
    "generic_kwh": {
        "input_text": "input_text.cronostar_active_profile_generic_kwh",
        "profiles_select": "input_select.cronostar_kwh_profiles",
        "current_value_entity": "input_number.cronostar_kwh_current",
        "file_tag": "kwh"
    },
    "generic_temperature": {
        "input_text": "input_text.cronostar_active_profile_generic_temperature",
        "profiles_select": "input_select.cronostar_gentemp_profiles",
        "current_value_entity": "input_number.cronostar_gentemp_current",
        "file_tag": "gentemp"
    },
}

def slugify(s: str) -> str:
    """Convert string to slug format."""
    s = s.lower().strip()
    s = s.replace(" ", "_")
    return "".join(c for c in s if c.isalnum() or c == "_")

def normalize_prefix(prefix: str) -> str:
    """Normalize prefix to ensure it ends with underscore."""
    if not prefix:
        return ""
    s = prefix.strip().lower()
    if not s.endswith("_"):
        s += "_"
    return s

def normalize_preset_type(preset_type: str) -> str:
    """Normalize preset type to canonical form."""
    if not preset_type:
        return "thermostat"
    
    key = slugify(preset_type)
    
    # Direct match
    if key in PRESETS_CONFIG:
        return key
    
    # Synonym matching
    synonyms = {
        "thermostat": {"thermostat", "temperature", "temp", "cronostar_temp"},
        "ev_charging": {"ev_charging", "ev", "evcharge", "charge", "charging", "cronostar_ev"},
        "generic_switch": {"generic_switch", "switch", "generic_switches"},
        "generic_kwh": {"generic_kwh", "kwh", "energy", "generic_energy"},
        "generic_temperature": {"generic_temperature", "gentemp", "generic_temp", "gen_temp"},
    }
    
    for canonical, synonyms_set in synonyms.items():
        if key in synonyms_set:
            return canonical
    
    return "thermostat"
