"""
Document adapter functions for transforming nested MongoDB documents to flat structures

- Proper null handling for RAM type (returns None instead of "Unknown")
- Better type safety with explicit None returns
- Improved fallback chains
"""
from datetime import datetime, timezone
from typing import Dict, Optional, Any
import logging

from utils.helpers import clean_objectid, safe_get_list, safe_get_number

logger = logging.getLogger("university_monitoring")


def adapt_specs_document(doc: Dict) -> Dict:
    """
    Transform specs document with better CPU model extraction
    
    ✅ FIXED: Returns None for missing data instead of "Unknown"
    """
    adapted = {
        "machine_id": doc.get("machine_id"),
        "hostname": doc.get("hostname"),
        "building": doc.get("building"),
        "room": doc.get("room"),
        "timestamp": doc.get("timestamp"),
    }
    
    # CPU
    cpu = doc.get("cpu", {})
    adapted["cpu_model"] = cpu.get("processor") or None  # ✅ Returns None, not "Unknown"
    adapted["cpu_cores"] = cpu.get("physical_cores", 0)
    adapted["cpu_threads"] = cpu.get("logical_cores", 0)
    adapted["cpu_base_clock_ghz"] = cpu.get("frequency_max_mhz", 0) / 1000 if cpu.get("frequency_max_mhz") else 0
    adapted["cpu_architecture"] = cpu.get("architecture") or None  # ✅ Explicit None
    
    # Memory - ✅ CRITICAL FIX: Proper null handling
    memory = doc.get("memory", {})
    adapted["memory_total_gb"] = memory.get("total_gb", 0)
    adapted["memory_type"] = memory.get("type") or None  # ✅ Returns None, not "Unknown"
    adapted["memory_speed_mhz"] = memory.get("speed_mhz") or None  # ✅ Explicit None
    
    # Storage
    storage = doc.get("storage", {})
    adapted["storage"] = storage.get("disks", [])
    
    # Aggregate disk total
    disks = storage.get("disks", [])
    total_disk_gb = sum(disk.get("size_gb", 0) for disk in disks)
    adapted["disk_total_gb"] = total_disk_gb
    
    # GPU
    adapted["gpu"] = doc.get("gpu", [])
    
    # OS
    os_info = doc.get("os", {})
    os_system = os_info.get('system', '')
    os_release = os_info.get('release', '')
    
    # Build OS name, but return None if both are empty
    if os_system or os_release:
        adapted["os_name"] = f"{os_system} {os_release}".strip()
    else:
        adapted["os_name"] = None  # ✅ Explicit None
    
    adapted["os_version"] = os_info.get("version") or None
    adapted["os_build"] = os_info.get("version") or None
    adapted["os_architecture"] = os_info.get("platform") or None
    adapted["os_install_date"] = os_info.get("install_date")
    
    # System
    system = doc.get("system", {})
    if not adapted.get("hostname"):
        adapted["hostname"] = system.get("hostname")
    adapted["boot_time"] = system.get("boot_time_iso")
    adapted["boot_time_epoch"] = system.get("boot_time_epoch")
    
    return adapted


