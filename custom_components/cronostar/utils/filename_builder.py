import logging
from typing import Optional

from .prefix_normalizer import slugify, normalize_prefix, PRESETS_CONFIG

_LOGGER = logging.getLogger(__name__)

def build_profile_filename(
    profile_name: str,
    canonical_preset: str,
    entity_prefix: str | None = None,
    global_prefix: str | None = None
) -> str:
    """
    Build profile filename using the correct prefix.
    Generates a single file per prefix context (e.g. cronostar_prefix_data.json).
    """
    # Determine which prefix to use
    if global_prefix:
        used_prefix = normalize_prefix(global_prefix)
    elif entity_prefix:
        used_prefix = normalize_prefix(entity_prefix)
    else:
        # Fallback to preset default
        used_prefix = normalize_prefix(
            PRESETS_CONFIG.get(canonical_preset, {}).get("entity_prefix", "cronostar_")
        )
    
    # Remove trailing underscore and create filename
    prefix_base = used_prefix.rstrip("_")
    
    _LOGGER.debug(
        "Building filename: prefix=%s (profile_name ignored for filename)",
        prefix_base
    )
    
    return f"{prefix_base}_data.json"
