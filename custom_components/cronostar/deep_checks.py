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
    source: str
    include_target: Optional[str]
    full_path: str
    yaml_keys_count: int
    yaml_keys: List[str]
    runtime_found_total: int
    runtime_found_prefixed: int
    runtime_missing: List[str]
    used_prefix: str
    hour_base: int

@dataclass
class AutomationInfo:
    source: str
    include_target: Optional[str]
    full_path: str
    yaml_count: int
    storage_count: int
    runtime_entities: List[str]
    found_by_alias: List[str]

@dataclass
class CardInitInfo:
    prefix_valid: bool
    profiles_file_exists: bool
    package_file_exists: bool
    automation_file_exists: bool
    profiles_path: str
    package_path: str
    automation_path: str

@dataclass
class PackageContentInfo:
    ok: bool
    path: str
    input_number_key: str
    missing_keys: List[str]
    present_keys: List[str]

@dataclass
class AutomationContentInfo:
    ok_alias: bool
    ok_apply_value: bool
    ok_schedule_next: bool
    alias: str
    path: str
    details: str

@dataclass
class ProfileJsonInfo:
    ok: bool
    path: str
    has_schedule: bool
    schedule_count: int
    invalid_items: int
    required_keys_present: List[str]

class YamlInspector:
    def __init__(self, hass: HomeAssistant, base_dir: str):
        self.hass = hass
        self.base_dir = base_dir

    async def find_section_source(self, cfg_path: str, section: str) -> Tuple[str, Optional[str]]:
        try:
            text = await self.hass.async_add_executor_job(self._read_file, cfg_path)
        except Exception as e:
            _LOGGER.warning("Failed to read %s: %s", cfg_path, e)
            return "unknown", None
        patterns = {
            "include_file": re.compile(rf"^{section}:\s*!include\s+(.+)$", re.M),
            "include_dir_named": re.compile(rf"^{section}:\s*!include_dir_merge_named\s+(.+)$", re.M),
            "include_dir_list": re.compile(rf"^{section}:\s*!include_dir_merge_list\s+(.+)$", re.M),
        }
        for source_type, pattern in patterns.items():
            match = pattern.search(text)
            if match:
                return source_type, match.group(1).strip()
        inline_pattern = re.compile(rf"^{section}:\s*$", re.M)
        if inline_pattern.search(text):
            return "inline", None
        return "none", None

    @staticmethod
    def _read_file(path: str) -> str:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    async def find_packages_dir(self, cfg_path: str) -> Optional[str]:
        """Detect the packages include directory from configuration.yaml.
        Supports both !include_dir_named and !include_dir_merge_named.
        """
        try:
            text = await self.hass.async_add_executor_job(self._read_file, cfg_path)
        except Exception as e:
            _LOGGER.warning("Failed to read %s: %s", cfg_path, e)
            return None
        # Look for 'packages:' include lines
        patterns = [
            re.compile(r"^\s*packages:\s*!include_dir_named\s+(.+)$", re.M),
            re.compile(r"^\s*packages:\s*!include_dir_merge_named\s+(.+)$", re.M),
        ]
        for pat in patterns:
            m = pat.search(text)
            if m:
                target = m.group(1).strip()
                _LOGGER.info("[DeepCheck] Detected packages include dir: %s", target)
                return target
        return None