def adapt_hardware_document(doc: Dict) -> Dict:
    """
    Transform hardware document with better field extraction
    
    ✅ IMPROVED: Better null handling throughout
    """
    adapted = {
        "machine_id": doc.get("machine_id"),
        "hostname": doc.get("hostname"),
        "building": doc.get("building"),
        "room": doc.get("room"),
        "timestamp": doc.get("timestamp"),
    }
    
    # CPU metrics - ensure proper number types
    adapted["cpu_usage_percent"] = safe_get_number(doc.get("cpu_usage_percent"), 0.0)
    adapted["cpu_per_core_usage"] = doc.get("cpu_per_core_usage", [])
    adapted["cpu_physical_cores"] = safe_get_number(doc.get("cpu_physical_cores"), 0)
    adapted["cpu_logical_cores"] = safe_get_number(doc.get("cpu_logical_cores"), 0)
    adapted["cpu_freq_current_mhz"] = safe_get_number(doc.get("cpu_freq_current_mhz"), 0.0)
    adapted["cpu_freq_min_mhz"] = safe_get_number(doc.get("cpu_freq_min_mhz"), 0.0)
    adapted["cpu_freq_max_mhz"] = safe_get_number(doc.get("cpu_freq_max_mhz"), 0.0)
    
    # ✅ IMPROVED: Returns None instead of 0 for missing temperature
    cpu_temp = (
        doc.get("cpu_temperature_c") or 
        doc.get("cpu_temp_celsius") or 
        doc.get("cpu_temp")
    )
    adapted["cpu_temp_celsius"] = safe_get_number(cpu_temp, None)  # ✅ None instead of 0
    
    # Memory metrics
    adapted["memory_total_gb"] = safe_get_number(doc.get("memory_total_gb"), 0.0)
    adapted["memory_used_gb"] = safe_get_number(doc.get("memory_used_gb"), 0.0)
    adapted["memory_free_gb"] = safe_get_number(doc.get("memory_free_gb"), 0.0)
    adapted["memory_available_gb"] = safe_get_number(doc.get("memory_available_gb"), 0.0)
    adapted["memory_usage_percent"] = safe_get_number(doc.get("memory_usage_percent"), 0.0)
    
    # Disk metrics
    adapted["disk_total_gb"] = safe_get_number(doc.get("disk_total_gb"), 0.0)
    adapted["disk_used_gb"] = safe_get_number(doc.get("disk_used_gb"), 0.0)
    adapted["disk_free_gb"] = safe_get_number(doc.get("disk_free_gb"), 0.0)
    adapted["disk_usage_percent"] = safe_get_number(doc.get("disk_usage_percent"), 0.0)
    adapted["partitions"] = doc.get("partitions", [])
    
    # Network metrics - multiple fallback attempts
    adapted["network_bytes_sent"] = safe_get_number(
        doc.get("network_bytes_sent") or 
        doc.get("net_bytes_sent") or 
        doc.get("bytes_sent"), 
        0
    )
    adapted["network_bytes_recv"] = safe_get_number(
        doc.get("network_bytes_recv") or 
        doc.get("net_bytes_recv") or 
        doc.get("bytes_recv"), 
        0
    )
    adapted["network_packets_sent"] = safe_get_number(
        doc.get("network_packets_sent") or 
        doc.get("net_packets_sent") or 
        doc.get("packets_sent"), 
        0
    )
    adapted["network_packets_recv"] = safe_get_number(
        doc.get("network_packets_recv") or 
        doc.get("net_packets_recv") or 
        doc.get("packets_recv"), 
        0
    )
    
    # Network throughput - CRITICAL: ensure this is a number
    adapted["network_upload_mbps"] = safe_get_number(doc.get("network_upload_mbps"), 0.0)
    adapted["network_download_mbps"] = safe_get_number(doc.get("network_download_mbps"), 0.0)
    adapted["network_throughput_mbps"] = safe_get_number(
        doc.get("network_throughput_mbps"), 0.0
    )
    
    # System metrics
    adapted["load_avg_1min"] = safe_get_number(doc.get("load_avg_1min"), 0.0)
    adapted["load_avg_5min"] = safe_get_number(doc.get("load_avg_5min"), 0.0)
    adapted["load_avg_15min"] = safe_get_number(doc.get("load_avg_15min"), 0.0)
    adapted["ctx_switches"] = safe_get_number(doc.get("ctx_switches"), 0)
    adapted["interrupts"] = safe_get_number(doc.get("interrupts"), 0)
    
    # GPU
    adapted["gpu_available"] = doc.get("gpu_available", False)
    adapted["sensors_available"] = doc.get("sensors_available", False)
    
    return adapted


