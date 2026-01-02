# CronoStar Troubleshooting

## Card not loading
- Confirm the component was installed. The resources should be registered and `/cronostar_card/cronostar-card.js` available.
- Clear browser cache.

## Entities not created
- Ensure you created a controller entry via the config flow after installing the component.
- Check logs for missing required fields or validation errors.

## Target entity not updating
- Verify the entity exists and is not `unavailable`.
- Confirm the preset and domain are supported for service calls.

## Profiles not found
- Check storage directory: `/config/cronostar/profiles`.
- Ensure files match naming by preset and prefix.

## Logs
Enable debug logging in the controller and review `custom_components.cronostar` log output.
