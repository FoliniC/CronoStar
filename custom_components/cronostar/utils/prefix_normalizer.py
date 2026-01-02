# custom_components/cronostar/utils/prefix_normalizer.py
"""
Prefix normalization utilities
Ensures consistent prefix handling across the integration
"""

import logging

_LOGGER = logging.getLogger(__name__)

# Preset type mappings
PRESET_ALIASES = {
    "thermostat": ["thermostat", "climate", "heating", "hvac"],
    "ev_charging": ["ev_charging", "ev", "charging", "car"],
    "generic_kwh": ["generic_kwh", "kwh", "energy", "power"],
    "generic_temperature": ["generic_temperature", "gentemp", "temperature"],
    "fan": ["fan", "ventilation"],
    # Include common variants used historically like 'generic_switch'
    "switch": ["switch", "light", "outlet", "plug", "generic_switch", "generic-switch", "switch_generic"],
    "cover": ["cover", "blind", "shutter", "shade"],
    "custom": ["custom", "generic", "other"],
}

# Backend configuration for presets (mirrors frontend CARD_CONFIG_PRESETS where needed)
PRESETS_CONFIG = {
    "thermostat": {"title": "CronoStar Thermostat", "unit": "°C", "global_prefix": "cronostar_temp_"},
    "ev_charging": {"title": "CronoStar EV Charging", "unit": "kW", "global_prefix": "cronostar_ev_"},
    "generic_kwh": {"title": "CronoStar Generic kWh", "unit": "kWh", "global_prefix": "cronostar_kwh_"},
    "generic_temperature": {"title": "CronoStar Generic Temperature", "unit": "°C", "global_prefix": "cronostar_gentemp_"},
    "generic_switch": {"title": "CronoStar Generic Switch", "unit": "", "global_prefix": "cronostar_switch_"},
}

# Reverse lookup for normalization
_PRESET_REVERSE_MAP = {}
for canonical, aliases in PRESET_ALIASES.items():
    for alias in aliases:
        _PRESET_REVERSE_MAP[alias.lower()] = canonical


def normalize_preset_type(preset_type: str) -> str:
    """
    Normalize preset type to canonical form

    Args:
        preset_type: Raw preset type

    Returns:
        Canonical preset type

    Examples:
        >>> normalize_preset_type("heating")
        "thermostat"
        >>> normalize_preset_type("LIGHT")
        "switch"
    """
    if not preset_type:
        return "thermostat"

    normalized_input = str(preset_type).lower().strip()
    canonical = _PRESET_REVERSE_MAP.get(normalized_input, "thermostat")

    # Enforce single canonical for switch family: use 'generic_switch'
    if canonical == "switch":
        # Log discrepancy once per process if requested variant isn't 'generic_switch'
        if normalized_input not in ("generic_switch", "generic-switch", "switch_generic"):
            _LOGGER.warning("Preset discrepancy detected: '%s' normalized to 'generic_switch'", preset_type)
        return "generic_switch"

    if normalized_input not in _PRESET_REVERSE_MAP:
        _LOGGER.debug("Unknown preset type '%s', defaulting to '%s'", preset_type, canonical)

    return canonical


def get_effective_prefix(global_prefix: str | None, meta: dict | None = None) -> str:
    """
    Get effective prefix from multiple sources
    Priority: global_prefix param > meta dict > empty string

    Args:
        global_prefix: Explicit prefix parameter
        meta: Metadata dictionary that may contain prefix

    Returns:
        Effective prefix (normalized)

    Examples:
        >>> get_effective_prefix("living_room")
        "living_room_"
        >>> get_effective_prefix(None, {"global_prefix": "bedroom"})
        "bedroom_"
    """
    # Priority 1: explicit parameter
    if global_prefix:
        return normalize_prefix(global_prefix)

    # Priority 2: metadata
    if meta and isinstance(meta, dict):
        meta_prefix = meta.get("global_prefix")
        if meta_prefix:
            return normalize_prefix(meta_prefix)

        # Legacy: check entity_prefix
        entity_prefix = meta.get("entity_prefix")
        if entity_prefix:
            _LOGGER.debug("Using legacy entity_prefix: %s", entity_prefix)
            return normalize_prefix(entity_prefix)

    # Priority 3: empty (default)
    return ""


def normalize_prefix(prefix: str) -> str:
    """
    Normalize prefix to ensure trailing underscore

    Args:
        prefix: Raw prefix

    Returns:
        Normalized prefix with trailing underscore

    Examples:
        >>> normalize_prefix("living_room")
        "living_room_"
        >>> normalize_prefix("bedroom_")
        "bedroom_"
        >>> normalize_prefix("")
        ""
    """
    if not prefix:
        return ""

    cleaned = str(prefix).strip()

    if not cleaned:
        return ""

    # Ensure trailing underscore
    if not cleaned.endswith("_"):
        cleaned += "_"

    return cleaned


def extract_prefix_from_entity(entity_id: str) -> str | None:
    """
    Extract prefix from entity ID

    Args:
        entity_id: Entity ID (e.g., "input_number.bedroom_current")

    Returns:
        Extracted prefix or None

    Examples:
        >>> extract_prefix_from_entity("input_number.bedroom_current")
        "bedroom_"
        >>> extract_prefix_from_entity("input_select.living_room_profiles")
        "living_room_"
    """
    if not entity_id or "." not in entity_id:
        return None

    try:
        # Remove domain
        object_id = entity_id.split(".", 1)[1]

        # Check for known suffixes
        known_suffixes = ["current", "profiles", "paused", "target_entity"]

        for suffix in known_suffixes:
            if object_id.endswith(f"_{suffix}"):
                prefix = object_id.rsplit(f"_{suffix}", 1)[0]
                return normalize_prefix(prefix)

        return None

    except Exception as e:
        _LOGGER.debug("Error extracting prefix from %s: %s", entity_id, e)
        return None


def build_entity_id(domain: str, prefix: str, name: str) -> str:
    """
    Build entity ID from components

    Args:
        domain: Entity domain (e.g., "input_number")
        prefix: Prefix (will be normalized)
        name: Entity name

    Returns:
        Complete entity ID

    Examples:
        >>> build_entity_id("input_number", "bedroom", "current")
        "input_number.bedroom_current"
        >>> build_entity_id("input_select", "living_room_", "profiles")
        "input_select.living_room_profiles"
    """
    normalized_prefix = normalize_prefix(prefix) if prefix else ""
    object_id = f"{normalized_prefix}{name}"
    return f"{domain}.{object_id}"


def validate_prefix_format(prefix: str) -> tuple[bool, str]:
    """
    Validate prefix format

    Args:
        prefix: Prefix to validate

    Returns:
        Tuple of (is_valid, error_message)

    Examples:
        >>> validate_prefix_format("bedroom_")
        (True, "")
        >>> validate_prefix_format("invalid prefix!")
        (False, "Prefix contains invalid characters")
    """
    if not prefix:
        return (True, "")

    # Remove trailing underscore for validation
    check_str = prefix.rstrip("_")

    # Check for invalid characters
    import re

    if not re.match(r"^[a-z0-9_]+$", check_str):
        return (False, "Prefix must contain only lowercase letters, numbers, and underscores")

    # Check length
    if len(check_str) > 50:
        return (False, "Prefix too long (max 50 characters)")

    # Check doesn't start with number
    if check_str[0].isdigit():
        return (False, "Prefix cannot start with a number")

    return (True, "")