def adapt_heartbeat_document(doc: Dict) -> Dict:
    """
    Transform heartbeat from nested to flat structure
    
    ✅ IMPROVED: Better fallback handling
    """
    adapted = {
        "machine_id": doc.get("machine_id"),
        "hostname": doc.get("hostname"),
        "building": doc.get("building"),
        "room": doc.get("room"),
        "station": doc.get("station"),
    }
    
    # ✅ Returns None instead of "Unknown"
    adapted["cpu_model"] = doc.get("cpu_model") or None
    
    # Handle timestamp - convert string to datetime if needed
    timestamp = doc.get("timestamp")
    if isinstance(timestamp, str):
        try:
            from dateutil import parser
            adapted["timestamp"] = parser.isoparse(timestamp)
        except:
            adapted["timestamp"] = timestamp
    else:
        adapted["timestamp"] = timestamp
    
    # Flatten resources - with proper type handling
    resources = doc.get("resources", {})
    adapted["cpu_usage_percent"] = safe_get_number(resources.get("cpu_usage_percent"), 0.0)
    adapted["memory_usage_percent"] = safe_get_number(resources.get("memory_usage_percent"), 0.0)
    adapted["disk_usage_percent"] = safe_get_number(resources.get("disk_usage_percent"), 0.0)
    adapted["cpu_core_count"] = safe_get_number(resources.get("cpu_core_count"), 0)
    adapted["cpu_thread_count"] = safe_get_number(resources.get("cpu_thread_count"), 0)
    adapted["process_count"] = safe_get_number(resources.get("process_count"), 0)
    
    # Memory details
    adapted["memory_total_gb"] = safe_get_number(resources.get("memory_total_gb"), 0.0)
    adapted["memory_used_gb"] = safe_get_number(resources.get("memory_used_gb"), 0.0)
    adapted["memory_available_gb"] = safe_get_number(resources.get("memory_available_gb"), 0.0)
    
    # Disk details
    adapted["disk_total_gb"] = safe_get_number(resources.get("disk_total_gb"), 0.0)
    adapted["disk_used_gb"] = safe_get_number(resources.get("disk_used_gb"), 0.0)
    adapted["disk_free_gb"] = safe_get_number(resources.get("disk_free_gb"), 0.0)
    
    # CPU per-core usage
    adapted["cpu_per_core_usage"] = resources.get("cpu_usage_per_core", [])
    
    # Flatten user activity
    user_activity = doc.get("user_activity", {})
    adapted["active_users"] = safe_get_number(user_activity.get("active_users"), 0)
    adapted["unique_users"] = safe_get_number(user_activity.get("unique_users"), 0)
    adapted["user_status"] = user_activity.get("user_status") or "unknown"
    adapted["idle_time_minutes"] = safe_get_number(user_activity.get("idle_time_minutes"), 0)
    adapted["is_idle"] = user_activity.get("is_idle", False)
    adapted["sessions"] = user_activity.get("sessions", [])
    
    # Extract current user from sessions or user_list
    sessions = user_activity.get("sessions", [])
    current_user = None
    
    if sessions and len(sessions) > 0:
        current_user = sessions[0].get("user")
    else:
        user_list = user_activity.get("user_list", [])
        if user_list:
            current_user = user_list[0]
    
    adapted["current_username"] = current_user
    adapted["current_account"] = current_user
    
    network = doc.get("network", {})
    adapted["internet_accessible"] = network.get("internet_accessible", True)
    
    adapted["bytes_sent"] = safe_get_number(
        network.get("bytes_sent") or 
        network.get("network_bytes_sent") or 
        network.get("net_bytes_sent"), 
        0
    )
    adapted["bytes_recv"] = safe_get_number(
        network.get("bytes_recv") or 
        network.get("network_bytes_recv") or 
        network.get("net_bytes_recv"), 
        0
    )
    adapted["packets_sent"] = safe_get_number(
        network.get("packets_sent") or 
        network.get("network_packets_sent") or 
        network.get("net_packets_sent"), 
        0
    )
    adapted["packets_recv"] = safe_get_number(
        network.get("packets_recv") or 
        network.get("network_packets_recv") or 
        network.get("net_packets_recv"), 
        0
    )
    
    # Flatten status
    status = doc.get("status", {})
    if isinstance(status, dict):
        adapted["status"] = status.get("status", "unknown")
        adapted["boot_time"] = status.get("boot_time_iso")
        adapted["boot_time_epoch"] = safe_get_number(status.get("boot_time_epoch"), None)
        adapted["last_seen"] = status.get("last_seen_iso")
        adapted["last_seen_epoch"] = safe_get_number(status.get("last_seen_epoch"), None)
        adapted["uptime_seconds"] = safe_get_number(status.get("uptime_seconds"), 0)
    elif isinstance(status, str):
        adapted["status"] = status
        adapted["boot_time"] = doc.get("boot_time")
        adapted["boot_time_epoch"] = None
        adapted["last_seen"] = doc.get("last_seen")
        adapted["last_seen_epoch"] = None
        adapted["uptime_seconds"] = 0
    else:
        adapted["status"] = "unknown"
        adapted["boot_time"] = None
        adapted["boot_time_epoch"] = None
        adapted["last_seen"] = None
        adapted["last_seen_epoch"] = None
        adapted["uptime_seconds"] = 0
    
    # Flatten uptime
    uptime = doc.get("uptime", {})
    if isinstance(uptime, dict) and uptime:
        adapted["uptime_seconds"] = safe_get_number(uptime.get("uptime_seconds"), adapted.get("uptime_seconds", 0))
        adapted["uptime_days"] = safe_get_number(uptime.get("uptime_days"), 0)
        adapted["uptime_hours"] = safe_get_number(uptime.get("uptime_hours"), 0)
        adapted["uptime_human"] = uptime.get("uptime_human") or "Unknown"
    
    # Flatten health
    health = doc.get("health_summary", {})
    adapted["system_health"] = health.get("system_health", "unknown")
    adapted["health_score"] = safe_get_number(health.get("health_score"), 0)
    adapted["issues"] = health.get("issues", [])
    adapted["health_issues"] = health.get("alerts", [])
    
    # CPU temperature - returns None if not available
    cpu_temp = (
        doc.get("cpu_temperature_c") or 
        doc.get("cpu_temp_celsius") or 
        doc.get("cpu_temp")
    )
    adapted["cpu_temp_celsius"] = safe_get_number(cpu_temp, None)  # ✅ None instead of 0
    
    adapted["network_throughput_mbps"] = safe_get_number(doc.get("network_throughput_mbps"), 0.0)
    
    return adapted


