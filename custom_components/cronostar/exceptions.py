"""Exceptions for CronoStar."""

from homeassistant.exceptions import HomeAssistantError


class CronoStarError(HomeAssistantError):
    """Base error for CronoStar."""


class ProfileNotFoundError(CronoStarError):
    """Error when a profile is not found."""
    translation_key = "profile_not_found"
    translation_domain = "cronostar"


class ScheduleApplicationError(CronoStarError):
    """Error when applying a schedule fails."""
    translation_key = "schedule_application_error"
    translation_domain = "cronostar"
