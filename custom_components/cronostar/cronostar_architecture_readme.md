# CronoStar Architecture Documentation

## Overview

CronoStar is a Home Assistant integration that provides advanced time-based scheduling with visual profile management. This document describes the architectural design as a **component-only integration** where configuration is handled by **Lovelace cards**, not config entries.

## Architecture Model

### Component-Only Integration

CronoStar uses a **component-only** approach where:
- **One config entry** installs the component globally
- **No per-controller entities** (select, sensor, switch)
- **No coordinators** for automatic updates
- **Configuration via Lovelace cards** - each card creates a controller instance
- **Global services** for profile management and schedule application

This model is similar to integrations like `browser_mod` or custom dashboard cards that manage their own state.

### Key Difference from Traditional Integrations

```
Traditional Integration:          CronoStar:
─────────────────────────        ─────────────────────────
Config Flow                       Config Flow
  ↓                                 ↓
Create Controller Entry           Install Component Globally
  ↓                                 ↓
Spawn Entities                    Register Services + Card
  ↓                                 ↓
Update via Coordinator            User Adds Card to Dashboard
                                    ↓
                                  Card Manages Controller State
```

### Components

```
┌──────────────────────────────────────────────────┐
│              Home Assistant                       │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │     CronoStar Component (Global)           │  │
│  │  - Storage Manager                         │  │
│  │  - Profile Services                        │  │
│  │  - Frontend Card (registered)              │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │     User Dashboards (Lovelace)             │  │
│  │                                             │  │
│  │  ┌──────────────┐  ┌──────────────┐       │  │
│  │  │ CronoStar    │  │ CronoStar    │       │  │
│  │  │ Card #1      │  │ Card #2      │  ...  │  │
│  │  │ (Thermostat) │  │ (Switch)     │       │  │
│  │  │              │  │              │       │  │
│  │  │ Manages:     │  │ Manages:     │       │  │
│  │  │ - Profile    │  │ - Profile    │       │  │
│  │  │ - Schedule   │  │ - Schedule   │       │  │
│  │  │ - Target     │  │ - Target     │       │  │
│  │  └──────────────┘  └──────────────┘       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## File Structure

```
custom_components/cronostar/
├── __init__.py                  # Component entry point (global setup)
├── manifest.json                # Integration metadata
├── config_flow.py              # Component installation flow (single instance)
├── const.py                    # Constants
│
├── setup/                      # Global setup modules
│   ├── __init__.py            # Main setup logic
│   ├── services.py            # Service registration
│   └── validators.py          # Environment validation
│
├── services/                   # Service implementations
│   └── profile_service.py     # Profile CRUD operations
│
├── storage/                    # Data persistence
│   └── storage_manager.py     # JSON file management + caching
│
├── utils/                      # Utilities
│   ├── prefix_normalizer.py  # Preset/prefix handling
│   ├── filename_builder.py   # Filename conventions
│   └── error_handler.py       # Error handling utilities
│
├── deep_checks/               # Diagnostics (optional)
│   ├── __init__.py
│   ├── entity_checker.py
│   ├── file_checker.py
│   └── automation_checker.py
│
├── translations/              # UI translations
│   ├── en.json
│   └── it.json
│
└── www/cronostar_card/       # Frontend resources
    ├── cronostar-card.js      # Lovelace card implementation
    ├── card-picker-metadata.js
    └── cronostar-preview.png
```

### Files NOT Present (vs Traditional Integration)

```
❌ coordinator.py              # No coordinators
❌ select.py                   # No entities
❌ sensor.py                   # No entities
❌ switch.py                   # No entities
❌ setup/events.py             # No coordinator events
```

## Setup Flow

### 1. Component Installation (`async_setup_entry`)

When the component is installed via config flow:

```python
async def async_setup_entry(hass, entry):
    # Verify this is component installation entry
    if not entry.data.get("component_installed"):
        return False

    # Global setup
    await async_setup_integration(hass, config)
    # Registers:
    # - Storage manager
    # - Global services
    # - Frontend card resources
    
    # NO coordinator creation
    # NO platform forwarding
    
    return True
```

### 2. Card Usage

Users add CronoStar cards to dashboards:

```yaml
# ui-lovelace.yaml or dashboard UI editor
type: custom:cronostar-card
name: Living Room Thermostat
preset: thermostat
target_entity: climate.living_room
global_prefix: cronostar_living_
```

### 3. Card Responsibilities

The Lovelace card handles:
- **UI Rendering**: Schedule editor, profile selector
- **State Management**: Current profile, pause state, schedule data
- **Service Calls**: Calls `cronostar.save_profile`, `cronostar.load_profile`, etc.
- **Schedule Application**: Either via automations or internal timers (TBD)

## Data Flow

### Profile Management (Card → Backend)

```
User edits schedule in card
        ↓
Card calls cronostar.save_profile service
        ↓
ProfileService receives data
        ↓
StorageManager writes JSON file
        ↓
Card receives success confirmation
        ↓
Card updates UI
```

### Profile Loading (Card ← Backend)

```
Card initialization
        ↓