def adapt_network_document(doc: Dict) -> Dict:
    """Transform network document with proper IP/MAC extraction"""
    adapted = {
        "machine_id": doc.get("machine_id"),
        "hostname": doc.get("hostname"),
        "building": doc.get("building"),
        "room": doc.get("room"),
        "timestamp": doc.get("timestamp"),
    }
    
    # Flatten interfaces
    interfaces = doc.get("interfaces", [])
    network_interfaces = []
    for iface in interfaces:
        flat_iface = {
            "name": iface.get("name"),
            "mac_address": iface.get("mac_address"),
            "is_up": iface.get("is_up", False),
            "speed_mbps": iface.get("speed_mbps", 0),
            "mtu": iface.get("mtu", 0)
        }
        addresses = iface.get("addresses", [])
        for addr in addresses:
            addr_type = addr.get("type", "").lower()
            if addr_type == "ipv4":
                flat_iface["ipv4"] = addr.get("address")
                flat_iface["netmask"] = addr.get("netmask")
            elif addr_type == "ipv6":
                flat_iface["ipv6"] = addr.get("address")
        network_interfaces.append(flat_iface)
    adapted["network_interfaces"] = network_interfaces
    
    # Flatten connectivity
    connectivity = doc.get("connectivity", {})
    adapted["internet_accessible"] = connectivity.get("internet_accessible", True)
    adapted["gateway_reachable"] = connectivity.get("gateway_reachable")
    adapted["dns_working"] = connectivity.get("dns_working")
    
    # Flatten traffic
    traffic = doc.get("traffic", {})
    adapted["bytes_sent"] = traffic.get("bytes_sent", 0)
    adapted["bytes_recv"] = traffic.get("bytes_recv", 0)
    adapted["packets_sent"] = traffic.get("packets_sent", 0)
    adapted["packets_recv"] = traffic.get("packets_recv", 0)
    
    # Extract primary IP/MAC from configuration
    config = doc.get("configuration", {})
    ip_addresses = config.get("ip_addresses", [])
    
    primary_ip = None
    primary_mac = None
    
    for ip_config in ip_addresses:
        interface = ip_config.get("interface", "")
        address = ip_config.get("address", "")
        
        # Skip loopback and WSL interfaces
        if "loopback" in interface.lower() or "wsl" in interface.lower():
            continue
        if address.startswith("127.") or address.startswith("172."):
            continue
            
        primary_ip = address
        primary_mac = ip_config.get("mac_address")
        break
    
    # Fallback: use first available
    if not primary_ip and ip_addresses:
        primary_ip = ip_addresses[0].get("address")
        primary_mac = ip_addresses[0].get("mac_address")
    
    # ✅ Return None instead of "Unknown" for consistency
    adapted["ip_address"] = primary_ip or None
    adapted["mac_address"] = primary_mac or None
    adapted["default_gateway"] = config.get("default_gateway")
    adapted["dns_servers"] = config.get("dns_servers", [])
    
    # Flatten performance
    performance = doc.get("performance", {})
    adapted["packet_loss_percent"] = performance.get("packet_loss_percent", 0)
    adapted["avg_latency_ms"] = performance.get("avg_latency_ms", 0)
    
    return adapted


