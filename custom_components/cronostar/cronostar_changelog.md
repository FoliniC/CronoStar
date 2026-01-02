# Changelog

All notable changes to CronoStar will be documented in this file.

## [5.3.0] - 2026-01-01

### Complete Architecture Refactoring - Component-Only Model

This release implements a **fundamental architectural change** from a traditional per-controller integration to a **component-only model** where controllers are managed by Lovelace cards.

### 🔄 Architecture Change

#### Before (5.2.x)
- Config flow created controller entries
- Each entry spawned entities (select, sensor, switch)
- Coordinators managed automatic updates
- Controllers in Devices & Services UI

#### After (5.3.0)
- Config flow installs component globally (once)
- **No entities created** by backend
- **No coordinators** - cards manage state
- Controllers configured via **Lovelace cards**
- Schedule application via **services + automations**

### Added

- **Component-Only Config Flow**
  - Single installation per HA instance
  - Simple confirmation dialog
  - Prevents duplicate installations
  - Installs global services and card

- **Enhanced Service Architecture**
  - `cronostar.save_profile` - Save schedule from card
  - `cronostar.load_profile` - Load schedule to card
  - `cronostar.add_profile` - Create new profile
  - `cronostar.delete_profile` - Remove profile
  - `cronostar.list_all_profiles` - List all profiles (debug)
  - `cronostar.apply_now` - Apply current schedule value (automation)

- **Lovelace Card Integration**
  - Card registered during component setup
  - Card manages controller state
  - Card calls backend services for persistence
  - Card configuration via UI editor

- **Complete Documentation**
  - ARCHITECTURE.md with component-only model
  - Data flow diagrams
  - Card-backend communication patterns
  - Migration guide from 5.2.x

### Changed (BREAKING)

- **Config Flow** ⚠️ BREAKING
  - Now installs component globally, not per-controller
  - Does NOT collect controller configuration
  - Single instance only (can't add multiple times)

- **No Backend Entities** ⚠️ BREAKING
  - Removed `select.{name}_profile` entities
  - Removed `sensor.{name}_current_value` entities
  - Removed `switch.{name}_pause` entities
  - Controllers exist only in Lovelace UI

- **No Coordinators** ⚠️ BREAKING
  - Removed automatic schedule updates
  - Schedules applied via explicit service calls
  - Requires automation for periodic application

- **Configuration Method** ⚠️ BREAKING
  - Controllers configured in Lovelace card editor
  - Not in Settings → Devices & Services
  - Card YAML or UI editor

### Removed

- **Backend Controller Management**
  - Removed `coordinator.py` - no automatic updates
  - Removed `select.py` - no profile selector entity
  - Removed `sensor.py` - no current value entity
  - Removed `switch.py` - no pause switch entity
  - Removed `setup/events.py` - no coordinator events

- **Per-Controller Entries**
  - Can't create multiple config entries for controllers
  - Single component-level entry only

- **Automatic Schedule Application**
  - No background coordinator applying schedules
  - Must use automations with `apply_now` service

### Fixed

- **Architectural Clarity**
  - Clear separation: component vs controllers
  - No confusion about entry purpose
  - Simpler mental model

- **Resource Usage**
  - No entity pollution
  - No coordinator background tasks
  - Only runs when explicitly called

### Migration Required ⚠️

#### From 5.2.x (Controller Entries)

If you have existing controller config entries:

1. **Backup profiles** (preserved automatically):
   ```bash
   cp -r /config/cronostar/profiles /config/cronostar_backup
   ```

2. **Remove old integration**:
   - Settings → Devices & Services
   - Find CronoStar controllers
   - Remove each entry

3. **Install new component**:
   - Settings → Devices & Services
   - Add Integration → CronoStar
   - Click Submit (one-time installation)

4. **Add Lovelace cards**:
   - Edit dashboard
   - Add card → Search "CronoStar"
   - Configure each controller:
     ```yaml
     type: custom:cronostar-card
     name: Living Room Thermostat
     preset: thermostat
     target_entity: climate.living_room
     global_prefix: cronostar_living_
     ```

5. **Create automations** for schedule application:
   ```yaml
   automation:
     - alias: "CronoStar: Living Room"
       triggers:
         - trigger: time_pattern
           minutes: "/1"
       actions:
         - action: cronostar.apply_now
           data:
             target_entity: climate.living_room
             preset_type: thermostat
             global_prefix: cronostar_living_
             profile_name: Comfort
   ```

6. **Profiles preserved**: Your existing schedule data in `/config/cronostar/profiles/` is unchanged and will work with the new system.

#### From Fresh Install

Simply:
1. Add integration via UI
2. Add CronoStar cards to dashboards
3. Configure schedules in card UI
4. Create automations for automatic application

### Compatibility

- **Home Assistant**: 2024.11.0 or newer
- **Python**: 3.12 or newer
- **Frontend Card**: Version 5.3.x required (updated separately)
- **Profile Format**: Backward compatible (no changes needed)

### Notes for Frontend Development

This backend release is designed to work with a companion frontend card update. The card needs to:

1. **Manage its own state**:
   - Current profile selection
   - Pause state
   - Schedule editor UI state

2. **Call backend services**:
   - `load_profile` on initialization
   - `save_profile` when user saves changes
   - Optional: internal timers to call `apply_now`

3. **Configuration via card config**:
   ```yaml
   type: custom:cronostar-card
   name: string
   preset: string
   target_entity: string
   global_prefix: string
   # Optional helper entities:
   profiles_select_entity: input_select.X
   pause_entity: input_boolean.X
   ```

See ARCHITECTURE.md for detailed card-backend communication patterns.

---

## [5.2.0] - 2025-12-30

### Added
- Initial modular architecture split
- Storage manager with caching
- Deep checks module for diagnostics

### Changed
- Split monolithic service into modules
- Improved prefix normalization

## [5.1.0] - 2025-12-25

### Added
- Profile service for CRUD operations
- JSON container format for profiles
- Backup system for profile files

## [5.0.0] - 2025-12-20

### Initial Release
- Time-based scheduling system
- Visual frontend card
- Multiple preset types
- Profile management
- YAML configuration

---

## Support

- **Issues**: https://github.com/FoliniC/CronoStar/issues
- **Documentation**: https://github.com/FoliniC/CronoStar
- **Community**: Home Assistant Community Forum

## FAQ

### Q: Where did my entities go?
A: In 5.3.0, there are no backend entities. Controllers exist only in Lovelace cards. Use automations to apply schedules.

### Q: How do I pause a schedule?
A: The card UI should provide a pause button. Alternatively, disable the automation that calls `apply_now`.

### Q: Can I still use automations?
A: Yes! Services work the same. Use `cronostar.apply_now` to apply schedules from automations.

### Q: Will my profiles be deleted?
A: No. Profile data is preserved in `/config/cronostar/profiles/` and is compatible with the new architecture.

### Q: Do I need to recreate all my schedules?
A: No. Existing schedules will load automatically in the new cards.

### Q: Can I use the old version?
A: Yes, 5.2.x remains available for those who prefer the coordinator model. However, it won't receive updates.

