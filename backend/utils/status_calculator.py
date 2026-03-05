"""
Machine Status Calculator
Determines machine status based on heartbeat and user activity data.

This centralizes the logic for calculating:
- Machine status (online, idle, offline)
- Idle time duration
- User presence indicators
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


def calculate_machine_status(
    heartbeat: Optional[Dict[str, Any]],
    user_activity: Optional[Dict[str, Any]],
    offline_threshold_minutes: int = 5,
    idle_threshold_minutes: int = 15
) -> str:
    """
    Calculate machine status based on heartbeat and user activity.
    
    Args:
        heartbeat: Latest heartbeat data from heartbeat_monitor_latest
        user_activity: Latest user activity data from user_activity_monitor_latest
        offline_threshold_minutes: Minutes without heartbeat before marking offline (default: 5)
        idle_threshold_minutes: Minutes without user activity before marking idle (default: 15)
    
    Returns:
        'online' - Machine is running and has active users
        'idle' - Machine is running but no active users
        'offline' - No heartbeat received within threshold
    
    Examples:
        >>> heartbeat = {'timestamp': datetime.now(), 'status': 'online'}
        >>> user_activity = {'active_user': 'john.doe', 'active_sessions': [...]}
        >>> calculate_machine_status(heartbeat, user_activity)
        'online'
        
        >>> heartbeat = {'timestamp': datetime.now()}
        >>> user_activity = {'active_user': None, 'active_sessions': []}
        >>> calculate_machine_status(heartbeat, user_activity)
        'idle'
    """
    now = datetime.now(timezone.utc)
    
    # ======================================================================
    # 1. CHECK OFFLINE (No heartbeat = machine is down/disconnected)
    # ======================================================================
    if not heartbeat or 'timestamp' not in heartbeat:
        logger.debug("No heartbeat data - marking as offline")
        return 'offline'
    
    # Parse heartbeat timestamp
    heartbeat_time = _parse_timestamp(heartbeat['timestamp'])
    if not heartbeat_time:
        logger.warning(f"Invalid heartbeat timestamp: {heartbeat.get('timestamp')}")
        return 'offline'
    
    # Calculate time since last heartbeat
    time_since_heartbeat_minutes = (now - heartbeat_time).total_seconds() / 60
    
    if time_since_heartbeat_minutes > offline_threshold_minutes:
        logger.debug(f"Last heartbeat was {time_since_heartbeat_minutes:.1f} minutes ago - marking as offline")
        return 'offline'
    
    # ======================================================================
    # 2. CHECK IDLE (Machine is on, but no active users)
    # ======================================================================
    if user_activity:
        # Check for active user
        active_user = user_activity.get('active_user')
        
        # Check active sessions
        active_sessions = user_activity.get('active_sessions', [])
        
        # Check user summary
        user_summary = user_activity.get('user_summary', {})
        has_active_users = user_summary.get('has_active_users', False)
        
        # If any indicator shows active users, machine is online
        if active_user or active_sessions or has_active_users:
            logger.debug(f"Machine has active user: {active_user}")
            return 'online'
        
        # No active users, but heartbeat is recent = idle
        logger.debug("Machine has heartbeat but no active users - marking as idle")
        return 'idle'
    
    # ======================================================================
    # 3. DEFAULT (Heartbeat exists but no user activity data)
    # ======================================================================
    # If we have heartbeat but no user activity data, assume online
    # (User activity monitor might not be configured)
    logger.debug("No user activity data - defaulting to online based on heartbeat")
    return 'online'


def calculate_idle_time_minutes(
    user_activity: Optional[Dict[str, Any]],
    heartbeat: Optional[Dict[str, Any]]
) -> int:
    """
    Calculate how long a machine has been idle (no active users).
    
    Args:
        user_activity: Latest user activity data
        heartbeat: Latest heartbeat data (for uptime reference)
    
    Returns:
        Minutes since last user activity (0 if users are currently active)
    
    Examples:
        >>> user_activity = {'active_sessions': [{'user': 'john'}]}
        >>> calculate_idle_time_minutes(user_activity, None)
        0  # Has active user, not idle
        
        >>> user_activity = {
        ...     'active_sessions': [],
        ...     'timestamp': datetime(2024, 3, 4, 9, 0)  # 1 hour ago
        ... }
        >>> calculate_idle_time_minutes(user_activity, None)
        60  # Idle for 60 minutes
    """
    if not user_activity:
        return 0
    
    # Check if there are active sessions
    active_sessions = user_activity.get('active_sessions', [])
    if active_sessions:
        # Machine has active users, not idle
        return 0
    
    # Check if there's an active user field
    active_user = user_activity.get('active_user')
    if active_user:
        # Machine has active user, not idle
        return 0
    
    # No active users - calculate idle time
    now = datetime.now(timezone.utc)
    
    # Try to get timestamp from user_activity
    timestamp = _parse_timestamp(user_activity.get('timestamp'))
    
    if timestamp:
        idle_minutes = int((now - timestamp).total_seconds() / 60)
        return max(0, idle_minutes)
    
    # If no timestamp in user_activity, try boot time from heartbeat
    if heartbeat and 'uptime' in heartbeat:
        uptime = heartbeat['uptime']
        if 'boot_time_epoch' in uptime:
            boot_time = datetime.fromtimestamp(uptime['boot_time_epoch'], timezone.utc)
            idle_minutes = int((now - boot_time).total_seconds() / 60)
            return max(0, idle_minutes)
    
    # Can't determine idle time
    return 0


def get_session_duration_minutes(session: Dict[str, Any]) -> int:
    """
    Calculate how long a user session has been active.
    
    Args:
        session: Session dictionary with 'started_epoch' or 'started_iso'
    
    Returns:
        Minutes since session started
    
    Examples:
        >>> session = {'started_epoch': 1709557200}  # Some time in the past
        >>> duration = get_session_duration_minutes(session)
        >>> duration > 0
        True
    """
    now = datetime.now(timezone.utc)
    
    # Try epoch timestamp first
    if 'started_epoch' in session:
        try:
            started = datetime.fromtimestamp(session['started_epoch'], timezone.utc)
            duration_minutes = int((now - started).total_seconds() / 60)
            return max(0, duration_minutes)
        except (ValueError, TypeError) as e:
            logger.debug(f"Error parsing started_epoch: {e}")
    
    # Try ISO timestamp
    if 'started_iso' in session:
        started = _parse_timestamp(session['started_iso'])
        if started:
            duration_minutes = int((now - started).total_seconds() / 60)
            return max(0, duration_minutes)
    
    # Can't determine duration
    return 0


def get_user_status_summary(
    user_activity: Optional[Dict[str, Any]],
    heartbeat: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Get comprehensive user activity summary.
    
    Args:
        user_activity: Latest user activity data
        heartbeat: Latest heartbeat data
    
    Returns:
        Dictionary with:
        - current_username: Active user name (or None)
        - active_users_count: Number of active sessions
        - session_duration_minutes: Duration of current session
        - idle_time_minutes: Time since last activity
        - has_active_user: Boolean flag
    
    Example:
        >>> user_activity = {
        ...     'active_user': 'john.doe',
        ...     'active_sessions': [{'user': 'john.doe', 'started_epoch': 1709557200}]
        ... }
        >>> summary = get_user_status_summary(user_activity, None)
        >>> summary['current_username']
        'john.doe'
        >>> summary['has_active_user']
        True
    """
    summary = {
        'current_username': None,
        'active_users_count': 0,
        'session_duration_minutes': 0,
        'idle_time_minutes': 0,
        'has_active_user': False
    }
    
    if not user_activity:
        return summary
    
    # Get active user
    active_user = user_activity.get('active_user')
    summary['current_username'] = active_user
    summary['has_active_user'] = bool(active_user)
    
    # Get active sessions count
    active_sessions = user_activity.get('active_sessions', [])
    summary['active_users_count'] = len(active_sessions)
    
    # Get session duration (for first/primary session)
    if active_sessions:
        primary_session = active_sessions[0]
        summary['session_duration_minutes'] = get_session_duration_minutes(primary_session)
    
    # Get idle time (if no active users)
    if not active_user and not active_sessions:
        summary['idle_time_minutes'] = calculate_idle_time_minutes(user_activity, heartbeat)
    
    return summary


