# Changelog
## v4.3.0 / v5.1.0

### Added - Integration (Backend)
- **Config Flow Support**: Initial support for Home Assistant Config Flow. You can now add CronoStar via the Integrations UI.
- **Auto-Configuration**: The integration now analyzes `configuration.yaml` and can automatically enable `packages` support if missing.
- **Automations Management**: Automatic creation of the `automations/` folder and configuration of the `!include_dir_merge_list` directive if needed.
- **Core Setup Refactoring**: Unified setup logic for both YAML and UI-based installations.

### Improved - Lovelace Card (Frontend)
- **Wizard UI Redesign**: New centered 2-column layout for the first step of the setup wizard.
- **Visual Feedback**: Enhanced preset cards with larger icons, dedicated descriptions, and high-visibility selection states.
- **Minimal Setup Flow**: Streamlined the initial configuration step to allow one-click saving of required files (Package + JSON).

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
- `cronostar.check_setup` service for configuration verification
- Deep checks for configuration validation
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

### Added - Configuration Examples
- Blueprint for hourly profile application
- Package configurations for all preset types
- Example automations
- Sample configuration.yaml

### Technical Details
- HACS compatible structure
- Single repository for both integration and card
- Automatic card installation with integration
- Profile storage in JSON format
- Prefix-based entity management
- Hour base auto-detection (0-23 or 1-24)

## v3.5.0
-   **Features**:
    -   Full localization of Italian strings in frontend (card UI) and backend (example YAMLs).
    -   Standardized all comments and internal documentation to English.
    -   Codebase linted and formatted for consistency.
-   **Improvements**:
    -   Enhanced maintainability and readability through comprehensive English translation.
    -   Improved consistency across the project's various components.

## v3.0.0
-   **Features**:
    -   Added long-press support for multi-point selection on mobile devices.

## v2.3.0
-   **Improvements**:
    -   Project renamed to CronoStar. The name 'Crono' highlights its scheduling nature, making it clear it's designed for time-based controls, such as thermostats and other daily routines.

## v2.22.11

-   **Bug Fixes**:
    -   Fixed: Logging visibility issue resolved; `Logger.warn` now respects `logging_enabled` setting.
    -   Fixed: Interface no longer unresponsive when 'Anomalous operation' message is displayed (pointer events are now ignored by the overlay).
-   **Improvements**:
    -   Missing entities warning is now logged only once per change in missing entities list.
    -   Watermark styling further refined to be less intrusive.
    -   Version patch incremented.

## v2.22.9

-   **Bug Fixes**:
    -   Fixed: Logging visibility issue resolved by replacing direct `console.log` calls with `Logger.log`.
-   **Improvements**:
    -   Watermark styling refined to be less intrusive (transparent background, lighter color, dynamic text).
    -   Default configuration now uses a `generic_kwh` preset (0-7 kWh) if no preset is specified.
    -   Version patch incremented.

## v2.22.8

-   **Bug Fixes**:
    -   Fixed: `TIMEOUTS` ReferenceError resolved by importing `TIMEOUTS` in `temperature-scheduler-card.js`.
-   **Improvements**:
    -   Watermark styling refined to be less intrusive (lighter color, no background).
    -   Missing entities are now logged as a single, grouped message in the console.
    -   Version patch incremented.

## v2.22.7

-   **Bug Fixes**:
    -   Fixed: When `input_number` entities are missing, the card now uses default values and displays a clear warning message and a watermark on the chart.
-   **Improvements**:
    -   Version patch incremented.

## v2.22.6

-   **Bug Fixes**:
    -   Fixed: When loading presets with missing `input_number` entities, a clear message is now displayed listing the required entities.
-   **Improvements**:
    -   Version patch incremented.

## v2.22.5

-   **Bug Fixes**:
    -   Fixed: Logging is now correctly disabled at startup when `logging_enabled` is `false`.
-   **Improvements**:
    -   Version patch incremented.

## v2.22.4

-   **Bug Fixes**:
    -   Fixed: Logging toggle and preset selection now work correctly and close the menu.
-   **Improvements**:
    -   Added warning logs when `input_number` entities are not found for a preset.
    -   Version patch incremented.

## v2.22.3

-   **Bug Fixes**:
    -   Fixed: Logging toggle now correctly enables/disables console logging and properly closes the menu.
    -   Fixed: Preset selection now works correctly, applies the preset configuration, and closes the menu.
    -   Fixed: Improved event handling for ha-select and ha-switch components to prevent premature menu closure.
-   **Improvements**:
    -   Added setTimeout delays to ensure UI state changes are visible before menu closes.
    -   Enhanced debug logging for troubleshooting toggle and preset changes.
    -   Improved preset change handler to properly merge preset configuration with user config.

## v2.22.2

-   **Features**:
    -   Added UI controls in the card's menu for `logging_enabled` and `preset` selection.
-   **Improvements**:
    -   Fixed: Menu now closes after selecting logging or preset options.
    -   Version patch incremented.

## v2.22.1

-   **Features**:
    -   Added UI controls in the card's menu for `logging_enabled` and `preset` selection.
-   **Improvements**:
    -   Version patch incremented.

## v2.22.0

-   **Features**:
    -   Added `preset` option for quick configuration (`thermostat`, `ev_charging`).
    -   Added `logging_enabled` option to control console output for debugging.
-   **Improvements**:
    -   Versioning scheme updated to increment minor version for new features.
    -   Updated `README.md` to explain the new preset system.

## v2.21.0

-   **Features**:
    -   Made the card more generic for use with any scheduled value, not just temperature (e.g., EV charging power).
    -   Added `y_axis_label` config option for a custom Y-axis label.
    -   Added `unit_of_measurement` config option.
    -   Added `min_value`, `max_value`, and `step_value` config options to control the Y-axis and value adjustments.
-   **Documentation**:
    -   Updated `README.md` with detailed instructions and examples for different scheduler types.

## v2.20.0

-   **Features**:
    -   Made the card more generic for use with any scheduled value, not just temperature (e.g., EV charging power).
    -   Added `y_axis_label` config option for a custom Y-axis label.
    -   Added `unit_of_measurement` config option.
    -   Added `min_value`, `max_value`, and `step_value` config options to control the Y-axis and value adjustments.
-   **Documentation**:
    -   Updated `README.md` with detailed instructions and examples for different scheduler types.

## v2.20.0

-   **Features**:
    -   Added a settings menu with options for language selection and help.
    -   Implemented internationalization with support for English and Italian.
    -   Added `Ctrl+A` keyboard shortcut to select all points on the chart.
    -   The settings menu includes a "Select All" option.
-   **Changes**:
    -   The behavior of the left and right arrow keys has been updated. They now align the temperature of all selected points to the value of the leftmost or rightmost selected point, respectively.
-   **Upgrades**:
    -   Upgraded the component from LitElement to Lit 3 for improved performance and modern features.
-   **Bug Fixes**:
    -   Resolved issues where changing the language did not update all parts of the UI correctly (including chart axis labels and the card title).
    -   Fixed the visibility of the hamburger menu icon.
    -   Ensured keyboard shortcuts are active immediately after the card loads by setting the initial focus.
-   **Documentation**:
    -   Updated the `README.md` to reflect all new features, keyboard shortcuts, and behavior changes.
