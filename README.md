# CronoStar for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/release/FoliniC/cronostar.svg)](https://github.com/FoliniC/cronostar/releases)
[![License](https://img.shields.io/github/license/FoliniC/cronostar.svg)](LICENSE)

A comprehensive Home Assistant integration for managing time-based profiles and automations with an intuitive visual interface.

![CronoStar](https://github.com/user-attachments/assets/8bd1361f-53ea-4aee-943d-b8e374308e36)


## ✨ Features

### 🔧 Integration (Backend)
- **Multiple Preset Types**: Thermostat, EV Charging, Generic Switch, Temperature, Power
- **Profile Management**: Create, save, load, and delete schedules
- **Service-Based Automation**: Apply profiles automatically or on-demand
- **Configuration Verification**: Deep checks to validate your setup
- **Blueprint Support**: Ready-to-use automation templates

### 🎨 Lovelace Card (Frontend)
- **Visual Editor**: Interactive drag-and-drop schedule editor
- **Multi-Point Selection**: Select multiple hours (Shift+click or long-press on mobile)
- **Keyboard Controls**: Arrow keys, Ctrl+A, precise adjustments
- **Real-Time Sync**: Instant synchronization with the integration
- **Multi-Language**: English and Italian support
- **Responsive Design**: Works on desktop, tablet, and mobile

## 🚀 Installation

### Via HACS (Recommended)

1. Open HACS → Integrations
2. Click ⋮ → Custom repositories
3. Add `https://github.com/FoliniC/cronostar`
4. Category: **Integration**
5. Click "Download"
6. **Restart Home Assistant**
7. Go to Settings → Devices & Services → Add Integration
8. Search for "CronoStar" and configure

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
apply_entity: climate.living_room
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
apply_entity: climate.living_room                    # Target entity
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
    - { hour: 0, value: 20 }
    - { hour: 1, value: 20 }
    # ... 24 hours total
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
