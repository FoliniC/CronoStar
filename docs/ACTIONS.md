# CronoStar Service Actions

Documented service actions provided by the integration.

## cronostar.apply_now
Apply the current scheduled value immediately to the configured target entity.

### Fields
- target_entity (string, required): Entity ID to apply value to.
- preset_type (string, required): Preset type for the controller.
- global_prefix (string, required): Identification prefix used by the controller.

## cronostar.save_profile
Save a profile to storage.

### Fields
- name (string): Profile name.
- preset (string): Preset type.
- schedule (list): List of time/value pairs.
- global_prefix (string): Identification prefix.

## cronostar.load_profile
Load a profile from storage into memory.

### Fields
- name (string): Profile name.
- preset (string): Preset type.
- global_prefix (string): Identification prefix.

## cronostar.add_profile
Create a new empty profile.

## cronostar.delete_profile
Delete a profile from storage.

## cronostar.list_all_profiles
List available profiles and containers.
