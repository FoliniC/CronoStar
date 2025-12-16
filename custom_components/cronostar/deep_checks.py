"""CronoStar Deep Checks - Modular configuration verification."""
import os
import re
import json
import time
import logging
from typing import Any, Dict, List, Tuple, Optional
from dataclasses import dataclass

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.util import yaml as yaml_util

_LOGGER = logging.getLogger(__name__)
DOMAIN = "cronostar"


@dataclass
class InputNumberInfo:
    """Information about input_number configuration."""
    source: str
    include_target: Optional[str]
    full_path: str
    yaml_keys_count: int
    yaml_keys: List[str]
    expected_count: int
    runtime_found_total: int
    runtime_found_prefixed: int
    runtime_missing: List[str]
    used_prefix: str
    hour_base: int


@dataclass
class AutomationInfo:
    """Information about automation configuration."""
    source: str
    include_target: Optional[str]
    full_path: str
    yaml_count: int
    storage_count: int
    runtime_entities: List[str]
    found_by_alias: List[str]


class YamlInspector:
    """Handles YAML configuration inspection."""
    
    def __init__(self, hass: HomeAssistant, base_dir: str):
        """Initialize the inspector."""
        self.hass = hass
        self.base_dir = base_dir
    
    async def find_section_source(
        self,
        cfg_path: str,
        section: str
    ) -> Tuple[str, Optional[str]]:
        """
        Detect if a section uses inline config or include directives.
        
        Returns:
            Tuple of (source_type, include_target)
            source_type: inline, include_file, include_dir_named, include_dir_list, none, unknown
        """
        try:
            text = await self.hass.async_add_executor_job(self._read_file, cfg_path)
        except Exception as e:
            _LOGGER.warning("Failed to read %s: %s", cfg_path, e)
            return "unknown", None
        
        # Pattern matching for different include types
        patterns = {
            "include_file": re.compile(rf"^{section}:\s*!include\s+(.+)$", re.M),
            "include_dir_named": re.compile(rf"^{section}:\s*!include_dir_merge_named\s+(.+)$", re.M),
            "include_dir_list": re.compile(rf"^{section}:\s*!include_dir_merge_list\s+(.+)$", re.M),
        }
        
        # Check for include directives
        for source_type, pattern in patterns.items():
            match = pattern.search(text)
            if match:
                return source_type, match.group(1).strip()
        
        # Check for inline definition
        inline_pattern = re.compile(rf"^{section}:\s*$", re.M)
        if inline_pattern.search(text):
            return "inline", None
        
        return "none", None
    
    @staticmethod
    def _read_file(path: str) -> str:
        """Read file synchronously."""
        with open(path, "r", encoding="utf-8") as f:
            return f.read()


