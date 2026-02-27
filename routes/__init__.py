"""Route registration package."""

from .api_routes import register_api_routes
from .analysis_routes import register_analysis_routes
from .error_handlers import register_error_handlers
from .scouting_routes import register_scouting_routes
from .settings_routes import register_settings_routes

__all__ = [
    "register_api_routes",
    "register_analysis_routes",
    "register_error_handlers",
    "register_scouting_routes",
    "register_settings_routes",
]
