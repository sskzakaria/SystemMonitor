"""
Group Management Router
Handles machine grouping operations
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime
import logging

from database import db_manager
from utils.collections import HEARTBEAT_LATEST, MACHINE_GROUPS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["groups"])


def validate_machine_id(machine_id: str) -> str:
    """Inline validation for machine ID"""
    if not machine_id or len(machine_id) < 3:
        raise HTTPException(status_code=400, detail="Machine ID must be at least 3 characters")
    if len(machine_id) > 100:
        raise HTTPException(status_code=400, detail="Machine ID must be less than 100 characters")
    return machine_id.strip()


def validate_groups(groups: List[str]) -> List[str]:
    """Validate and clean group names"""
    if not groups:
        raise HTTPException(status_code=400, detail="No groups provided")
    
    clean_groups = []
    for group in groups:
        if not group or not group.strip():
            continue
        
        clean_group = group.strip()
        
        # Validate group name
        if len(clean_group) < 1:
            raise HTTPException(status_code=400, detail="Group name cannot be empty")
        if len(clean_group) > 100:
            raise HTTPException(status_code=400, detail=f"Group name too long: {clean_group}")
        
        # Check for invalid characters (optional - adjust as needed)
        # For now, allow alphanumeric, spaces, hyphens, underscores
        invalid_chars = set('<>&"\';')
        if any(char in invalid_chars for char in clean_group):
            raise HTTPException(
                status_code=400,
                detail=f"Group name contains invalid characters: {clean_group}"
            )
        
        clean_groups.append(clean_group)
    
    if not clean_groups:
        raise HTTPException(status_code=400, detail="No valid groups provided")
    
    return clean_groups


@router.get("/groups", response_model=List[str])
async def get_all_groups():
    """Get all unique groups"""
    try:
        pipeline = [
            {"$unwind": "$groups"},
            {"$group": {"_id": "$groups"}},
            {"$sort": {"_id": 1}}
        ]
        
        cursor = db_manager.mongodb_db[HEARTBEAT_LATEST].aggregate(pipeline)
        groups = [doc["_id"] async for doc in cursor]
        
        return groups
    except Exception as e:
        logger.error(f"Error fetching groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/groups", response_model=List[str])
async def get_machine_groups(machine_id: str):
    """Get groups for a specific machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        machine = await db_manager.mongodb_db[HEARTBEAT_LATEST].find_one(
            {"machine_id": machine_id}
        )
        
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        return machine.get("groups", [])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching machine groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/{machine_id}/groups")
async def add_machine_to_groups(machine_id: str, groups: List[str]):
    """Add machine to groups"""
    try:
        machine_id = validate_machine_id(machine_id)
        clean_groups = validate_groups(groups)
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$addToSet": {"groups": {"$each": clean_groups}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Added machine {machine_id} to {len(clean_groups)} groups")
        return {"message": f"Added to {len(clean_groups)} groups"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding to groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/machines/{machine_id}/groups")
async def remove_machine_from_groups(machine_id: str, groups: List[str]):
    """Remove machine from groups"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        if not groups:
            raise HTTPException(status_code=400, detail="No groups provided")
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$pull": {"groups": {"$in": groups}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Removed machine {machine_id} from {len(groups)} groups")
        return {"message": f"Removed from {len(groups)} groups"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing from groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/groups")
async def bulk_add_to_groups(machine_ids: List[str], groups: List[str]):
    """Add multiple machines to groups"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        clean_groups = validate_groups(groups)
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$addToSet": {"groups": {"$each": clean_groups}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        logger.info(f"Bulk added {result.modified_count} machines to groups")
        return {
            "message": f"Updated {result.modified_count} machines",
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk group operation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/groups/remove")
async def bulk_remove_from_groups(machine_ids: List[str], groups: List[str]):
    """Remove multiple machines from groups"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        if not groups:
            raise HTTPException(status_code=400, detail="No groups provided")
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$pull": {"groups": {"$in": groups}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        logger.info(f"Bulk removed {result.modified_count} machines from groups")
        return {
            "message": f"Updated {result.modified_count} machines",
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk group removal: {e}")
        raise HTTPException(status_code=500, detail=str(e))
