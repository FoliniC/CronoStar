# CronoStar Troubleshooting

## Card not loading
- Confirm the component was installed. Resources should be registered and `/cronostar_card/cronostar-card.js` available.
- Clear browser cache.

## Entities not created
- Ensure you have configured a card with a valid identification prefix and target entity.
- The component creates native entities automatically upon card registration.

## Target entity not updating
- Verify the target entity exists and is not `unavailable`.
- Confirm the preset type matches the target entity domain (e.g., `thermostat` for `climate` entities).

## Profiles not found
- Check storage directory: `/config/cronostar/profiles`.
- Ensure files match naming convention: `cronostar_<prefix>_data.json`.

## Logs
Review Home Assistant logs for output from `custom_components.cronostar` for detailed error messages.