def is_machine_healthy(
    heartbeat: Optional[Dict[str, Any]],
    warning_threshold: int = 75,
    critical_threshold: int = 90
) -> Dict[str, Any]:
    """
    Check if machine is healthy based on resource usage.
    
    Args:
        heartbeat: Latest heartbeat data with resource usage
        warning_threshold: Percentage threshold for warning (default: 75)
        critical_threshold: Percentage threshold for critical (default: 90)
    
    Returns:
        Dictionary with:
        - status: 'healthy', 'warning', 'critical', or 'unknown'
        - health_score: 0-100 score
        - issues: List of issue strings
    
    Example:
        >>> heartbeat = {
        ...     'resources': {
        ...         'cpu_usage_percent': 85,
        ...         'memory_usage_percent': 60,
        ...         'disk_usage_percent': 70
        ...     }
        ... }
        >>> health = is_machine_healthy(heartbeat)
        >>> health['status']
        'warning'
    """
    result = {
        'status': 'unknown',
        'health_score': 0,
        'issues': []
    }
    
    if not heartbeat or 'resources' not in heartbeat:
        result['issues'].append('no_heartbeat_data')
        return result
    
    resources = heartbeat['resources']
    
    # Get resource usage
    cpu = resources.get('cpu_usage_percent', 0)
    memory = resources.get('memory_usage_percent', 0)
    disk = resources.get('disk_usage_percent', 0)
    
    # Calculate health score
    health_score = 100
    issues = []
    
    # CPU check
    if cpu >= critical_threshold:
        health_score -= 30
        issues.append(f'cpu_critical ({cpu:.1f}%)')
    elif cpu >= warning_threshold:
        health_score -= 15
        issues.append(f'cpu_warning ({cpu:.1f}%)')
    
    # Memory check
    if memory >= critical_threshold:
        health_score -= 30
        issues.append(f'memory_critical ({memory:.1f}%)')
    elif memory >= warning_threshold:
        health_score -= 15
        issues.append(f'memory_warning ({memory:.1f}%)')
    
    # Disk check
    if disk >= critical_threshold:
        health_score -= 20
        issues.append(f'disk_critical ({disk:.1f}%)')
    elif disk >= warning_threshold:
        health_score -= 10
        issues.append(f'disk_warning ({disk:.1f}%)')
    
    # Determine overall status
    if health_score >= 80:
        status = 'healthy'
    elif health_score >= 50:
        status = 'warning'
    else:
        status = 'critical'
    
    result['status'] = status
    result['health_score'] = max(0, health_score)
    result['issues'] = issues
    
    return result


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _parse_timestamp(timestamp: Any) -> Optional[datetime]:
    """
    Parse various timestamp formats into datetime object.
    
    Supports:
    - datetime objects
    - ISO 8601 strings
    - Epoch timestamps (int/float)
    
    Args:
        timestamp: Timestamp in various formats
    
    Returns:
        datetime object (UTC) or None if parsing fails
    """
    if not timestamp:
        return None
    
    # Already a datetime object
    if isinstance(timestamp, datetime):
        # Ensure timezone aware
        if timestamp.tzinfo is None:
            return timestamp.replace(tzinfo=timezone.utc)
        return timestamp
    
    # ISO 8601 string
    if isinstance(timestamp, str):
        try:
            # Handle both with and without 'Z' suffix
            ts_str = timestamp.replace('Z', '+00:00')
            dt = datetime.fromisoformat(ts_str)
            # Ensure timezone aware
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, AttributeError) as e:
            logger.debug(f"Error parsing ISO timestamp '{timestamp}': {e}")
            return None
    
    # Epoch timestamp (seconds since 1970-01-01)
    if isinstance(timestamp, (int, float)):
        try:
            return datetime.fromtimestamp(timestamp, timezone.utc)
        except (ValueError, OSError) as e:
            logger.debug(f"Error parsing epoch timestamp {timestamp}: {e}")
            return None
    
    logger.debug(f"Unknown timestamp format: {type(timestamp)}")
    return None


