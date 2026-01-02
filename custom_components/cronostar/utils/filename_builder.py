import logging

from .prefix_normalizer import normalize_prefix

_LOGGER = logging.getLogger(__name__)


def build_profile_filename(preset_type: str, global_prefix: str) -> str:
    """
    Build profile filename using the correct prefix and preset.
    Standard: cronostar_<base>_<preset_type>.json
    """
    prefix_with_underscore = normalize_prefix(global_prefix)
    base = prefix_with_underscore.rstrip("_") or "default"

    # Ensure base doesn't start with cronostar_ if we are going to add it
    if base.startswith("cronostar_"):
        base = base[len("cronostar_") :]

    return f"cronostar_{base}_data.json"
