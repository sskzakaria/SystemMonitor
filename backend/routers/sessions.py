"""
User Sessions Router
Provides user session information for machines
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import logging

from database import db_manager
from utils.collections import USER_ACTIVITY_LATEST

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["sessions"])


def validate_machine_id(machine_id: str) -> str:
    """Inline validation for machine ID"""
    if not machine_id or len(machine_id) < 3:
        raise HTTPException(status_code=400, detail="Machine ID must be at least 3 characters")
    if len(machine_id) > 100:
        raise HTTPException(status_code=400, detail="Machine ID must be less than 100 characters")
    return machine_id.strip()


class SessionInfo(BaseModel):
    """Session information response"""
    machine_id: str
    active_user: Optional[str] = None
    session_count: int = 0
    login_time: Optional[datetime] = None
    idle_time: Optional[int] = None
    session_type: Optional[str] = None


class ActiveSession(BaseModel):
    """Active session summary"""
    machine_id: str
    username: Optional[str]
    login_time: Optional[datetime]
    session_count: int = 1


@router.get("/machines/{machine_id}/sessions", response_model=SessionInfo)
async def get_machine_sessions(machine_id: str):
    """Get active user sessions for a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        # Get user activity data
        user_data = await db_manager.mongodb_db[USER_ACTIVITY_LATEST].find_one(
            {"machine_id": machine_id}
        )
        
        if not user_data:
            # Return empty session info
            return SessionInfo(
                machine_id=machine_id,
                active_user=None,
                session_count=0,
                login_time=None,
                idle_time=None,
                session_type=None
            )
        
        # Extract session info
        return SessionInfo(
            machine_id=machine_id,
            active_user=user_data.get("current_user"),
            session_count=user_data.get("active_sessions", 0),
            login_time=user_data.get("login_time"),
            idle_time=user_data.get("idle_time_seconds"),
            session_type=user_data.get("session_type", "local")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/active", response_model=List[ActiveSession])
async def get_all_active_sessions():
    """Get all machines with active user sessions"""
    try:
        cursor = db_manager.mongodb_db[USER_ACTIVITY_LATEST].find(
            {"current_user": {"$ne": None}}
        )
        
        sessions = []
        async for doc in cursor:
            sessions.append(ActiveSession(
                machine_id=doc["machine_id"],
                username=doc.get("current_user"),
                login_time=doc.get("login_time"),
                session_count=doc.get("active_sessions", 1)
            ))
        
        return sessions
    except Exception as e:
        logger.error(f"Error fetching active sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/count")
async def get_session_counts():
    """Get session statistics"""
    try:
        # Total machines with active sessions
        total_active = await db_manager.mongodb_db[USER_ACTIVITY_LATEST].count_documents(
            {"current_user": {"$ne": None}}
        )
        
        # Total machines being monitored
        total_machines = await db_manager.mongodb_db[USER_ACTIVITY_LATEST].count_documents({})
        
        return {
            "active_sessions": total_active,
            "total_machines": total_machines,
            "idle_machines": total_machines - total_active
        }
    except Exception as e:
        logger.error(f"Error getting session counts: {e}")
        raise HTTPException(status_code=500, detail=str(e))
