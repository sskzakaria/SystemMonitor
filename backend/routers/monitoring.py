"""
Monitoring data endpoints (hardware, network, user activity, applications, etc.)
Provides detailed monitoring data for individual machines
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pymongo import ASCENDING, DESCENDING
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from utils.adapters import adapt_document
from utils.helpers import calculate_machine_status, clean_objectid
from utils.collections import (
    SPECS_LATEST, HARDWARE_LATEST, NETWORK_LATEST, APPLICATION_LATEST,
    SERVICES_LATEST, SECURITY_LATEST, UPDATE_LATEST, OVERVIEW_LATEST,
    PERIPHERALS_LATEST, USER_ACTIVITY_LATEST, HARDWARE_HISTORY, NETWORK_HISTORY
)

router = APIRouter(prefix="/api/v1", tags=["monitoring"])
logger = logging.getLogger(__name__)


@router.get("/machines/{machine_id}/specs")
async def get_machine_specs(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get machine specifications"""
    doc = await db_manager.mongodb_db[SPECS_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Specs not found for {machine_id}")
    return adapt_document(doc, "specs")


@router.get("/machines/{machine_id}/hardware")
async def get_machine_hardware(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get hardware metrics"""
    doc = await db_manager.mongodb_db[HARDWARE_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Hardware data not found for {machine_id}")
    return adapt_document(doc, "hardware")


@router.get("/machines/{machine_id}/network")
async def get_machine_network(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get network information"""
    doc = await db_manager.mongodb_db[NETWORK_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Network data not found for {machine_id}")
    return adapt_document(doc, "network")


@router.get("/machines/{machine_id}/applications")
async def get_machine_applications(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get running applications"""
    doc = await db_manager.mongodb_db[APPLICATION_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Application data not found for {machine_id}")
    
    # Clean and return (no adapter for applications yet)
    cleaned = clean_objectid(doc)
    return {
        "processes": cleaned.get("processes", []),
        "applications": cleaned.get("applications", []),
        "running_apps": cleaned.get("running_apps", [])
    }


@router.get("/machines/{machine_id}/services")
async def get_machine_services(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get system services"""
    doc = await db_manager.mongodb_db[SERVICES_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Services data not found for {machine_id}")
    
    # Clean and return
    cleaned = clean_objectid(doc)
    return {"services": cleaned.get("services", [])}


@router.get("/machines/{machine_id}/security")
async def get_machine_security(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get security software"""
    doc = await db_manager.mongodb_db[SECURITY_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Security data not found for {machine_id}")
    
    # Clean and return
    cleaned = clean_objectid(doc)
    return cleaned


@router.get("/machines/{machine_id}/updates")
async def get_machine_updates(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get system updates"""
    doc = await db_manager.mongodb_db[UPDATE_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Update data not found for {machine_id}")
    
    # Clean and return
    cleaned = clean_objectid(doc)
    return cleaned


@router.get("/machines/{machine_id}/overview")
async def get_machine_overview(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get machine overview"""
    doc = await db_manager.mongodb_db[OVERVIEW_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Overview not found for {machine_id}")
    
    # Clean and return
    cleaned = clean_objectid(doc)
    return cleaned


@router.get("/machines/{machine_id}/software")
async def get_machine_software(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get installed software inventory"""
    security_doc = await db_manager.mongodb_db[SECURITY_LATEST].find_one({"machine_id": machine_id})
    
    if security_doc:
        cleaned = clean_objectid(security_doc)
        installed_programs = cleaned.get("installed_programs", [])
        
        software_list = []
        for prog in installed_programs:
            if isinstance(prog, dict):
                software_list.append({
                    "name": prog.get("name", "Unknown"),
                    "version": prog.get("version", "Unknown"),
                    "publisher": prog.get("publisher"),
                    "install_date": prog.get("install_date"),
                    "size_mb": prog.get("size_mb")
                })
        
        return {
            "machine_id": machine_id,
            "software": software_list,
            "count": len(software_list),
            "last_updated": cleaned.get("timestamp")
        }
    
    return {
        "machine_id": machine_id,
        "software": [],
        "count": 0,
        "last_updated": None
    }


@router.get("/machines/{machine_id}/peripherals")
async def get_machine_peripherals(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get connected peripherals"""
    doc = await db_manager.mongodb_db[PERIPHERALS_LATEST].find_one({"machine_id": machine_id})
    
    if doc:
        cleaned = clean_objectid(doc)
        devices = cleaned.get("devices", []) or cleaned.get("connected_devices", [])
        
        formatted_devices = []
        for device in devices:
            if isinstance(device, dict):
                formatted_devices.append({
                    "id": device.get("id", f"dev-{len(formatted_devices)}"),
                    "name": device.get("name", "Unknown Device"),
                    "type": device.get("type", "unknown"),
                    "status": device.get("status", "unknown"),
                    "connection": device.get("connection", "Unknown"),
                    "manufacturer": device.get("manufacturer"),
                    "driver_version": device.get("driver_version"),
                    "last_seen": device.get("last_seen")
                })
        
        return {
            "machine_id": machine_id,
            "devices": formatted_devices,
            "count": len(formatted_devices),
            "last_updated": cleaned.get("timestamp")
        }
    
    return {
        "machine_id": machine_id,
        "devices": [],
        "count": 0,
        "last_updated": None
    }


@router.get("/machines/{machine_id}/sessions")
async def get_machine_sessions(
    machine_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get current and recent user sessions"""
    doc = await db_manager.mongodb_db[USER_ACTIVITY_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"User activity data not found for {machine_id}")
    
    adapted = adapt_document(doc, "user_activity")
    return {
        "current_sessions": adapted.get("sessions", []),
        "active_user": adapted.get("active_user"),
        "session_count": len(adapted.get("sessions", []))
    }


@router.get("/machines/{machine_id}/login-history")
async def get_login_history(
    machine_id: str = Path(...),
    days: int = Query(7, ge=1, le=90),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get login history"""
    doc = await db_manager.mongodb_db[USER_ACTIVITY_LATEST].find_one({"machine_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"User activity data not found for {machine_id}")
    
    adapted = adapt_document(doc, "user_activity")
    return {
        "machine_id": machine_id,
        "login_history_24h": adapted.get("login_history_24h", []),
        "period_days": days
    }


# Historical Data Endpoints

@router.get("/machines/{machine_id}/history/cpu")
async def get_cpu_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get CPU usage history"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cursor = db_manager.mongodb_db[HARDWARE_HISTORY].find(
        {"machine_id": machine_id, "timestamp": {"$gte": cutoff}}
    ).sort("timestamp", ASCENDING)
    
    history = []
    async for doc in cursor:
        adapted = adapt_document(doc, "hardware")
        history.append({
            "timestamp": adapted["timestamp"].isoformat() if isinstance(adapted["timestamp"], datetime) else adapted["timestamp"],
            "cpu_usage_percent": adapted.get("cpu_usage_percent", 0),
            "cpu_temp_celsius": adapted.get("cpu_temp_celsius")
        })
    
    return {"machine_id": machine_id, "history": history, "period_hours": hours}


@router.get("/machines/{machine_id}/history/memory")
async def get_memory_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get memory usage history"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cursor = db_manager.mongodb_db[HARDWARE_HISTORY].find(
        {"machine_id": machine_id, "timestamp": {"$gte": cutoff}}
    ).sort("timestamp", ASCENDING)
    
    history = []
    async for doc in cursor:
        adapted = adapt_document(doc, "hardware")
        history.append({
            "timestamp": adapted["timestamp"].isoformat() if isinstance(adapted["timestamp"], datetime) else adapted["timestamp"],
            "memory_usage_percent": adapted.get("memory_usage_percent", 0),
            "memory_used_gb": adapted.get("memory_used_gb", 0)
        })
    
    return {"machine_id": machine_id, "history": history, "period_hours": hours}


@router.get("/machines/{machine_id}/history/disk")
async def get_disk_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get disk usage history"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cursor = db_manager.mongodb_db[HARDWARE_HISTORY].find(
        {"machine_id": machine_id, "timestamp": {"$gte": cutoff}}
    ).sort("timestamp", ASCENDING)
    
    history = []
    async for doc in cursor:
        adapted = adapt_document(doc, "hardware")
        history.append({
            "timestamp": adapted["timestamp"].isoformat() if isinstance(adapted["timestamp"], datetime) else adapted["timestamp"],
            "disk_usage_percent": adapted.get("disk_usage_percent", 0),
            "disk_used_gb": adapted.get("disk_used_gb", 0)
        })
    
    return {"machine_id": machine_id, "history": history, "period_hours": hours}


@router.get("/machines/{machine_id}/history/network")
async def get_network_history(
    machine_id: str = Path(...),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get network traffic history"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cursor = db_manager.mongodb_db[NETWORK_HISTORY].find(
        {"machine_id": machine_id, "timestamp": {"$gte": cutoff}}
    ).sort("timestamp", ASCENDING)
    
    history = []
    async for doc in cursor:
        adapted = adapt_document(doc, "network")
        history.append({
            "timestamp": adapted["timestamp"].isoformat() if isinstance(adapted["timestamp"], datetime) else adapted["timestamp"],
            "bytes_sent": adapted.get("bytes_sent", 0),
            "bytes_recv": adapted.get("bytes_recv", 0),
            "packets_sent": adapted.get("packets_sent", 0),
            "packets_recv": adapted.get("packets_recv", 0)
        })
    
    return {"machine_id": machine_id, "history": history, "period_hours": hours}


@router.get("/user-sessions/active")
async def get_all_active_sessions(user: OptionalUser = Depends(get_optional_user)):
    """Get all active user sessions"""
    cursor = db_manager.mongodb_db[USER_ACTIVITY_LATEST].find({})
    active_sessions = []
    async for doc in cursor:
        adapted = adapt_document(doc, "user_activity")
        sessions = adapted.get("sessions", [])
        if sessions:
            for session in sessions:
                active_sessions.append({
                    "machine_id": adapted["machine_id"],
                    "hostname": adapted.get("hostname"),
                    "user": session.get("user"),
                    "login_time": session.get("started_iso"),
                    "terminal": session.get("terminal")
                })
    return {"active_sessions": active_sessions, "total_count": len(active_sessions)}


@router.get("/user-sessions/history")
async def get_session_history(
    days: int = Query(30, ge=1, le=365),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get historical session data"""
    # Note: This collection may not exist yet
    collection_name = "user_activity_monitor_daily"
    
    # Check if collection exists
    collection_names = await db_manager.mongodb_db.list_collection_names()
    if collection_name not in collection_names:
        logger.warning(f"Collection {collection_name} does not exist")
        return {"session_history": [], "period_days": days}
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db_manager.mongodb_db[collection_name].find(
        {"date": {"$gte": cutoff}}
    ).sort("date", DESCENDING)
    
    history = []
    async for doc in cursor:
        history.append({
            "date": doc["date"].isoformat() if isinstance(doc["date"], datetime) else doc["date"],
            "machine_id": doc.get("machine_id"),
            "total_sessions": doc.get("total_sessions", 0),
            "unique_users": doc.get("unique_users", 0)
        })
    
    return {"session_history": history, "period_days": days}
