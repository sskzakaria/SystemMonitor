"""
Tag Management Router
Handles CRUD operations for machine tags
"""
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
import logging

from database import db_manager
from utils.collections import HEARTBEAT_LATEST

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["tags"])


def validate_machine_id(machine_id: str) -> str:
    """Inline validation for machine ID"""
    if not machine_id or len(machine_id) < 3:
        raise HTTPException(status_code=400, detail="Machine ID must be at least 3 characters")
    if len(machine_id) > 100:
        raise HTTPException(status_code=400, detail="Machine ID must be less than 100 characters")
    return machine_id.strip()


def validate_tags(tags: List[str]) -> List[str]:
    """Inline validation for tags"""
    if not tags:
        raise HTTPException(status_code=400, detail="No tags provided")
    
    clean_tags = []
    for tag in tags:
        clean_tag = tag.strip().lower()
        if len(clean_tag) < 1:
            continue
        if len(clean_tag) > 50:
            raise HTTPException(status_code=400, detail=f"Tag '{tag}' is too long (max 50 characters)")
        clean_tags.append(clean_tag)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_tags = []
    for tag in clean_tags:
        if tag not in seen:
            seen.add(tag)
            unique_tags.append(tag)
    
    return unique_tags


@router.get("/tags", response_model=List[str])
async def get_all_tags():
    """Get all unique tags across all machines"""
    try:
        # Aggregate all tags from machines
        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags"}},
            {"$sort": {"_id": 1}}
        ]
        
        cursor = db_manager.mongodb_db[HEARTBEAT_LATEST].aggregate(pipeline)
        tags = [doc["_id"] async for doc in cursor]
        
        return tags
    except Exception as e:
        logger.error(f"Error fetching tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/tags", response_model=List[str])
async def get_machine_tags(machine_id: str):
    """Get tags for a specific machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        machine = await db_manager.mongodb_db[HEARTBEAT_LATEST].find_one(
            {"machine_id": machine_id}
        )
        
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        return machine.get("tags", [])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching machine tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/{machine_id}/tags")
async def add_machine_tags(machine_id: str, tags: List[str]):
    """Add tags to a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        clean_tags = validate_tags(tags)
        
        # Update machine with new tags (add to existing, no duplicates)
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$addToSet": {"tags": {"$each": clean_tags}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Added {len(clean_tags)} tags to machine {machine_id}")
        return {"message": f"Added {len(clean_tags)} tags", "tags": clean_tags}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/machines/{machine_id}/tags")
async def remove_machine_tags(machine_id: str, tags: List[str]):
    """Remove tags from a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        if not tags:
            raise HTTPException(status_code=400, detail="No tags provided")
        
        # Update machine - remove specified tags
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {
                "$pull": {"tags": {"$in": tags}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Removed {len(tags)} tags from machine {machine_id}")
        return {"message": f"Removed {len(tags)} tags"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/tags")
async def bulk_add_tags(machine_ids: List[str], tags: List[str]):
    """Add tags to multiple machines"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        clean_tags = validate_tags(tags)
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$addToSet": {"tags": {"$each": clean_tags}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        logger.info(f"Bulk added tags to {result.modified_count} machines")
        return {
            "message": f"Updated {result.modified_count} machines",
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk tag operation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/bulk/tags/remove")
async def bulk_remove_tags(machine_ids: List[str], tags: List[str]):
    """Remove tags from multiple machines"""
    try:
        if not machine_ids:
            raise HTTPException(status_code=400, detail="No machine IDs provided")
        
        if not tags:
            raise HTTPException(status_code=400, detail="No tags provided")
        
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": machine_ids}},
            {
                "$pull": {"tags": {"$in": tags}},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        logger.info(f"Bulk removed tags from {result.modified_count} machines")
        return {
            "message": f"Updated {result.modified_count} machines",
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk tag removal: {e}")
        raise HTTPException(status_code=500, detail=str(e))
