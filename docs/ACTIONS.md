# CronoStar Service Actions

Documented service actions provided by the integration.

## cronostar.apply_now
Apply the current scheduled value immediately to the configured target entity.

### Fields
- target_entity (string, required): Entity ID to apply value to.
- preset_type (string, required): Preset type for the controller.
- global_prefix (string, required): Identification prefix used by the controller.
- profile_name (string, required): Name of the profile to use for application.

## cronostar.save_profile
Save a profile to storage.

### Fields
- profile_name (string): Profile name.
- preset_type (string): Preset type.
- schedule (list): List of time/value pairs.
- global_prefix (string): Identification prefix.
- meta (object): Optional metadata including card configuration.

## cronostar.load_profile
Load a profile from storage.

### Fields
- profile_name (string): Profile name.
- preset_type (string): Preset type.
- global_prefix (string): Identification prefix.

## cronostar.add_profile
Create a new profile.

## cronostar.delete_profile
Delete a profile from storage.

## cronostar.list_all_profiles
List all available profiles and containers across all presets.