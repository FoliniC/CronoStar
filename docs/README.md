# CronoStar Integration

CronoStar provides advanced time-based scheduling with profile management for Home Assistant.

## High-level description
- Create controllers by adding CronoStar cards to your dashboard.
- Standard Home Assistant entities (Sensor, Switch, Select) are created automatically for each controller.
- Store and manage multiple profiles (schedules) on disk, with caching and optional backups.
- A Lovelace card provides a powerful visual interface to edit profiles.

## Installation
1. In Home Assistant, go to Settings → Devices & Services → Integrations → Add Integration.
2. Search for "CronoStar" and start the flow.
3. Install the component (registers resources and services).
4. Add CronoStar cards to your Lovelace dashboards.

## Configuration
Controllers are configured directly in the Lovelace card editor:
- **Identification Prefix**: Unique string to identify related entities and files.
- **Target Entity**: The entity that receives scheduled values (e.g., `climate.living_room`, `switch.plug`).
- **Preset**: Preconfigured settings for common use cases (Thermostat, EV Charging, etc.).

## Supported entities
Each controller creates:
- **Sensor**: Shows current scheduled value.
- **Switch**: Pause/resume schedule application.
- **Select**: Choose active profile.

## How data is updated
- Each controller uses a Data Update Coordinator with a 1-minute cycle.
- The coordinator calculates interpolated values from the active profile and applies them to the target entity.

## Troubleshooting
- Ensure the target entity exists and is available.
- Check Home Assistant logs for `custom_components.cronostar`.
- Verify profile storage path in `/config/cronostar/profiles`.

## Service actions
- `cronostar.apply_now`: Force apply the current scheduled value.
- `cronostar.save_profile`, `cronostar.load_profile`, `cronostar.add_profile`, `cronostar.delete_profile`: Manage profile persistence.
- `cronostar.list_all_profiles`: List all profiles for diagnostics.