# ============================================================================
# TESTING
# ============================================================================

if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.DEBUG)
    
    # Test 1: Online machine with active user
    print("\n=== Test 1: Online machine with active user ===")
    heartbeat = {
        'timestamp': datetime.now(timezone.utc),
        'status': 'online',
        'resources': {
            'cpu_usage_percent': 45,
            'memory_usage_percent': 60,
            'disk_usage_percent': 70
        }
    }
    user_activity = {
        'active_user': 'john.doe',
        'active_sessions': [
            {
                'user': 'john.doe',
                'started_epoch': int((datetime.now(timezone.utc) - timedelta(hours=2)).timestamp())
            }
        ],
        'timestamp': datetime.now(timezone.utc)
    }
    
    status = calculate_machine_status(heartbeat, user_activity)
    user_summary = get_user_status_summary(user_activity, heartbeat)
    health = is_machine_healthy(heartbeat)
    
    print(f"Status: {status}")
    print(f"User: {user_summary['current_username']}")
    print(f"Session Duration: {user_summary['session_duration_minutes']} minutes")
    print(f"Health: {health['status']} (score: {health['health_score']})")
    
    # Test 2: Idle machine (no users)
    print("\n=== Test 2: Idle machine (no users) ===")
    user_activity_idle = {
        'active_user': None,
        'active_sessions': [],
        'timestamp': datetime.now(timezone.utc) - timedelta(minutes=30)
    }
    
    status = calculate_machine_status(heartbeat, user_activity_idle)
    idle_time = calculate_idle_time_minutes(user_activity_idle, heartbeat)
    
    print(f"Status: {status}")
    print(f"Idle Time: {idle_time} minutes")
    
    # Test 3: Offline machine
    print("\n=== Test 3: Offline machine ===")
    heartbeat_old = {
        'timestamp': datetime.now(timezone.utc) - timedelta(minutes=10),
        'status': 'online'
    }
    
    status = calculate_machine_status(heartbeat_old, user_activity)
    print(f"Status: {status}")
    
    print("\n✅ Tests complete!")
