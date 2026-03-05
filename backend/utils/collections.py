"""
Centralized collection name definitions
Prevents typos and inconsistencies
"""

# Latest collections (current state)
HEARTBEAT_LATEST = "heartbeat_monitor_latest"
HARDWARE_LATEST = "hardware_monitor_latest"
NETWORK_LATEST = "network_monitor_latest"
USER_ACTIVITY_LATEST = "user_activity_monitor_latest"
APPLICATION_LATEST = "application_monitor_latest"
SERVICES_LATEST = "services_monitor_latest"
SPECS_LATEST = "specs_monitor_latest"
UPDATE_LATEST = "update_monitor_latest"
OVERVIEW_LATEST = "overview_monitor_latest"
SECURITY_LATEST = "security_software_monitor_latest"
PERIPHERALS_LATEST = "peripherals_monitor_latest"

# History collections (time-series)
HEARTBEAT_HISTORY = "heartbeat_monitor_history"
HARDWARE_HISTORY = "hardware_monitor_history"
NETWORK_HISTORY = "network_monitor_history"
USER_ACTIVITY_HISTORY = "user_activity_monitor_history"
APPLICATION_HISTORY = "application_monitor_history"
SERVICES_HISTORY = "services_monitor_history"
UPDATE_HISTORY = "update_monitor_history"

# Aggregated collections
HARDWARE_1MIN = "hardware_1min"
HARDWARE_5MIN = "hardware_5min"
HARDWARE_1HOUR = "hardware_1hour"

# Management collections
ALERTS = "alerts"
ALERT_HISTORY = "alert_history"
MACHINE_ACTIONS = "machine_actions"
MACHINE_NOTES = "machine_notes"
MAINTENANCE_SCHEDULES = "maintenance_schedules"
TAG_DEFINITIONS = "tag_definitions"
MACHINE_GROUPS = "machine_groups"
TIMELINE_EVENTS = "timeline_events"
USER_SESSIONS = "user_sessions"
SESSIONS_LATEST = "user_sessions"  # Alias for compatibility
ADMIN_AUDIT_LOG = "admin_audit_log"
SYSTEM_CONFIG = "system_config"

# Map monitor types to collection names
MONITOR_TYPE_TO_COLLECTION = {
    'heartbeat': HEARTBEAT_LATEST,
    'hardware': HARDWARE_LATEST,
    'network': NETWORK_LATEST,
    'user_activity': USER_ACTIVITY_LATEST,
    'application': APPLICATION_LATEST,
    'services': SERVICES_LATEST,
    'specs': SPECS_LATEST,
    'update': UPDATE_LATEST,
    'overview': OVERVIEW_LATEST,
    'security': SECURITY_LATEST,
    'security_software': SECURITY_LATEST,
    'peripherals': PERIPHERALS_LATEST,
}

# Alias for compatibility
MONITOR_TYPE_TO_LATEST = MONITOR_TYPE_TO_COLLECTION

MONITOR_TYPE_TO_HISTORY = {
    'heartbeat': HEARTBEAT_HISTORY,
    'hardware': HARDWARE_HISTORY,
    'network': NETWORK_HISTORY,
    'user_activity': USER_ACTIVITY_HISTORY,
    'application': APPLICATION_HISTORY,
    'services': SERVICES_HISTORY,
    'update': UPDATE_HISTORY,
}

# All collection names for iteration/verification
ALL_COLLECTIONS = [
    # Latest
    HEARTBEAT_LATEST, HARDWARE_LATEST, NETWORK_LATEST, SPECS_LATEST,
    USER_ACTIVITY_LATEST, APPLICATION_LATEST, SERVICES_LATEST,
    UPDATE_LATEST, OVERVIEW_LATEST, SECURITY_LATEST, PERIPHERALS_LATEST,
    # History
    HEARTBEAT_HISTORY, HARDWARE_HISTORY, NETWORK_HISTORY,
    USER_ACTIVITY_HISTORY, APPLICATION_HISTORY, SERVICES_HISTORY, UPDATE_HISTORY,
    # Aggregated
    HARDWARE_1MIN, HARDWARE_5MIN, HARDWARE_1HOUR,
    # Management
    ALERTS, ALERT_HISTORY, MACHINE_ACTIONS, MACHINE_NOTES, MACHINE_GROUPS,
    TAG_DEFINITIONS, MAINTENANCE_SCHEDULES, TIMELINE_EVENTS, USER_SESSIONS,
    ADMIN_AUDIT_LOG, SYSTEM_CONFIG
]