class InputNumberInspector:
    """Handles input_number inspection."""
    
    def __init__(self, hass: HomeAssistant, yaml_inspector: YamlInspector):
        """Initialize the inspector."""
        self.hass = hass
        self.yaml_inspector = yaml_inspector
    
    async def inspect(
        self,
        cfg_path: str,
        base_dir: str,
        prefix: str,
        hour_base: int,
        expected_count: int
    ) -> InputNumberInfo:
        """Inspect input_number configuration."""
        # Find configuration source
        source, include_target = await self.yaml_inspector.find_section_source(
            cfg_path,
            "input_number"
        )
        
        # Build full path
        full_path = self._build_full_path(base_dir, include_target, cfg_path)
        
        # Validate prefix
        prefix_valid = bool(re.match(r"^[a-z0-9_]+_$", prefix))
        used_prefix = prefix if prefix_valid else "cronostar_"
        
        # Get expected entities (only the current value entity is needed now)
        expected_entities = [f"input_number.{used_prefix}current"]
        
        # Check runtime entities
        runtime_states = self.hass.states.async_all()
        found_all = set(
            s.entity_id for s in runtime_states
            if s.entity_id.startswith("input_number.")
        )
        found_prefixed = set(
            s.entity_id for s in runtime_states
            if s.entity_id.startswith(f"input_number.{used_prefix}")
        )
        
        missing = [
            eid.split(".")[-1]
            for eid in expected_entities
            if eid not in found_prefixed
        ]
        
        # Count YAML definitions
        yaml_keys_count, yaml_keys = await self._count_yaml_entities(
            base_dir,
            source,
            include_target,
            cfg_path
        )
        
        return InputNumberInfo(
            source=source,
            include_target=include_target,
            full_path=full_path,
            yaml_keys_count=yaml_keys_count,
            yaml_keys=yaml_keys,
            expected_count=expected_count,
            runtime_found_total=len(found_all),
            runtime_found_prefixed=len(found_prefixed),
            runtime_missing=missing,
            used_prefix=used_prefix,
            hour_base=hour_base
        )
    
    async def _count_yaml_entities(
        self,
        base_dir: str,
        source: str,
        include_target: Optional[str],
        cfg_path: str
    ) -> Tuple[int, List[str]]:
        """Count entities defined in YAML."""
        keys: List[str] = []
        
        try:
            if source == "inline":
                loaded = await self.hass.async_add_executor_job(
                    yaml_util.load_yaml,
                    cfg_path
                )
                section = loaded.get("input_number") or {}
                if isinstance(section, dict):
                    keys = list(section.keys())
            
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                included = await self.hass.async_add_executor_job(
                    yaml_util.load_yaml,
                    file_path
                )
                if isinstance(included, dict):
                    keys = list(included.keys())
            
            elif source == "include_dir_named" and include_target:
                dir_path = os.path.join(base_dir, include_target)
                keys = await self._read_dir_named(dir_path)
            
            elif source == "include_dir_list" and include_target:
                dir_path = os.path.join(base_dir, include_target)
                keys = await self._read_dir_list(dir_path)
        
        except Exception as e:
            _LOGGER.warning("Error reading input_number YAML: %s", e)
        
        return len(keys), keys
    
    async def _read_dir_named(self, dir_path: str) -> List[str]:
        """Read entities from include_dir_merge_named."""
        keys = []
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            
            inc = await self.hass.async_add_executor_job(
                yaml_util.load_yaml,
                os.path.join(dir_path, name)
            )
            
            if isinstance(inc, dict):
                keys.extend(list(inc.keys()))
        
        return keys
    
    async def _read_dir_list(self, dir_path: str) -> List[str]:
        """Read entities from include_dir_merge_list."""
        keys = []
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            
            inc = await self.hass.async_add_executor_job(
                yaml_util.load_yaml,
                os.path.join(dir_path, name)
            )
            
            if isinstance(inc, list):
                for item in inc:
                    if isinstance(item, dict):
                        keys.extend(list(item.keys()))
        
        return keys
    
    @staticmethod
    def _build_full_path(base_dir: str, include_target: Optional[str], cfg_path: str) -> str:
        """Build display path for configuration."""
        if include_target:
            full_path = os.path.join(base_dir, include_target)
        else:
            full_path = cfg_path
        
        return full_path.replace(base_dir, "/config").replace("\\", "/")
    
    @staticmethod
    def _get_hours_list(hour_base: int) -> List[str]:
        """Get list of hour strings."""
        if hour_base == 1:
            return [f"{i:02d}" for i in range(1, 25)]
        return [f"{i:02d}" for i in range(0, 24)]


