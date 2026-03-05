"""
Admin, Configuration, Bulk Operations, Tags, Groups, and Search Endpoints

⚠️  AUTHENTICATION NOTE:
This router uses OptionalUser dependency which allows unauthenticated access.
When authentication is implemented, replace with:
    - from dependencies import require_admin, AdminUser
    - user: AdminUser = Depends(require_admin)
This will enforce admin-level authentication on all endpoints.
"""
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from bson import ObjectId
from collections import defaultdict
import logging

from config import Config
from database import db_manager
from dependencies import get_optional_user, OptionalUser
from models.requests import (
    BulkMaintenanceRequest, BulkTagsRequest, BulkGroupRequest,
    CreateTagRequest, CreateGroupRequest, UpdateGroupRequest
)
from utils.adapters import adapt_document
from utils.helpers import clean_objectid, calculate_machine_status
from utils.collections import (
    HEARTBEAT_LATEST, SYSTEM_CONFIG, TAG_DEFINITIONS,
    MACHINE_GROUPS, MACHINE_ACTIONS, MACHINE_NOTES
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION MANAGEMENT
# =============================================================================

@router.get("/config")
async def get_config(user: OptionalUser = Depends(get_optional_user)):
    """
    Get system configuration
    
    🔒 TODO: Require admin authentication
    """
    try:
        config = await db_manager.mongodb_db[SYSTEM_CONFIG].find_one({"config_type": "main"})
        if not config:
            # Return default configuration
            config = {
                "config_type": "main",
                "offline_threshold_seconds": Config.OFFLINE_THRESHOLD_SECONDS,
                "idle_threshold_seconds": Config.IDLE_ACTIVITY_THRESHOLD_SECONDS,
                "alert_thresholds": {
                    "cpu_warning": 80,
                    "cpu_critical": 90,
                    "memory_warning": 80,
                    "memory_critical": 90,
                    "disk_warning": 80,
                    "disk_critical": 90
                }
            }
        return clean_objectid(config)
    except Exception as e:
        logger.error(f"Error fetching config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(
    config_updates: dict = Body(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Update system configuration
    
    🔒 TODO: Require admin authentication
    """
    try:
        await db_manager.mongodb_db[SYSTEM_CONFIG].update_one(
            {"config_type": "main"},
            {"$set": config_updates},
            upsert=True
        )
        logger.info(f"System config updated by {user.username if user else 'system'}")
        return {"status": "updated"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/thresholds")
async def get_alert_thresholds(user: OptionalUser = Depends(get_optional_user)):
    """
    Get alert thresholds
    
    🔒 TODO: Require admin authentication
    """
    try:
        config = await db_manager.mongodb_db[SYSTEM_CONFIG].find_one({"config_type": "main"})
        if config and "alert_thresholds" in config:
            return config["alert_thresholds"]
        
        # Return defaults
        return {
            "cpu_warning": 80,
            "cpu_critical": 90,
            "memory_warning": 80,
            "memory_critical": 90,
            "disk_warning": 80,
            "disk_critical": 90
        }
    except Exception as e:
        logger.error(f"Error fetching thresholds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SEARCH AND DISCOVERY
# =============================================================================

@router.get("/search/machines")
async def search_machines(
    q: str = Query(..., min_length=1),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Search machines by keyword
    Searches across: machine_id, hostname, building, room, tags
    
    🔒 TODO: Optionally require authentication
    """
    try:
        query = {
            "$or": [
                {"machine_id": {"$regex": q, "$options": "i"}},
                {"hostname": {"$regex": q, "$options": "i"}},
                {"building": {"$regex": q, "$options": "i"}},
                {"room": {"$regex": q, "$options": "i"}},
                {"tags": {"$regex": q, "$options": "i"}}
            ]
        }
        
        cursor = db_manager.mongodb_db[HEARTBEAT_LATEST].find(query).limit(50)
        results = []
        
        async for doc in cursor:
            adapted = adapt_document(doc, "heartbeat")
            results.append({
                "machine_id": adapted["machine_id"],
                "hostname": adapted.get("hostname", "Unknown"),
                "location": f"{adapted.get('building', 'Unknown')} - Room {adapted.get('room', 'N/A')}",
                "status": calculate_machine_status(adapted)
            })
        
        return {"results": results, "count": len(results), "query": q}
    except Exception as e:
        logger.error(f"Error searching machines: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/locations")
async def list_locations(user: OptionalUser = Depends(get_optional_user)):
    """
    Get list of all locations (buildings and rooms)
    
    🔒 TODO: Optionally require authentication
    """
    try:
        cursor = db_manager.mongodb_db[HEARTBEAT_LATEST].find({})
        buildings = set()
        rooms_by_building = defaultdict(set)
        
        async for doc in cursor:
            adapted = adapt_document(doc, "heartbeat")
            building = adapted.get("building")
            room = adapted.get("room")
            
            if building:
                buildings.add(building)
                if room:
                    rooms_by_building[building].add(room)
        
        locations = []
        for building in sorted(buildings):
            locations.append({
                "building": building,
                "rooms": sorted(list(rooms_by_building[building]))
            })
        
        return {"locations": locations}
    except Exception as e:
        logger.error(f"Error fetching locations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# BULK OPERATIONS
# =============================================================================

@router.post("/bulk/restart")
async def bulk_restart(
    request: BulkMaintenanceRequest,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Bulk restart machines
    Creates restart action requests for agent to execute
    
    🔒 TODO: Require admin authentication
    """
    try:
        actions = []
        for machine_id in request.machine_ids:
            action = {
                "machine_id": machine_id,
                "action_type": "restart",
                "reason": request.reason,
                "notify_users": request.notify_users,
                "requested_by": user.username if user else "system",
                "requested_at": datetime.now(timezone.utc),
                "status": "pending"
            }
            actions.append(action)
        
        if actions:
            result = await db_manager.mongodb_db[MACHINE_ACTIONS].insert_many(actions)
            logger.info(f"Bulk restart requested for {len(actions)} machines by {user.username if user else 'system'}")
            return {"action_count": len(result.inserted_ids), "status": "pending"}
        
        return {"action_count": 0, "status": "no_machines"}
    except Exception as e:
        logger.error(f"Error creating bulk restart actions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk/maintenance")
async def bulk_maintenance_mode(
    request: BulkMaintenanceRequest,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Set maintenance mode for multiple machines
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": request.machine_ids}},
            {
                "$set": {
                    "maintenance_mode": True,
                    "maintenance_reason": request.reason,
                    "maintenance_duration_hours": request.duration_hours,
                    "maintenance_set_by": user.username if user else "system",
                    "maintenance_set_at": datetime.now(timezone.utc)
                }
            }
        )
        
        logger.info(f"Bulk maintenance mode set for {result.modified_count} machines")
        return {"updated_count": result.modified_count}
    except Exception as e:
        logger.error(f"Error setting bulk maintenance mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk/tags")
async def bulk_add_tags(
    request: BulkTagsRequest,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Add tags to multiple machines
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {"machine_id": {"$in": request.machine_ids}},
            {"$addToSet": {"tags": {"$each": request.tags}}}
        )
        
        logger.info(f"Bulk added {len(request.tags)} tags to {result.modified_count} machines")
        return {"updated_count": result.modified_count, "tags_added": len(request.tags)}
    except Exception as e:
        logger.error(f"Error bulk adding tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# TAGS MANAGEMENT
# =============================================================================

@router.get("/tags")
async def list_tags(user: OptionalUser = Depends(get_optional_user)):
    """
    List all available tag definitions
    
    🔒 TODO: Optionally require authentication
    """
    try:
        cursor = db_manager.mongodb_db[TAG_DEFINITIONS].find({})
        tags = []
        async for doc in cursor:
            tags.append(clean_objectid(doc))
        
        return {"tags": tags, "count": len(tags)}
    except Exception as e:
        logger.error(f"Error listing tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tags")
async def create_tag(
    request: CreateTagRequest,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Create a new tag definition
    
    🔒 TODO: Require admin authentication
    """
    try:
        tag = {
            "name": request.name,
            "color": request.color or "#3B82F6",  # Default blue
            "description": request.description,
            "created_by": user.username if user else "system",
            "created_at": datetime.now(timezone.utc)
        }
        
        # Check if tag already exists
        existing = await db_manager.mongodb_db[TAG_DEFINITIONS].find_one({"name": request.name})
        if existing:
            raise HTTPException(status_code=400, detail="Tag already exists")
        
        result = await db_manager.mongodb_db[TAG_DEFINITIONS].insert_one(tag)
        logger.info(f"Tag '{request.name}' created by {user.username if user else 'system'}")
        return {"tag_id": str(result.inserted_id), "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tags/{tag_name}")
async def update_tag(
    tag_name: str = Path(...),
    color: Optional[str] = Body(None),
    description: Optional[str] = Body(None),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Update tag definition
    
    🔒 TODO: Require admin authentication
    """
    try:
        update_data = {}
        if color:
            update_data["color"] = color
        if description:
            update_data["description"] = description
        
        if update_data:
            result = await db_manager.mongodb_db[TAG_DEFINITIONS].update_one(
                {"name": tag_name},
                {"$set": update_data}
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Tag not found")
        
        logger.info(f"Tag '{tag_name}' updated by {user.username if user else 'system'}")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tags/{tag_name}")
async def delete_tag(
    tag_name: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Delete a tag definition and remove from all machines
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[TAG_DEFINITIONS].delete_one({"name": tag_name})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        # Remove tag from all machines
        await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {},
            {"$pull": {"tags": tag_name}}
        )
        
        logger.info(f"Tag '{tag_name}' deleted by {user.username if user else 'system'}")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/{machine_id}/tags")
async def add_tag_to_machine(
    machine_id: str = Path(...),
    tag_name: str = Body(..., embed=True),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Add tag to a specific machine
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {"$addToSet": {"tags": tag_name}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Tag '{tag_name}' added to {machine_id}")
        return {"status": "tag_added"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding tag to machine: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/machines/{machine_id}/tags/{tag_name}")
async def remove_tag_from_machine(
    machine_id: str = Path(...),
    tag_name: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Remove tag from a specific machine
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[HEARTBEAT_LATEST].update_one(
            {"machine_id": machine_id},
            {"$pull": {"tags": tag_name}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Machine not found")
        
        logger.info(f"Tag '{tag_name}' removed from {machine_id}")
        return {"status": "tag_removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing tag from machine: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GROUPS MANAGEMENT
# =============================================================================

@router.get("/groups")
async def list_groups(user: OptionalUser = Depends(get_optional_user)):
    """
    List all machine groups with metadata
    
    🔒 TODO: Optionally require authentication
    """
    try:
        cursor = db_manager.mongodb_db[MACHINE_GROUPS].find({})
        groups = []
        async for doc in cursor:
            groups.append(clean_objectid(doc))
        
        return {"groups": groups, "count": len(groups)}
    except Exception as e:
        logger.error(f"Error listing groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/groups")
async def create_group(
    request: CreateGroupRequest,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Create a new machine group
    
    🔒 TODO: Require admin authentication
    """
    try:
        # Check if group already exists
        existing = await db_manager.mongodb_db[MACHINE_GROUPS].find_one({"group_id": request.group_id})
        if existing:
            raise HTTPException(status_code=400, detail="Group already exists")
        
        group = {
            "group_id": request.group_id,
            "group_name": request.group_name,
            "description": request.description,
            "machine_ids": request.machine_ids,
            "created_by": user.username if user else "system",
            "created_at": datetime.now(timezone.utc)
        }
        
        result = await db_manager.mongodb_db[MACHINE_GROUPS].insert_one(group)
        
        # Add group to machines
        if request.machine_ids:
            await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
                {"machine_id": {"$in": request.machine_ids}},
                {"$addToSet": {"groups": request.group_id}}
            )
        
        logger.info(f"Group '{request.group_id}' created with {len(request.machine_ids)} machines")
        return {"group_id": str(result.inserted_id), "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/groups/{group_id}")
async def update_group(
    group_id: str = Path(...),
    request: UpdateGroupRequest = Body(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Update a machine group
    
    🔒 TODO: Require admin authentication
    """
    try:
        # Update group metadata
        update_data = {}
        if request.group_name:
            update_data["group_name"] = request.group_name
        if request.description is not None:
            update_data["description"] = request.description
        
        if update_data:
            result = await db_manager.mongodb_db[MACHINE_GROUPS].update_one(
                {"group_id": group_id},
                {"$set": update_data}
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Group not found")
        
        # Add machines to group
        if request.add_machines:
            await db_manager.mongodb_db[MACHINE_GROUPS].update_one(
                {"group_id": group_id},
                {"$addToSet": {"machine_ids": {"$each": request.add_machines}}}
            )
            await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
                {"machine_id": {"$in": request.add_machines}},
                {"$addToSet": {"groups": group_id}}
            )
        
        # Remove machines from group
        if request.remove_machines:
            await db_manager.mongodb_db[MACHINE_GROUPS].update_one(
                {"group_id": group_id},
                {"$pull": {"machine_ids": {"$in": request.remove_machines}}}
            )
            await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
                {"machine_id": {"$in": request.remove_machines}},
                {"$pull": {"groups": group_id}}
            )
        
        logger.info(f"Group '{group_id}' updated")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: str = Path(...),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Delete a machine group and remove from all machines
    
    🔒 TODO: Require admin authentication
    """
    try:
        result = await db_manager.mongodb_db[MACHINE_GROUPS].delete_one({"group_id": group_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Remove group from all machines
        await db_manager.mongodb_db[HEARTBEAT_LATEST].update_many(
            {},
            {"$pull": {"groups": group_id}}
        )
        
        logger.info(f"Group '{group_id}' deleted")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# NOTES MANAGEMENT
# =============================================================================

@router.get("/notes")
async def get_all_notes(
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get all notes across all machines
    
    🔒 TODO: Optionally require authentication
    """
    try:
        from pymongo import DESCENDING
        
        query = {}
        if category:
            query["category"] = category
        if priority:
            query["priority"] = priority
        
        cursor = db_manager.mongodb_db[MACHINE_NOTES].find(query).sort("created_at", DESCENDING).limit(limit)
        notes = []
        async for doc in cursor:
            notes.append(clean_objectid(doc))
        
        return {"notes": notes, "count": len(notes)}
    except Exception as e:
        logger.error(f"Error fetching notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
