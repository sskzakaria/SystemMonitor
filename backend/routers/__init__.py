"""
Router modules for the University Monitoring System
All API routers are exported from this package
"""

from . import (
    machines,
    events,
    ingestion_optimized,
    websocket,
    analytics,
    analytics_extended,
    stats,
    tags,
    sessions,
    notes,
    monitoring,
    maintenance,
    health,
    groups,
    timeline,
    alerts,
    admin,
    usb,
    config,
    export
)

__all__ = [
    "machines",
    "events",
    "ingestion_optimized",
    "websocket",
    "analytics",
    "analytics_extended",
    "stats",
    "tags",
    "sessions",
    "notes",
    "monitoring",
    "maintenance",
    "health",
    "groups",
    "timeline",
    "alerts",
    "admin",
    "usb",
    "config",
    "export"
]
