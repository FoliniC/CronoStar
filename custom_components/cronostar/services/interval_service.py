"""Gestione intervalli variabili per CronoStar."""

import logging
from enum import Enum
from typing import Optional

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse

_LOGGER = logging.getLogger(__name__)


class IntervalType(Enum):
    """Intervalli supportati."""

    HOURLY = 60
    HALF_HOUR = 30
    QUARTER = 15
    TEN_MIN = 10
    FIVE_MIN = 5
    MINUTE = 1
    
    @classmethod
    def from_minutes(cls, minutes: int) -> Optional["IntervalType"]:
        for interval in cls:
            if interval.value == minutes:
                return interval
        return None
    
    def get_points_count(self) -> int:
        return (24 * 60) // self.value
    
    def get_time_labels(self) -> list[str]:
        labels = []
        for i in range(0, 24 * 60, self.value):
            h = i // 60
            m = i % 60
            labels.append(f"{h:02d}:{m:02d}")
        return labels


class IntervalConverter:
    """Converte schedule tra intervalli."""
    
    @staticmethod
    def convert_schedule(schedule, target_interval: IntervalType):
        """Converte schedule a nuovo intervallo."""
        from ..storage.schedule_manager import Schedule
        
        if schedule.interval_minutes == target_interval.value:
            return schedule
        
        if schedule.interval_minutes > target_interval.value:
            # Upscale: interpola
            new_points = IntervalConverter._interpolate(schedule.points, schedule.interval_minutes, target_interval.value)
        else:
            # Downscale: seleziona
            new_points = IntervalConverter._select(schedule.points, target_interval.value)
        
        return Schedule(
            profile_name=schedule.profile_name,
            preset_type=schedule.preset_type,
            interval_minutes=target_interval.value,
            points=new_points,
            global_prefix=getattr(schedule, "global_prefix", None),
            saved_at=schedule.saved_at,
        )
    
    @staticmethod
    def _interpolate(points, from_interval: int, to_interval: int):
        """Interpolazione lineare."""
        from ..storage.schedule_manager import SchedulePoint
        
        new_points = []
        sorted_points = sorted(points, key=lambda p: p.to_minutes())
        
        for i in range(0, 24 * 60, to_interval):
            h = i // 60
            m = i % 60
            time_str = f"{h:02d}:{m:02d}"
            
            # Trova punti prima/dopo
            prev_point = None
            next_point = None
            
            for _idx, point in enumerate(sorted_points):
                if point.to_minutes() <= i:
                    prev_point = point
                if point.to_minutes() > i:
                    next_point = point
                    break
            
            if not next_point:
                next_point = sorted_points[0]
            if not prev_point:
                prev_point = sorted_points[-1]
            
            # Interpola
            if prev_point.time == next_point.time:
                value = prev_point.value
            else:
                prev_min = prev_point.to_minutes()
                next_min = next_point.to_minutes()
                
                if next_min < prev_min:
                    next_min += 24 * 60
                
                if next_min == prev_min:
                    ratio = 0
                else:
                    ratio = (i - prev_min) / (next_min - prev_min)
                
                value = prev_point.value + ratio * (next_point.value - prev_point.value)
            
            new_points.append(SchedulePoint(time=time_str, value=round(value, 2)))
        
        return new_points
    
    @staticmethod
    def _select(points, to_interval: int):
        """Seleziona solo punti su intervallo."""
        target_times = set()
        for i in range(0, 24 * 60, to_interval):
            h = i // 60
            m = i % 60
            target_times.add(f"{h:02d}:{m:02d}")
        
        return [p for p in points if p.time in target_times]


class IntervalService:
    """Servizi intervalli."""
    
    def __init__(self, hass: HomeAssistant, storage_manager):
        self.hass = hass
        self.storage_manager = storage_manager
    
    async def convert_schedule_interval(self, call: ServiceCall) -> ServiceResponse:
        """Converte schedule a nuovo intervallo."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix", "cronostar_")
        target_minutes = int(call.data.get("target_interval", 60))
        save_as = call.data.get("save_as")
        
        target_interval = IntervalType.from_minutes(target_minutes)
        if not target_interval:
            return {"success": False, "error": f"Invalid interval: {target_minutes}"}
        
        schedule = await self.storage_manager.load_schedule(profile_name, preset_type, global_prefix)
        
        if not schedule:
            return {"success": False, "error": f"Schedule not found: {profile_name}"}
        
        converted = IntervalConverter.convert_schedule(schedule, target_interval)
        
        if save_as:
            converted.profile_name = save_as
        
        success = await self.storage_manager.save_schedule(converted)
        
        return {
            "success": success,
            "original_interval": schedule.interval_minutes,
            "new_interval": converted.interval_minutes,
            "original_points": len(schedule.points),
            "new_points": len(converted.points),
            "profile_name": converted.profile_name,
        }
    
    async def get_schedule_info(self, call: ServiceCall) -> ServiceResponse:
        """Info su schedule."""
        profile_name = call.data.get("profile_name")
        preset_type = call.data.get("preset_type")
        global_prefix = call.data.get("global_prefix", "cronostar_")
        
        schedule = await self.storage_manager.load_schedule(profile_name, preset_type, global_prefix)
        
        if not schedule:
            return {"success": False, "error": f"Schedule not found: {profile_name}"}
        
        values = [p.value for p in schedule.points]
        
        return {
            "success": True,
            "profile_name": schedule.profile_name,
            "preset_type": schedule.preset_type,
            "interval_minutes": schedule.interval_minutes,
            "points": [{"time": p.time, "value": p.value} for p in schedule.points],
            "points_count": len(schedule.points),
            "min_value": min(values) if values else None,
            "max_value": max(values) if values else None,
            "avg_value": sum(values) / len(values) if values else None,
        }
