"""
Enhanced Configuration with Frontend-Friendly Defaults
Combines best practices from both versions
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime

# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

@dataclass
class MonitorConfig:
    """Base monitoring configuration with frontend-friendly defaults"""
    
    # Database configuration
    MONGODB_URI: str = os.getenv('MONGODB_URI', 'mongodb.net/')
    DB_NAME_SUFFIX: str = os.getenv('DB_NAME_SUFFIX', '_university_monitor')
    CENTRAL_DB_NAME: str = os.getenv('CENTRAL_DB_NAME', 'university_systems_central')
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    VERSION: str = os.getenv('VERSION', '2.0.0')
    
    # Backend API configuration
    BACKEND_URL: str = os.getenv('BACKEND_URL', 'http://localhost:8001')
    BACKEND_ENABLED: bool = os.getenv('BACKEND_ENABLED', 'true').lower() in ['true', '1', 'yes', 'on']
    BACKEND_TIMEOUT: int = int(os.getenv('BACKEND_TIMEOUT', '30'))
    BACKEND_RETRY_ATTEMPTS: int = int(os.getenv('BACKEND_RETRY_ATTEMPTS', '3'))
    BACKEND_FALLBACK_URLS: str = os.getenv('BACKEND_FALLBACK_URLS', '')

    GRAFANA_ENABLED: bool = True
    GRAFANA_URL: str = "http://localhost:3000"
    GRAFANA_USER: str = "admin"
    GRAFANA_PASSWORD: str = "admin"
    GRAFANA_DATASOURCE_UID: str = ""
    
    # Agent storage behavior
    AGENT_WRITE_TO_DB: bool = os.getenv('AGENT_WRITE_TO_DB', 'false').lower() in ['true', '1', 'yes', 'on']
    AGENT_LOCAL_BACKUP: bool = os.getenv('AGENT_LOCAL_BACKUP', 'false').lower() in ['true', '1', 'yes', 'on']
        
    BACKEND_MAX_RETRIES: int = int(os.getenv('BACKEND_MAX_RETRIES', '3'))
    BACKEND_RETRY_DELAY: float = float(os.getenv('BACKEND_RETRY_DELAY', '1.0'))
    # Monitor intervals (in seconds)
    HEARTBEAT_INTERVAL: int = int(os.getenv('HEARTBEAT_INTERVAL', '30'))
    USER_ACTIVITY_INTERVAL: int = int(os.getenv('USER_ACTIVITY_INTERVAL', '60'))
    NETWORK_INTERVAL: int = int(os.getenv('NETWORK_INTERVAL', '300'))
    APPLICATION_INTERVAL: int = int(os.getenv('APPLICATION_INTERVAL', '60'))
    SPECS_INTERVAL: int = int(os.getenv('SPECS_INTERVAL', '3600'))
    UPDATE_INTERVAL: int = int(os.getenv('UPDATE_INTERVAL', '3600'))
    OVERVIEW_INTERVAL: int = int(os.getenv('OVERVIEW_INTERVAL', '1800'))
    SERVICES_INTERVAL: int = int(os.getenv('SERVICES_INTERVAL', '300'))
    HARDWARE_INTERVAL: int = int(os.getenv('HARDWARE_INTERVAL', '5'))
    
    # Machine identification - auto-parsed from hostname
    CAMPUS_NAME: str = field(default_factory=lambda: MonitorConfig._get_location_info()['campus'])
    BUILDING: str = field(default_factory=lambda: MonitorConfig._get_location_info()['building'])
    ROOM: str = field(default_factory=lambda: MonitorConfig._get_location_info()['room'])
    STATION: Optional[int] = field(default_factory=lambda: MonitorConfig._get_location_info()['station'])
    MACHINE_TYPE: str = field(default_factory=lambda: MonitorConfig._get_location_info()['machine_type'])
    
    # Frontend-friendly collection names
    COLLECTIONS: Dict[str, str] = field(default_factory=lambda: {
        'hardware': 'hardware_metrics',
        'performance': 'performance_metrics',
        'software': 'software_metrics',
        'availability': 'availability_metrics',
        'alerts': 'system_alerts',
        'user_activity': 'user_activity_metrics',
        'network': 'network_metrics',
        'services': 'services_metrics'
    })
    
    # Metrics aggregation intervals for dashboards
    AGGREGATION_INTERVALS: List[str] = field(default_factory=lambda: ['5m', '1h', '1d', '1w'])
    
    @property
    def backend_fallback_urls_list(self) -> List[str]:
        """Return list of backend fallback URLs"""
        if not self.BACKEND_FALLBACK_URLS:
            return []
        return [u.strip() for u in self.BACKEND_FALLBACK_URLS.split(',') if u.strip()]
    
    @staticmethod
    def _get_location_info():
        """Get location info from hostname parsing"""
        try:
            from core.utils import parse_machine_location
            location_info = parse_machine_location()
            
            # Allow campus name override from environment if needed
            env_campus = os.getenv('CAMPUS_NAME')
            if env_campus:
                location_info['campus'] = env_campus
            
            return location_info
        except ImportError:
            # Fallback if utils not available yet
            return {
                'campus': os.getenv('CAMPUS_NAME', 'Main Campus'),
                'building': os.getenv('BUILDING', 'unknown'),
                'room': os.getenv('ROOM', 'unknown'),
                'station': None,
                'machine_type': os.getenv('MACHINE_TYPE', 'classroom_computer')
            }

@dataclass
class HeartbeatMonitorConfig(MonitorConfig):
    """Heartbeat monitor configuration"""
    INTERVAL: int = int(os.getenv('HEARTBEAT_MONITOR_INTERVAL', '30'))
    RETENTION_HOURS: int = int(os.getenv('HEARTBEAT_MONITOR_RETENTION_HOURS', '24'))
    ALERT_THRESHOLD_MINUTES: int = int(os.getenv('ALERT_THRESHOLD_MINUTES', '5'))

@dataclass
class UserActivityMonitorConfig(MonitorConfig):
    """User activity monitor configuration"""
    INTERVAL: int = int(os.getenv('USER_ACTIVITY_MONITOR_INTERVAL', '60'))
    RETENTION_HOURS: int = int(os.getenv('USER_ACTIVITY_MONITOR_RETENTION_HOURS', '24'))
    TRACK_IDLE_TIME: bool = os.getenv('TRACK_IDLE_TIME', 'true').lower() in ['true', '1', 'yes']

@dataclass
class NetworkMonitorConfig(MonitorConfig):
    """Network monitor configuration"""
    INTERVAL: int = int(os.getenv('NETWORK_MONITOR_INTERVAL', '300'))
    RETENTION_HOURS: int = int(os.getenv('NETWORK_MONITOR_RETENTION_HOURS', '48'))
    PING_TARGETS: List[str] = field(default_factory=lambda: [
        '8.8.8.8',  # Google DNS
        '1.1.1.1',  # Cloudflare DNS
    ])
    SPEED_TEST_ENABLED: bool = os.getenv('SPEED_TEST_ENABLED', 'false').lower() in ['true', '1', 'yes']

@dataclass
class ApplicationMonitorConfig(MonitorConfig):
    """Application monitor configuration"""
    INTERVAL: int = int(os.getenv('APPLICATION_MONITOR_INTERVAL', '60'))
    RETENTION_HOURS: int = int(os.getenv('APPLICATION_MONITOR_RETENTION_HOURS', '24'))
    TRACK_TOP_PROCESSES: int = int(os.getenv('TRACK_TOP_PROCESSES', '10'))

@dataclass
class HardwareMonitorConfig(MonitorConfig):
    """Hardware monitor configuration"""
    INTERVAL: int = int(os.getenv('HARDWARE_MONITOR_INTERVAL', '5'))
    RETENTION_HOURS: int = int(os.getenv('HARDWARE_MONITOR_RETENTION_HOURS', '24'))
    GRAFANA_ENABLED = True
    GRAFANA_URL= "http://localhost:3000"
    GRAFANA_USER = "admin"
    GRAFANA_PASSWORD = "admin"
    GRAFANA_DATASOURCE_UID = ""
    GRAFANA_API_KEY = ""
    # InfluxDB configuration (optional)
    INFLUXDB_URL: str = os.getenv('HARDWARE_MONITOR_INFLUXDB_URL', 'http://localhost:8086')
    INFLUXDB_TOKEN: str = os.getenv('HARDWARE_MONITOR_INFLUXDB_TOKEN', '')
    INFLUXDB_ORG: str = os.getenv('HARDWARE_MONITOR_INFLUXDB_ORG', 'myorg')
    INFLUXDB_BUCKET: str = os.getenv('HARDWARE_MONITOR_INFLUXDB_BUCKET', 'hardware_metrics')
    INFLUXDB_ENABLED: bool = os.getenv('INFLUXDB_ENABLED', 'true').lower() in ['true', '1', 'yes']
    
    # Alert thresholds (for frontend health indicators)
    THRESHOLDS: Dict[str, Dict[str, float]] = field(default_factory=lambda: {
        'cpu_temp': {'warning': 70, 'critical': 85},
        'cpu_usage': {'warning': 80, 'critical': 95},
        'memory_usage': {'warning': 80, 'critical': 95},
        'disk_usage': {'warning': 80, 'critical': 90},
        'gpu_temp': {'warning': 75, 'critical': 90}
    })

@dataclass
class SpecsMonitorConfig(MonitorConfig):
    """System specifications monitor configuration"""
    INTERVAL: int = int(os.getenv('SPECS_MONITOR_INTERVAL', '3600'))
    RETENTION_HOURS: int = int(os.getenv('SPECS_MONITOR_RETENTION_HOURS', '168'))  # 1 week
    
    # Specs to track for dashboard display
    TRACKED_SPECS: List[str] = field(default_factory=lambda: [
        'cpu_name', 'cpu_cores', 'cpu_threads',
        'memory_total_gb', 'disk_total_gb',
        'os_name', 'os_version'
    ])

@dataclass
class UpdateMonitorConfig(MonitorConfig):
    """Windows Update monitor configuration"""
    INTERVAL: int = int(os.getenv('UPDATE_MONITOR_INTERVAL', '3600'))
    RETENTION_HOURS: int = int(os.getenv('UPDATE_MONITOR_RETENTION_HOURS', '168'))  # 1 week
    CRITICAL_UPDATE_DAYS: int = int(os.getenv('CRITICAL_UPDATE_DAYS', '30'))
    UPDATE_HISTORY_LIMIT: int = int(os.getenv('UPDATE_HISTORY_LIMIT', '10'))

@dataclass
class OverviewMonitorConfig(MonitorConfig):
    """System overview monitor configuration"""
    INTERVAL: int = int(os.getenv('OVERVIEW_MONITOR_INTERVAL', '3600'))
    RETENTION_HOURS: int = int(os.getenv('OVERVIEW_MONITOR_RETENTION_HOURS', '168'))  # 1 week

@dataclass
class ServicesMonitorConfig(MonitorConfig):
    """Windows Services monitor configuration"""
    INTERVAL: int = int(os.getenv('SERVICES_MONITOR_INTERVAL', '300'))
    RETENTION_HOURS: int = int(os.getenv('SERVICES_MONITOR_RETENTION_HOURS', '48'))
    
    # Critical services to monitor
    CRITICAL_SERVICES: List[str] = field(default_factory=lambda: [
        'Windows Update',
        'Windows Defender Antivirus Service',
        'Windows Defender Firewall',
        'Windows Time',
        'DNS Client',
        'DHCP Client',
        'Windows Event Log',
        'Task Scheduler',
        'Remote Desktop Services',
        'Print Spooler'
    ])

@dataclass
class PeripheralsMonitorConfig(MonitorConfig):
    """Configuration for Peripherals Monitor"""
    INTERVAL: int = int(os.getenv('PERIPHERALS_MONITOR_INTERVAL', '300'))  # 5 minutes
    RETENTION_HOURS: int = int(os.getenv('PERIPHERALS_MONITOR_RETENTION_HOURS', '48'))
    
    # Enable/disable specific features
    COLLECT_DISPLAYS: bool = os.getenv('COLLECT_DISPLAYS', 'true').lower() in ['true', '1', 'yes']
    COLLECT_AUDIO: bool = os.getenv('COLLECT_AUDIO', 'true').lower() in ['true', '1', 'yes']
    COLLECT_POWER: bool = os.getenv('COLLECT_POWER', 'true').lower() in ['true', '1', 'yes']


@dataclass
class USBDevicesMonitorConfig(MonitorConfig):
    """Configuration for USB Devices Monitor"""
    INTERVAL: int = int(os.getenv('USB_DEVICES_MONITOR_INTERVAL', '120'))  # 2 minutes
    RETENTION_HOURS: int = int(os.getenv('USB_DEVICES_MONITOR_RETENTION_HOURS', '48'))
    
    # Enable/disable specific features
    CATEGORIZE_DEVICES: bool = os.getenv('CATEGORIZE_DEVICES', 'true').lower() in ['true', '1', 'yes']
    INCLUDE_HUBS: bool = os.getenv('INCLUDE_HUBS', 'true').lower() in ['true', '1', 'yes']
    INCLUDE_CONTROLLERS: bool = os.getenv('INCLUDE_CONTROLLERS', 'true').lower() in ['true', '1', 'yes']


@dataclass
class SecuritySoftwareMonitorConfig(MonitorConfig):
    """Configuration for Security & Software Monitor"""
    INTERVAL: int = int(os.getenv('SECURITY_SOFTWARE_MONITOR_INTERVAL', '600'))  # 10 minutes
    RETENTION_HOURS: int = int(os.getenv('SECURITY_SOFTWARE_MONITOR_RETENTION_HOURS', '168'))  # 1 week
    
    # Enable/disable specific features
    COLLECT_ANTIVIRUS: bool = os.getenv('COLLECT_ANTIVIRUS', 'true').lower() in ['true', '1', 'yes']
    COLLECT_FIREWALL: bool = os.getenv('COLLECT_FIREWALL', 'true').lower() in ['true', '1', 'yes']
    COLLECT_DEFENDER_DETAILS: bool = os.getenv('COLLECT_DEFENDER_DETAILS', 'true').lower() in ['true', '1', 'yes']
    COLLECT_INSTALLED_PROGRAMS: bool = os.getenv('COLLECT_INSTALLED_PROGRAMS', 'true').lower() in ['true', '1', 'yes']
    
    # Installed programs limit (can be slow with many programs)
    MAX_PROGRAMS_TO_COLLECT: int = int(os.getenv('MAX_PROGRAMS_TO_COLLECT', '500'))


@dataclass
class EventLogMonitorConfig(MonitorConfig):
    """Configuration for Event Log Monitor"""
    INTERVAL: int = int(os.getenv('EVENT_LOG_MONITOR_INTERVAL', '300'))  # 5 minutes
    RETENTION_HOURS: int = int(os.getenv('EVENT_LOG_MONITOR_RETENTION_HOURS', '48'))
    
    # Event collection settings
    MAX_EVENTS_PER_LOG: int = int(os.getenv('MAX_EVENTS_PER_LOG', '50'))
    HOURS_LOOKBACK: int = int(os.getenv('HOURS_LOOKBACK', '24'))
    
    # Which logs to collect
    COLLECT_SYSTEM_LOG: bool = os.getenv('COLLECT_SYSTEM_LOG', 'true').lower() in ['true', '1', 'yes']
    COLLECT_SECURITY_LOG: bool = os.getenv('COLLECT_SECURITY_LOG', 'true').lower() in ['true', '1', 'yes']
    COLLECT_APPLICATION_LOG: bool = os.getenv('COLLECT_APPLICATION_LOG', 'true').lower() in ['true', '1', 'yes']
@dataclass
class DashboardConfig:
    """Frontend dashboard configuration"""
    
    # Refresh intervals
    DASHBOARD_REFRESH_INTERVAL: int = 30  # seconds
    DEFAULT_TIME_RANGE: str = '24h'
    REAL_TIME_UPDATE_INTERVAL: int = 5  # seconds for real-time widgets
    
    # Metric priorities for display
    PRIMARY_METRICS: List[str] = field(default_factory=lambda: [
        'cpu_usage_percent',
        'memory_usage_percent',
        'disk_usage_percent',
        'system_health'
    ])
    
    SECONDARY_METRICS: List[str] = field(default_factory=lambda: [
        'cpu_temperature',
        'network_throughput',
        'active_users',
        'running_services_count'
    ])
    
    # Chart configurations
    CHART_DATA_POINTS: int = 100  # Number of data points to display in charts
    CHART_COLORS: Dict[str, str] = field(default_factory=lambda: {
        'healthy': '#10b981',    # Green
        'warning': '#f59e0b',    # Orange
        'critical': '#ef4444',   # Red
        'unknown': '#6b7280'     # Gray
    })
    
    # Table configurations
    DEFAULT_PAGE_SIZE: int = 25
    MAX_PAGE_SIZE: int = 100
    
    # Alert configurations
    ALERT_SOUND_ENABLED: bool = True
    ALERT_NOTIFICATION_ENABLED: bool = True
    CRITICAL_ALERT_BLINK: bool = True

# Export all configs for easy import
__all__ = [
    'MonitorConfig',
    'HeartbeatMonitorConfig',
    'UserActivityMonitorConfig',
    'NetworkMonitorConfig',
    'ApplicationMonitorConfig',
    'HardwareMonitorConfig',
    'SpecsMonitorConfig',
    'UpdateMonitorConfig',
    'OverviewMonitorConfig',
    'ServicesMonitorConfig',
    'DashboardConfig',
    'PeripheralsMonitorConfig',          
    'USBDevicesMonitorConfig',            
    'SecuritySoftwareMonitorConfig',      
    'EventLogMonitorConfig'               
]
