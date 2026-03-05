"""
base_monitor.py - Enhanced Base Monitor Class with WMI Threading Fix, Circuit Breaker & API Integration

COMPLETE VERSION - ALL FEATURES:
1. ✅ WMI Threading Fix - Proper COM initialization for Windows threads
2. ✅ Circuit Breaker Pattern - Automatic failure recovery
3. ✅ Health Metrics - Track success/failure rates
4. ✅ Backend API Integration - Send data to backend API (NEW!)
5. ✅ Graceful Degradation - Continue even when features fail
6. ✅ Backwards Compatible - Existing monitors work without changes

This is the foundation class that all monitors inherit from. It provides:
- Backend API integration with triple-fallback storage
- Standardized data formatting
- Triple-fallback storage (API → MongoDB → Local JSON)
- Health monitoring and scoring
- Retry logic and error handling
- Smart machine_id generation (hostname-based for backend compatibility)
- Thread-safe WMI access (Windows COM initialization)
- Circuit breaker for failed operations
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import socket
import time
import platform
import logging
import json
import os
import random
import asyncio
import re
import sys
import threading
from collections import deque

# Platform check - Windows only
if platform.system() != "Windows":
    raise Exception("This monitoring system only supports Windows")

# Windows-specific imports for COM/WMI
try:
    import pythoncom
    PYTHONCOM_AVAILABLE = True
except ImportError:
    PYTHONCOM_AVAILABLE = False
    pythoncom = None

# Optional imports with fallbacks
try:
    from pymongo import ASCENDING, DESCENDING
    from pymongo.errors import ConnectionFailure
    MONGODB_AVAILABLE = True
except ImportError:
    ASCENDING = DESCENDING = None
    ConnectionFailure = Exception
    MONGODB_AVAILABLE = False

# Backend API Client
try:
    from core.api_client import BackendAPIClient, create_api_client
    API_CLIENT_AVAILABLE = True
except ImportError:
    API_CLIENT_AVAILABLE = False
    BackendAPIClient = None
    create_api_client = None

try:
    from core.utils import setup_logging, connect_to_mongodb, get_machine_identifier, parse_machine_location
    from core.config import MonitorConfig
except ImportError:
    # Fallback implementations
    def setup_logging(name, level='INFO'):
        """
        Fallback when core.utils is unavailable.
        Sets propagate=False to prevent double-printing to the root logger.
        """
        logger = logging.getLogger(name)
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter(
                '%(asctime)s | %(name)-20s | %(levelname)-8s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            ))
            logger.addHandler(handler)
        logger.setLevel(getattr(logging, level.upper(), logging.INFO))
        logger.propagate = False  # stops double-printing to root logger
        return logger
    connect_to_mongodb = None
    get_machine_identifier = lambda: socket.gethostname()
    parse_machine_location = lambda: {'building': 'unknown', 'room': 'unknown', 'station': None, 'machine_type': 'classroom_computer'}

    class MonitorConfig:
        MONGODB_URI = 'mongodb+srv://MERN:MERN@mern-app.oyfulwx.mongodb.net/"'
        DB_NAME_SUFFIX = '_university_monitor'
        CENTRAL_DB_NAME = 'university_systems_central'
        BACKEND_ENABLED = False
        AGENT_WRITE_TO_DB = True
        AGENT_LOCAL_BACKUP = True
        RETENTION_HOURS = 48
        LOG_LEVEL = 'INFO'
        INTERVAL = 60
        VERSION = '2.0.0'
        CAMPUS_NAME = 'Main Campus'
        BUILDING = 'unknown'
        ROOM = 'unknown'
        STATION = None
        MACHINE_TYPE = 'classroom_computer'


# ============================================================================
# Circuit Breaker Pattern
# ============================================================================

class CircuitBreaker:
    """
    Circuit breaker to prevent overwhelming failed operations
    
    States:
    - CLOSED: Normal operation (default)
    - OPEN: Too many failures, stop trying
    - HALF_OPEN: Testing if service recovered
    """
    
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.state = "CLOSED"
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.half_open_attempts = 0
        self.max_half_open_attempts = 3
    
    def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection"""
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.timeout:
                self.state = "HALF_OPEN"
                self.half_open_attempts = 0
            else:
                raise Exception(f"Circuit breaker OPEN - service unavailable")
        
        try:
            result = func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure()
            raise e
    
    def on_success(self):
        """Handle successful operation"""
        if self.state == "HALF_OPEN":
            self.success_count += 1
            if self.success_count >= 2:
                self.state = "CLOSED"
                self.failure_count = 0
                self.success_count = 0
        elif self.state == "CLOSED":
            self.failure_count = max(0, self.failure_count - 1)
    
    def on_failure(self):
        """Handle failed operation"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == "HALF_OPEN":
            self.half_open_attempts += 1
            if self.half_open_attempts >= self.max_half_open_attempts:
                self.state = "OPEN"
        elif self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
    
    def is_available(self) -> bool:
        """Check if circuit breaker allows operations"""
        return self.state != "OPEN"


# ============================================================================
# Health Metrics Tracking
# ============================================================================

class HealthMetrics:
    """Track monitor health metrics"""
    
    def __init__(self, window_size: int = 100):
        self.success_count = 0
        self.failure_count = 0
        self.last_errors = deque(maxlen=10)
        self.collection_times = deque(maxlen=window_size)
        self.last_success_time = None
        self.last_failure_time = None
    
    def record_success(self, duration_ms: float):
        """Record successful collection"""
        self.success_count += 1
        self.collection_times.append(duration_ms)
        self.last_success_time = datetime.now(timezone.utc)
    
    def record_failure(self, error: str):
        """Record failed collection"""
        self.failure_count += 1
        self.last_errors.append({
            'error': error,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        self.last_failure_time = datetime.now(timezone.utc)
    
    def get_success_rate(self) -> float:
        """Get success rate percentage"""
        total = self.success_count + self.failure_count
        if total == 0:
            return 100.0
        return (self.success_count / total) * 100
    
    def get_avg_collection_time(self) -> float:
        """Get average collection time in ms"""
        if not self.collection_times:
            return 0.0
        return sum(self.collection_times) / len(self.collection_times)


# ============================================================================
# Enhanced Base Monitor with API Integration
# ============================================================================

class BaseMonitor(ABC):
    """
    Base class for all Windows monitors
    
    FEATURES:
    - Backend API Integration: Send data to backend for storage
    - WMI Threading Fix: Proper COM initialization per thread
    - Circuit Breaker: Automatic recovery from failures
    - Health Metrics: Track success/failure rates
    - Graceful Degradation: Continue when features fail
    - Triple-fallback storage: API → MongoDB → Local JSON
    - Smart machine identification
    - Hostname-based location parsing
    - Standardized data format
    - Health scoring
    """
    
    def __init__(self, module_name: str, config: Optional[MonitorConfig] = None):
        """
        Initialize base monitor
        
        Args:
            module_name: Name of the monitor (e.g., 'heartbeat_monitor')
            config: Configuration object
        """
        self.module_name = module_name
        self.config = config or MonitorConfig()
        self.logger = setup_logging(module_name, getattr(self.config, 'LOG_LEVEL', 'INFO'))
        
        # Get hostname (e.g., "4299-TBT333" or "DESKTOP-ABC123")
        self.hostname = socket.gethostname()
        
        # Parse location from hostname
        location_info = self._parse_hostname_location(self.hostname)
        
        # Create machine_id from parsed location
        self.machine_id = self._create_machine_id(location_info)
        
        # Store location info
        self.campus_name = getattr(self.config, 'CAMPUS_NAME', 'Main Campus')
        self.building = location_info.get('building', getattr(self.config, 'BUILDING', 'unknown'))
        self.room = location_info.get('room', getattr(self.config, 'ROOM', 'unknown'))
        self.station = location_info.get('station', getattr(self.config, 'STATION', None))
        self.machine_type = location_info.get('machine_type', getattr(self.config, 'MACHINE_TYPE', 'classroom_computer'))
        
        # Circuit breaker for resilience
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=getattr(config, 'FAILURE_THRESHOLD', 5),
            timeout=getattr(config, 'CIRCUIT_BREAKER_TIMEOUT', 60)
        )
        
        # Health metrics tracking
        self.health_metrics = HealthMetrics()
        
        # Thread-local storage for COM/WMI
        self._thread_local = threading.local()
        
        # Storage backends
        self.mongodb_client = None
        self.db = None
        
        # Backend API client
        self.api_client = None
        self.backend_enabled = getattr(self.config, 'BACKEND_ENABLED', True)
        
        if self.backend_enabled and API_CLIENT_AVAILABLE:
            try:
                self.api_client = create_api_client(self.config)
                self.logger.debug(f"API client initialized for {module_name}")
            except Exception as e:
                self.logger.warning(f"Failed to initialize API client: {e}")
                self.api_client = None
        
        # Tracking
        self.last_collection_duration = 0
        self.last_errors = deque(maxlen=10)
        
        # Initialize storage
        self._initialize_storage()
        
        # Log initialization
        self.logger.info(f"{module_name} initialized")
        self.logger.info(f"  Machine ID: {self.machine_id}")
        self.logger.info(f"  Hostname: {self.hostname}")
        self.logger.info(f"  Location: {self.machine_id}")
    
    def _parse_hostname_location(self, hostname: str) -> Dict[str, Any]:
        """
        Parse location information from hostname
        
        Examples:
        - "4299-TBT333" → building=TBT, room=333, station=4299
        - "MRT-06-4203" → building=MRT, room=06, station=4203
        - "DESKTOP-ABC123" → all unknown
        """
        try:
            return parse_machine_location()
        except:
            # Fallback parsing
            parts = hostname.split('-')
            
            if len(parts) >= 2:
                # Check if first part is a number (station) and second is building code
                if parts[0].isdigit() and not parts[1].isdigit():
                    return {
                        'building': parts[1][:3].upper(),
                        'room': parts[1][3:] if len(parts[1]) > 3 else 'unknown',
                        'station': int(parts[0]),
                        'machine_type': 'classroom_computer'
                    }
                # Check if pattern is building-room-station
                elif len(parts) >= 3:
                    return {
                        'building': parts[0].upper(),
                        'room': parts[1],
                        'station': int(parts[2]) if parts[2].isdigit() else None,
                        'machine_type': 'classroom_computer'
                    }
            
            return {
                'building': 'unknown',
                'room': 'unknown',
                'station': None,
                'machine_type': 'classroom_computer'
            }
    
    def _create_machine_id(self, location_info: Dict[str, Any]) -> str:
        """
        Create machine_id from location info
        Format: BUILDING-ROOM-STATION or fallback to hostname
        """
        building = location_info.get('building', 'unknown')
        room = location_info.get('room', 'unknown')
        station = location_info.get('station')
        
        if building != 'unknown' and room != 'unknown' and station:
            return f"{building}-{room}-{station}"
        elif building != 'unknown' and room != 'unknown':
            return f"{building}-{room}"
        else:
            return self.hostname
    
    # ========================================================================
    # WMI Thread Safety Functions
    # ========================================================================
    
    def _init_com_for_thread(self):
        """
        Initialize COM for Windows WMI in current thread
        
        CRITICAL FIX: This prevents WMI threading errors
        Must be called at start of any thread that uses WMI
        """
        if not PYTHONCOM_AVAILABLE:
            return
        
        if not hasattr(self._thread_local, 'com_initialized'):
            try:
                pythoncom.CoInitialize()
                self._thread_local.com_initialized = True
                self.logger.debug("COM initialized for thread")
            except Exception as e:
                self.logger.warning(f"Could not initialize COM: {e}")
    
    def _cleanup_com_for_thread(self):
        """Cleanup COM for current thread"""
        if not PYTHONCOM_AVAILABLE:
            return
        
        if hasattr(self._thread_local, 'com_initialized'):
            try:
                pythoncom.CoUninitialize()
                delattr(self._thread_local, 'com_initialized')
                self.logger.debug("COM uninitialized for thread")
            except Exception as e:
                self.logger.warning(f"Could not uninitialize COM: {e}")
    
    def _get_wmi_connection(self, namespace: str = None):
        """
        Get thread-safe WMI connection.

        Args:
            namespace: Optional WMI namespace, e.g. 'root\\SecurityCenter2'
                       or 'root\\Microsoft\\Windows\\Defender'.
                       Defaults to the standard 'root\\cimv2' namespace.

        Each distinct namespace gets its own cached connection on the thread-local
        so callers can request different namespaces without re-initialising COM.
        """
        # Ensure COM is initialized for this thread
        self._init_com_for_thread()

        # Use a per-namespace cache key so different namespaces don't collide
        cache_key = f'wmi_{namespace}' if namespace else 'wmi'

        if not hasattr(self._thread_local, cache_key):
            try:
                import wmi
                conn = wmi.WMI(namespace=namespace) if namespace else wmi.WMI()
                setattr(self._thread_local, cache_key, conn)
                self.logger.debug(f"WMI connection established for thread (namespace={namespace or 'default'})")
            except Exception as e:
                self.logger.error(f"Failed to create WMI connection (namespace={namespace}): {e}")
                raise

        return getattr(self._thread_local, cache_key)
    
    # ========================================================================
    # Storage Initialization
    # ========================================================================
    
    def _initialize_storage(self):
        """Initialize MongoDB if configured"""
        if not getattr(self.config, 'AGENT_WRITE_TO_DB', False):
            return
        
        if not MONGODB_AVAILABLE:
            self.logger.warning("MongoDB not available - skipping DB initialization")
            return
        
        try:
            if connect_to_mongodb:
                self.mongodb_client, self.db = connect_to_mongodb(self.config)
                self.logger.info("✓ MongoDB connected")
        except Exception as e:
            self.logger.warning(f"MongoDB connection failed: {e}")
    
    # ========================================================================
    # Monitor Lifecycle
    # ========================================================================
    
    def _sleep_with_jitter(self, interval: float):
        """Sleep with random jitter to prevent thundering herd"""
        jitter = random.uniform(-0.05, 0.05) * interval
        sleep_time = max(0.1, interval + jitter)
        time.sleep(sleep_time)
    
    def run_once(self) -> Dict[str, Any]:
        """
        Run collection once (useful for testing)
        
        Returns:
            Collected data dictionary
        """
        # Initialize COM for this thread
        self._init_com_for_thread()
        
        try:
            # Check if there's a run_monitor method (backwards compatibility)
            if hasattr(self, 'run_monitor'):
                return self.run_monitor(run_now=True)
            else:
                # Call abstract method
                data = self.collect_data()
                return self._format_data(data)
        finally:
            # Cleanup COM
            self._cleanup_com_for_thread()
    
    @abstractmethod
    def run_monitor(self, run_now: bool = False) -> Dict[str, Any]:
        """
        Run the monitor and collect data
        
        MUST be implemented by subclasses
        
        Args:
            run_now: Whether to run immediately or wait for interval
            
        Returns:
            Dictionary containing collected metrics
        """
        pass
    
    def _format_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format collected data with standard fields
        
        Args:
            data: Raw collected data
            
        Returns:
            Formatted data with metadata
        """
        if data is None:
            data = {}
        
        # Add standard metadata
        formatted = {
            'machine_id': self.machine_id,
            'hostname': self.hostname,
            'timestamp': datetime.now(timezone.utc),
            'monitor_type': self.module_name,
            'building': self.building,
            'room': self.room,
        }
        
        # Add station if available
        if self.station:
            formatted['station'] = self.station
        
        # Merge with collected data
        formatted.update(data)
        
        return formatted
    
    # ========================================================================
    # Storage Methods with API Integration
    # ========================================================================
    
    def store_monitor_data(self, data: Dict[str, Any]):
        """
        Store data using triple-fallback strategy:
        1. Try Backend API (if enabled)
        2. Try MongoDB (if configured for direct writes)
        3. Fall back to local JSON
        """
        if not data:
            return
        
        # Format data
        formatted_data = self._format_data(data)
        
        # ===================================================================
        # Try Backend API first (if enabled)
        # ===================================================================
        if self.backend_enabled and self.api_client:
            try:
                # Determine endpoint based on monitor type
                endpoint_map = {
                    'heartbeat_monitor': 'heartbeat',
                    'hardware_monitor': 'hardware',
                    'user_activity_monitor': 'user-activity',
                    'network_monitor': 'network',
                    'application_monitor': 'application',
                    'services_monitor': 'services',
                    'specs_monitor': 'specs',
                    'update_monitor': 'update',
                    'overview_monitor': 'overview',
                    'peripherals_monitor': 'peripherals',
                    'usb_devices_monitor': 'usb-devices',
                    'security_software_monitor': 'security-software',
                    'event_log_monitor': 'event-logs'
                }
                
                endpoint = endpoint_map.get(self.module_name, 'generic')
                
                # Send to backend
                success = self._send_to_backend_sync(endpoint, formatted_data)
                
                if success:
                    self.logger.debug(f"✓ Data sent to backend ({endpoint})")
                    self.health_metrics.record_success(self.last_collection_duration)
                    return  # Success! Don't try other methods
                else:
                    self.logger.warning(f"Failed to send to backend, trying fallbacks...")
                    self.health_metrics.record_failure("Backend API failed")
                    
            except Exception as e:
                self.logger.warning(f"Backend API error: {e}")
                self.health_metrics.record_failure(str(e))
        
        # ===================================================================
        # Fallback 1: Try MongoDB if configured for direct writes
        # ===================================================================
        if self.db is not None and getattr(self.config, 'AGENT_WRITE_TO_DB', False):
            try:
                self._store_in_mongodb(formatted_data)
                self.logger.debug("✓ Data stored in MongoDB (direct)")
                return
            except Exception as e:
                self.logger.warning(f"MongoDB storage failed: {e}")
        
        # ===================================================================
        # Fallback 2: Local JSON backup
        # ===================================================================
        if getattr(self.config, 'AGENT_LOCAL_BACKUP', False):
            try:
                self._store_local_json(formatted_data)
                self.logger.debug("✓ Data stored locally (JSON backup)")
            except Exception as e:
                self.logger.error(f"Local storage failed: {e}")
    
    def _send_to_backend_sync(self, endpoint: str, data: Dict[str, Any]) -> bool:
        """
        Send data to backend API synchronously
        
        Args:
            endpoint: API endpoint name (e.g., 'hardware', 'heartbeat')
            data: Data dictionary to send
            
        Returns:
            True if successful, False otherwise
        """
        if not self.api_client:
            return False
        
        try:
            # Get or create event loop
            try:
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            # Define async send operation
            async def send_data():
                async with self.api_client as client:
                    # Map endpoint to client method
                    method_map = {
                        'heartbeat': client.send_heartbeat,
                        'hardware': client.send_hardware,
                        'user-activity': client.send_user_activity,
                        'network': client.send_network,
                        'application': client.send_applications,
                        'services': client.send_services,
                        'specs': client.send_specs,
                        'update': client.send_updates,
                        'overview': client.send_overview,
                        'peripherals': client.send_peripherals,
                        'usb-devices': client.send_usb_devices,
                        'security-software': client.send_security,
                        'event-logs': client.send_event_logs
                    }
                    
                    send_method = method_map.get(endpoint)
                    if send_method:
                        return await send_method(data)
                    else:
                        self.logger.error(f"Unknown endpoint: {endpoint}")
                        return False
            
            # Execute async operation
            return loop.run_until_complete(send_data())
            
        except Exception as e:
            self.logger.error(f"Error sending to backend: {e}")
            return False
    
    def _store_in_mongodb(self, data: Dict[str, Any]):
        """Store data in MongoDB"""
        collection_name = f"{self.module_name}_latest"
        collection = self.db[collection_name]
        
        # Upsert (update or insert)
        collection.update_one(
            {'machine_id': self.machine_id},
            {'$set': data},
            upsert=True
        )
        
        # Also store in history
        history_collection = self.db[f"{self.module_name}_history"]
        history_collection.insert_one(data.copy())
    
    def _store_local_json(self, data: Dict[str, Any]):
        """Store data in local JSON file"""
        log_dir = 'log/offline_data'
        os.makedirs(log_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{self.machine_id}_{self.module_name}_{timestamp}.json"
        filepath = os.path.join(log_dir, filename)
        
        # Convert datetime objects to strings
        json_data = json.loads(json.dumps(data, default=str))
        
        with open(filepath, 'w') as f:
            json.dump(json_data, f, indent=2)
    
    # ========================================================================
    # Health & Status Methods
    # ========================================================================
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get monitor health status
        
        Includes circuit breaker state and health metrics
        """
        return {
            'name': self.module_name,
            'machine_id': self.machine_id,
            'hostname': self.hostname,
            'circuit_breaker_state': self.circuit_breaker.state,
            'success_rate': round(self.health_metrics.get_success_rate(), 2),
            'success_count': self.health_metrics.success_count,
            'failure_count': self.health_metrics.failure_count,
            'avg_collection_time_ms': round(self.health_metrics.get_avg_collection_time(), 2),
            'last_errors': list(self.health_metrics.last_errors),
            'last_collection_duration_ms': round(self.last_collection_duration, 2)
        }
    
    def is_healthy(self) -> bool:
        """
        Check if monitor is healthy
        
        Uses health metrics
        """
        success_rate = self.health_metrics.get_success_rate()
        total_attempts = self.health_metrics.success_count + self.health_metrics.failure_count
        
        # Consider unhealthy if success rate < 50% with at least 10 attempts
        if success_rate < 50 and total_attempts >= 10:
            return False
        
        # Consider unhealthy if circuit breaker is open
        if self.circuit_breaker.state == "OPEN":
            return False
        
        return True
    
    def get_common_data(self) -> Dict[str, Any]:
        """
        Get common data fields for backwards compatibility
        
        DEPRECATED: Use _format_data() instead
        This method is kept for backwards compatibility with old monitors
        
        Returns:
            Dictionary with machine_id, hostname, timestamp, location
        """
        return {
            'machine_id': self.machine_id,
            'hostname': self.hostname,
            'timestamp': datetime.now(timezone.utc),
            'building': self.building,
            'room': self.room,
            'campus': self.campus_name
        }
    
    def update_config(self, **kwargs):
        """
        Update configuration dynamically
        
        Args:
            **kwargs: Configuration key-value pairs
        """
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                self.logger.info(f"Updated config: {key} = {value}")
            else:
                self.logger.warning(f"Invalid config key: {key}")


# ============================================================================
# WindowsWMIMonitor - Specialized Base Class for WMI Monitors
# ============================================================================

class WindowsWMIMonitor(BaseMonitor):
    """
    Specialized base class for Windows WMI-based monitors
    
    Use this as base class for monitors that use WMI:
    - peripherals_monitor
    - usb_devices_monitor
    - security_software_monitor
    
    Example:
        class PeripheralsMonitor(WindowsWMIMonitor):
            def run_monitor(self, run_now=False):
                wmi = self._get_wmi_connection()  # Thread-safe!
                # ... use wmi
    """
    
    def __init__(self, module_name: str, config: Optional[MonitorConfig] = None):
        super().__init__(module_name, config)
        
        # WMI-specific settings
        self.wmi_timeout = getattr(config, 'WMI_TIMEOUT', 10)
    
    # WMI convenience methods inherited from BaseMonitor:
    # - self._init_com_for_thread()
    # - self._get_wmi_connection()
    # - self._cleanup_com_for_thread()