class AutomationInspector:
    """Handles automation inspection."""
    
    def __init__(self, hass: HomeAssistant, yaml_inspector: YamlInspector):
        """Initialize the inspector."""
        self.hass = hass
        self.yaml_inspector = yaml_inspector
    
    async def inspect(
        self,
        cfg_path: str,
        base_dir: str,
        alias: str
    ) -> AutomationInfo:
        """Inspect automation configuration."""
        # Find configuration source
        source, include_target = await self.yaml_inspector.find_section_source(
            cfg_path,
            "automation"
        )
        
        # Build full path
        full_path = self._build_full_path(base_dir, include_target, cfg_path)
        
        # Check runtime entities
        runtime = self.hass.states.async_all()
        auto_entities = [s for s in runtime if s.entity_id.startswith("automation.")]
        found_by_alias = [
            s.entity_id
            for s in auto_entities
            if (s.attributes.get("friendly_name") or "") == alias
        ]
        
        # Count YAML automations
        yaml_count = await self._count_yaml_automations(
            base_dir,
            source,
            include_target,
            cfg_path
        )
        
        # Count storage automations
        storage_count = await self._count_storage_automations()
        
        return AutomationInfo(
            source=source,
            include_target=include_target,
            full_path=full_path,
            yaml_count=yaml_count,
            storage_count=storage_count,
            runtime_entities=[s.entity_id for s in auto_entities],
            found_by_alias=found_by_alias
        )
    
    async def _count_yaml_automations(
        self,
        base_dir: str,
        source: str,
        include_target: Optional[str],
        cfg_path: str
    ) -> int:
        """Count automations defined in YAML."""
        count = 0
        
        try:
            if source == "inline":
                loaded = await self.hass.async_add_executor_job(
                    yaml_util.load_yaml,
                    cfg_path
                )
                section = loaded.get("automation")
                if isinstance(section, list):
                    count = len(section)
                elif isinstance(section, dict):
                    count = 1
            
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                inc = await self.hass.async_add_executor_job(
                    yaml_util.load_yaml,
                    file_path
                )
                if isinstance(inc, list):
                    count = len(inc)
                else:
                    count = 1 if inc else 0
            
            elif source == "include_dir_list" and include_target:
                dir_path = os.path.join(base_dir, include_target)
                count = await self._count_dir_list(dir_path)
            
            elif source == "include_dir_named" and include_target:
                dir_path = os.path.join(base_dir, include_target)
                count = await self._count_dir_named(dir_path)
        
        except Exception as e:
            _LOGGER.warning("Error reading automation YAML: %s", e)
        
        return count
    
    async def _count_dir_list(self, dir_path: str) -> int:
        """Count automations in include_dir_merge_list."""
        count = 0
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            
            inc = await self.hass.async_add_executor_job(
                yaml_util.load_yaml,
                os.path.join(dir_path, name)
            )
            
            if isinstance(inc, list):
                count += len(inc)
        
        return count
    
    async def _count_dir_named(self, dir_path: str) -> int:
        """Count automations in include_dir_merge_named."""
        count = 0
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            
            inc = await self.hass.async_add_executor_job(
                yaml_util.load_yaml,
                os.path.join(dir_path, name)
            )
            
            if isinstance(inc, dict):
                count += len(inc)
        
        return count
    
    async def _count_storage_automations(self) -> int:
        """Count automations in storage."""
        storage_path = self.hass.config.path(".storage", "automations")
        
        try:
            if not await self.hass.async_add_executor_job(os.path.exists, storage_path):
                return 0
            
            def read_storage():
                with open(storage_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            
            data = await self.hass.async_add_executor_job(read_storage)
            
            if isinstance(data, list):
                return len(data)
            elif isinstance(data, dict):
                items = data.get("items") or []
                return len(items)
        
        except Exception as e:
            _LOGGER.debug("Error reading storage automations: %s", e)
        
        return 0
    
    @staticmethod
    def _build_full_path(base_dir: str, include_target: Optional[str], cfg_path: str) -> str:
        """Build display path for configuration."""
        if include_target:
            full_path = os.path.join(base_dir, include_target)
        else:
            full_path = cfg_path
        
        return full_path.replace(base_dir, "/config").replace("\\", "/")


class ReportGenerator:
    """Generates human-readable reports."""
    
    @staticmethod
    def render_message(
        input_number: InputNumberInfo,
        automation: AutomationInfo,
        alias: str,
        version: str
    ) -> str:
        """Create a human-readable message for the persistent notification."""
        parts = []
        
        parts.append(f"--- CronoStar Setup Check (v{version}) ---")
        
        # Input Number Status
        parts.append("\n[Input Number Helpers]")
        input_numbers_missing = (
            input_number.runtime_found_prefixed < input_number.expected_count
        )
        
        if input_numbers_missing:
            parts.append("STATUS: ❌ MISSING")
            parts.append(
                f"Details: Found {input_number.runtime_found_prefixed}/"
                f"{input_number.expected_count} helpers with prefix "
                f"'{input_number.used_prefix}'."
            )
        else:
            parts.append("STATUS: ✅ OK")
            parts.append(
                f"Details: Found {input_number.runtime_found_prefixed}/"
                f"{input_number.expected_count} helpers with prefix "
                f"'{input_number.used_prefix}'."
            )
        
        parts.append(
            f"Configuration source: {input_number.source} @ "
            f"{input_number.full_path}"
        )
        
        # Automation Status
        parts.append("\n[Automation]")
        automation_missing = not automation.found_by_alias
        
        if automation_missing:
            parts.append("STATUS: ❌ MISSING")
            parts.append(f"Details: No automation found with alias '{alias}'.")
        else:
            parts.append("STATUS: ✅ OK")
            parts.append(f"Details: Found automation with alias '{alias}'.")
        
        parts.append(
            f"Configuration source: {automation.source} @ {automation.full_path}"
        )
        
        # Actionable Steps
        actionable_steps = ReportGenerator._generate_actionable_steps(
            input_number,
            automation,
            input_numbers_missing,
            automation_missing
        )
        
        if actionable_steps:
            parts.append("\n\n--- What To Do Next ---")
            parts.extend(actionable_steps)
        
        return "\n".join(parts)
    
    @staticmethod
    def _generate_actionable_steps(
        input_number: InputNumberInfo,
        automation: AutomationInfo,
        input_numbers_missing: bool,
        automation_missing: bool
    ) -> List[str]:
        """Generate actionable steps for fixing issues."""
        steps = []
        
        if input_numbers_missing:
            filename = f"{input_number.used_prefix.rstrip('_')}_helpers.yaml"
            steps.append("\n**ACTION 1: Create Input Number Helpers**")
            steps.append(
                f"  1. Create a new file named `{filename}` inside the directory: "
                f"`{input_number.full_path}`"
            )
            steps.append(
                "  2. In the CronoStar card editor (Step 2), click "
                "`Copy helpers YAML` (📋)."
            )
            steps.append("  3. Paste the copied content into the new file.")
            steps.append("  4. Save the file and restart Home Assistant.")
        
        if automation_missing:
            filename = f"{input_number.used_prefix.rstrip('_')}_automation.yaml"
            steps.append("\n**ACTION 2: Create Automation**")
            steps.append(
                f"  1. Create a new file named `{filename}` inside the directory: "
                f"`{automation.full_path}`"
            )
            steps.append(
                "  2. In the CronoStar card editor (Step 4), click "
                "`Copy YAML` (📋)."
            )
            steps.append("  3. Paste the copied content into the new file.")
            steps.append("  4. Restart Home Assistant.")
        
        return steps


def register_check_setup_service(hass: HomeAssistant) -> None:
    """Register the cronostar.check_setup service."""
    
    async def async_check_setup(call: ServiceCall) -> None:
        """Check configuration for input_number helpers and automations."""
        # Extract parameters
        prefix = (call.data.get("prefix") or "").strip()
        hour_base = int(call.data.get("hour_base") or 0)
        alias = (call.data.get("alias") or "").strip()
        expected_count = int(call.data.get("expected_count") or 24)
        
        # Setup paths
        cfg_path = hass.config.path("configuration.yaml")
        base_dir = os.path.dirname(cfg_path)
        
        # Create inspectors
        yaml_inspector = YamlInspector(hass, base_dir)
        input_number_inspector = InputNumberInspector(hass, yaml_inspector)
        automation_inspector = AutomationInspector(hass, yaml_inspector)
        
        # Run inspections
        input_number_info = await input_number_inspector.inspect(
            cfg_path,
            base_dir,
            prefix,
            hour_base,
            expected_count
        )
        
        automation_info = await automation_inspector.inspect(
            cfg_path,
            base_dir,
            alias
        )
        
        # Build report
        component_version = hass.data.get(DOMAIN, {}).get("version", "unknown")
        
        message = ReportGenerator.render_message(
            input_number_info,
            automation_info,
            alias,
            component_version
        )
        
        # Create notification
        notification_id = f"cronostar_setup_{int(time.time())}"
        await hass.services.async_call(
            "persistent_notification",
            "create",
            {
                "title": "CronoStar Setup Check",
                "message": message,
                "notification_id": notification_id,
            },
            blocking=True,
        )
        
        # Fire event for the card
        report = {
            "input_number": input_number_info.__dict__,
            "automation": automation_info.__dict__,
            "formatted_message": message,
        }
        
        hass.bus.async_fire("cronostar_setup_report", report)
        _LOGGER.info("CronoStar setup report fired")
    
    try:
        hass.services.async_register(DOMAIN, "check_setup", async_check_setup)
        _LOGGER.info("Registered service %s.check_setup", DOMAIN)
    except Exception as err:
        _LOGGER.warning("Failed to register %s.check_setup: %s", DOMAIN, err)
