"""
machines_with_transformer.py - Updated machine endpoints with data transformation

INTEGRATION GUIDE:
1. Rename existing machines.py → machines_old.py (backup)
2. Rename this file → machines.py
3. Update main.py to initialize transformer
4. Restart backend

This adds transformation layer to the following endpoints:
- GET /api/v1/machines/{machine_id}  (heartbeat data)
- GET /api/v1/machines/{machine_id}/specs
- GET /api/v1/machines/{machine_id}/network
- GET /api/v1/machines/{machine_id}/user-activity
- GET /api/v1/machines/{machine_id}/logs
- GET /api/v1/machines/{machine_id}/processes
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from datetime import datetime, timezone, timedelta
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from utils.helpers import calculate_machine_status_with_heartbeat
from utils.status_calculator import calculate_machine_status, get_user_status_summary
from utils.data_transformer import get_transformer  # ← NEW IMPORT

router = APIRouter(prefix="/api/v1", tags=["machines"])
logger = logging.getLogger("university_monitoring")


# ============================================================================
# HEARTBEAT / MAIN DETAILS (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}")
async def get_machine_details(
    machine_id: str,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine details with real-time heartbeat data.
    
    **TRANSFORMATION APPLIED:**
    - Flattens nested heartbeat structure (resources, network, status, health_summary)
    """
    try:
        # Get latest heartbeat
        heartbeat = await db_manager.db.heartbeat.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not heartbeat:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_heartbeat = transformer.transform_heartbeat(heartbeat)
        
        # Get other data
        specs = await db_manager.db.specs.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        network = await db_manager.db.network.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        # Calculate status
        status_info = await calculate_machine_status_with_heartbeat(
            machine_id, heartbeat
        )
        
        return {
            "machine_id": machine_id,
            "heartbeat": transformed_heartbeat,  # ← Transformed!
            "specs": specs,
            "network": network,
            "status": status_info,
            "last_seen": heartbeat.get("timestamp")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching machine {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SPECS (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}/specs")
async def get_machine_specs(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine hardware specifications.
    
    **TRANSFORMATION APPLIED:**
    - Flattens storage.partitions → storage (array)
    - Converts CPU MHz → GHz
    - Derives memory_speed_mhz from first module
    """
    try:
        specs = await db_manager.db.specs.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not specs:
            return {"error": "No specs data available", "machine_id": machine_id}
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_specs = transformer.transform_specs(specs)
        
        return transformed_specs
        
    except Exception as e:
        logger.error(f"Error fetching specs for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# NETWORK (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}/network")
async def get_machine_network(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine network information.
    
    **TRANSFORMATION APPLIED:**
    - Merges MAC addresses from specs
    - Adds connection_type detection
    - Adds signal_strength placeholder
    """
    try:
        network = await db_manager.db.network.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not network:
            return {"error": "No network data available", "machine_id": machine_id}
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_network = await transformer.transform_network(network, machine_id)
        
        return transformed_network
        
    except Exception as e:
        logger.error(f"Error fetching network for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# USER ACTIVITY (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}/user-activity")
async def get_machine_user_activity(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine user activity information.
    
    **TRANSFORMATION APPLIED:**
    - Renames active_user → current_username
    - Provides both login_history and login_history_24h
    - Provides sessions alias for active_sessions
    """
    try:
        user_activity = await db_manager.db.user_activity.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not user_activity:
            return {"error": "No user activity data available", "machine_id": machine_id}
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_activity = transformer.transform_user_activity(user_activity)
        
        return transformed_activity
        
    except Exception as e:
        logger.error(f"Error fetching user activity for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LOGIN HISTORY (FOR SecurityTab)
# ============================================================================

@router.get("/machines/{machine_id}/login-history")
async def get_machine_login_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),  # 1-168 hours (1 week max)
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get login history for SecurityTab.
    
    **TRANSFORMATION APPLIED:**
    - Returns login_history in format SecurityTab expects
    """
    try:
        user_activity = await db_manager.db.user_activity.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not user_activity:
            return {"sessions": [], "login_history_24h": []}
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed = transformer.transform_user_activity(user_activity)
        
        # Return both formats for SecurityTab compatibility
        return {
            "sessions": transformed.get("login_history", []),
            "login_history_24h": transformed.get("login_history_24h", []),
            "login_history": transformed.get("login_history", [])
        }
        
    except Exception as e:
        logger.error(f"Error fetching login history for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LOGS (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}/logs")
async def get_machine_logs(
    machine_id: str = Path(...),
    log_type: Optional[str] = Query(None, regex="^(system|security|application|critical)$"),
    limit: int = Query(100, ge=1, le=1000),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine event logs.
    
    **TRANSFORMATION APPLIED:**
    - Maps system_events → system
    - Maps security_events → security
    - Maps application_events → application
    """
    try:
        event_logs = await db_manager.db.event_logs.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not event_logs:
            return {
                "system": [],
                "security": [],
                "application": [],
                "critical": []
            }
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_logs = transformer.transform_event_logs(event_logs)
        
        # Filter by log_type if specified
        if log_type:
            logs = transformed_logs.get(log_type, [])
            return {log_type: logs[:limit]}
        
        # Return all logs
        return {
            "system": transformed_logs.get("system", [])[:limit],
            "security": transformed_logs.get("security", [])[:limit],
            "application": transformed_logs.get("application", [])[:limit],
            "critical": transformed_logs.get("critical", [])[:limit]
        }
        
    except Exception as e:
        logger.error(f"Error fetching logs for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PROCESSES (WITH TRANSFORMATION)
# ============================================================================

@router.get("/machines/{machine_id}/processes")
async def get_machine_processes(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine process/application information.
    
    **TRANSFORMATION APPLIED:**
    - Maps process_summary → summary
    - Maps top_by_cpu → top_cpu
    - Maps top_by_memory → top_memory
    - Maps application_categories → categories
    """
    try:
        application = await db_manager.db.application.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not application:
            return {
                "summary": {"total_processes": 0},
                "top_cpu": [],
                "top_memory": [],
                "categories": {}
            }
        
        # ✨ APPLY TRANSFORMATION ✨
        transformer = get_transformer()
        transformed_processes = transformer.transform_application(application)
        
        return transformed_processes
        
    except Exception as e:
        logger.error(f"Error fetching processes for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HARDWARE (PASS-THROUGH - Already perfect!)
# ============================================================================

@router.get("/machines/{machine_id}/hardware")
async def get_machine_hardware(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine hardware metrics (real-time).
    
    **NO TRANSFORMATION NEEDED** - Hardware monitor already sends perfect format!
    """
    try:
        hardware = await db_manager.db.hardware.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not hardware:
            return {"error": "No hardware data available", "machine_id": machine_id}
        
        return hardware
        
    except Exception as e:
        logger.error(f"Error fetching hardware for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SECURITY (PASS-THROUGH - Already perfect!)
# ============================================================================

@router.get("/machines/{machine_id}/security")
async def get_machine_security(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine security information.
    
    **NO TRANSFORMATION NEEDED** - Security monitor already sends perfect format!
    """
    try:
        security = await db_manager.db.security.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not security:
            return {"error": "No security data available", "machine_id": machine_id}
        
        return security
        
    except Exception as e:
        logger.error(f"Error fetching security for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PERIPHERALS (PASS-THROUGH - Already perfect!)
# ============================================================================

@router.get("/machines/{machine_id}/peripherals")
async def get_machine_peripherals(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get machine peripherals information.
    
    **NO TRANSFORMATION NEEDED** - Peripherals monitor already sends perfect format!
    """
    try:
        peripherals = await db_manager.db.peripherals.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not peripherals:
            return {"error": "No peripherals data available", "machine_id": machine_id}
        
        return peripherals
        
    except Exception as e:
        logger.error(f"Error fetching peripherals for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# NEW ENDPOINTS (FROM VERIFICATION AUDIT)
# ============================================================================

@router.get("/machines/{machine_id}/services")
async def get_machine_services(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get Windows services status.
    
    **NEW ENDPOINT** - Implements services monitor frontend integration
    """
    try:
        services = await db_manager.db.services.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not services:
            return {
                "services_summary": {"total": 0, "running": 0, "stopped": 0},
                "critical_services": [],
                "alerts": []
            }
        
        return services
        
    except Exception as e:
        logger.error(f"Error fetching services for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/updates")
async def get_machine_updates(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get Windows Update status.
    
    **NEW ENDPOINT** - Implements update monitor frontend integration
    """
    try:
        update = await db_manager.db.update.find_one(
            {"machine_id": machine_id},
            sort=[("timestamp", -1)]
        )
        
        if not update:
            return {
                "pending_updates": None,
                "update_needed": None,
                "reboot_pending": False
            }
        
        return update
        
    except Exception as e:
        logger.error(f"Error fetching update status for {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# KEEP ALL OTHER ENDPOINTS FROM ORIGINAL machines.py
# (Copy them from your existing machines.py file)
# ============================================================================
# - GET /machines (list view)
# - GET /machines/{machine_id}/history
# - GET /machines/{machine_id}/events
# - GET /machines/{machine_id}/sessions
# - POST /machines/{machine_id}/maintenance
# - etc.