class InputNumberInspector:
    def __init__(self, hass: HomeAssistant, yaml_inspector: YamlInspector):
        self.hass = hass
        self.yaml_inspector = yaml_inspector

    async def inspect(self, cfg_path: str, base_dir: str, prefix: str, hour_base: int) -> InputNumberInfo:
        source, include_target = await self.yaml_inspector.find_section_source(cfg_path, "input_number")
        full_path = self._build_full_path(base_dir, include_target, cfg_path)
        # Normalize prefix to always end with underscore
        raw_prefix = (prefix or "cronostar_").strip().lower()
        used_prefix = raw_prefix if raw_prefix.endswith("_") else f"{raw_prefix}_"
        expected_entities = [f"input_number.{used_prefix}current"]

        runtime_states = self.hass.states.async_all()
        found_all = set(s.entity_id for s in runtime_states if s.entity_id.startswith("input_number."))
        found_prefixed = set(s.entity_id for s in runtime_states if s.entity_id.startswith(f"input_number.{used_prefix}"))
        missing = [eid.split(".")[-1] for eid in expected_entities if eid not in found_prefixed]

        yaml_keys_count, yaml_keys = await self._count_yaml_entities(base_dir, source, include_target, cfg_path)

        return InputNumberInfo(
            source=source,
            include_target=include_target,
            full_path=full_path,
            yaml_keys_count=yaml_keys_count,
            yaml_keys=yaml_keys,
            runtime_found_total=len(found_all),
            runtime_found_prefixed=len(found_prefixed),
            runtime_missing=missing,
            used_prefix=used_prefix,
            hour_base=hour_base
        )

    async def validate_package_content(self, base_dir: str, source: str, include_target: Optional[str], cfg_path: str, used_prefix: str) -> PackageContentInfo:
        """Ensure the package contains the expected input_number helper and basic attributes."""
        input_key = f"{used_prefix}current"
        missing = []
        present = []
        path = self._build_full_path(base_dir, include_target, cfg_path)
        try:
            # Load the YAML content depending on source
            if source == "inline":
                loaded = await self.hass.async_add_executor_job(yaml_util.load_yaml, cfg_path)
                section = loaded.get("input_number") or {}
                content = section if isinstance(section, dict) else {}
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                content = await self.hass.async_add_executor_job(yaml_util.load_yaml, file_path)
            elif source == "include_dir_named" and include_target:
                # Merge dicts across named files
                dir_path = os.path.join(base_dir, include_target)
                merged: Dict[str, Any] = {}
                for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
                    if not name.lower().endswith((".yaml", ".yml")):
                        continue
                    inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
                    if isinstance(inc, dict):
                        merged.update(inc)
                content = merged
            elif source == "include_dir_list" and include_target:
                # Build a dict from list items
                dir_path = os.path.join(base_dir, include_target)
                merged: Dict[str, Any] = {}
                for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
                    if not name.lower().endswith((".yaml", ".yml")):
                        continue
                    inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
                    if isinstance(inc, list):
                        for item in inc:
                            if isinstance(item, dict):
                                merged.update(item)
                content = merged
            else:
                content = {}
        except Exception as e:
            _LOGGER.warning("Error loading package YAML for validation: %s", e)
            content = {}

        helper = content.get(input_key)
        if not isinstance(helper, dict):
            missing.append(input_key)
            return PackageContentInfo(ok=False, path=path, input_number_key=input_key, missing_keys=missing, present_keys=present)

        # Basic attribute presence check
        for key in ("min", "max", "step"):
            if key in helper:
                present.append(key)
            else:
                missing.append(key)

        return PackageContentInfo(ok=len(missing) == 0, path=path, input_number_key=input_key, missing_keys=missing, present_keys=present)

    async def _count_yaml_entities(self, base_dir: str, source: str, include_target: Optional[str], cfg_path: str) -> Tuple[int, List[str]]:
        keys: List[str] = []
        try:
            if source == "inline":
                loaded = await self.hass.async_add_executor_job(yaml_util.load_yaml, cfg_path)
                section = loaded.get("input_number") or {}
                if isinstance(section, dict):
                    keys = list(section.keys())
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                included = await self.hass.async_add_executor_job(yaml_util.load_yaml, file_path)
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
        keys = []
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
            if isinstance(inc, dict):
                keys.extend(list(inc.keys()))
        return keys

    async def _read_dir_list(self, dir_path: str) -> List[str]:
        keys = []
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
            if isinstance(inc, list):
                for item in inc:
                    if isinstance(item, dict):
                        keys.extend(list(item.keys()))
        return keys

    @staticmethod
    def _build_full_path(base_dir: str, include_target: Optional[str], cfg_path: str) -> str:
        if include_target:
            full_path = os.path.join(base_dir, include_target)
        else:
            full_path = cfg_path
        return full_path.replace(base_dir, "/config").replace("\\", "/")

