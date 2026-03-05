"""
Maintenance Management Router
Handles maintenance mode and scheduling for machines
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from bson import ObjectId
import logging

from database import db_manager
from utils.collections import MAINTENANCE_SCHEDULES, HEARTBEAT_LATEST

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["maintenance"])


def validate_machine_id(machine_id: str) -> str:
    """Inline validation for machine ID"""
    if not machine_id or len(machine_id) < 3:
        raise HTTPException(status_code=400, detail="Machine ID must be at least 3 characters")
    if len(machine_id) > 100:
        raise HTTPException(status_code=400, detail="Machine ID must be less than 100 characters")
    return machine_id.strip()


class MaintenanceSchedule(BaseModel):
    """Maintenance schedule model"""
    machine_id: str
    scheduled_start: datetime
    scheduled_end: datetime
    reason: str = Field(..., min_length=1, max_length=500)
    created_by: str
    status: str = "scheduled"  # scheduled, in_progress, completed, cancelled


class MaintenanceScheduleResponse(BaseModel):
    """Maintenance schedule response"""
    id: str
    machine_id: str
    scheduled_start: datetime
    scheduled_end: datetime
    reason: str
    created_by: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None


class MaintenanceRequest(BaseModel):
    """Request to enable maintenance mode"""
    reason: str = Field(..., min_length=1, max_length=500)
    duration_hours: int = Field(2, ge=1, le=72)


@router.post("/machines/{machine_id}/maintenance")
async def enable_maintenance_mode(
    machine_id: str,
    request: MaintenanceRequest
):
    """Enable maintenance mode for a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        now = datetime.utcnow()
        end_time = now + timedelta(hours=request.duration_hours)
        
        # Create maintenance schedule
        schedule_doc = {
            "machine_id": machine_id,
            "scheduled_start": now,
            "scheduled_end": end_time,
            "reason": request.reason,
            "created_by": "admin",  # TODO: Get from auth
            "status": "in_progress",
            "created_at": now
        }
        
        await db_manager.mongodb_db[MAINTENANCE_SCHEDULES].insert_one(schedule_doc)
        
        # Update machine status
        await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$set": {
                    "maintenance_mode": True,
                    "maintenance_reason": request.reason,
                    "maintenance_until": end_time,
                    "updated_at": now
                }
            }
        )
        
        logger.info(f"Enabled maintenance mode for {machine_id} until {end_time}")
        return {
            "message": "Maintenance mode enabled",
            "until": end_time,
            "duration_hours": request.duration_hours
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enabling maintenance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/machines/{machine_id}/maintenance")
async def disable_maintenance_mode(machine_id: str):
    """Disable maintenance mode for a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        # Update machine status
        await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$unset": {
                    "maintenance_mode": "",
                    "maintenance_reason": "",
                    "maintenance_until": ""
                },
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        # Mark schedule as completed
        await db_manager.mongodb_db[MAINTENANCE_SCHEDULES].update_many(
            {
                "machine_id": machine_id,
                "status": "in_progress"
            },
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Disabled maintenance mode for {machine_id}")
        return {"message": "Maintenance mode disabled"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disabling maintenance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/maintenance/status")
async def get_maintenance_status(machine_id: str):
    """Get maintenance status for a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        machine = await db_manager.mongodb_db[HEARTBEAT_LATEST].find_one(
            {"machine_id": machine_id}
        )
        
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        is_maintenance = machine.get("maintenance_mode", False)
        
        return {
            "machine_id": machine_id,
            "maintenance_mode": is_maintenance,
            "maintenance_reason": machine.get("maintenance_reason") if is_maintenance else None,
            "maintenance_until": machine.get("maintenance_until") if is_maintenance else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting maintenance status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/maintenance")
async def bulk_enable_maintenance(
    machine_ids: List[str],
    request: MaintenanceRequest
):
    """Enable maintenance mode for multiple machines"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        now = datetime.utcnow()
        end_time = now + timedelta(hours=request.duration_hours)
        
        # Create schedules for all machines
        schedules = [
            {
                "machine_id": mid,
                "scheduled_start": now,
                "scheduled_end": end_time,
                "reason": request.reason,
                "created_by": "admin",
                "status": "in_progress",
                "created_at": now
            }
            for mid in machine_ids
        ]
        
        if schedules:
            await db_manager.mongodb_db[MAINTENANCE_SCHEDULES].insert_many(schedules)
        
        # Update all machines
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$set": {
                    "maintenance_mode": True,
                    "maintenance_reason": request.reason,
                    "maintenance_until": end_time,
                    "updated_at": now
                }
            }
        )
        
        logger.info(f"Enabled maintenance for {result.modified_count} machines")
        return {
            "message": f"Enabled maintenance for {result.modified_count} machines",
            "until": end_time,
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk maintenance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/maintenance/disable")
async def bulk_disable_maintenance(machine_ids: List[str]):
    """Disable maintenance mode for multiple machines"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        # Update machines
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$unset": {
                    "maintenance_mode": "",
                    "maintenance_reason": "",
                    "maintenance_until": ""
                },
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        # Mark schedules as completed
        await db_manager.mongodb_db[MAINTENANCE_SCHEDULES].update_many(
            {
                "machine_id": {"$in": machine_ids},
                "status": "in_progress"
            },
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Disabled maintenance for {result.modified_count} machines")
        return {
            "message": f"Disabled maintenance for {result.modified_count} machines",
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk maintenance disable: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/maintenance/schedules", response_model=List[MaintenanceScheduleResponse])
async def get_all_maintenance_schedules(
    status: Optional[str] = None,
    limit: int = 100
):
    """Get maintenance schedules"""
    try:
        query = {}
        if status:
            query["status"] = status
        
        cursor = db_manager.mongodb_db[MAINTENANCE_SCHEDULES].find(query).sort(
            "scheduled_start", -1
        ).limit(limit)
        
        schedules = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            schedules.append(MaintenanceScheduleResponse(**doc))
        
        return schedules
    except Exception as e:
        logger.error(f"Error fetching maintenance schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/maintenance/active")
async def get_active_maintenance():
    """Get all machines currently in maintenance mode"""
    try:
        cursor = db_manager.mongodb_db[HEARTBEAT_LATEST].find(
            {"maintenance_mode": True}
        )
        
        machines = []
        async for doc in cursor:
            machines.append({
                "machine_id": doc["machine_id"],
                "hostname": doc.get("hostname"),
                "maintenance_reason": doc.get("maintenance_reason"),
                "maintenance_until": doc.get("maintenance_until")
            })
        
        return {
            "count": len(machines),
            "machines": machines
        }
    except Exception as e:
        logger.error(f"Error fetching active maintenance: {e}")
        raise HTTPException(status_code=500, detail=str(e))
