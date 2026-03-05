"""
Timeline Events Router
Handles timeline event queries for frontend
"""
from fastapi import APIRouter, Depends, Query, Path
from typing import Optional, List
from datetime import datetime, timedelta, timezone
import logging

from database import db_manager
from dependencies import get_optional_user, OptionalUser
from utils.helpers import clean_objectid

router = APIRouter(prefix="/api/v1", tags=["events"])
logger = logging.getLogger("university_monitoring")


@router.get("/events")
async def get_events(
    machine_id: Optional[str] = None,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(500, ge=1, le=1000),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Get timeline events with filters
    
    Args:
        machine_id: Filter by specific machine
        event_type: Filter by event type (status_change, alert, maintenance, etc.)
        severity: Filter by severity (info, warning, error)
        limit: Maximum number of events to return
        hours: Number of hours to look back
    
    Returns:
        List of timeline events
    """
    try:
        # Build query
        query = {}
        
        if machine_id:
            query["machine_id"] = machine_id
        
        if event_type:
            query["event_type"] = event_type
        
        if severity:
            query["severity"] = severity
        
        # Time filter
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        query["timestamp"] = {"$gte": cutoff}
        
        # Query database
        cursor = db_manager.mongodb_db.timeline_events.find(query).sort(
            "timestamp", -1
        ).limit(limit)
        
        events = []
        async for doc in cursor:
            event = clean_objectid(doc)
            events.append(event)
        
        return {
            "events": events,
            "count": len(events),
            "filters": {
                "machine_id": machine_id,
                "event_type": event_type,
                "severity": severity,
                "hours": hours
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/types")
async def get_event_types(user: OptionalUser = Depends(get_optional_user)):
    """Get list of all event types"""
    try:
        pipeline = [
            {"$group": {"_id": "$event_type"}},
            {"$sort": {"_id": 1}}
        ]
        
        cursor = db_manager.mongodb_db.timeline_events.aggregate(pipeline)
        event_types = [doc["_id"] async for doc in cursor if doc["_id"]]
        
        return {"event_types": event_types}
        
    except Exception as e:
        logger.error(f"Error fetching event types: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/events")
async def create_event(
    machine_id: str,
    event_type: str,
    message: str,
    severity: str = "info",
    details: dict = None,
    user: OptionalUser = Depends(get_optional_user)
):
    """
    Create a new timeline event
    
    Args:
        machine_id: Machine identifier
        event_type: Type of event (status_change, alert, maintenance, etc.)
        message: Event message
        severity: Event severity (info, warning, error)
        details: Additional event details
    """
    try:
        event = {
            "machine_id": machine_id,
            "event_type": event_type,
            "message": message,
            "severity": severity,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc),
            "created_by": user.username
        }
        
        result = await db_manager.mongodb_db.timeline_events.insert_one(event)
        
        return {
            "event_id": str(result.inserted_id),
            "status": "created"
        }
        
    except Exception as e:
        logger.error(f"Error creating event: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/events")
async def get_machine_events(
    machine_id: str = Path(...),
    limit: int = Query(100, ge=1, le=500),
    hours: int = Query(24, ge=1, le=168),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get events for a specific machine"""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        cursor = db_manager.mongodb_db.timeline_events.find(
            {
                "machine_id": machine_id,
                "timestamp": {"$gte": cutoff}
            }
        ).sort("timestamp", -1).limit(limit)
        
        events = []
        async for doc in cursor:
            events.append(clean_objectid(doc))
        
        return {
            "machine_id": machine_id,
            "events": events,
            "count": len(events)
        }
        
    except Exception as e:
        logger.error(f"Error fetching machine events: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/recent")
async def get_recent_events(
    limit: int = Query(50, ge=1, le=200),
    user: OptionalUser = Depends(get_optional_user)
):
    """Get most recent events across all machines"""
    try:
        cursor = db_manager.mongodb_db.timeline_events.find({}).sort(
            "timestamp", -1
        ).limit(limit)
        
        events = []
        async for doc in cursor:
            events.append(clean_objectid(doc))
        
        return {
            "events": events,
            "count": len(events)
        }
        
    except Exception as e:
        logger.error(f"Error fetching recent events: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
