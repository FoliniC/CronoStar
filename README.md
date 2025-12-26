# CronoStar for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/release/FoliniC/cronostar.svg)](https://github.com/FoliniC/cronostar/releases)
[![License](https://img.shields.io/github/license/FoliniC/cronostar.svg)](LICENSE)

Easily add time-based schedules to any entity. The integration can automatically create the required helpers and automations, stores its settings in editable JSON files, and provides an intuitive visual interface to manage all your time profiles. 

![CronoStar](https://github.com/user-attachments/assets/724972bf-f360-4e84-ada9-66577adb4328)



![CronoStar settings](https://github.com/user-attachments/assets/fd130bd6-aea4-4578-b25a-35ac61a969f6)

![CronoStar manager](https://github.com/user-attachments/assets/2a9155f9-75f6-4d1a-8d3a-56339c1ef937)


## 🎯 What's New in v5.0

### 🔧 Dynamic Point Management & History
- **Undo/Redo Support**: Easily revert or re-apply changes (Ctrl+Z / Ctrl+Y)
- **Click on line**: Add new point
- **Right-click on point**: Remove point
- **Alt+Q**: Insert point (keyboard)
- **Alt+W**: Delete point (keyboard)
- Points can be at any time (not just hourly)

### 📊 Optimized Storage
- ISO 8601 date format
- Schedule with `time` field (HH:MM format)
- Automatic removal of redundant points
- Only saves points where value changes

### ⚡ Smart Scheduler
- Interpolates values between points
- Triggers updates only when values change
- Handles irregular intervals automatically

## ✨ Features

### 🔧 Integration (Backend)
- **Multiple Preset Types**: Thermostat, EV Charging, Generic Switch, Temperature, Power
- **Profile Management**: Create, save, load, and delete schedules
- **Service-Based Automation**: Apply profiles automatically or on-demand
- **Configuration Verification**: Deep checks to validate your setup
- **Blueprint Support**: Ready-to-use automation templates

### 🎨 Lovelace Card (Frontend)
- **Visual Editor**: Interactive drag-and-drop schedule editor
- **History Management**: Full Undo/Redo support for all changes
- **Multi-Point Selection**: Select multiple hours (Shift+click or long-press on mobile)
- **Keyboard Controls**: Arrow keys, Ctrl+A, precise adjustments
- **Real-Time Sync**: Instant synchronization with the integration
- **Multi-Language**: English and Italian support
- **Responsive Design**: Works on desktop, tablet, and mobile

### 🖱️ Mouse Usage
- **Add Points**: Left-click on empty space to insert a new point.
- **Selection**: Click on a point to select it.
- **Multiple Selection**:
  - **Ctrl / Cmd + Click**: Add/remove individual points.
  - **Shift + Click**: Select all points between the last selected and the clicked one.
  - **Selection Box**: Drag on an empty area to draw a rectangle; all points inside will be selected.
- **Adjust Values**: Drag a point up or down. If multiple points are selected, they move together preserving relative distances.
- **Delete**: Right-click on a point to remove it.
- **Alignment**: **Alt + Left Click** aligns selected points to the leftmost selected point's value; **Alt + Right Click** aligns them to the rightmost.

### ⌨️ Keyboard Usage
- **UP / DOWN Arrows**: Increase or decrease the value of selected points.
- **LEFT / RIGHT Arrows**: Align selected points to the left or right edge of the current selection.
- **Modifiers**:
  - **Ctrl / Cmd**: Fine adjustment (smaller increments).
  - **Shift**: Snap to integer values (Y-axis) or 30-minute intervals (X-axis).
- **Shortcuts**:
  - **Ctrl + Z**: Undo last action.
  - **Ctrl + Y / Ctrl + Shift + Z**: Redo action.
  - **Ctrl + A**: Select all points.
  - **Alt + Q**: Insert new point halfway between selection and the next point.
  - **Alt + W**: Delete currently selected point(s).
  - **Esc**: Deselect all.
  - **Enter**: (If configured) Apply changes immediately.
## 🚀 Installation

### Via HACS (Recommended)

1. Open HACS → Integrations
2. Click ⋮ → Custom repositories
3. Add `https://github.com/FoliniC/cronostar`
4. Category: **Integration**
5. Click "Download"
6. **Restart Home Assistant**
7. Go to Settings → Devices & Services → Add Integration
8. Search for "CronoStar" and configure. The system will automatically check for `packages` and `automations` folders.

### Manual Installation

1. Download the [latest release](https://github.com/FoliniC/cronostar/releases)
2. Extract and copy `custom_components/cronostar` to your Home Assistant `custom_components` directory
3. **Restart Home Assistant**
4. Add the integration via Settings → Devices & Services

## 📦 What's Included

This single repository contains everything you need:

```
cronostar/
├── custom_components/cronostar/  # Integration (Python)
│   ├── services/                 # Service implementations
│   ├── utils/                    # Utility functions
│   └── www/                      # Built Lovelace card
├── cronostar_card/               # Card source code (JavaScript)
│   ├── src/                      # Source files
│   └── dist/                     # Built files
├── packages/                     # Configuration packages
├── automations/                  # Example automations
├── blueprints/                   # Automation blueprints
└── examples/                     # Configuration examples
```

## 🎯 Quick Start Guide

### 1. Choose Your Preset

Select the preset that matches your use case:

| Preset | Use Case | Range | Unit |
|--------|----------|-------|------|
| 🌡️ **Thermostat** | Temperature control | 15-30 | °C |
| 🔌 **EV Charging** | Electric vehicle charging | 0-8 | kW |
| ⚡ **Generic kWh** | Energy scheduling | 0-7 | kWh |
| 🌡️ **Generic Temperature** | Temperature monitoring | 0-40 | °C |
| 💡 **Generic Switch** | On/Off control | 0-1 | - |

### 2. Set Up Helper Entities

CronoStar needs 24 `input_number` entities (one per hour). The easiest way is to use the provided packages:

1. Copy the appropriate package from `packages/` to your Home Assistant `config/packages/` directory
2. Enable packages in `configuration.yaml`:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
3. Restart Home Assistant

**Example package structure:**
```yaml
# packages/cronostar_thermostat.yaml
input_number:
  cronostar_temp_00:
    name: "Temperature Hour 00"
    min: 15
    max: 30
    step: 0.5
    unit_of_measurement: "°C"
  # ... hours 01-23
```

### 3. Add the Card

Add the card to your dashboard:

```yaml
type: custom:cronostar-card
preset: thermostat
entity_prefix: cronostar_temp_
target_entity: climate.living_room
profiles_select_entity: input_select.cronostar_temp_profiles
pause_entity: input_boolean.cronostar_temp_paused
```

### 4. Create Automation

Use the included blueprint or create a custom automation:

```yaml
automation:
  - alias: "CronoStar - Apply Hourly"
    trigger:
      - platform: time_pattern
        minutes: "0"
    action:
      - service: cronostar.apply_now
        data:
          entity_id: climate.living_room
          preset_type: thermostat
          entity_prefix: cronostar_temp_
```

## 📖 Configuration

### Basic Card Configuration

```yaml
type: custom:cronostar-card
preset: thermostat                                    # Required: preset type
entity_prefix: cronostar_temp_                       # Required: helper entities prefix
target_entity: climate.living_room                    # Target entity
profiles_select_entity: input_select.cronostar_temp_profiles  # Profile selector
pause_entity: input_boolean.cronostar_temp_paused    # Pause control
```

### Advanced Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | preset name | Custom card title |
| `y_axis_label` | string | preset default | Y-axis label |
| `unit_of_measurement` | string | preset default | Display unit |
| `min_value` | number | preset default | Minimum value |
| `max_value` | number | preset default | Maximum value |
| `step_value` | number | preset default | Value increment |
| `allow_max_value` | boolean | `false` | Enable symbolic "Max" value |
| `hour_base` | number/string | `auto` | Hour numbering (0 or 1) |
| `logging_enabled` | boolean | `false` | Console debug logging |

### Example: Custom Configuration

```yaml
type: custom:cronostar-card
title: "Custom Schedule"
entity_prefix: my_custom_
y_axis_label: "Power"
unit_of_measurement: "W"
min_value: 0
max_value: 3000
step_value: 100
```

## 🔧 Available Services

### `cronostar.apply_now`
Apply the current hour's scheduled value immediately.

```yaml
service: cronostar.apply_now
data:
  entity_id: climate.living_room
  preset_type: thermostat
  entity_prefix: cronostar_temp_
```

### `cronostar.save_profile`
Save the current schedule as a profile.

```yaml
service: cronostar.save_profile
data:
  profile_name: "Comfort"
  preset_type: thermostat
  global_prefix: cronostar_temp_
  schedule:
    - { time: "00:00", value: 20 }
    - { time: "06:30", value: 22 }
    - { time: "22:00", value: 20 }
```

### `cronostar.load_profile`
Load a saved profile.

```yaml
service: cronostar.load_profile
data:
  profile_name: "Comfort"
  preset_type: thermostat
  global_prefix: cronostar_temp_
```

### `cronostar.add_profile`
Create a new profile with default values.

```yaml
service: cronostar.add_profile
data:
  profile_name: "New Profile"
  preset_type: thermostat
  global_prefix: cronostar_temp_
```

### `cronostar.delete_profile`
Delete an existing profile.

```yaml
service: cronostar.delete_profile
data:
  profile_name: "Old Profile"
  preset_type: thermostat
  global_prefix: cronostar_temp_
```

### `cronostar.check_setup`
Verify your configuration and helper entities.

```yaml
service: cronostar.check_setup
data:
  prefix: cronostar_temp_
  hour_base: 0
```

## 📂 File Storage

CronoStar stores profile data in:
```
/config/cronostar/profiles/
```

Profile files use this naming convention:
```
cronostar_<preset>_<profile_name>.json
```

**Examples:**
- `cronostar_temp_comfort.json`
- `cronostar_ev_night.json`

**Backup:** This directory is included in Home Assistant's automatic backups.

## 📚 Reference Files

### Packages (`packages/`)
Complete configuration packages for each preset:
- `cronostar_thermostat.yaml`
- `cronostar_ev_charging.yaml`
- `cronostar_generic_presets.yaml`
- `cronostar_profiles.yaml`

### Blueprints (`blueprints/`)
Ready-to-use automation templates:
- `apply_hourly.yaml` - Apply profiles every hour

### Automations (`automations/`)
Example automations:
- `cronostar_automation.yaml`

### Examples (`examples/`)
- `configuration.yaml` - Sample configuration

## 🛠️ Development

### Building the Card

```bash
cd cronostar_card
npm install
npm run build
```

The built file is automatically copied to `custom_components/cronostar/www/`

### Project Structure

- **Backend**: `custom_components/cronostar/` - Python integration
- **Frontend**: `cronostar_card/` - JavaScript card source
- **Configuration**: `packages/`, `automations/`, `blueprints/`

## 📝 Documentation

- [Configuration Guide](https://github.com/FoliniC/cronostar/wiki/Configuration)
- [Automation Examples](https://github.com/FoliniC/cronostar/wiki/Automations)
- [Troubleshooting](https://github.com/FoliniC/cronostar/wiki/Troubleshooting)

## 💬 Support

- 🐛 [Report Issues](https://github.com/FoliniC/cronostar/issues)
- 💡 [Feature Requests](https://github.com/FoliniC/cronostar/issues)
- 💬 [Discussions](https://github.com/FoliniC/cronostar/discussions)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Credits

Built with:
- [Lit](https://lit.dev/) - Web Components
- [Chart.js](https://www.chartjs.org/) - Charting library
- [chartjs-plugin-dragdata](https://github.com/chrispahm/chartjs-plugin-dragdata) - Drag functionality

## ☕ Support the Project

If you find CronoStar useful, consider [buying me a glass of wine](https://buymeacoffee.com/carlofolinf) 🍷

---

**Made with ❤️ for Home Assistant**