Card calls cronostar.load_profile service
        ↓
ProfileService reads from StorageManager
        ↓
Return schedule data to card
        ↓
Card renders schedule editor with data
```

### Schedule Application (Automation)

```
Time trigger (e.g., every minute)
        ↓
Automation calls cronostar.apply_now service
        ↓
Service interpolates schedule for current time
        ↓
Service updates target entity
        ↓
Target entity changes state
```

Example automation:
```yaml
automation:
  - id: cronostar_living_apply
    alias: "CronoStar: Apply Living Room Schedule"
    
    triggers:
      - trigger: time_pattern
        minutes: "/1"  # Every minute
    
    conditions:
      # Add conditions like pause check if needed
    
    actions:
      - action: cronostar.apply_now
        data:
          target_entity: climate.living_room
          preset_type: thermostat
          global_prefix: cronostar_living_
          profile_name: "{{ states('input_select.living_profile') }}"
```

## Service Architecture

### Global Services (Component Level)

All services are registered once when component is installed:

| Service | Description | Used By |
|---------|-------------|---------|
| `cronostar.save_profile` | Save/update schedule profile | Lovelace card |
| `cronostar.load_profile` | Load profile data (returns JSON) | Lovelace card |
| `cronostar.add_profile` | Create new empty profile | Lovelace card |
| `cronostar.delete_profile` | Delete existing profile | Lovelace card |
| `cronostar.list_all_profiles` | List all profiles (debugging) | Developer tools |
| `cronostar.apply_now` | Force apply current schedule value | Automations |

### Service Call Examples

#### Save Profile (from card)
```javascript
// In cronostar-card.js
await hass.callService('cronostar', 'save_profile', {
  profile_name: 'Default',
  preset_type: 'thermostat',
  global_prefix: 'cronostar_living_',
  schedule: [
    {time: '00:00', value: 18.0},
    {time: '06:00', value: 21.0},
    {time: '23:00', value: 19.0}
  ],
  meta: {
    target_entity: 'climate.living_room',
    title: 'Living Room Thermostat'
  }
});
```

#### Load Profile (from card)
```javascript
// In cronostar-card.js
const result = await hass.callService('cronostar', 'load_profile', {
  profile_name: 'Default',
  preset_type: 'thermostat',
  global_prefix: 'cronostar_living_'
}, {return_response: true});

console.log(result.schedule); // Schedule data
```

#### Apply Now (from automation)
```yaml
action: cronostar.apply_now
data:
  target_entity: climate.living_room
  preset_type: thermostat
  global_prefix: cronostar_living_
  profile_name: Default
```

## Storage Format

Profiles are stored in JSON containers (unchanged):

```json
{
  "meta": {
    "preset_type": "thermostat",
    "global_prefix": "cronostar_living_",
    "target_entity": "climate.living_room",
    "updated_at": "2026-01-01T10:00:00"
  },
  "profiles": {
    "Default": {
      "schedule": [
        {"time": "00:00", "value": 18.0},
        {"time": "06:00", "value": 21.0}
      ],
      "updated_at": "2026-01-01T10:00:00"
    }
  },
  "saved_at": "2026-01-01T10:00:00Z",
  "version": 2
}
```

Filename format: `cronostar_{prefix}_data.json`

## Key Design Decisions

### 1. No Entities, Only Services

**Rationale**: 
- Cards manage their own UI state
- No need for select/sensor/switch entities
- Reduces entity pollution in HA
- Simpler architecture

**Trade-off**: 
- Can't use entity-based automations
- Must use service-based automations

### 2. No Coordinators

**Rationale**:
- Cards handle their own data fetching
- Schedule application via explicit service calls
- No automatic background updates needed

**Trade-off**:
- Automations must explicitly call `apply_now`
- No "set and forget" like traditional thermostats

### 3. Component-Only Config Entry

**Rationale**:
- Single installation per HA instance
- Prevents multiple component instances
- Clearer separation: component vs controllers

**Trade-off**:
- Can't manage controllers via Devices & Services UI
- Must use Lovelace card editor

### 4. Service-Based Schedule Application

**Rationale**:
- Explicit control over when schedules apply
- Can integrate with complex automations
- No hidden background processes

**Trade-off**:
- User must create automations (or card implements timers)
- Not "plug and play" like some integrations

## Integration with Lovelace Card

### Card Configuration

Users add cards with configuration:

```yaml
type: custom:cronostar-card
name: Living Room Thermostat
preset: thermostat
target_entity: climate.living_room
global_prefix: cronostar_living_
profiles_select_entity: input_select.living_profile  # Optional
enabled_entity: switch.living_enabled            # Optional
```

### Card State Management

The card maintains:
- **Current profile selection** (in card state or input_select)
- **Pause state** (in card state or input_boolean)
- **Schedule data** (loaded from backend via services)
- **Current interpolated value** (calculated in card)

### Card-Backend Communication

```javascript
// Card initialization
async connectedCallback() {
  // Load available profiles
  const profiles = await this.loadProfiles();
  
  // Load selected profile's schedule
  const schedule = await this.loadSchedule(selectedProfile);
  
  // Render UI
  this.renderScheduleEditor(schedule);
}

