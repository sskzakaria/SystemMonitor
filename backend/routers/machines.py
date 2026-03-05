"""
Machine management endpoints - UPDATED WITH USER ACTIVITY INTEGRATION
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from datetime import datetime, timezone, timedelta
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from utils.helpers import calculate_machine_status_with_heartbeat
from utils.status_calculator import calculate_machine_status, get_user_status_summary

router = APIRouter(prefix="/api/v1", tags=["machines"])
logger = logging.getLogger("university_monitoring")


def extract_primary_ip(network_data: dict) -> str:
    """Extract primary IP address from network interfaces"""
    if not network_data:
        return "N/A"
    
    interfaces = network_data.get('interfaces', [])
    if not interfaces:
        return "N/A"
    
    # Try to find a non-loopback IPv4 address
    for iface in interfaces:
        ipv4_addresses = iface.get('ipv4_addresses', [])
        for ip in ipv4_addresses:
            if not ip.startswith('127.'):
                return ip
    
    # Fallback to first IPv4 address found
    for iface in interfaces:
        ipv4_addresses = iface.get('ipv4_addresses', [])
        if ipv4_addresses:
            return ipv4_addresses[0]
    
    return "N/A"


def count_failed_logins(event_log_data: dict) -> int:
    """Count failed login attempts from event log data"""
    if not event_log_data:
        return 0
    
    failed_logins = event_log_data.get('failed_logins_24h', [])
    return len(failed_logins)


def get_security_status(security_data: dict) -> dict:
    """Extract security status summary"""
    if not security_data:
        return {
            'overall_status': 'unknown',
            'antivirus_enabled': None,
            'firewall_enabled': None,
            'updates_pending': None
        }
    
    # Handle both dict and nested structures
    # The security data might have antivirus/firewall as lists (from agent)
    antivirus_data = security_data.get('antivirus', {})
    if isinstance(antivirus_data, list):
        # If it's a list, take the first item
        antivirus_data = antivirus_data[0] if antivirus_data else {}
    
    firewall_data = security_data.get('firewall', {})
    if isinstance(firewall_data, list):
        firewall_data = firewall_data[0] if firewall_data else {}
    
    windows_update_data = security_data.get('windows_update', {})
    if isinstance(windows_update_data, list):
        windows_update_data = windows_update_data[0] if windows_update_data else {}
    
    return {
        'overall_status': security_data.get('overall_status', 'unknown'),
        'antivirus_enabled': antivirus_data.get('enabled') if isinstance(antivirus_data, dict) else None,
        'antivirus_name': antivirus_data.get('product_name') if isinstance(antivirus_data, dict) else None,
        'firewall_enabled': firewall_data.get('enabled') if isinstance(firewall_data, dict) else None,
        'updates_pending': windows_update_data.get('updates_pending', 0) if isinstance(windows_update_data, dict) else 0,
        'last_scan': antivirus_data.get('last_scan_time') if isinstance(antivirus_data, dict) else None
    }


def calculate_uptime_seconds(boot_time_epoch: int) -> int:
    """Calculate uptime in seconds from boot time epoch"""
    logger.info(f"🔍 calculate_uptime_seconds received boot_time_epoch: {boot_time_epoch}")
    
    if not boot_time_epoch:
        return 0
    
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    uptime = now_epoch - boot_time_epoch
    logger.info(f"✅ Calculated uptime: {uptime}s (boot: {boot_time_epoch}, now: {now_epoch})")
    return max(0, uptime)


@router.get("/machines")
async def get_machines(
    building: Optional[str] = None,
    room: Optional[str] = None,
    status: Optional[str] = None,
    user: OptionalUser = Depends(get_optional_user)
):
    """Get all machines with real-time status calculation and user activity"""
    try:
        # Build query
        query = {}
        if building:
            query["building"] = building
        if room:
            query["room"] = room
        
        # Get heartbeat data
        heartbeat_cursor = db_manager.mongodb_db.heartbeat_monitor_latest.find(query)
        heartbeat_docs = await heartbeat_cursor.to_list(length=None)
        
        # Get specs data (for hardware comparison)
        specs_cursor = db_manager.mongodb_db.specs_monitor_latest.find({})
        specs_docs = await specs_cursor.to_list(length=None)
        
        # ✅ Get network data (for IP extraction)
        network_cursor = db_manager.mongodb_db.network_monitor_latest.find({})
        network_docs = await network_cursor.to_list(length=None)
        
        # ✅ NEW: Get user activity data
        user_activity_cursor = db_manager.mongodb_db.user_activity_monitor_latest.find({})
        user_activity_docs = await user_activity_cursor.to_list(length=None)
        
        # Create lookup dictionaries
        specs_by_machine = {doc['machine_id']: doc for doc in specs_docs}
        network_by_machine = {doc['machine_id']: doc for doc in network_docs}
        user_activity_by_machine = {doc['machine_id']: doc for doc in user_activity_docs}
        
        # ✅ Get event log and security data for alerts
        event_log_cursor = db_manager.mongodb_db.event_log_monitor_latest.find({})
        event_log_docs = await event_log_cursor.to_list(length=None)
        event_log_by_machine = {doc['machine_id']: doc for doc in event_log_docs}
        
        security_cursor = db_manager.mongodb_db.security_software_monitor_latest.find({})
        security_docs = await security_cursor.to_list(length=None)
        security_by_machine = {doc['machine_id']: doc for doc in security_docs}
        
        machines = []
        for doc in heartbeat_docs:
            machine_id = doc.get('machine_id')
            
            # Get related data
            machine_specs = specs_by_machine.get(machine_id, {})
            network_from_collection = network_by_machine.get(machine_id, {})
            user_activity_data = user_activity_by_machine.get(machine_id, {})
            event_log_data = event_log_by_machine.get(machine_id, {})
            security_data = security_by_machine.get(machine_id, {})
            
            # ✅ USE STATUS CALCULATOR - Properly determines online/idle/offline
            machine_status = calculate_machine_status(
                doc,
                user_activity_data,
                offline_threshold_minutes=5
            )
            
            # ✅ GET USER STATUS SUMMARY - Gets session duration, idle time, etc.
            user_summary = get_user_status_summary(user_activity_data, doc)
            
            # Extract data from nested structure
            system_data = doc.get('system', {})
            network_data = doc.get('network', {})  # This is from heartbeat (minimal)
            
            # ✅ Calculate uptime from boot_time_epoch (check heartbeat first)
            boot_time_epoch = (
                doc.get('uptime', {}).get('boot_time_epoch') or
                doc.get('status', {}).get('boot_time_epoch') or
                system_data.get('boot_time_epoch', 0)
            )
            uptime_seconds = calculate_uptime_seconds(boot_time_epoch)
            
            # ✅ Extract IP address from network collection (not heartbeat!)
            ip_address = extract_primary_ip(network_from_collection or network_data)
            
            # ✅ Extract current user from user activity data
            current_user = None
            active_sessions = []
            has_active_users = False
            session_duration_minutes = 0
            
            if user_activity_data:
                current_user = (
                    user_activity_data.get('active_user') or
                    user_activity_data.get('user_summary', {}).get('current_user')
                )
                active_sessions = user_activity_data.get('active_sessions', [])
                has_active_users = user_activity_data.get('user_summary', {}).get('has_active_users', False)
                
                # Calculate session duration from login_history_24h
                login_history = user_activity_data.get('login_history_24h', [])
                if login_history and len(login_history) > 0:
                    latest_session = login_history[0]
                    duration_seconds = latest_session.get('duration_seconds', 0)
                    session_duration_minutes = duration_seconds // 60 if duration_seconds else 0
            
            # ✅ Count failed logins
            failed_login_count = count_failed_logins(event_log_data)
            
            # ✅ Get security status
            security_status = get_security_status(security_data)
            
            # Build enhanced response
            machine_data = {
                "machine_id": machine_id,
                "hostname": doc.get('hostname', machine_id),
                "building": doc.get('building', 'Unknown'),
                "room": doc.get('room', 'Unknown'),
                "location": doc.get('location', f"{doc.get('building', 'Unknown')} - Room {doc.get('room', 'Unknown')}"),
                "tags": doc.get('tags', []),
                "groups": doc.get('groups', []),
                
                # CRITICAL: Send last_heartbeat so frontend can validate
                "last_heartbeat": doc.get('timestamp') or doc.get('last_heartbeat') or doc.get('received_at'),
                "timestamp": doc.get('timestamp') or doc.get('received_at'),
                
                # Status with real-time calculation INCLUDING USER ACTIVITY
                "status": {
                    "state": machine_status,
                    "uptime_seconds": uptime_seconds,
                    "last_boot": system_data.get('boot_time_iso')
                },
                
                # Resources
                "resources": {
                    "cpu_usage": doc.get('cpu_usage_percent', 0),
                    "memory_usage": doc.get('memory_usage_percent', 0),
                    "disk_usage_percent": doc.get('disk_usage_percent', 0),
                    "cpu_temperature": doc.get('cpu_temperature_celsius'),
                    "cpu_model": machine_specs.get('cpu_model'),
                },
                
                # Specs data for hardware comparison
                "specs": {
                    "cpu_model": machine_specs.get('cpu_model', 'Unknown'),
                    "cpu_cores": machine_specs.get('cpu_cores', 0),
                    "cpu_frequency_mhz": machine_specs.get('cpu_frequency_mhz', 0),
                    "memory_total_gb": machine_specs.get('memory_total_gb', 0),
                    "memory_type": machine_specs.get('memory_type', 'Unknown'),
                    "disk_total_gb": machine_specs.get('disk_total_gb', 0),
                    "os_type": machine_specs.get('os_type', 'Unknown'),
                    "os_version": machine_specs.get('os_version', 'Unknown'),
                },
                
                # Network - extracted from interfaces
                "network": {
                    "ip_address": ip_address,
                    "upload_mbps": doc.get('network_upload_mbps', 0),
                    "download_mbps": doc.get('network_download_mbps', 0),
                },
                
                # ✅ User activity - NOW FROM CORRECT COLLECTION!
                "user_activity": {
                    "current_username": current_user,
                    "current_account": current_user,
                    "active_user": current_user,
                    "has_active_users": has_active_users,
                    "active_sessions": active_sessions,
                    "last_login": user_activity_data.get('login_history_24h', [{}])[0].get('login_time_iso') if user_activity_data and user_activity_data.get('login_history_24h') else None,
                    "session_duration_seconds": user_activity_data.get('login_history_24h', [{}])[0].get('duration_seconds') if user_activity_data and user_activity_data.get('login_history_24h') else None,
                    "session_duration_minutes": session_duration_minutes  # ✅ Added for frontend display
                },
                
                # ✅ Security alerts
                "alerts": {
                    "failed_login_count": failed_login_count
                },
                
                # ✅ Security status
                "security": security_status,
                
                # Health
                "health": {
                    "status": doc.get('health_status', 'healthy'),
                    "score": doc.get('health_score', 100)
                }
            }
            
            # Filter by status if requested
            if status and machine_status != status:
                continue
            
            machines.append(machine_data)
        
        logger.info(f"✅ Returned {len(machines)} machines (filtered from {len(heartbeat_docs)} total)")
        return {"machines": machines, "total": len(machines)}
        
    except Exception as e:
        logger.error(f"Error getting machines: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}")
async def get_machine_details(
    machine_id: str,
    user: OptionalUser = Depends(get_optional_user)
):
    """Get detailed information for a specific machine with user activity"""
    try:
        # Get heartbeat data
        heartbeat_doc = await db_manager.mongodb_db.heartbeat_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        if not heartbeat_doc:
            raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
        
        # ✅ Fetch specs, network, hardware, and USER ACTIVITY data in parallel
        specs_doc = await db_manager.mongodb_db.specs_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        network_doc = await db_manager.mongodb_db.network_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        hardware_doc = await db_manager.mongodb_db.hardware_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        # ✅ NEW: Fetch user activity data
        user_activity_doc = await db_manager.mongodb_db.user_activity_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        # ✅ NEW: Fetch event log and security data
        event_log_doc = await db_manager.mongodb_db.event_log_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        security_doc = await db_manager.mongodb_db.security_software_monitor_latest.find_one({
            "machine_id": machine_id
        })
        
        # ✅ Extract data from the CORRECT collections
        system_data = heartbeat_doc.get('system', {}) or specs_doc.get('system', {}) if specs_doc else {}
        network_data = network_doc if network_doc else heartbeat_doc.get('network', {})
        
        # ✅ Calculate uptime from boot_time_epoch (check multiple sources)
        boot_time_epoch = (
            heartbeat_doc.get('uptime', {}).get('boot_time_epoch') or
            heartbeat_doc.get('status', {}).get('boot_time_epoch') or
            system_data.get('boot_time_epoch') or 
            specs_doc.get('boot_time_epoch') if specs_doc else None or
            hardware_doc.get('boot_time_epoch') if hardware_doc else None
        )
        
        uptime_seconds = calculate_uptime_seconds(boot_time_epoch) if boot_time_epoch else 0
        
        # ✅ Extract primary IP from network collection
        ip_address = (
            network_data.get('ip_address') or
            extract_primary_ip(network_data) or
            'Unknown'
        )
        
        # ✅ Determine status based on heartbeat AND user activity
        real_status = calculate_machine_status(
            heartbeat_doc,
            user_activity_doc,
            offline_threshold_minutes=5
        )
        
        # ✅ Extract current user from user activity data
        current_user = None
        active_sessions = []
        has_active_users = False
        session_duration_minutes = 0
        
        if user_activity_doc:
            current_user = (
                user_activity_doc.get('active_user') or
                user_activity_doc.get('user_summary', {}).get('current_user')
            )
            active_sessions = user_activity_doc.get('active_sessions', [])
            has_active_users = user_activity_doc.get('user_summary', {}).get('has_active_users', False)
            
            # Calculate session duration from login_history_24h
            login_history = user_activity_doc.get('login_history_24h', [])
            if login_history and len(login_history) > 0:
                latest_session = login_history[0]
                duration_seconds = latest_session.get('duration_seconds', 0)
                session_duration_minutes = duration_seconds // 60 if duration_seconds else 0
        
        # ✅ Count failed logins from event log data
        failed_login_count = count_failed_logins(event_log_doc)
        
        # ✅ Get security status from security data
        security_status = get_security_status(security_doc)
        
        logger.info(f"🔍 Machine {machine_id}: status={real_status}, ip={ip_address}, uptime={uptime_seconds}s, user={current_user}")
        
        # Build enhanced response
        machine_data = {
            "machine_id": machine_id,
            "hostname": heartbeat_doc.get('hostname', machine_id),
            "building": heartbeat_doc.get('building', 'Unknown'),
            "room": heartbeat_doc.get('room', 'Unknown'),
            "location": heartbeat_doc.get('location', f"{heartbeat_doc.get('building', 'Unknown')} - Room {heartbeat_doc.get('room', 'Unknown')}"),
            "tags": heartbeat_doc.get('tags', []),
            "groups": heartbeat_doc.get('groups', []),
            
            # CRITICAL: Send last_heartbeat
            "last_heartbeat": heartbeat_doc.get('timestamp') or heartbeat_doc.get('last_heartbeat') or heartbeat_doc.get('received_at'),
            "timestamp": heartbeat_doc.get('timestamp') or heartbeat_doc.get('received_at'),
            
            # Status with real-time calculation INCLUDING USER ACTIVITY
            "status": {
                "state": real_status,
                "uptime_seconds": uptime_seconds,
                "last_boot": system_data.get('boot_time_iso')
            },
            
            # Resources
            "resources": {
                "cpu_usage": heartbeat_doc.get('cpu_usage_percent', 0),
                "memory_usage": heartbeat_doc.get('memory_usage_percent', 0),
                "disk_usage_percent": heartbeat_doc.get('disk_usage_percent', 0),
                "cpu_temperature": heartbeat_doc.get('cpu_temperature_celsius'),
                "cpu_model": specs_doc.get('cpu_model') if specs_doc else None,
            },
            
            # Full specs data
            "specs": specs_doc if specs_doc else {},
            
            # Network - return full network data + extracted IP
            "network": {
                "ip_address": ip_address,
                "upload_mbps": heartbeat_doc.get('network_upload_mbps', 0),
                "download_mbps": heartbeat_doc.get('network_download_mbps', 0),
            },
            
            # ✅ User activity - NOW FROM CORRECT COLLECTION!
            "user_activity": {
                "current_username": current_user,
                "current_account": current_user,
                "active_user": current_user,
                "has_active_users": has_active_users,
                "active_sessions": active_sessions,
                "last_login": user_activity_doc.get('login_history_24h', [{}])[0].get('login_time_iso') if user_activity_doc and user_activity_doc.get('login_history_24h') else None,
                "session_duration_seconds": user_activity_doc.get('login_history_24h', [{}])[0].get('duration_seconds') if user_activity_doc and user_activity_doc.get('login_history_24h') else None,
                "session_duration_minutes": session_duration_minutes  # ✅ Added for frontend display
            },
            
            # ✅ Security alerts
            "alerts": {
                "failed_login_count": failed_login_count
            },
            
            # ✅ Security status
            "security": security_status,
            
            # Health
            "health": {
                "status": heartbeat_doc.get('health_status', 'healthy'),
                "score": heartbeat_doc.get('health_score', 100)
            },
            
            # Include system data
            "system": system_data
        }
        
        return machine_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting machine {machine_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ADDITIONAL ENDPOINTS (specs, hardware, history, security, etc.)
# ============================================================================

@router.get("/machines/{machine_id}/specs")
async def get_machine_specs(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get machine specifications (static hardware data)"""
    try:
        specs_doc = await db_manager.mongodb_db.specs_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not specs_doc:
            raise HTTPException(status_code=404, detail=f"Specs not found for {machine_id}")
        
        return specs_doc
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching specs for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/hardware")
async def get_machine_hardware(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get machine hardware metrics (dynamic resource usage)"""
    try:
        hardware_doc = await db_manager.mongodb_db.hardware_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not hardware_doc:
            raise HTTPException(status_code=404, detail=f"Hardware data not found for {machine_id}")
        
        return hardware_doc
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hardware for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/history")
async def get_machine_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=720),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get historical hardware metrics for a machine"""
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        # Query hardware history collection
        cursor = db_manager.mongodb_db.hardware_monitor_history.find(
            {
                "machine_id": machine_id,
                "timestamp": {"$gte": since}
            },
            {"_id": 0}
        ).sort("timestamp", 1).limit(1000)
        
        history = await cursor.to_list(length=1000)
        
        return {
            "machine_id": machine_id,
            "hours": hours,
            "data_points": len(history),
            "history": history
        }
        
    except Exception as e:
        logger.error(f"Error fetching history for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/security")
async def get_machine_security(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get security software status for a machine"""
    try:
        security_doc = await db_manager.mongodb_db.security_software_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not security_doc:
            return {
                "machine_id": machine_id,
                "antivirus": [],
                "firewall": {},
                "windows_defender": {},
                "timestamp": None
            }
        
        return security_doc
        
    except Exception as e:
        logger.error(f"Error fetching security for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/machines/{machine_id}/tags")
async def update_machine_tags(
    machine_id: str = Path(...),
    request: dict = None,
    user: OptionalUser = Depends(get_optional_user)
):
    """Update machine tags"""
    tags = request.get("tags", []) if request else []
    
    result = await db_manager.mongodb_db.heartbeat_monitor_latest.update_one(
        {"machine_id": machine_id},
        {"$set": {"tags": tags}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    return {"status": "updated", "tags": tags}


@router.get("/machines/{machine_id}/peripherals")
async def get_machine_peripherals(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get peripheral devices for a machine (merged from peripherals + usb_devices collections)"""
    try:
        # Query BOTH collections
        peripheral_data = await db_manager.mongodb_db.peripherals_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        usb_data = await db_manager.mongodb_db.usb_devices_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        # Build the response by merging both sources
        result = {
            "machine_id": machine_id,
            "usb_devices": [],
            "devices_by_category": {
                "storage": [],
                "input": [],
                "printers": [],
                "hubs": []
            },
            "displays": [],
            "audio": {
                "input_devices": [],
                "output_devices": []
            },
            "timestamp": None
        }
        
        # Merge peripheral_data (displays, audio, etc.)
        if peripheral_data:
            result["displays"] = peripheral_data.get("displays", [])
            result["audio"] = peripheral_data.get("audio", {
                "input_devices": [],
                "output_devices": []
            })
            result["timestamp"] = peripheral_data.get("timestamp")
            
            # Some peripheral data might have devices_by_category
            if "devices_by_category" in peripheral_data:
                result["devices_by_category"] = peripheral_data["devices_by_category"]
        
        # Merge usb_data (USB devices)
        if usb_data:
            # USB devices might be in different formats
            if "usb_devices" in usb_data:
                result["usb_devices"] = usb_data["usb_devices"]
            elif "devices" in usb_data:
                result["usb_devices"] = usb_data["devices"]
            
            # Merge devices_by_category if present
            if "devices_by_category" in usb_data:
                for category, devices in usb_data["devices_by_category"].items():
                    if category in result["devices_by_category"]:
                        result["devices_by_category"][category].extend(devices)
                    else:
                        result["devices_by_category"][category] = devices
            
            # Update timestamp if usb_data is newer
            if usb_data.get("timestamp") and (not result["timestamp"] or usb_data["timestamp"] > result["timestamp"]):
                result["timestamp"] = usb_data["timestamp"]
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching peripherals for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/events")
async def get_machine_events(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get event logs for a machine"""
    try:
        # Query the event_log_monitor_latest collection
        event_data = await db_manager.mongodb_db.event_log_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not event_data:
            # Return empty structure
            return {
                "machine_id": machine_id,
                "application_events": [],
                "system_events": [],
                "security_events": [],
                "critical_events": [],
                "summary": {
                    "system": {"errors": 0, "warnings": 0, "information": 0},
                    "security": {"audit_success": 0, "audit_failure": 0},
                    "application": {"errors": 0, "warnings": 0, "information": 0},
                    "total_errors": 0,
                    "total_warnings": 0
                },
                "total_application_events": 0,
                "total_system_events": 0,
                "total_security_events": 0,
                "total_critical_events": 0,
                "timestamp": None
            }
        
        return event_data
        
    except Exception as e:
        logger.error(f"Error fetching events for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/sessions")
async def get_machine_sessions(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get user session data for a machine"""
    try:
        # Query the user_activity_monitor_latest collection
        session_data = await db_manager.mongodb_db.user_activity_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not session_data:
            return {
                "machine_id": machine_id,
                "active_sessions": [],
                "user_summary": {
                    "current_user": None,
                    "total_sessions": 0,
                    "unique_users": 0,
                    "user_list": [],
                    "has_active_users": False
                },
                "timestamp": None
            }
        
        return session_data
        
    except Exception as e:
        logger.error(f"Error fetching sessions for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/applications")
async def get_machine_applications(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get installed applications for a machine"""
    try:
        # Query the applications_monitor_latest collection
        app_data = await db_manager.mongodb_db.applications_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        if not app_data:
            return {
                "machine_id": machine_id,
                "installed_applications": [],
                "total_count": 0,
                "timestamp": None
            }
        
        return app_data
        
    except Exception as e:
        logger.error(f"Error fetching applications for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# BULK OPERATIONS
# ============================================================================

@router.post("/machines/bulk/tags")
async def bulk_add_tags(
    request: dict,
    user: OptionalUser = Depends(get_optional_user)
):
    """Add tags to multiple machines"""
    try:
        machine_ids = request.get("machine_ids", [])
        tags = request.get("tags", [])
        
        if not machine_ids or not tags:
            raise HTTPException(status_code=400, detail="machine_ids and tags are required")
        
        result = await db_manager.mongodb_db.heartbeat_monitor_latest.update_many(
            {"machine_id": {"$in": machine_ids}},
            {"$addToSet": {"tags": {"$each": tags}}}
        )
        
        return {
            "success": True,
            "updated_count": result.modified_count,
            "machine_ids": machine_ids,
            "tags": tags
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk adding tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/groups")
async def bulk_add_to_group(
    request: dict,
    user: OptionalUser = Depends(get_optional_user)
):
    """Add multiple machines to a group"""
    try:
        machine_ids = request.get("machine_ids", [])
        group_name = request.get("group_name")
        
        if not machine_ids or not group_name:
            raise HTTPException(status_code=400, detail="machine_ids and group_name are required")
        
        result = await db_manager.mongodb_db.heartbeat_monitor_latest.update_many(
            {"machine_id": {"$in": machine_ids}},
            {"$addToSet": {"groups": group_name}}
        )
        
        return {
            "success": True,
            "updated_count": result.modified_count,
            "machine_ids": machine_ids,
            "group_name": group_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk adding to group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FLEET STATISTICS & METADATA
# ============================================================================

@router.get("/fleet/averages")
async def get_fleet_averages(
    building: Optional[str] = None,
    user: OptionalUser = Depends(get_optional_user)
):
    """Get fleet-wide average metrics"""
    try:
        query = {}
        if building:
            query["building"] = building
        
        # Aggregate statistics from heartbeat collection
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "avg_cpu": {"$avg": "$cpu_usage_percent"},
                "avg_memory": {"$avg": "$memory_usage_percent"},
                "avg_disk": {"$avg": "$disk_usage_percent"},
                "avg_health_score": {"$avg": "$health_score"},
                "total_machines": {"$sum": 1},
                "online_count": {
                    "$sum": {"$cond": [{"$ne": ["$timestamp", None]}, 1, 0]}
                }
            }}
        ]
        
        cursor = db_manager.mongodb_db.heartbeat_monitor_latest.aggregate(pipeline)
        result = await cursor.to_list(length=1)
        
        if not result:
            return {
                "avg_cpu": 0,
                "avg_memory": 0,
                "avg_disk": 0,
                "avg_health_score": 100,
                "total_machines": 0,
                "online_count": 0
            }
        
        stats = result[0]
        stats.pop("_id", None)
        
        return stats
        
    except Exception as e:
        logger.error(f"Error fetching fleet averages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/buildings")
async def get_buildings(user: OptionalUser = Depends(get_optional_user)):
    """Get list of all buildings"""
    try:
        buildings = await db_manager.mongodb_db.heartbeat_monitor_latest.distinct("building")
        return {"buildings": [b for b in buildings if b]}
        
    except Exception as e:
        logger.error(f"Error fetching buildings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags")
async def get_all_tags(user: OptionalUser = Depends(get_optional_user)):
    """Get all unique tags"""
    try:
        tags = await db_manager.mongodb_db.heartbeat_monitor_latest.distinct("tags")
        return {"tags": [t for t in tags if t]}
        
    except Exception as e:
        logger.error(f"Error fetching tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/groups")
async def get_all_groups(user: OptionalUser = Depends(get_optional_user)):
    """Get all unique groups"""
    try:
        groups = await db_manager.mongodb_db.heartbeat_monitor_latest.distinct("groups")
        return {"groups": [g for g in groups if g]}
        
    except Exception as e:
        logger.error(f"Error fetching groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DEBUG ENDPOINTS
# ============================================================================

@router.get("/debug/machines/{machine_id}/usb-raw")
async def debug_usb_devices(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """DEBUG: See raw USB devices data from both collections"""
    try:
        # Query peripherals collection
        peripheral_data = await db_manager.mongodb_db.peripherals_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        # Query USB devices collection
        usb_data = await db_manager.mongodb_db.usb_devices_monitor_latest.find_one(
            {"machine_id": machine_id},
            {"_id": 0}
        )
        
        return {
            "machine_id": machine_id,
            "peripherals_collection": peripheral_data,
            "usb_devices_collection": usb_data,
            "has_peripherals": peripheral_data is not None,
            "has_usb_data": usb_data is not None,
            "peripheral_keys": list(peripheral_data.keys()) if peripheral_data else [],
            "usb_keys": list(usb_data.keys()) if usb_data else []
        }
        
    except Exception as e:
        logger.error(f"Error in debug endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))