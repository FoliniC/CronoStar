# Changelog

## v5.4.0

### 🛡️ Quality and Testing
- **Code Coverage**: Reached **94%** coverage across the entire backend codebase.
- **Robustness**: Improved error handling and edge case validation in service and storage managers.
- **CI/CD Integration**: Automated test suite and dynamic coverage reporting via GitHub Actions.

## v5.3.0

### 🔄 Architectural Refactoring
- **Removed YAML Generation**: The integration no longer generates or requires external YAML packages or automations.
- **Native Entity Integration**: Switched to standard Home Assistant Config Entry and Data Update Coordinator pattern.
- **Automatic Entity Management**: Native Sensor, Switch, and Select entities are created automatically for each schedule controller.
- **Simplified Setup**: Wizard streamlined to focus on card configuration and profile persistence.

### 🎨 Lovelace Card
- **Unified Editor**: Removed the automation generation step from the wizard.
- **Clean Summary**: The final step now focuses on verifying the card configuration.
- **Internal State Management**: The card now handles profile loading and synchronization directly with the backend.

### 🔧 Backend
- **Service Cleanup**: Removed services related to YAML file creation and environment verification (`check_setup`).
- **Standardized Storage**: Profiles remain stored in JSON format for easy manual editing if needed.

## v4.3.0 / v5.1.0

### Added - Integration (Backend)
- **Config Flow Support**: Initial support for Home Assistant Config Flow. You can now add CronoStar via the Integrations UI.
- **Core Setup Refactoring**: Unified setup logic for both YAML and UI-based installations.

### Improved - Lovelace Card (Frontend)
- **Wizard UI Redesign**: New centered 2-column layout for the first step of the setup wizard.
- **Visual Feedback**: Enhanced preset cards with larger icons, dedicated descriptions, and high-visibility selection states.

### Bug Fixes
- Fixed incorrect imports in the backend initialization.
- Enforced strict CSS grid layout in the wizard to prevent block shifting.

## v4.3.3

### Bug Fixes
- Fixed: "Waiting for automation" overlay appearing on initial load without user interaction. The overlay now only appears after a user-initiated change to the schedule.

## v4.0.0

### Added - Integration
- Initial release of CronoStar custom integration
- Multiple preset types support (Thermostat, EV Charging, Generic Switch, Temperature, Power)
- Profile management system with save/load functionality
- Service-based automation system
- `cronostar.apply_now` service for immediate application
- `cronostar.save_profile` service for saving profiles
- `cronostar.load_profile` service for loading profiles
- `cronostar.add_profile` service for creating new profiles
- `cronostar.delete_profile` service for deleting profiles
- Automatic profile loading on startup
- Event `cronostar_profiles_loaded` for frontend synchronization

### Added - Lovelace Card
- Visual hourly schedule editor with interactive chart
- Drag-and-drop value adjustment
- Multi-point selection (Shift + drag)
- Keyboard controls (arrows, Ctrl+A, Esc)
- Profile selector with save/load functionality
- Pause/resume functionality
- Apply Now button for immediate application
- 5 preset types with preconfigured settings
- Multi-language support (English and Italian)
- Real-time synchronization with integration
- Configuration wizard for easy setup

### Technical Details
- HACS compatible structure
- Single repository for both integration and card
- Automatic card installation with integration
- Profile storage in JSON format
- Prefix-based entity management
- Hour base auto-detection (0-23 or 1-24)