// User saves schedule
async saveSchedule() {
  await hass.callService('cronostar', 'save_profile', {
    profile_name: this.selectedProfile,
    schedule: this.currentSchedule,
    ...
  });
}
```

## Comparison: Traditional vs Component-Only

| Aspect | Traditional Integration | CronoStar (Component-Only) |
|--------|------------------------|----------------------------|
| **Config Entry** | Per controller | One for entire component |
| **Entities** | select, sensor, switch per controller | None (UI only) |
| **Coordinator** | Yes, updates automatically | No, cards manage state |
| **Configuration** | Via config flow UI | Via Lovelace card editor |
| **Schedule Application** | Automatic (coordinator) | Explicit (service + automation) |
| **State Storage** | HA entity registry | Card state + JSON files |
| **Visibility** | Shows in Devices & Services | Shows only as integration |

## Testing

### Component Installation
1. Add integration via Settings → Integrations
2. Verify services registered: `Developer Tools → Services → cronostar.*`
3. Verify card available: Dashboard edit → Add card → Search "CronoStar"

### Card Functionality
1. Add CronoStar card to dashboard
2. Configure: name, preset, target entity
3. Edit schedule in card UI
4. Save → verify JSON file created in `config/cronostar/profiles/`
5. Reload page → verify schedule loaded correctly

### Service Calls
```yaml
# Test save_profile
service: cronostar.save_profile
data:
  profile_name: Test
  preset_type: thermostat
  schedule: [{time: "00:00", value: 20}]

# Test load_profile
service: cronostar.load_profile
data:
  profile_name: Test
  preset_type: thermostat
response_variable: result

# Test apply_now
service: cronostar.apply_now
data:
  target_entity: climate.test
  profile_name: Test
  preset_type: thermostat
```

### Automation Integration
Create test automation:
```yaml
automation:
  - alias: Test CronoStar Apply
    triggers:
      - trigger: time_pattern
        minutes: "/1"
    actions:
      - action: cronostar.apply_now
        data:
          target_entity: climate.test
          profile_name: Test
          preset_type: thermostat
```

## Migration Path

### From Previous Architecture (5.2.x with Coordinators)

Users who had YAML-configured controllers need to:

1. **Uninstall old integration**
2. **Install new component** via UI
3. **Add Lovelace cards** for each controller
4. **Create automations** for schedule application
5. **Profiles preserved** automatically (same JSON format)

Example migration for one controller:
```yaml
# OLD (5.2.x) - configuration.yaml
cronostar:
  controllers:
    - name: Living Room
      preset: thermostat
      target: climate.living_room

# NEW (5.3.0+) - Lovelace dashboard
type: custom:cronostar-card
name: Living Room
preset: thermostat
target_entity: climate.living_room
global_prefix: cronostar_living_

# NEW - Automation (separate file)
automation:
  - alias: "CronoStar: Living Room"
    triggers:
      - trigger: time_pattern
        minutes: "/1"
    actions:
      - action: cronostar.apply_now
        data:
          target_entity: climate.living_room
          profile_name: "{{ states('input_select.living_profile') }}"
          preset_type: thermostat
          global_prefix: cronostar_living_
```

## Troubleshooting

### Component Not Appearing in Integrations
- Verify `manifest.json` has `"config_flow": true`
- Check Home Assistant logs for errors
- Try restart after installation

### Card Not Available
- Verify frontend resources registered: Check for `/cronostar_card/cronostar-card.js` in browser Network tab
- Clear browser cache
- Check `www/cronostar_card/` directory exists

### Services Not Working
- Verify component installed successfully
- Check `Developer Tools → Services` for `cronostar.*` services
- Check Home Assistant logs for service registration errors

### Schedules Not Applying
- Verify automation created and enabled
- Check automation triggers firing: `Developer Tools → Automations`
- Verify `apply_now` service being called: Check logs
- Check target entity exists and is controllable

## Future Enhancements

Potential improvements:
- [ ] **Card-managed timers** - Apply schedules without automations
- [ ] **Entity selectors in card** - Instead of requiring manual automation creation
- [ ] **Preset templates** - Pre-configured schedules for common use cases
- [ ] **Multi-zone support** - One card controlling multiple entities
- [ ] **Schedule preview** - Show upcoming values
- [ ] **Import/export** - Share profiles between instances
- [ ] **Conditional schedules** - Apply different schedules based on conditions

## Compliance Checklist

✅ Config flow implementation (component installation)
✅ Single instance enforcement
✅ Service registration with schema
✅ Proper translations (en, it)
✅ Error handling and logging
✅ Storage with caching and validation
✅ Unload/reload support
✅ Frontend resource registration
❌ Per-controller entities (intentionally omitted)
❌ Coordinator pattern (intentionally omitted)

---
**Version**: 5.4.0  
**Last Updated**: January 2026


**Version**: 5.3.0
**Model**: Component-Only (Card-Managed Controllers)
**Last Updated**: 2026-01-01
