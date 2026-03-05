"""
University Computer Monitoring System - Monitors Package

This package contains all monitoring modules for the system.
"""

__version__ = "2.0.0"
__author__ = "University IT Department"

# Import base monitor
from .base_monitor import BaseMonitor

# Import all monitors (with error handling)
try:
    from .heartbeat_monitor import HeartbeatMonitor
except ImportError:
    HeartbeatMonitor = None

try:
    from .hardware_monitor import HardwareMonitor
except ImportError:
    HardwareMonitor = None

try:
    from .user_activity_monitor import UserActivityMonitor
except ImportError:
    UserActivityMonitor = None

try:
    from .network_monitor import NetworkMonitor
except ImportError:
    NetworkMonitor = None

try:
    from .application_monitor import ApplicationMonitor
except ImportError:
    ApplicationMonitor = None

try:
    from .specs_monitor import SpecsMonitor
except ImportError:
    SpecsMonitor = None

try:
    from .services_monitor import ServicesMonitor
except ImportError:
    ServicesMonitor = None

try:
    from .update_monitor import UpdateMonitor
except ImportError:
    UpdateMonitor = None

try:
    from .overview_monitor import OverviewMonitor
except ImportError:
    OverviewMonitor = None

try:
    from .peripherals_monitor import PeripheralsMonitor
except ImportError:
    PeripheralsMonitor = None

try:
    from .usb_devices_monitor import USBDevicesMonitor
except ImportError:
    USBDevicesMonitor = None

try:
    from .security_software_monitor import SecuritySoftwareMonitor
except ImportError:
    SecuritySoftwareMonitor = None

try:
    from .event_log_monitor import EventLogMonitor
except ImportError:
    EventLogMonitor = None

# List all available monitors
__all__ = [
    'BaseMonitor',
    'HeartbeatMonitor',
    'HardwareMonitor',
    'UserActivityMonitor',
    'NetworkMonitor',
    'ApplicationMonitor',
    'SpecsMonitor',
    'ServicesMonitor',
    'UpdateMonitor',
    'OverviewMonitor',
    'PeripheralsMonitor',
    'USBDevicesMonitor',
    'SecuritySoftwareMonitor',
    'EventLogMonitor',
]

# Available monitors list (for runtime checking)
AVAILABLE_MONITORS = {
    'heartbeat': HeartbeatMonitor,
    'hardware': HardwareMonitor,
    'user_activity': UserActivityMonitor,
    'network': NetworkMonitor,
    'application': ApplicationMonitor,
    'specs': SpecsMonitor,
    'services': ServicesMonitor,
    'update': UpdateMonitor,
    'overview': OverviewMonitor,
    'peripherals': PeripheralsMonitor,
    'usb_devices': USBDevicesMonitor,
    'security_software': SecuritySoftwareMonitor,
    'event_log': EventLogMonitor,
}

# Filter out None values (monitors that failed to import)
AVAILABLE_MONITORS = {k: v for k, v in AVAILABLE_MONITORS.items() if v is not None}