def adapt_user_activity_document(doc: Dict) -> Dict:
    """
    Transform user activity document with proper active_user extraction
    
    ✅ FIXED: Improved fallback chain for active_user detection
    """
    adapted = {
        "machine_id": doc.get("machine_id"),
        "hostname": doc.get("hostname"),
        "building": doc.get("building"),
        "room": doc.get("room"),
        "timestamp": doc.get("timestamp"),
    }
    
    active_user = None
    
    user_summary = doc.get("user_summary", {})
    if user_summary and isinstance(user_summary, dict):
        active_user = user_summary.get("current_user")
        adapted["unique_users"] = user_summary.get("unique_users", 0)
        adapted["total_sessions"] = user_summary.get("total_sessions", 0)
    
    if not active_user:
        active_user = doc.get("active_user")
    
    if not active_user:
        active_sessions = doc.get("active_sessions", [])
        if active_sessions and len(active_sessions) > 0:
            first_session = active_sessions[0]
            if isinstance(first_session, dict):
                active_user = first_session.get("user")
    
    if not active_user and user_summary:
        user_list = user_summary.get("user_list", [])
        if user_list:
            active_user = user_list[0]
    
    # Set all user field variants
    adapted["active_user"] = active_user
    adapted["current_username"] = active_user
    adapted["current_account"] = active_user
    
    # Sessions
    active_sessions = doc.get("active_sessions", [])
    adapted["sessions"] = active_sessions
    
    # Calculate session duration
    if active_sessions:
        first_session = active_sessions[0]
        started = first_session.get("started_iso")
        if started:
            try:
                start_time = datetime.fromisoformat(started.replace('Z', '+00:00'))
                now = datetime.now(start_time.tzinfo)
                duration = (now - start_time).total_seconds()
                adapted["session_duration_seconds"] = int(duration)
            except:
                adapted["session_duration_seconds"] = 0
        adapted["login_time"] = started
    else:
        adapted["session_duration_seconds"] = 0
        adapted["login_time"] = None
    
    adapted["login_history_24h"] = doc.get("login_history_24h", [])
    
    return adapted


def adapt_document(doc: Dict, collection_type: str) -> Dict:
    """
    Main adapter dispatcher with error handling
    """
    if not doc:
        return {}
    
    if not isinstance(doc, dict):
        logger.error(f"adapt_document received non-dict type: {type(doc)} for {collection_type}")
        return {}
    
    doc = clean_objectid(doc)
    
    adapters = {
        "heartbeat": adapt_heartbeat_document,
        "hardware": adapt_hardware_document,
        "network": adapt_network_document,
        "user_activity": adapt_user_activity_document,
        "specs": adapt_specs_document,
    }
    
    adapter_func = adapters.get(collection_type)
    if adapter_func:
        try:
            adapted = adapter_func(doc)
            adapted = clean_objectid(adapted)
            return adapted
        except Exception as e:
            logger.error(f"Error adapting {collection_type}: {e}", exc_info=True)
            return clean_objectid(doc)
    
    return clean_objectid(doc)
