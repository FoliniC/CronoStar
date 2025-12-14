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
    
    Priority:
    1. global_prefix (if provided)
    2. entity_prefix (if provided)
    3. Default preset prefix
    """
    profile_slug = slugify(profile_name)
    
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
        "Building filename: profile=%s, preset=%s, global_prefix=%s, entity_prefix=%s, used=%s",
        profile_name,
        canonical_preset,
        global_prefix,
        entity_prefix,
        prefix_base
    )
    
    return f"{prefix_base}_{profile_slug}.json"