class AutomationInspector:
    def __init__(self, hass: HomeAssistant, yaml_inspector: YamlInspector):
        self.hass = hass
        self.yaml_inspector = yaml_inspector

    async def inspect(self, cfg_path: str, base_dir: str, alias: str) -> AutomationInfo:
        source, include_target = await self.yaml_inspector.find_section_source(cfg_path, "automation")
        full_path = self._build_full_path(base_dir, include_target, cfg_path)

        runtime = self.hass.states.async_all()
        auto_entities = [s for s in runtime if s.entity_id.startswith("automation.")]
        found_by_alias = [s.entity_id for s in auto_entities if (s.attributes.get("friendly_name") or "") == alias]

        yaml_count = await self._count_yaml_automations(base_dir, source, include_target, cfg_path)
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

    async def validate_automation_content(self, base_dir: str, source: str, include_target: Optional[str], cfg_path: str, alias: str, used_prefix: str) -> AutomationContentInfo:
        """Validate that the automation applies the value and schedules the next run."""
        path = self._build_full_path(base_dir, include_target, cfg_path)
        ok_alias = False
        ok_apply = False
        ok_sched = False
        details = ""
        try:
            # Load automations list from YAML depending on source
            def load_list_from_obj(obj: Any) -> List[Dict[str, Any]]:
                if isinstance(obj, list):
                    return obj
                if isinstance(obj, dict):
                    # Single automation dict (inline) -> wrap
                    return [obj]
                return []

            if source == "inline":
                loaded = await self.hass.async_add_executor_job(yaml_util.load_yaml, cfg_path)
                section = loaded.get("automation")
                autos = load_list_from_obj(section)
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, file_path)
                autos = load_list_from_obj(inc)
            elif source in ("include_dir_list", "include_dir_named") and include_target:
                dir_path = os.path.join(base_dir, include_target)
                autos = []
                for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
                    if not name.lower().endswith((".yaml", ".yml")):
                        continue
                    inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
                    autos.extend(load_list_from_obj(inc))
            else:
                autos = []

            # Find by alias
            target = None
            for a in autos:
                a_alias = (a.get("alias") or a.get("id") or "").strip()
                if a_alias == alias:
                    target = a
                    ok_alias = True
                    break

            if not target:
                return AutomationContentInfo(ok_alias=ok_alias, ok_apply_value=False, ok_schedule_next=False, alias=alias, path=path, details="Alias not found in YAML")

            # Validate apply value: look for an action calling a service and referencing input_number.<prefix>current
            actions = target.get("action") or []
            if isinstance(actions, dict):
                actions = [actions]
            for act in actions:
                if not isinstance(act, dict):
                    continue
                svc = act.get("service") or act.get("action")
                data = act.get("data") or act.get("data_template") or {}
                # Look for Jinja template or entity_id referencing the helper
                helper_id = f"input_number.{used_prefix}current"
                serialized = json.dumps(data, ensure_ascii=False) if data else ""
                if isinstance(svc, str) and helper_id in serialized:
                    ok_apply = True
                    break

            # Validate scheduling: either time/time_pattern trigger or explicit delay/wait and re-schedule logic
            triggers = target.get("trigger") or []
            if isinstance(triggers, dict):
                triggers = [triggers]
            for tr in triggers:
                if not isinstance(tr, dict):
                    continue
                platform = (tr.get("platform") or "").strip()
                if platform in ("time", "time_pattern"):
                    ok_sched = True
                    break
            if not ok_sched:
                # Heuristic: actions include delay/wait_template implying manual scheduling
                for act in actions:
                    if not isinstance(act, dict):
                        continue
                    if act.get("delay") or act.get("wait_template"):
                        ok_sched = True
                        break

            return AutomationContentInfo(ok_alias=ok_alias, ok_apply_value=ok_apply, ok_schedule_next=ok_sched, alias=alias, path=path, details="")
        except Exception as e:
            details = f"Error validating automation content: {e}"
            _LOGGER.warning(details)
            return AutomationContentInfo(ok_alias=ok_alias, ok_apply_value=False, ok_schedule_next=False, alias=alias, path=path, details=details)

    async def _count_yaml_automations(self, base_dir: str, source: str, include_target: Optional[str], cfg_path: str) -> int:
        count = 0
        try:
            if source == "inline":
                loaded = await self.hass.async_add_executor_job(yaml_util.load_yaml, cfg_path)
                section = loaded.get("automation")
                if isinstance(section, list):
                    count = len(section)
                elif isinstance(section, dict):
                    count = 1
            elif source == "include_file" and include_target:
                file_path = os.path.join(base_dir, include_target)
                inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, file_path)
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
        count = 0
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
            if isinstance(inc, list):
                count += len(inc)
        return count

    async def _count_dir_named(self, dir_path: str) -> int:
        count = 0
        for name in sorted(await self.hass.async_add_executor_job(os.listdir, dir_path)):
            if not name.lower().endswith((".yaml", ".yml")):
                continue
            inc = await self.hass.async_add_executor_job(yaml_util.load_yaml, os.path.join(dir_path, name))
            if isinstance(inc, dict):
                count += len(inc)
        return count

    async def _count_storage_automations(self) -> int:
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
        if include_target:
            full_path = os.path.join(base_dir, include_target)
        else:
            full_path = cfg_path
        return full_path.replace(base_dir, "/config").replace("\\", "/")

