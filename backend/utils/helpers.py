"""
Helper utility functions
Core functions needed by backend routers
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from bson import ObjectId
import logging

logger = logging.getLogger("university_monitoring")


def clean_objectid(obj):
    """Recursively remove or convert ObjectId fields"""
    if isinstance(obj, dict):
        if "_id" in obj:
            del obj["_id"]
        for key, value in list(obj.items()):
            if isinstance(value, ObjectId):
                obj[key] = str(value)
            elif isinstance(value, (dict, list)):
                obj[key] = clean_objectid(value)
        return obj
    elif isinstance(obj, list):
        return [clean_objectid(item) for item in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    return obj


def safe_get_list(doc: dict, key: str, default: list = None) -> list:
    """Safely extract list value from document"""
    if default is None:
        default = []
    value = doc.get(key)
    if value is None:
        return default
    if isinstance(value, list):
        return value
    if isinstance(value, int):
        return default
    try:
        return list(value)
    except (TypeError, ValueError):
        return default


def safe_get_number(value, default=0.0):
    """Safely convert value to number with fallback"""
    if value is None:
        return default
    
    # Handle MongoDB $numberLong format
    if isinstance(value, dict):
        if "$numberLong" in value:
            try:
                return int(value["$numberLong"])
            except:
                return default
        return default
    
    # Handle direct numeric types
    if isinstance(value, (int, float)):
        return float(value) if isinstance(default, float) else int(value)
    
    # Handle string conversion
    if isinstance(value, str):
        try:
            if isinstance(default, int) and '.' not in value:
                return int(value)
            return float(value)
        except (ValueError, TypeError):
            return default
    
    return default


def calculate_health_score(metrics: Dict) -> int:
    """Calculate health score (0-100) based on resource usage"""
    score = 100
    
    cpu = metrics.get('cpu_usage_percent', 0)
    if cpu > 90: score -= 30
    elif cpu > 75: score -= 20
    elif cpu > 60: score -= 10
    
    memory = metrics.get('memory_usage_percent', 0)
    if memory > 90: score -= 30
    elif memory > 75: score -= 20
    elif memory > 60: score -= 10
    
    disk = metrics.get('disk_usage_percent', 0)
    if disk > 90: score -= 20
    elif disk > 80: score -= 10
    
    temp = metrics.get('cpu_temperature_c', 0)
    if temp > 85: score -= 20
    elif temp > 70: score -= 10
    
    return max(0, score)


def calculate_machine_status(heartbeat_doc: Dict) -> str:
    """Determine machine status: offline, in-use, or idle"""
    from config import Config
    
    if not heartbeat_doc:
        return 'offline'
    
    last_seen = heartbeat_doc.get('timestamp')
    if isinstance(last_seen, datetime):
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        time_diff = datetime.now(timezone.utc) - last_seen
        if time_diff.total_seconds() > Config.OFFLINE_THRESHOLD_SECONDS:
            return 'offline'
    
    current_account = heartbeat_doc.get('current_account')
    current_username = heartbeat_doc.get('current_username')
    active_user = heartbeat_doc.get('active_user')
    
    if current_account or current_username or active_user:
        return 'in-use'
    
    return 'idle'


def convert_mongodb_timestamp(timestamp) -> Optional[datetime]:
    """
    Convert various timestamp formats to datetime object
    
    Handles:
    - String ISO format: "2026-01-05T04:02:39.941Z"
    - MongoDB $date format: {"$date": "2026-01-05T04:02:39.941Z"}
    - datetime objects
    """
    if not timestamp:
        return None
    
    # Already a datetime
    if isinstance(timestamp, datetime):
        if timestamp.tzinfo is None:
            return timestamp.replace(tzinfo=timezone.utc)
        return timestamp
    
    # MongoDB's {$date: "..."} format
    if isinstance(timestamp, dict) and '$date' in timestamp:
        timestamp = timestamp['$date']
    
    # String ISO format
    if isinstance(timestamp, str):
        try:
            # Remove 'Z' and add '+00:00' for proper UTC parsing
            timestamp_str = timestamp.replace('Z', '+00:00')
            dt = datetime.fromisoformat(timestamp_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception as e:
            logger.warning(f"Failed to parse timestamp '{timestamp}': {e}")
            return None
    
    return None


def calculate_machine_status_with_heartbeat(doc: dict, threshold_minutes: int = 5) -> str:
    """
    Calculate machine status based on last heartbeat timestamp
    
    Returns: 'active', 'idle', or 'offline'
    """
    # Get timestamp (try multiple field names)
    timestamp = doc.get('timestamp') or doc.get('last_heartbeat') or doc.get('received_at')
    
    if not timestamp:
        logger.debug(f"No timestamp found for machine {doc.get('machine_id')}")
        return 'offline'
    
    # Convert to datetime
    dt = convert_mongodb_timestamp(timestamp)
    if not dt:
        logger.debug(f"Failed to convert timestamp for {doc.get('machine_id')}: {timestamp}")
        return 'offline'
    
    # Calculate time since heartbeat
    now = datetime.now(timezone.utc)
    time_diff = now - dt
    minutes_since_heartbeat = time_diff.total_seconds() / 60
    
    logger.debug(f"Machine {doc.get('machine_id')}: Last heartbeat {minutes_since_heartbeat:.2f} minutes ago")
    
    # Machine is offline if no recent heartbeat
    if minutes_since_heartbeat > threshold_minutes:
        logger.debug(f"Machine {doc.get('machine_id')}: OFFLINE (>{threshold_minutes} min)")
        return 'offline'
    
    # Check user activity to determine active vs idle
    user_activity = doc.get('user_activity', {})
    
    # Try different field names for active user
    active_user = (
        user_activity.get('active_user') or 
        user_activity.get('current_user') or
        user_activity.get('username')
    )
    
    # User is logged in and it's not a system account
    if active_user and active_user not in ['None', 'SYSTEM', '', 'null', None]:
        logger.debug(f"Machine {doc.get('machine_id')}: ACTIVE (user: {active_user})")
        return 'active'
    
    # Check CPU/Memory for activity
    cpu_usage = doc.get('cpu_usage_percent', 0)
    memory_usage = doc.get('memory_usage_percent', 0)
    
    if cpu_usage > 20:
        logger.debug(f"Machine {doc.get('machine_id')}: ACTIVE (CPU: {cpu_usage}%)")
        return 'active'
    
    # Online but idle
    logger.debug(f"Machine {doc.get('machine_id')}: IDLE (CPU: {cpu_usage}%, no active user)")
    return 'idle'
