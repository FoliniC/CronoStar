```
"""
SmartScheduler aggiornato per il formato v5.0 con time-based schedule
Supporta sia il formato nuovo (time: "HH:MM") che il vecchio (index: N) per retrocompatibilità
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

class SmartScheduler:
    """Scheduler intelligente per profili con intervalli irregolari."""
    
    def __init__(self, hass: HomeAssistant, profile_service):
        self.hass = hass
        self.profile_service = profile_service
        self._timers: Dict[str, callable] = {}
        self._profiles_cache: Dict[str, Dict] = {}
    
    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        """Converte HH:MM in minuti dal mezanotte.
        
        Args:
            time_str: Stringa in formato "HH:MM"
            
        Returns:
            Minuti dal mezanotte (0-1439)
        """
        try:
            hours, minutes = map(int, time_str.split(':'))
            if not (0 <= hours < 24 and 0 <= minutes < 60):
                _LOGGER.warning("Invalid time value: %s", time_str)
                return 0
            return hours * 60 + minutes
        except (ValueError, AttributeError) as e:
            _LOGGER.error("Failed to parse time string '%s': %s", time_str, e)
            return 0
    
    @staticmethod
    def _index_to_minutes(index: int, interval_minutes: int = 60) -> int:
        """Converte index in minuti (per retrocompatibilità).
        
        Args:
            index: Indice del punto (0-23 per orario)
            interval_minutes: Intervallo tra i punti
            
        Returns:
            Minuti dal mezanotte
        """
        return (index * interval_minutes) % 1440
    
    def _normalize_schedule(self, schedule: List[Dict], interval_minutes: int = 60) -> List[Dict]:
        """Normalizza lo schedule al formato time-based.
        
        Converte automaticamente dal formato vecchio (index) al nuovo (time)
        se necessario.
        
        Args:
            schedule: Schedule in formato vecchio o nuovo
            interval_minutes: Intervallo per conversione da index
            
        Returns:
            Schedule normalizzato con campo "time" e "value"
        """
        normalized = []
        
        for point in schedule:
            if not isinstance(point, dict):
                continue
            
            # Formato nuovo (già con "time")
            if "time" in point and "value" in point:
                normalized.append({
                    "time": point["time"],
                    "value": float(point["value"])
                })
            
            # Formato vecchio (con "index")
            elif "index" in point and "value" in point:
                minutes = self._index_to_minutes(point["index"], interval_minutes)
                hours = minutes // 60
                mins = minutes % 60
                normalized.append({
                    "time": f"{hours:02d}:{mins:02d}",
                    "value": float(point["value"])
                })
        
        # Ordina per tempo
        normalized.sort(key=lambda p: p["time"])
        
        # Log warning se schedule è vuoto
        if not normalized:
            _LOGGER.warning("Schedule vuoto dopo normalizzazione")
        
        return normalized
    
    def _get_value_at_time(
        self,
        schedule: List[Dict],
        target_time: datetime,
        interval_minutes: int = 60
    ) -> Optional[float]:
        """Ottiene il valore interpolato per un tempo specifico.
        
        Args:
            schedule: Lista di punti con "time" e "value"
            target_time: Tempo target per cui calcolare il valore
            interval_minutes: Intervallo (usato per retrocompatibilità)
            
        Returns:
            Valore interpolato o None se schedule vuoto
        """
        if not schedule:
            _LOGGER.debug("Schedule vuoto")
            return None
        
        # Normalizza schedule (converte da index a time se necessario)
        normalized_schedule = self._normalize_schedule(schedule, interval_minutes)
        
        if not normalized_schedule:
            _LOGGER.error("Impossibile normalizzare schedule")
            return None
        
        target_minutes = target_time.hour * 60 + target_time.minute
        
        # Trova i punti prima e dopo
        before = None
        after = None
        
        for point in normalized_schedule:
            point_minutes = self._time_to_minutes(point["time"])
            
            if point_minutes <= target_minutes:
                before = point
            if point_minutes >= target_minutes and not after:
                after = point
        
        # Gestione wrap-around midnight
        if not before:
            before = normalized_schedule[-1]
            _LOGGER.debug("Wrap-around: using last point %s", before["time"])
        if not after:
            after = normalized_schedule[0]
            _LOGGER.debug("Wrap-around: using first point %s", after["time"])
        
        # Match esatto
        before_minutes = self._time_to_minutes(before["time"])
        after_minutes = self._time_to_minutes(after["time"])
        
        if before_minutes == target_minutes:
            _LOGGER.debug("Exact match at %s: %.2f", before["time"], before["value"])
            return float(before["value"])
        
        if after_minutes == target_minutes:
            _LOGGER.debug("Exact match at %s: %.2f", after["time"], after["value"])
            return float(after["value"])
        
        # Gestione wrap-around per calcolo ratio
        if after_minutes < before_minutes:
            after_minutes += 1440  # Aggiungi 24 ore
        
        if target_minutes < before_minutes:
            target_minutes += 1440
        
        # Evita divisione per zero
        if after_minutes == before_minutes:
            _LOGGER.warning("Duplicate times: %s", before["time"])
            return float(before["value"])
        
        # Interpolazione lineare
        ratio = (target_minutes - before_minutes) / (after_minutes - before_minutes)
        interpolated = before["value"] + ratio * (after["value"] - before["value"])
        result = round(interpolated, 2)
        
        _LOGGER.debug(
            "Interpolation: %s (%.2f) -> %s (%.2f) at %s: ratio=%.3f, result=%.2f",
            before["time"], before["value"],
            after["time"], after["value"],
            target_time.strftime("%H:%M"),
            ratio, result
        )
        
        return result
    
    def _find_next_change(
        self,
        schedule: List[Dict],
        now: datetime,
        interval_minutes: int = 60
    ) -> Optional[datetime]:
        """Trova il prossimo cambio di valore nello schedule.
        
        Args:
            schedule: Schedule normalizzato
            now: Tempo corrente
            interval_minutes: Intervallo (per retrocompatibilità)
            
        Returns:
            DateTime del prossimo cambio, o None se non ci sono cambi
        """
        if not schedule:
            return None
        
        # Normalizza schedule
        normalized_schedule = self._normalize_schedule(schedule, interval_minutes)
        
        if not normalized_schedule:
            return None
        
        current_minutes = now.hour * 60 + now.minute
        
        # Cerca prossimo punto dopo ora corrente
        for point in normalized_schedule:
            point_minutes = self._time_to_minutes(point["time"])
            
            if point_minutes > current_minutes:
                hours = point_minutes // 60
                minutes = point_minutes % 60
                
                next_time = now.replace(
                    hour=hours,
                    minute=minutes,
                    second=0,
                    microsecond=0
                )
                
                _LOGGER.debug("Next change today at %s", next_time.strftime("%H:%M"))
                return next_time
        
        # Nessun cambio oggi, usa primo punto domani
        if normalized_schedule:
            first_point = normalized_schedule[0]
            first_minutes = self._time_to_minutes(first_point["time"])
            
            tomorrow = now + timedelta(days=1)
            next_time = tomorrow.replace(
                hour=first_minutes // 60,
                minute=first_minutes % 60,
                second=0,
                microsecond=0
            )
            
            _LOGGER.debug("Next change tomorrow at %s", next_time.strftime("%H:%M"))
            return next_time
        
        return None
    
    async def update_preset(
        self,
        preset_type: str,
        profile_data: Optional[Dict] = None
    ):
        """Aggiorna lo schedule per un preset.
        
        Args:
            preset_type: Tipo di preset
            profile_data: Dati del profilo (se None, carica da storage)
        """
        # Cancella timer esistente
        if preset_type in self._timers:
            try:
                self._timers[preset_type]()
            except Exception as e:
                _LOGGER.debug("Error cancelling old timer: %s", e)
            del self._timers[preset_type]
        
        # Carica o usa profile_data
        if not profile_data:
            profile_data = await self._load_active_profile(preset_type)
        
        if not profile_data:
            _LOGGER.warning("No profile data for %s", preset_type)
            self._schedule_retry(preset_type)
            return
        
        # Cache profile
        self._profiles_cache[preset_type] = profile_data
        
        # Ottieni schedule e intervallo
        schedule = profile_data.get("schedule", [])
        interval_minutes = profile_data.get("interval_minutes", 60)
        
        if not schedule:
            _LOGGER.warning("Empty schedule for %s", preset_type)
            self._schedule_retry(preset_type)
            return
        
        # Calcola valore corrente
        now = dt_util.now()
        current_value = self._get_value_at_time(schedule, now, interval_minutes)
        
        if current_value is None:
            _LOGGER.warning("Cannot calculate value for %s", preset_type)
            self._schedule_retry(preset_type)
            return
        
        # Aggiorna entity
        await self._update_current_value_entity(preset_type, current_value)
        
        # Schedula prossimo aggiornamento
        next_change = self._find_next_change(schedule, now, interval_minutes)
        
        if next_change:
            @callback
            def _update_callback(now):
                self.hass.async_create_task(self.update_preset(preset_type))
            
            self._timers[preset_type] = async_track_point_in_time(
                self.hass,
                _update_callback,
                next_change
            )
            
            _LOGGER.info(
                "Next update for %s at %s",
                preset_type,
                next_change.strftime("%Y-%m-%d %H:%M:%S")
            )
    
    # ... altri metodi rimangono invariati ...

```