class ReportGenerator:
    @staticmethod
    def render_message(input_number: InputNumberInfo, automation: AutomationInfo, alias: str, version: str,
                       package_content: Optional[PackageContentInfo] = None,
                       automation_content: Optional[AutomationContentInfo] = None,
                       profile_json: Optional[ProfileJsonInfo] = None) -> str:
        parts = []
        parts.append(f"--- CronoStar Setup Check (v{version}) ---")

        parts.append("\n[Input Number Helper]")
        helper_id = f"input_number.{input_number.used_prefix}current"
        missing_helper = helper_id.split(".")[-1] in input_number.runtime_missing
        if missing_helper:
            parts.append("STATUS: ❌ MISSING")
            parts.append(f"Details: Helper '{helper_id}' not found in runtime states.")
        else:
            parts.append("STATUS: ✅ OK")
            parts.append(f"Details: Helper '{helper_id}' is present.")
        parts.append(f"Configuration source: {input_number.source} @ {input_number.full_path}")

        if package_content:
            parts.append("\n[Package YAML Content]")
            parts.append(f"File: {package_content.path}")
            parts.append(f"Expected helper: input_number.{package_content.input_number_key}")
            if package_content.ok:
                parts.append("STATUS: ✅ OK")
            else:
                parts.append("STATUS: ❌ INVALID")
            if package_content.present_keys:
                parts.append(f"Present keys: {', '.join(package_content.present_keys)}")
            if package_content.missing_keys:
                parts.append(f"Missing keys: {', '.join(package_content.missing_keys)}")

        parts.append("\n[Automation]")
        automation_missing = not automation.found_by_alias
        if automation_missing:
            parts.append("STATUS: ❌ MISSING")
            parts.append(f"Details: No automation found with alias '{alias}'.")
        else:
            parts.append("STATUS: ✅ OK")
            parts.append(f"Details: Found automation with alias '{alias}'.")
        parts.append(f"Configuration source: {automation.source} @ {automation.full_path}")

        if automation_content:
            parts.append("\n[Automation Content]")
            parts.append(f"File: {automation_content.path}")
            parts.append(f"Alias matched: {'✅' if automation_content.ok_alias else '❌'}")
            parts.append(f"Apply value action present: {'✅' if automation_content.ok_apply_value else '❌'}")
            parts.append(f"Scheduling present: {'✅' if automation_content.ok_schedule_next else '❌'}")
            if automation_content.details:
                parts.append(f"Details: {automation_content.details}")

        parts.append("\n[Card Initialization]")
        parts.append("Run the wizard Step 5 and use 'Save All' to initialize JSON + YAML.")

        if profile_json:
            parts.append("\n[Profiles JSON Content]")
            parts.append(f"File: {profile_json.path}")
            parts.append(f"Schedule present: {'✅' if profile_json.has_schedule else '❌'}")
            parts.append(f"Schedule count: {profile_json.schedule_count}")
            parts.append(f"Invalid items: {profile_json.invalid_items}")
            if profile_json.required_keys_present:
                parts.append(f"Required keys present: {', '.join(profile_json.required_keys_present)}")

        return "\n".join(parts)

def register_check_setup_service(hass: HomeAssistant) -> None:
    async def async_check_setup(call: ServiceCall) -> None:
        prefix = (call.data.get("prefix") or "").strip()
        hour_base = int(call.data.get("hour_base") or 0)
        alias = (call.data.get("alias") or "").strip()
        # expected_count deprecated in sparse mode; no longer used

        cfg_path = hass.config.path("configuration.yaml")
        base_dir = os.path.dirname(cfg_path)

        yaml_inspector = YamlInspector(hass, base_dir)
        input_number_inspector = InputNumberInspector(hass, yaml_inspector)
        automation_inspector = AutomationInspector(hass, yaml_inspector)

        input_number_info = await input_number_inspector.inspect(cfg_path, base_dir, prefix, hour_base)
        automation_info = await automation_inspector.inspect(cfg_path, base_dir, alias)

        # Card Init verification
        used_prefix = input_number_info.used_prefix
        prefix_base = used_prefix.rstrip("_")

        # Helper to infer prefix from existing package filename
        def _infer_prefix_from_packages(dir_path: str) -> Optional[str]:
            try:
                if not os.path.isdir(dir_path):
                    return None
                candidates = [fn for fn in os.listdir(dir_path) if fn.endswith("_package.yaml")]
                if not candidates:
                    return None
                # Prefer exact prefix match, else take first
                for fn in candidates:
                    if fn.startswith(f"{prefix_base}_") or fn.startswith(f"{used_prefix}package"):
                        base = fn[:-len("_package.yaml")]
                        return f"{base}_"
                base = candidates[0][:-len("_package.yaml")]
                return f"{base}_"
            except Exception as _e:
                return None

        profiles_path = hass.config.path("cronostar", "profiles", f"{prefix_base}_data.json")

        # Prefer explicit packages include dir from configuration.yaml
        packages_target = await yaml_inspector.find_packages_dir(cfg_path)
        if packages_target:
            packages_dir = hass.config.path(packages_target)
        else:
            # Fallback to input_number include target or default 'packages'
            if input_number_info.source in ("include_dir_named", "include_dir_list") and input_number_info.include_target:
                packages_dir = hass.config.path(input_number_info.include_target)
            else:
                packages_dir = hass.config.path("packages")

        package_path = os.path.join(packages_dir, f"{used_prefix}package.yaml")

        # Fallback: if package not found, try inferring prefix from existing *_package.yaml in packages dir
        if not os.path.exists(package_path):
            inferred_prefix = _infer_prefix_from_packages(packages_dir)
            if inferred_prefix and inferred_prefix != used_prefix:
                _LOGGER.info("[DeepCheck] Inferred prefix from packages dir '%s' -> '%s'", packages_dir, inferred_prefix)
                used_prefix = inferred_prefix
                prefix_base = used_prefix.rstrip("_")
                profiles_path = hass.config.path("cronostar", "profiles", f"{prefix_base}_data.json")
                package_path = os.path.join(packages_dir, f"{used_prefix}package.yaml")

        # Automation: prefer automations include-dir if configured; else use full_path
        if automation_info.source in ("include_dir_list", "include_dir_named") and automation_info.include_target:
            automation_path = os.path.join(hass.config.path(automation_info.include_target), f"{prefix_base}_automation.yaml")
        else:
            automation_path = automation_info.full_path  # inline/include_file not a single filename

        # Log normalized '/config' paths and existence
        profiles_path_log = profiles_path.replace(base_dir, "/config").replace("\\", "/")
        package_path_log = package_path.replace(base_dir, "/config").replace("\\", "/")
        automation_path_log = automation_path.replace(base_dir, "/config").replace("\\", "/")
        _LOGGER.info("[DeepCheck] Paths: profiles=%s exists=%s", profiles_path_log, os.path.exists(profiles_path))
        _LOGGER.info("[DeepCheck] Paths: package=%s exists=%s", package_path_log, os.path.exists(package_path))
        _LOGGER.info("[DeepCheck] Paths: automation=%s exists=%s", automation_path_log, os.path.exists(automation_path))

        card_init = CardInitInfo(
            prefix_valid=bool(re.match(r"^[a-z0-9_]+_$", used_prefix)),
            profiles_file_exists=os.path.exists(profiles_path),
            package_file_exists=os.path.exists(package_path),
            automation_file_exists=os.path.exists(automation_path),
            profiles_path=profiles_path,
            package_path=package_path,
            automation_path=automation_path
        )

        # Validate contents
        package_content = await input_number_inspector.validate_package_content(base_dir, input_number_info.source, input_number_info.include_target, cfg_path, used_prefix)
        automation_content = await automation_inspector.validate_automation_content(base_dir, automation_info.source, automation_info.include_target, cfg_path, alias, used_prefix)

        # Profiles JSON validation
        def _read_json(path: str) -> Any:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        prof_ok = False
        has_schedule = False
        schedule_count = 0
        invalid_items = 0
        req_keys_present: List[str] = []
        try:
            if os.path.exists(profiles_path):
                data = await hass.async_add_executor_job(_read_json, profiles_path)
                prof_ok = isinstance(data, dict)
                # Heuristic required keys
                for key in ("preset_type", "profile_name", "schedule"):
                    if key in data:
                        req_keys_present.append(key)
                schedule = data.get("schedule") if isinstance(data, dict) else None
                if isinstance(schedule, list):
                    has_schedule = True
                    schedule_count = len(schedule)
                    for item in schedule:
                        if not (isinstance(item, dict) and isinstance(item.get("time"), str) and isinstance(item.get("value"), (int, float))):
                            invalid_items += 1
        except Exception as e:
            _LOGGER.warning("Error reading profiles JSON: %s", e)

        profile_json = ProfileJsonInfo(ok=prof_ok, path=profiles_path.replace(base_dir, "/config").replace("\\", "/"), has_schedule=has_schedule, schedule_count=schedule_count, invalid_items=invalid_items, required_keys_present=req_keys_present)

        # Report message
        component_version = hass.data.get(DOMAIN, {}).get("version", "unknown")
        message = ReportGenerator.render_message(input_number_info, automation_info, alias, component_version, package_content=package_content, automation_content=automation_content, profile_json=profile_json)
        message += "\n\n[Card Initialization]"
        message += f"\nPrefix valid: {'✅' if card_init.prefix_valid else '❌'}"
        message += f"\nProfiles JSON: {'✅' if card_init.profiles_file_exists else '❌'} @ {card_init.profiles_path}"
        message += f"\nPackage YAML: {'✅' if card_init.package_file_exists else '❌'} @ {card_init.package_path}"
        message += f"\nAutomation YAML: {'✅' if card_init.automation_file_exists else '❌'} @ {card_init.automation_path}"

        notification_id = f"cronostar_setup_{int(time.time())}"
        await hass.services.async_call(
            "persistent_notification",
            "create",
            {
                "title": "CronoStar Setup Check",
                "message": message,
                "notification_id": notification_id
            },
            blocking=True
        )

        report = {
            "input_number": input_number_info.__dict__,
            "automation": automation_info.__dict__,
            "card_init": card_init.__dict__,
            "package_content": (package_content.__dict__ if package_content else None),
            "automation_content": (automation_content.__dict__ if automation_content else None),
            "profile_json": (profile_json.__dict__ if profile_json else None),
            "formatted_message": message
        }
        hass.bus.async_fire("cronostar_setup_report", report)
        _LOGGER.info("CronoStar setup report fired")

    try:
        hass.services.async_register(DOMAIN, "check_setup", async_check_setup)
        _LOGGER.info("Registered service %s.check_setup", DOMAIN)
    except Exception as err:
        _LOGGER.warning("Failed to register %s.check_setup: %s", DOMAIN, err)
